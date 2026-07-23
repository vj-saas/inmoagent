---
name: project-conventions
description: Convenciones reales de agente-inmo (NestJS + Prisma). Patrón de módulo/servicio, manejo de errores, naming y regla multi-tenant. Se precarga en los implementers para que no infieran el patrón mirando el codebase cada vez.
---

# Convenciones de agente-inmo

Patrón real del proyecto para que los implementers escriban código que se
mimetiza con lo existente. Fuente: `src/` + `CLAUDE.md`.

## 1. Patrón de un servicio / módulo típico

Servicios `@Injectable()` que reciben `PrismaService` por constructor. **Toda
query filtra por `tenantId`.** Ejemplo real (`src/leads/leads.service.ts`):

```ts
import { Injectable } from '@nestjs/common';
import type { Lead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Busca el lead de `phone` en `tenantId` o lo crea si es su primer mensaje. */
  findOrCreateByPhone(tenantId: string, phone: string): Promise<Lead> {
    const now = new Date();
    return this.prisma.lead.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      update: { lastMessageAt: now },
      create: { tenantId, phone, lastMessageAt: now },
    });
  }
}
```

Obligatorio replicar:
- Un módulo NestJS por dominio (`src/<dominio>/<dominio>.module.ts`), con su
  `.service.ts`, y `.controller.ts` solo si expone HTTP.
- Inyección por constructor con `private readonly`.
- `tenantId: string` como primer parámetro de todo método que toque datos de un
  tenant. Nunca una query sin filtrar por tenant (salvo módulos internos
  explícitamente marcados — ver CLAUDE.md).
- Tipos de dominio importados desde `@prisma/client` con `import type`.
- DTOs de entrada HTTP validados con `class-validator`.
- Env accedido vía `@nestjs/config` tipado (schema zod en `src/config/`), nunca
  `process.env` crudo disperso.

## 2. Convención de manejo de errores

- Errores de dominio: excepciones HTTP de Nest (`NotFoundException`,
  `BadRequestException`, `ForbiddenException`, etc.), captadas por los exception
  filters. No swallowear errores en silencio.
- Nada de secretos ni PII en los mensajes de error.
- Logs estructurados con **pino** (`nestjs-pino`), siempre con el contexto
  disponible: `tenantId`, `leadId`, `waMessageId`.
- Guardrails de la FSM/LLM: ante output inválido del LLM, se descarta y se
  responde por el camino seguro (`safe-reply` / `output-validator`), nunca se
  envía al lead algo sin validar contra la DB.

## 3. Convención de naming

- Archivos: `kebab-case` por rol — `*.service.ts`, `*.controller.ts`,
  `*.module.ts`, `*.processor.ts` (workers BullMQ), `*.client.ts` (clientes
  HTTP externos), `*.guard.ts`, `*.util.ts`, `*.types.ts`, `*.schema.ts`.
- Clases / tipos: `PascalCase` (`LeadsService`, `MetaGraphClient`).
- Métodos / variables: `camelCase`.
- Tests: `*.spec.ts` junto al archivo que prueban (unit, Jest); e2e en `test/`
  vía `test/jest-e2e.json`, con fixtures reales de Meta en `test/fixtures/meta/`.
- Código e identificadores en **inglés**; mensajes al lead en **español**.
- Commits convencionales: `feat:`, `fix:`, `chore:`.

---

> Ampliá este archivo cuando aparezcan patrones nuevos representativos (p. ej. un
> processor BullMQ ejemplar, o el patrón de un controller con DTOs). Cuanto más
> fiel al código real, menos tiene que inferir cada implementer.
