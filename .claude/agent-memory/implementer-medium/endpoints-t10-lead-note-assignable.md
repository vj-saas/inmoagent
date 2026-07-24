---
name: endpoints-t10-lead-note-assignable
description: T10 A.4 agregó LeadNote/AssignableUser/Message tipos y 7 funciones nuevas a endpoints.ts
metadata:
  type: project
---

`frontend/src/api/endpoints.ts` (T10, spec A.4) ya tiene: `LeadNote`,
`AssignableUser`, `Message` (tipado real desde `model Message` en
schema.prisma: direction IN/OUT, type TEXT/AUDIO/IMAGE/DOCUMENT/TEMPLATE/UNSUPPORTED),
y `Lead` extendido con `contactedAt`, `assignedUserId`, `nextActionAt`
(todos `string | null`). Funciones agregadas: `createNote`, `getLeadNotes`,
`markContacted`, `markUncontacted`, `optOutLead`, `patchAssignment`,
`listAssignableUsers`. Los TODO(A.3) de `getLead`/`getLeadMessages`/
`releaseLead`/`suppressLead` ya se sacaron — estas 4 funciones están
completas y consumibles, no son más stubs.

Por: no había backend corriendo; se validó con `endpoints.test.ts`
mockeando `http-client` (patrón `vi.mock('./http-client', ...)` +
`requestMock.toHaveBeenCalledWith(url, {method, body?, token})`), igual
que el resto del archivo.

Cómo aplicar: en tareas de componentes (T11-T17 de A.4) estas funciones y
tipos ya están disponibles para importar directamente, no hace falta
re-crearlas ni volver a chequear TODOs.
