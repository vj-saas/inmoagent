# Tasks V-B: Design system y UI base del dashboard

> Producido por `task-splitter`. Tareas atómicas derivadas de `plan.md`, cada
> una despachable a un implementer. Vive en
> `specs/V-B-design-system/tasks.md`.
>
> Nota de clasificación: el CLAUDE.md de este proyecto define low/medium/high
> en términos de módulos del backend NestJS (`conversation`, `webhook`,
> `pipeline`, `llm`, `properties`, `leads`, `appointments`, `admin`, etc.); no
> tiene una categoría explícita para `frontend/`. Esta fase es puramente de
> presentación (spec, "Fuera de alcance": no toca `api/`, `auth/`, `hooks/` ni
> el contrato con el backend), así que ninguna tarea es **high**: no hay FSM,
> guardrails, multi-tenant, cifrado ni migraciones Prisma involucradas. Se
> aplica el criterio explícito del CLAUDE.md por analogía: **low** para
> config/build tooling y limpieza/formato puros (equivalente a "ajustes de
> config" y "formato/estilo"); **medium** para todo lo que construye o
> modifica componentes/rutas con estado real (carga/error/vacío,
> accesibilidad de foco, preservación de testids y comportamiento) —
> equivalente a "refactors locales" del CLAUDE.md. Ante la duda entre low y
> medium (p. ej. tareas de limpieza que además cierran gates de toda la
> migración) se elige el nivel más alto, siguiendo la regla general del
> proceso SDD.

## Tareas

## T1 — Infraestructura: Tailwind v4, tokens y helper `cn`
- **Dificultad:** low ← config de build (`package.json`, `vite.config.ts`) y
  archivo de tokens nuevo, sin lógica de negocio ni riesgo (equivalente a
  "ajustes de config" del CLAUDE.md)
- **Descripción:** Agregar `tailwindcss` + `@tailwindcss/vite` (dev) y
  `class-variance-authority`, `clsx`, `tailwind-merge` (runtime) a
  `frontend/package.json`. Agregar el plugin `tailwindcss()` a
  `frontend/vite.config.ts` (sin PostCSS). Dejar `frontend/vitest.config.ts`
  explícitamente sin cambios (`test.css` en `false`). Crear
  `frontend/src/styles/theme.css` con paleta, tipografía, espaciado, radios y
  sombras dentro de un único bloque `@theme`, partiendo de los valores ya
  presentes en `index.css`. Crear `frontend/src/styles/legacy.css` con el CSS
  artesanal actual movido tal cual (selectores de elemento). Reescribir
  `frontend/src/index.css` como orquestador: import de Tailwind + `theme.css`
  + `legacy.css` + capa base mínima. Crear `frontend/src/lib/cn.ts`
  (`cn = (...) => twMerge(clsx(...))`). Validar `docker build` real del
  `Dockerfile` para descartar el riesgo del binario nativo de
  `@tailwindcss/oxide` en linux/x64.
- **Valida:** prerrequisito estructural de AC-2 y AC-3 (no se valida
  directamente con un test de comportamiento; se verifica con `npm run build`
  limpio, `npm run test` completo sin regresiones — nada consume Tailwind
  todavía — y build de Docker exitoso). Hueco a cerrar si se quiere cobertura
  explícita: un smoke test que confirme que una clase Tailwind se emite en el
  CSS de build.
- **Dependencias:** ninguna
- **Paralelizable:** no (bloquea todas las tareas siguientes)

## T2 — Primitivas `ui/`: Button, Input, Select, Card, Table, Badge, Toast, Modal, Skeleton, EmptyState, AsyncSection
- **Dificultad:** medium ← librería de componentes nueva, consumida por las 8
  rutas; sin lógica de negocio pero con superficie amplia (accesibilidad,
  variantes, contratos de props) — más que "config/formato", equivalente a
  "refactors locales" del CLAUDE.md
- **Descripción:** Crear en `frontend/src/components/ui/`: `Button.tsx`
  (`cva`: variant primary/secondary/ghost/danger, size sm/md, `loading`),
  `Input.tsx` (nativo, sin envolver label), `Select.tsx` (nativo, preserva
  `userEvent.selectOptions`), `Card.tsx` (`Card`/`CardHeader`/`CardBody`),
  `Table.tsx` (`Table`/`THead`/`TBody`/`Tr`/`Th`/`Td` + `TableScroll` con
  `overflow-x-auto`), `Badge.tsx` (tone neutral/info/success/warning/danger),
  `Toast.tsx` (`ToastProvider` + `useToast()`, `aria-live="polite"`, default
  no-op sin provider), `Modal.tsx` (`role="dialog" aria-modal="true"`,
  Escape, click afuera, foco inicial, sin portal ni `<dialog>`),
  `Skeleton.tsx` (variantes text/row/card), `EmptyState.tsx` (glifo + título
  + mensaje en español, `data-testid` configurable), `AsyncSection.tsx`
  (render mutuamente excluyente loading → error → empty → children) e
  `index.ts` (barrel). Todas con `forwardRef`, props que extienden
  `ComponentPropsWithoutRef` del elemento nativo, `className` mergeado último
  con `cn()`. Escribir `ui/*.test.tsx` nuevos: variantes, passthrough de
  `className`/props nativas, Escape del Modal, no-op de `useToast()` sin
  provider.
- **Valida:** AC-2 vía los `ui/*.test.tsx` nuevos (existencia y contrato de
  las 9 primitivas + barrel).
- **Dependencias:** T1
- **Paralelizable:** no (única tarea de esta capa; T3 depende de ella)

## T3 — Reimplementar `Spinner`, `ErrorBanner` y `Pagination` con `ui/`
- **Dificultad:** medium ← refactor local de componentes compartidos por las
  8 rutas; preservar testids y comportamiento es el riesgo real
- **Descripción:** Reimplementar `src/components/Spinner.tsx` con Tailwind
  (elimina el `<style>` inline con `@keyframes`), mantiene
  `data-testid="spinner"` y la prop `text`. Reimplementar
  `src/components/ErrorBanner.tsx` con tokens, mantiene
  `data-testid="error-banner"` y el texto del mensaje. Reimplementar
  `src/components/Pagination.tsx` usando `Button` de `ui/`, mantiene los
  testids `pagination*`. Actualizar `src/components/index.ts` para
  re-exportar también `./ui`.
- **Valida:** AC-1 (cero `style={{...}}` en estos tres archivos), AC-5/AC-6
  (Spinner y ErrorBanner siguen siendo el vehículo de esos estados) vía los
  tests existentes `Spinner.test.tsx`, `ErrorBanner.test.tsx`,
  `Pagination.test.tsx` (o los tests de las páginas que los ejercitan si no
  hay archivo dedicado — verificar antes de empezar).
- **Dependencias:** T2
- **Paralelizable:** no (bloquea T4, primera ruta)

## T4 — Migrar `LoginPage` (prueba de patrón)
- **Dificultad:** medium ← primera ruta migrada, sin `AppLayout` alrededor;
  fija el patrón que repiten T5-T10
- **Descripción:** Migrar `src/routes/LoginPage.tsx` a `Card` + `Input` +
  `Button`, eliminando las 9 `style={{...}}` inline. Cablear `AsyncSection`
  (o el patrón equivalente puntual, dado que es un formulario y no un
  listado) para los estados de carga/error existentes.
- **Valida:** AC-1 (cero inline styles en `LoginPage.tsx`), AC-5, AC-6 vía
  `LoginPage.test.tsx`.
- **Dependencias:** T3
- **Paralelizable:** no (el plan fija este orden de migración; siguiente
  ruta depende de que esta cierre con `npm run test` en verde)

## T5 — Migrar `DashboardPage` + `components/dashboard/*`
- **Dificultad:** medium
- **Descripción:** Migrar `src/routes/DashboardPage.tsx` a `Card`/
  `MetricCard`, `AsyncSection` con skeleton de tarjetas, grilla responsive
  1 → 2 → 4 columnas. Migrar en la misma tarea `MetricCard.tsx` y
  `DateRangePicker.tsx` (usan `Card`, `Input`) para que la pantalla no quede
  mitad Tailwind mitad artesanal.
- **Valida:** AC-1, AC-5, AC-6 vía `DashboardPage.test.tsx` (y los tests de
  `MetricCard`/`DateRangePicker` si existen archivos dedicados).
- **Dependencias:** T4
- **Paralelizable:** no (archivos propios, pero el plan fija migración
  secuencial una ruta a la vez con suite completa en verde en cada cierre)

## T6 — Migrar `LeadsPage` + `components/leads/{LeadRow,LeadsList,LeadChips,LeadSearchInput,LeadStateFilter}`
- **Dificultad:** medium
- **Descripción:** Migrar `src/routes/LeadsPage.tsx` a `TableScroll` + `Table`,
  `EmptyState` conservando el testid `leads-empty`, filtros apilados en
  mobile. Migrar en la misma tarea `LeadRow`, `LeadsList`, `LeadChips`,
  `LeadSearchInput`, `LeadStateFilter` (dueños de la pantalla).
- **Valida:** AC-1, AC-5, AC-6, AC-7 (empty state conserva `leads-empty`),
  AC-8 (tabla envuelta en `TableScroll`) vía `LeadsPage.test.tsx` y los tests
  de los componentes de `components/leads/` listados arriba.
- **Dependencias:** T5
- **Paralelizable:** no (orden fijado por el plan)

## T7 — Migrar `LeadDetailPage` + `components/leads/{MessageTimeline,LeadNotes,NoteForm,AssignmentControl,ContactedToggle,OptOutButton,ReleaseHandoffButton,SuppressLeadButton}`
- **Dificultad:** medium
- **Descripción:** Migrar `src/routes/LeadDetailPage.tsx` a `Card` por bloque
  (ficha, notas, timeline), formularios con `Input`/`Select`/`Button`, modal
  de supresión sobre `ui/Modal` conservando el testid
  `suppress-lead-modal`. Migrar en la misma tarea `MessageTimeline`,
  `LeadNotes`, `NoteForm`, `AssignmentControl`, `ContactedToggle`,
  `OptOutButton`, `ReleaseHandoffButton`, `SuppressLeadButton`.
- **Valida:** AC-1, AC-5, AC-6, AC-4 (el modal de supresión conserva
  `suppress-lead-modal` y no rompe queries existentes) vía
  `LeadDetailPage.test.tsx` y los tests de los componentes listados arriba.
- **Dependencias:** T6
- **Paralelizable:** no (orden fijado por el plan)

## T8 — Migrar `AgendaPage` + `components/agenda/*` (5 archivos, incluye `AppointmentStatusBadge`)
- **Dificultad:** medium
- **Descripción:** Migrar `src/routes/AgendaPage.tsx` a `TableScroll`, con
  `Badge` de estado y un estado vacío NUEVO (hoy `AgendaPage` no tiene uno).
  Migrar en la misma tarea los 5 archivos de `components/agenda/*`;
  `AppointmentStatusBadge` pasa a usar `Badge`. Leer `AgendaPage.test.tsx`
  ANTES de agregar el empty state para decidir si reemplaza la tabla o se
  muestra debajo del encabezado, sin borrar ni tocar ningún test existente.
- **Valida:** AC-1, AC-5, AC-6, AC-7 (empty state nuevo), AC-8
  (`TableScroll`) vía `AgendaPage.test.tsx` y los tests de
  `components/agenda/`.
- **Dependencias:** T7
- **Paralelizable:** no (orden fijado por el plan)

## T9 — Migrar `CallQueuePage` + `CallQueueRow`
- **Dificultad:** medium
- **Descripción:** Migrar `src/routes/CallQueuePage.tsx` a `TableScroll` +
  `EmptyState`, conservando el testid `call-queue-empty`. Migrar en la misma
  tarea `CallQueueRow` (de `components/leads/`).
- **Valida:** AC-1, AC-5, AC-6, AC-7 (conserva `call-queue-empty`), AC-8 vía
  `CallQueuePage.test.tsx`.
- **Dependencias:** T8
- **Paralelizable:** no (orden fijado por el plan)

## T10 — Migrar `PeoplePage`
- **Dificultad:** medium
- **Descripción:** Migrar `src/routes/PeoplePage.tsx` a `Table` + `Card` del
  alta, modal de contraseña temporal sobre `ui/Modal` conservando el testid
  `temporary-password-modal`, estado vacío NUEVO (hoy no existe), skeleton de
  tabla. Leer `PeoplePage.test.tsx` antes de agregar el empty state, mismo
  cuidado que en T8.
- **Valida:** AC-1, AC-5, AC-6, AC-7 (empty state nuevo), AC-4 (modal de
  contraseña conserva `temporary-password-modal`) vía `PeoplePage.test.tsx`.
- **Dependencias:** T9
- **Paralelizable:** no (orden fijado por el plan; última ruta antes de
  `AppLayout`)

## T11 — Migrar `AppLayout` + montar `ToastProvider` en `App.tsx`
- **Dificultad:** medium ← riesgo real de romper tests por nav duplicada
  (`getByText('Leads')` falla con más de una coincidencia); cambio aditivo en
  `App.tsx`
- **Descripción:** Migrar `src/routes/AppLayout.tsx` a header responsive con
  UNA sola lista de links en el DOM (adaptada por CSS, `overflow-x-auto`
  propio del nav o `flex-wrap`; si hay disclosure tipo hamburguesa, muestra y
  oculta la misma lista, no una copia; su botón no puede llamarse "Cerrar
  sesión"), `main` con padding y `max-w` por token. Único cambio en
  `src/App.tsx`: envolver `AppRoutes` con `<ToastProvider>` (aditivo, no
  altera rutas).
- **Valida:** AC-1, AC-8 (nav con scroll propio, no scroll de página), AC-9
  (nav no cortada/superpuesta a 375px), AC-10 (roles visibles según
  `person.role` sin cambios) vía `AppLayout.test.tsx`; smoke de que
  `App.tsx` sigue montando todas las rutas sin cambios de comportamiento.
- **Dependencias:** T10
- **Paralelizable:** no (última ruta migrada del plan)

## T12 — Limpieza de `legacy.css`, gates de grep y checklist responsive final
- **Dificultad:** medium ← tarea de cierre que valida toda la migración
  (riesgo de regresión si algo quedó sin migrar); ante la duda entre low y
  medium se elige el nivel más alto
- **Descripción:** Borrar `frontend/src/styles/legacy.css` y su import en
  `index.css`. Correr y dejar en verde los gates de grep: cero `style={` y
  cero `CSSProperties` bajo `src/routes/` y `src/components/` (AC-1); cero
  hex/`rgb(`/tamaños o radios literales fuera de `theme.css` (AC-3); grep
  contra anchos fijos en píxeles en `routes/` y `components/`. Crear
  `responsive-guardrails.test.tsx` que renderiza cada una de las 8 rutas y
  verifica que toda tabla esté dentro de un contenedor con
  `overflow-x-auto`. Completar
  `specs/V-B-design-system/responsive-checklist.md` con una fila por ruta:
  viewport 375x667, comparar `document.documentElement.scrollWidth` contra
  `clientWidth` en consola (evidencia de AC-8), más inspección visual de
  nav, tablas, formularios y targets táctiles ≥40px (AC-9). Correr
  `npm run test` completo y `npm run build` como gate final de AC-4.
- **Valida:** AC-1, AC-3 (gates de grep), AC-4 (suite completa sin tests
  eliminados/skippeados), AC-8 (`responsive-guardrails.test.tsx` +
  checklist manual), AC-9 (checklist manual por ruta) — todos vía los gates
  y `responsive-guardrails.test.tsx` de esta tarea más
  `responsive-checklist.md` como evidencia registrada, no un test
  automatizado (jsdom no tiene motor de layout; documentado en el plan como
  limitación conocida).
- **Dependencias:** T11
- **Paralelizable:** no (cierre de la fase)

## Orden de ejecución sugerido

> Lo usa `task-router` para despachar. El plan fija una migración
> estrictamente secuencial (una ruta a la vez, CSS legacy convivente hasta el
> final, `npm run test` en verde en cada cierre), así que no hay grupos
> paralelos dentro de la secuencia de rutas — cada tarea depende de que la
> anterior haya cerrado en verde.

- **Paso 1:** T1 (infraestructura y tokens)
- **Paso 2:** T2 (primitivas `ui/`)
- **Paso 3:** T3 (Spinner/ErrorBanner/Pagination)
- **Paso 4:** T4 (LoginPage, prueba de patrón)
- **Paso 5:** T5 (DashboardPage)
- **Paso 6:** T6 (LeadsPage)
- **Paso 7:** T7 (LeadDetailPage)
- **Paso 8:** T8 (AgendaPage)
- **Paso 9:** T9 (CallQueuePage)
- **Paso 10:** T10 (PeoplePage)
- **Paso 11:** T11 (AppLayout + ToastProvider)
- **Paso 12:** T12 (limpieza de legacy.css + gates finales)

## Cobertura de criterios

- AC-1 → T3, T4, T5, T6, T7, T8, T9, T10, T11, T12 ✓ (gate final en T12)
- AC-2 → T2 ✓
- AC-3 → T1, T12 ✓ (gate final en T12)
- AC-4 → T4-T11 (ningún test tocado en cada tarea) + T12 (gate final de
  suite completa) ✓
- AC-5 → T3, T4, T5, T6, T7, T8, T9, T10, T11 ✓
- AC-6 → T3, T4, T5, T6, T7, T8, T9, T10, T11 ✓
- AC-7 → T6 (leads-empty), T8 (nuevo), T9 (call-queue-empty), T10 (nuevo) ✓
- AC-8 → T6, T7 (implícito vía tabla si aplica), T8, T9, T11 (nav), T12
  (gate + checklist) ✓
- AC-9 → T11 (nav), T12 (checklist manual por ruta, cubre las 8 rutas) ✓
- AC-10 → T11 (AppLayout preserva roles); implícito en T4-T10 al no tocar
  `api/`/`auth/`/`hooks/` en ninguna tarea ✓

Sin huecos: los 10 AC de la spec tienen al menos una tarea que los valida.
Único punto abierto (no bloqueante, señalado en T1 y T12): la infraestructura
de Tailwind (T1) no tiene un test de aceptación propio más allá de build
limpio, y AC-8/AC-9 se verifican en T12 con checklist manual más un guardrail
estructural en Vitest — no con un test automatizado de layout real, según la
limitación de jsdom documentada en `plan.md`.
