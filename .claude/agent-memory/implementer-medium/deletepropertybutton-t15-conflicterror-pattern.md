---
name: deletepropertybutton-t15-conflicterror-pattern
description: T15 (V-D-portal-propiedades) DeletePropertyButton — testear 409 con ConflictError real, no Error genérico
metadata:
  type: project
---

`DeletePropertyButton.tsx` calca el patrón de `ReleaseHandoffButton.tsx` (modal de
confirmación + `useApi`), pero además debe mostrar el mensaje del backend ante 409
en un `ErrorBanner` sin disparar `onDeleted` (AC-10: el padre no hace optimistic
update, la fila debe seguir en la lista).

**Why:** `http-client.ts` mapea 409 a `ConflictError` cuyo `.message` ya es el
string que devolvió el backend (`extractMessage`). Si el test del 409 usa
`new Error('algo')` en vez de `ConflictError`, el test pasa igual (porque
`useApi` solo chequea `instanceof Error`) pero no verifica que el mensaje real
del backend llegue al usuario — mejor usar `ConflictError` explícitamente en el
mock de rechazo para que el test sea representativo del caso real.

**How to apply:** en componentes que consumen errores HTTP tipados de
`http-client.ts` (`ConflictError`, `ValidationError`, etc.), preferir esos tipos
concretos en los mocks de test de error en vez de `new Error(...)` genérico,
sobre todo cuando el AC exige mostrar el mensaje específico del backend.
Relacionado con [[endpoints-t9-property-typing]].
