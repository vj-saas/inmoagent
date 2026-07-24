---
name: appointmentactionform-t4-props
description: Props finales de AppointmentActionForm (B2-vista-agenda T4), consumidas por AppointmentRow en T5
metadata:
  type: project
---

`frontend/src/components/agenda/AppointmentActionForm.tsx` quedó con esta interfaz:

```ts
export type AppointmentActionFormMode = 'confirm' | 'reschedule';
export interface AppointmentActionFormSubmitData {
  scheduledAt: string; // ISO
  assignedUserId?: string;
  notes?: string;
}
export interface AppointmentActionFormProps {
  mode: AppointmentActionFormMode;
  assignableUsers?: AssignableUser[]; // solo se usa/renderiza si mode==='confirm'
  onSubmit: (data: AppointmentActionFormSubmitData) => void;
  onVolver: () => void; // cierra sin invocar onSubmit, botón "Volver"
  disabled?: boolean;
}
```

Detalles importantes para quien consuma esto (T5/AppointmentRow):
- El botón submit dice "Confirmar cita" o "Reprogramar cita" (nunca "Confirmar" a
  secas) — deliberado para no colisionar con el regex anclado `/^confirmar$/i`
  de AC-5 en AgendaPage.test.tsx, que apunta al botón "Confirmar" de la fila.
- Botón "Volver" (no "Cancelar") para no colisionar con el "Cancelar" de la fila.
- Validación de fecha vacía/inválida muestra el texto exacto "Selecciona una
  fecha y hora" y NO invoca onSubmit — el test de AgendaPage matchea con
  `/seleccion[aá] una fecha/i`.
- Notas y selector de asesor solo se muestran/envían en mode 'confirm'
  (AC-9: reschedule solo manda scheduledAt).
- `assignedUserId`/`notes` en el submit se omiten (no se envían strings vacíos)
  si el usuario no los tocó.

Why: T1 (endpoints.ts con Appointment/AppointmentStatus/listAppointments etc.)
ya estaba hecho al momento de implementar T4, así que no hubo que inventar tipos.
`AssignableUser` se reusó de endpoints.ts (ya existía por T10/A.5 de leads).

How to apply: T5 (AppointmentRow) debe importar este componente y mapear
mode='confirm' para PROPOSED→Confirmar y mode='reschedule' para
CONFIRMED→Reprogramar, pasando la lista de asesores solo en el primer caso.
