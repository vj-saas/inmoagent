---
name: mutation-check-critical-branches
description: En código crítico-adyacente (messaging/outbound), verificar los tests nuevos mutando la rama a propósito antes de dar la tarea por cerrada
metadata:
  type: feedback
---

Cuando una tarea introduce una rama nueva en código del que depende el bot en
producción (`src/messaging/outbound.processor.ts`, `src/messaging/messaging.service.ts`,
`src/pipeline/*`), no alcanza con que la suite quede verde: forzar la mutación
(`if (cond)` -> `if (false)` y luego `if (true)`) y confirmar que falla el test
nuevo Y el test del camino viejo, después restaurar desde una copia.

**Why:** verde no prueba que el test cubra lo que dice cubrir. En T6 de
`specs/V-B2-bandeja-manual` el riesgo era doble persistencia (dos burbujas del
mismo mensaje al lead) y un test que pasara por accidente habría dejado pasar la
regresión al bot real.

**How to apply:** copiar el archivo al scratchpad antes de mutar, correr solo el
spec afectado (rápido), restaurar con `cp` y re-correr para confirmar verde.
Sirve además como evidencia concreta para el reporte de "verifiqué, no asumí"
que pide la tarea. Ver [[e2e-parallel-flake]] para la distinción entre fallo real
y flake.
