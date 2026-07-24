---
name: agendapage-t7-daterangepicker-mount-emit
description: AgendaPage/DashboardPage — DateRangePicker emite onChange también al montar; no dupliques la carga inicial con un useEffect propio
metadata:
  type: feedback
---

`DateRangePicker` invoca `onChange` (con el rango normalizado) apenas se monta,
no solo cuando el usuario edita las fechas. Si además la página orquestadora
dispara la carga inicial en su propio `useEffect([tenantId, range, ...])`,
`listAppointments`/`getMetrics` se invoca 2 veces al montar en vez de 1, y
tests que assertan `toHaveBeenCalledTimes(1)` en la carga inicial fallan.

**Por qué:** el patrón correcto (ya usado en `DashboardPage.tsx`) es NO tener
un `useEffect` propio para la carga inicial: `handleRangeChange` (pasado como
`onChange` a `DateRangePicker`) es la única vía que dispara `run(...)`, tanto
en el mount como en cambios posteriores. Un segundo disparador (filtro de
estado, etc.) debe reusar el `range` actual desde el estado, no re-triggerear
vía otro `useEffect`.

**Cómo aplicar:** en cualquier página que combine `DateRangePicker` +
`useApi`, replicar el patrón: sin `useEffect` de carga inicial, todos los
handlers (`onChange` de filtros) llaman directamente a una función compartida
tipo `fetchX(range, otrosFiltros)`.

También: la ventana "hoy a próximos 7 días" se expresa como
`to = today + 6 días` (no `+7`), porque `DateRangePicker` normaliza `to` a
`23:59:59.999` del día elegido — con `+7` el diff redondeado da 8 días, no 7.

Nota aparte (no corregida, reportada): `AppointmentStatusFilter` (select con
`<option>Confirmada</option>`) y el badge de estado en `AppointmentRow`
(`Confirmada` visible) generan texto duplicado; un test que hace
`screen.getByText('Confirmada')` sin scope falla por "multiple elements
found". Es un conflicto entre dos componentes ya aprobados de otras tareas;
no se tocó ninguno de los dos, se dejó como falla conocida y reportada.
Ver [[t18-integration-verification-pattern]] para el patrón de reportar en vez
de tocar piezas aprobadas.
