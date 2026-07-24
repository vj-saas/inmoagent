---
name: appointmentrow-t5-props
description: Props finales de AppointmentRow (B2-vista-agenda T5) para que T6/T7 lo consuman correctamente
metadata:
  type: project
---

`AppointmentRow` (frontend/src/components/agenda/AppointmentRow.tsx) quedó con estas props:

```ts
export interface AppointmentRowProps {
  appointment: Appointment;
  tenantId: string;
  token: string;
  assignableUsers?: AssignableUser[];
  onUpdated: (updated: Appointment) => void;
}
```

- `onUpdated` se invoca con el `Appointment` que devuelve el backend tras confirm/reschedule/cancel/done/no-show; el padre (AppointmentsList/AgendaPage) debe reemplazar in-place por `id`, no gestiona pending/error interno.
- El formulario de confirmar/reprogramar se renderiza condicionalmente (`openForm === 'confirm' | 'reschedule' | null`), lo que desmonta/monta `AppointmentActionForm` en vez de mantenerlo siempre montado — evita el problema de estado sucio que señaló code-reviewer en [[appointmentactionform-t4-props]].
- Botón "Confirmar" de la fila (regex `/^confirmar$/i`) es un texto distinto del botón "Confirmar cita" del form (regex `/confirmar cita/i`); nunca coexisten en el DOM porque el form reemplaza a los botones.

**Why:** AgendaPage.test.tsx (T5-T7) exige data-testid="appointment-row", matriz exacta de botones por status, y que el error de una acción no cambie el status mostrado.
**How to apply:** T6 (AppointmentsList) debe pasar tenantId/token desde sesión y mapear `appointments.map(a => <AppointmentRow key={a.id} ... onUpdated={...} />)`, reemplazando el item en el array local sin refetch.
