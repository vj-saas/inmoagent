# Plan B.4: Notificaciones push del panel (Web Push / VAPID)

> Producido por `planner`. Define CÓMO se construye lo que la spec B.4 pide.
> Pipeline **crítico**: el aislamiento multi-tenant de `PushSubscription` es
> superficie crítica según `CLAUDE.md`. La sección "Aislamiento multi-tenant"
> y la de "Aprobaciones pendientes" requieren visto bueno humano explícito
> antes de pasar a `task-splitter`.

## Arquitectura

Tres frentes, acoplados solo por dos contratos: el HTTP de
`/admin/tenants/:tenantId/push-subscriptions` y el JSON del payload push.

**1. Dominio push (backend, módulo nuevo `src/push/`).** Concentra TODO lo que
sabe de Web Push: el modelo, las queries filtradas por tenant, el armado del
payload y el único archivo que importa la librería `web-push`. No importa
ningún módulo de negocio (solo `PrismaModule`, que es global, y `ConfigService`)
→ puede ser importado por `ConversationModule` y por `AdminModule` sin riesgo de
ciclo.

**2. Superficie HTTP (backend, `src/admin/push/`).** El controller de alta/baja
vive en `AdminModule` porque ahí viven los guards (`PersonOrApiKeyGuard`,
`PersonSessionRequiredGuard`, `TenantThrottlerGuard`) y ahí cuelga toda la API
del panel. Mismo reparto que ya existe entre `src/appointments/` (dominio) y
`src/admin/appointments/` (HTTP admin).

**3. Frontend (Vite + React 18, `frontend/`).** El bundler real es **Vite 5**
(`frontend/vite.config.ts`, `@vitejs/plugin-react`, build `tsc && vite build`,
servido en prod por `serve -s dist`). No hay Workbox, ni `vite-plugin-pwa`, ni
`manifest.webmanifest` hoy: el panel es una SPA, no una PWA instalable. Por eso
el service worker se agrega como archivo estático plano en `frontend/public/`.

Flujo end-to-end:

```
  [Bot / FSM]                                [Panel admin]
  SchedulingHandler.enterScheduling          AppointmentsAdminService.confirm
        | appointments.propose() -> PROPOSED       | updateOrThrowConflict(...)
        | leadAlert.notify()  (INTACTO)            | assignedUserId != null
        v                                          v
        +----------> AppointmentPushNotifier <-----+   (src/push, nunca lanza)
                              |
              PushSubscriptionsService (queries SIEMPRE con tenantId)
                              |  subs
                              v
                    WEB_PUSH_SENDER (token DI)
                              |  'sent' | 'gone' | 'failed'
                    WebPushLibSender  <- unico import de `web-push`
                              |            'gone' => borrar sub por id
                              v
                    [FCM / Mozilla / WNS]
                              v
                    frontend/public/sw.js  (push -> showNotification;
                                            notificationclick -> payload.url)
```
