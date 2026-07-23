# Memory index

- [Setup de vitest en frontend/](frontend-vitest-setup.md) — vitest no estaba instalado pese a tener config; agregarlo es mínimo, verificar con `npx vitest run`
- [Vitest config compartido en frontend/](vitest-shared-config-frontend.md) — coordinar package.json/vitest.config.ts entre tareas paralelas de tests
- [AuthContext: idempotencia ante 401 concurrentes](auth-context-401-idempotent.md) — patrón de ref-flag y cómo testear el callback de onUnauthorized sin fetch real
- [AuthContext.logout ya llama a endpoints.logout](appcontext-logout-already-calls-endpoint.md) — no duplicar la llamada en AppLayout/consumidores
- [LoginPage: mocking de useAuth + react-router-dom](login-page-mocking-pattern.md) — patrón de test para pantallas que dependen de ambos hooks
- [react-router-dom agregado en T11](react-router-dom-added.md) — no estaba instalado, se sumó v6.28; ya disponible para T12/T13/T17
- [useApi con funciones tipadas de endpoints.ts](useapi-typed-function-cast.md) — castear al pasar la función; encadenar .catch en llamadas sin await para evitar unhandled rejection
