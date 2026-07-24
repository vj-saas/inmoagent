import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PersonRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { BootstrapOwnerDto } from './dto/bootstrap-owner.dto';
import type { CreatePersonDto } from './dto/create-person.dto';
import { generateTemporaryPassword, hashPassword } from './password.util';
import { toPersonResponse, type PersonResponse } from './person-response';

/**
 * Respuesta de creación/reseteo que incluye la contraseña temporal en texto
 * plano. Se devuelve UNA sola vez al caller y nunca se persiste ni se loguea
 * (AC-17/AC-23): tras esta respuesta la contraseña ya no es recuperable.
 */
export interface PersonResponseWithTemporaryPassword extends PersonResponse {
  temporaryPassword: string;
}

/**
 * Normaliza el email a minúsculas (AC-2) y recorta espacios. La unicidad global
 * (`@unique`) y el login (que también normaliza) dependen de que todo email se
 * guarde ya normalizado; nunca se confía en que el DTO venga en minúsculas.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Detecta el fallo de serialización que Postgres lanza (SQLSTATE `40001`) cuando
 * dos transacciones `Serializable` concurrentes chocan en un conflicto de
 * escritura. Prisma lo expone como `PrismaClientKnownRequestError` con código
 * `P2034` ("write conflict or deadlock"); en algunas rutas queda además el
 * SQLSTATE crudo en `meta.code`. Se contemplan ambas formas para no depender de
 * la versión del cliente Prisma.
 */
function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code === 'P2034') {
    return true;
  }
  const rawCode = (error.meta as { code?: unknown } | undefined)?.code;
  return rawCode === '40001';
}

/**
 * Gestión de personas de un tenant. TODA operación queda acotada al `tenantId`
 * de la sesión de quien pide (nunca al de un body/param separado): es la capa de
 * defensa en profundidad del aislamiento multi-tenant, junto al `TenantScopeGuard`
 * que corta cross-tenant por la URL. Un `personId` de otro tenant bajo la URL
 * propia da 404 (no se filtra ni se toca dato ajeno).
 */
@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea el primer `OWNER` activo de un tenant (bootstrap con master key).
   *
   * **Estrategia de exclusión mutua:** en lugar de `Serializable` (que
   * generaba falsos `P2034` bajo alta contención entre transacciones de
   * distintos tenants), nos apoyamos en el índice único parcial:
   *
   *   `UNIQUE ON Person (tenantId) WHERE role = 'OWNER' AND active = true`
   *
   * Si dos bootstrap llegan concurrentemente para el mismo tenant:
   *  - Uno pasa el `findFirst`, crea el owner y commitea.
   *  - El otro también pasa el `findFirst` (aún no ve el commit del primero
   *    bajo Read Committed), intenta el `create` y recibe `P2002` (violación
   *    del índice único) → se convierte en 409.
   *
   * El `findFirst` previo es una verificación temprana que evita el hash de
   * argon2 cuando ya existe un owner (ruta mayoritaria), y produce un mensaje
   * de error claro. Para la condición de carrera, el `P2002` del `create` es
   * el árbitro final.
   *
   * Si el `tenantId` no existe, el `create` viola la FK (`P2003`) → 404.
   */
  async bootstrapOwner(
    tenantId: string,
    dto: BootstrapOwnerDto,
  ): Promise<PersonResponse> {
    const email = normalizeEmail(dto.email);

    // Verificación temprana: si ya hay owner activo, evitamos el hash costoso.
    const existingOwner = await this.prisma.person.findFirst({
      where: { tenantId, role: PersonRole.OWNER, active: true },
    });
    if (existingOwner) {
      throw new ConflictException('El tenant ya tiene un owner activo');
    }

    const passwordHash = await hashPassword(dto.password);

    try {
      const person = await this.prisma.person.create({
        data: {
          tenantId,
          email,
          passwordHash,
          role: PersonRole.OWNER,
          active: true,
        },
      });
      return toPersonResponse(person);
    } catch (error) {
      // Condición de carrera: otro bootstrap concurrente ganó la carrera y el
      // índice único parcial rechaza este INSERT. Mismo resultado externo que
      // «ya hay owner activo».
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('El tenant ya tiene un owner activo');
      }
      // Tenant inexistente: el `create` viola la FK.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Tenant no encontrado');
      }
      throw error;
    }
  }

  /**
   * Crea una persona en el `tenantId` de la sesión. Si el DTO trae `password`,
   * se usa esa (sin devolver `temporaryPassword`); si no viene, se genera una
   * temporal y se devuelve una única vez (AC-17). Email ya en uso (constraint
   * `@unique` global) ⇒ se captura el `P2002` de Prisma y se responde 409 sin
   * crear nada (AC-18).
   */
  async create(
    tenantId: string,
    dto: CreatePersonDto,
  ): Promise<PersonResponse | PersonResponseWithTemporaryPassword> {
    const email = normalizeEmail(dto.email);
    const generatedPassword =
      dto.password === undefined ? generateTemporaryPassword() : undefined;
    const plainPassword = generatedPassword ?? dto.password!;
    const passwordHash = await hashPassword(plainPassword);

    try {
      const person = await this.prisma.person.create({
        data: {
          tenantId,
          email,
          passwordHash,
          role: dto.role,
          active: true,
        },
      });
      const response = toPersonResponse(person);
      if (generatedPassword !== undefined) {
        return { ...response, temporaryPassword: generatedPassword };
      }
      return response;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe una persona con ese email');
      }
      throw error;
    }
  }

  /** Lista las personas del tenant de la sesión (AC-19), saneadas sin el hash. */
  async list(tenantId: string): Promise<PersonResponse[]> {
    const people = await this.prisma.person.findMany({ where: { tenantId } });
    return people.map(toPersonResponse);
  }

  /**
   * Lista las personas activas del tenant, saneadas al mínimo necesario para
   * poblar un selector de asignación (ambos roles, no solo OWNER). A
   * diferencia de `list`, no incluye personas inactivas ni el resto de los
   * campos sensibles.
   */
  async listAssignable(
    tenantId: string,
  ): Promise<Array<{ id: string; email: string; role: PersonRole }>> {
    return this.prisma.person.findMany({
      where: { tenantId, active: true },
      select: { id: true, email: true, role: true },
    });
  }

  /**
   * Desactiva una persona del propio tenant (AC-20). Todo dentro de una
   * `$transaction`: si el `personId` no existe o es de otro tenant ⇒ 404; si es
   * el único owner activo del tenant (desactivarla dejaría al tenant sin ningún
   * owner activo) ⇒ 409 sin cambios (AC-21). En el caso feliz, marca
   * `active = false` y borra TODAS sus sesiones en la misma transacción, para
   * que no quede una ventana donde una sesión previa siga siendo usable.
   */
  async deactivate(
    tenantId: string,
    personId: string,
  ): Promise<PersonResponse> {
    const person = await this.prisma.$transaction(async (tx) => {
      const target = await tx.person.findFirst({
        where: { id: personId, tenantId },
      });
      if (!target) {
        throw new NotFoundException('Persona no encontrada');
      }

      if (target.active && target.role === PersonRole.OWNER) {
        const activeOwners = await tx.person.count({
          where: { tenantId, role: PersonRole.OWNER, active: true },
        });
        if (activeOwners <= 1) {
          throw new ConflictException(
            'No se puede desactivar al último owner activo del tenant',
          );
        }
      }

      const updated = await tx.person.update({
        where: { id: personId },
        data: { active: false },
      });
      await tx.session.deleteMany({ where: { personId } });
      return updated;
    });

    return toPersonResponse(person);
  }

  /**
   * Regenera la contraseña de una persona del propio tenant (AC-23). Dentro de
   * una `$transaction`: reemplaza el `passwordHash` por uno nuevo y borra TODAS
   * sus sesiones (invalidación inmediata, sin ventana). Devuelve la contraseña
   * temporal en claro una única vez; nunca se persiste ni se loguea.
   */
  async resetPassword(
    tenantId: string,
    personId: string,
  ): Promise<PersonResponseWithTemporaryPassword> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const person = await this.prisma.$transaction(async (tx) => {
      const target = await tx.person.findFirst({
        where: { id: personId, tenantId },
      });
      if (!target) {
        throw new NotFoundException('Persona no encontrada');
      }
      const updated = await tx.person.update({
        where: { id: personId },
        data: { passwordHash },
      });
      await tx.session.deleteMany({ where: { personId } });
      return updated;
    });

    return { ...toPersonResponse(person), temporaryPassword };
  }
}
