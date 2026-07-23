---
name: useapi-typed-function-cast
description: useApi<T> espera (...args:unknown[])=>Promise<T>; pasar una función tipada (ej. listPeople(tenantId,token)) directo da error TS2345 por contravarianza de parámetros
metadata:
  type: feedback
---

Al usar `useApi` (frontend/src/hooks/useApi.ts) con una función de `endpoints.ts`
que tiene parámetros tipados (no `unknown[]`), TypeScript falla con
`Types of parameters 'x' and 'args' are incompatible` porque `useApi<T>` exige
`(...args: unknown[]) => Promise<T>` y las funciones de endpoints tienen firmas
concretas (`string, string`).

**Por qué:** contravarianza estricta de parámetros de función en modo strict.

**Cómo aplicar:** castear al pasar la función: `useApi<R>(fn as (...args:
unknown[]) => Promise<R>)`. No cambiar la firma de `useApi` ni de los
endpoints — es más simple castear en el call site. También recordar en
`fetchPeople`/wrappers que llaman a `run(...)` sin `await`: encadenar
`.catch(() => {})` porque `run` relanza el error (para que otros callers puedan
manejarlo) y si no se atrapa en efectos/handlers sin await, Vitest reporta
"Unhandled Rejection" aunque el test pase (falso positivo potencial).

Ver [[appcontext-logout-already-calls-endpoint]] y
[[login-page-mocking-pattern]] para otros patrones de esta capa.
