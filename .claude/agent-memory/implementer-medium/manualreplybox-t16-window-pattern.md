---
name: manualreplybox-t16-window-pattern
description: T16 (V-B2-bandeja-manual) ManualReplyBox — cálculo de ventana 24hs y trampas de vi.useFakeTimers en tests con setInterval
metadata:
  type: feedback
---

`ManualReplyBox.tsx` calcula el remanente de la ventana de servicio de 24hs
client-side a partir de `lead.lastInboundAt` (expiresAt = lastInboundAt + 24h,
`null` = vencida), refrescado con `setInterval` de 60s. Reusa
`resolveLeadMode` de [[leadmodebadge-t14-pattern]] para el caso OPTED_OUT.

**Por qué:** al testear el `setInterval` con `vi.useFakeTimers()`, mezclar
`vi.setSystemTime(fecha)` + `vi.advanceTimersByTime(ms)` da resultados
desincronizados (off-by-N-minutes) porque el reloj de fake timers y
`setSystemTime` no siempre avanzan en sincro. Además, actualizar el estado de
React desde un timer avanzado con `vi.advanceTimersByTime` fuera de `act()`
dispara el warning "not wrapped in act(...)" y a veces no refleja el nuevo
valor en el DOM antes del assert.

**Cómo aplicar:** para testear un `setInterval` que hace `setState`, usar
SOLO `vi.advanceTimersByTime(N * intervalMs)` (múltiplo del intervalo real)
envuelto en `act(() => { ... })`, sin combinarlo con `vi.setSystemTime`
después del mount. Para tests que no necesitan verificar el conteo exacto del
timer (ej. solo que la caja esté habilitada/deshabilitada), evitar fake
timers del todo y calcular timestamps relativos a `Date.now()` real
(`new Date(Date.now() - N * 60 * 60 * 1000).toISOString()`), así no hay que
sincronizar dos relojes falsos.
