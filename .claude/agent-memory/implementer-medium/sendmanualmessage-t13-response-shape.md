---
name: sendmanualmessage-t13-response-shape
description: sendManualMessage (endpoints.ts) devuelve {message, lead}, no solo Message
metadata:
  type: project
---

`POST .../leads/:leadId/send` (backend `AdminLeadMessagingService.sendManual`,
T8/T9) devuelve `SendManualResult = { message: Message; lead: Lead }`, no un
`Message` suelto. El frontend (`sendManualMessage` en
`frontend/src/api/endpoints.ts`, T13) tipa el retorno como
`SendManualMessageResponse` calcado de esa interfaz.

**Por qué:** al escribir T13 asumí en un borrador inicial que el endpoint
devolvía solo el mensaje creado; el controller (`admin-leads.controller.ts`,
método `send`) reenvía tal cual el resultado del service, que incluye también
el `lead` actualizado (útil porque el envío puede tocar el estado del lead).

**Cómo aplicar:** T15/T16/T18 (que consumen `sendManualMessage`) deben leer
`.message` y opcionalmente `.lead` de la respuesta, no tratarla como `Message`
directamente. Ver [[t13-sendmanualmessage]] si se crea esa memoria específica.
