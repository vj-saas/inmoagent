---
name: t20-ac16-regression-verification
description: T20 (onboarding) fue tarea de verificación pura, no de código; patrón para tareas similares de regresión sin tocar tests existentes
metadata:
  type: project
---

T20 de V-C-onboarding-tenant pedía correr `test/admin-properties.e2e-spec.ts` y
`test/admin-guard-composite.e2e-spec.ts` SIN MODIFICARLOS para verificar AC-16
(alta de tenant y rotación de token) tras T1-T19. Ambos pasaron en verde
(58/58) sin ningún cambio de código. Suite completa: 300 unit + 241 e2e = 541
en verde (2026-07-25).

**Why:** cuando una tarea "medium" es de verificación/regresión (no agrega
feature), el criterio de éxito es que los tests existentes sigan en verde tal
cual están — no hay que escribir nada nuevo. Si hubieran fallado, la regla
explícita era NO arreglar código de producción por mi cuenta, solo diagnosticar
causa raíz (via git log de T1-T19) y reportar como bloqueante crítico al
coordinador.

**How to apply:** ante tareas tipo "correr sin modificar X para verificar que Y
sigue funcionando", no busques trabajo adicional que hacer — correr el/los
comandos y documentar el resultado (verde o rojo con diagnóstico) ES la tarea
completa. Docker (Postgres puerto 5434, Redis 6381 vía docker-compose) ya
estaba levantado de sesiones previas (T9, T19), no hizo falta levantarlo de
nuevo.
