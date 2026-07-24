import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  type Appointment,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CloseAppointmentDto } from './dto/close-appointment.dto';
import { ConfirmAppointmentDto } from './dto/confirm-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

type TransitionAction = 'confirm' | 'reschedule' | 'cancel' | 'done' | 'noShow';

/**
 * Tabla cerrada de la matriz de transiciones (spec B.1, decisión 1). Cada acción
 * mapea al conjunto de estados de ORIGEN válidos. Los tres terminales
 * (DONE/CANCELLED/NO_SHOW) no aparecen en ningún set → bloqueados para las cinco
 * acciones en un solo lugar (AC-15). La legalidad de la transición vive acá; la
 * acción concreta (fijar scheduledAt, tocar outcome) vive en cada método.
 */
const VALID_ORIGINS: Record<TransitionAction, Set<AppointmentStatus>> = {
  confirm: new Set([AppointmentStatus.PROPOSED]),
  reschedule: new Set([AppointmentStatus.CONFIRMED]),
  cancel: new Set([AppointmentStatus.PROPOSED, AppointmentStatus.CONFIRMED]),
  done: new Set([AppointmentStatus.CONFIRMED]),
  noShow: new Set([AppointmentStatus.CONFIRMED]),
};

@Injectable()
export class AppointmentsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Espejo de `AdminLeadsService.findLeadOrThrow`: centraliza el patrón
   * `findFirst({ id, tenantId }) -> 404 unificado`, barrera anti-oráculo de
   * existencia cross-tenant. NUNCA busca por `id` solo. Acepta un cliente de
   * transacción opcional por consistencia con el helper de leads.
   */
  async findAppointmentOrThrow(
    tenantId: string,
    aid: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Appointment> {
    const client = tx ?? this.prisma;
    const appointment = await client.appointment.findFirst({
      where: { id: aid, tenantId },
    });
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }
    return appointment;
  }

  /**
   * Valida la legalidad de la transición contra la tabla central. Lanza
   * `ConflictException` (409) si el estado actual no es un origen válido para la
   * acción (incluye cualquier intento desde un estado terminal — AC-15).
   */
  private assertTransition(
    current: AppointmentStatus,
    action: TransitionAction,
  ): void {
    if (!VALID_ORIGINS[action].has(current)) {
      throw new ConflictException(
        `Transición inválida: no se puede ${action} una cita en estado ${current}`,
      );
    }
  }

  /**
   * Ejecuta el `updateMany` condicionado al estado de origen y verifica su
   * `count`. El `where` con `status` acotado es lo que hace atómica la
   * transición sin `$transaction` (evita el TOCTOU entre `findAppointmentOrThrow`
   * y el update: si otra request cambió el estado en el medio, este `updateMany`
   * no matchea ninguna fila). Pero esa atomicidad solo protege algo si el
   * resultado se chequea: `count === 0` significa que la cita YA NO estaba en el
   * estado esperado al momento del update (carrera real, aunque `assertTransition`
   * haya validado un estado que ya no es el vigente), y debe rechazarse con 409
   * — nunca releer y devolver 200 con el estado en el que quedó por la otra
   * operación concurrente.
   */
  private async updateOrThrowConflict(
    where: Prisma.AppointmentWhereInput,
    data: Prisma.AppointmentUncheckedUpdateManyInput,
    action: TransitionAction,
  ): Promise<void> {
    const { count } = await this.prisma.appointment.updateMany({ where, data });
    if (count === 0) {
      throw new ConflictException(
        `Transición inválida: la cita cambió de estado antes de completar ${action}`,
      );
    }
  }

  /** PROPOSED → CONFIRMED, fija `scheduledAt` y opcionalmente `assignedUserId`/`notes`. */
  async confirm(
    tenantId: string,
    aid: string,
    dto: ConfirmAppointmentDto,
  ): Promise<Appointment> {
    const appointment = await this.findAppointmentOrThrow(tenantId, aid);
    this.assertTransition(appointment.status, 'confirm');

    if (dto.assignedUserId !== undefined) {
      const person = await this.prisma.person.findFirst({
        where: { id: dto.assignedUserId, tenantId },
      });
      if (!person) {
        throw new BadRequestException(
          'El usuario asignado no existe o pertenece a otro tenant',
        );
      }
    }

    const data: Prisma.AppointmentUncheckedUpdateManyInput = {
      status: AppointmentStatus.CONFIRMED,
      scheduledAt: new Date(dto.scheduledAt),
    };
    if (dto.assignedUserId !== undefined) {
      data.assignedUserId = dto.assignedUserId;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    await this.updateOrThrowConflict(
      { id: aid, tenantId, status: AppointmentStatus.PROPOSED },
      data,
      'confirm',
    );

    return this.findAppointmentOrThrow(tenantId, aid);
  }

  /** CONFIRMED → CONFIRMED: actualiza `scheduledAt` sin tocar `status`. */
  async reschedule(
    tenantId: string,
    aid: string,
    dto: RescheduleAppointmentDto,
  ): Promise<Appointment> {
    const appointment = await this.findAppointmentOrThrow(tenantId, aid);
    this.assertTransition(appointment.status, 'reschedule');

    const data: Prisma.AppointmentUncheckedUpdateManyInput = {
      scheduledAt: new Date(dto.scheduledAt),
    };
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    await this.updateOrThrowConflict(
      { id: aid, tenantId, status: AppointmentStatus.CONFIRMED },
      data,
      'reschedule',
    );

    return this.findAppointmentOrThrow(tenantId, aid);
  }

  /** PROPOSED|CONFIRMED → CANCELLED. */
  async cancel(
    tenantId: string,
    aid: string,
    dto: CancelAppointmentDto,
  ): Promise<Appointment> {
    const appointment = await this.findAppointmentOrThrow(tenantId, aid);
    this.assertTransition(appointment.status, 'cancel');

    const data: Prisma.AppointmentUncheckedUpdateManyInput = {
      status: AppointmentStatus.CANCELLED,
    };
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    await this.updateOrThrowConflict(
      {
        id: aid,
        tenantId,
        status: {
          in: [AppointmentStatus.PROPOSED, AppointmentStatus.CONFIRMED],
        },
      },
      data,
      'cancel',
    );

    return this.findAppointmentOrThrow(tenantId, aid);
  }

  /** CONFIRMED → DONE, con `outcome`/`notes` opcionales. */
  async done(
    tenantId: string,
    aid: string,
    dto: CloseAppointmentDto,
  ): Promise<Appointment> {
    return this.close(tenantId, aid, dto, 'done', AppointmentStatus.DONE);
  }

  /** CONFIRMED → NO_SHOW, con `outcome`/`notes` opcionales. */
  async noShow(
    tenantId: string,
    aid: string,
    dto: CloseAppointmentDto,
  ): Promise<Appointment> {
    return this.close(tenantId, aid, dto, 'noShow', AppointmentStatus.NO_SHOW);
  }

  private async close(
    tenantId: string,
    aid: string,
    dto: CloseAppointmentDto,
    action: 'done' | 'noShow',
    target: AppointmentStatus,
  ): Promise<Appointment> {
    const appointment = await this.findAppointmentOrThrow(tenantId, aid);
    this.assertTransition(appointment.status, action);

    const data: Prisma.AppointmentUncheckedUpdateManyInput = { status: target };
    if (dto.outcome !== undefined) {
      data.outcome = dto.outcome;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    await this.updateOrThrowConflict(
      { id: aid, tenantId, status: AppointmentStatus.CONFIRMED },
      data,
      action,
    );

    return this.findAppointmentOrThrow(tenantId, aid);
  }

  /**
   * Lista las citas del tenant. Filtro opcional por `status` (uno o varios) y por
   * rango de fecha sobre `scheduledAt` (las citas sin `scheduledAt` quedan fuera
   * del rango por diseño — spec B.1 decisión del GET). Sin paginación.
   */
  async list(
    tenantId: string,
    query: ListAppointmentsQueryDto,
  ): Promise<{ appointments: Appointment[] }> {
    const where: Prisma.AppointmentWhereInput = { tenantId };

    if (query.status && query.status.length > 0) {
      where.status = { in: query.status };
    }

    if (query.from || query.to) {
      where.scheduledAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: { sort: 'asc', nulls: 'last' } },
    });

    return { appointments };
  }
}
