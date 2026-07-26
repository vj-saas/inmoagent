---
name: usereventsetup-overwrites-navigator-clipboard
description: userEvent.setup() en @testing-library/user-event v14 instala su propio stub de navigator.clipboard, pisando cualquier mock previo
metadata:
  type: feedback
---

Al testear botones de "copiar" que usan `navigator.clipboard.writeText`, si se
mockea `navigator.clipboard` (con `Object.defineProperty` o similar) **antes**
de llamar a `userEvent.setup()`, el stub interno de clipboard de user-event v14
pisa el mock: el componente termina llamando a un `Clipboard` real de
user-event (un `EventTarget` con `Symbol(Manage ClipboardSub)`), no al mock, y
el spy queda con 0 llamadas sin ningún error — parece que el handler nunca se
ejecuta, pero sí se ejecuta.

**Por qué:** perdí ~40 minutos debuggeando esto en [[t12-tenant-create-form-apikeyreveal]]
(WizardStepper/TenantCreateForm/ApiKeyReveal, T12 de V-C-onboarding-tenant)
porque el síntoma (mock con 0 llamadas) parece indicar que el evento no llegó
al handler, cuando en realidad sí llegó pero llamó a otro objeto.

**Cómo aplicar:** en tests de copy-to-clipboard con userEvent, llamar primero
`const user = userEvent.setup()` y RECIÉN DESPUÉS mockear con
`vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)`
(spyOn sobre el objeto que instaló user-event, no defineProperty desde cero).
Patrón usado en `frontend/src/components/onboarding/ApiKeyReveal.test.tsx`.
