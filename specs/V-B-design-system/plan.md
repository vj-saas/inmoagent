# Plan V-B: Design system y UI base del dashboard

> Producido por `planner`. Define CÓMO se construye lo que la spec pide.

## Arquitectura

Migración de presentación pura sobre la SPA existente (`frontend/`: Vite 5 +
React 18 + TS strict + Vitest/jsdom). No se toca `api/`, `auth/`, `hooks/` ni el
ruteo de `App.tsx`: la lógica de datos queda intacta (AC-10).

Se introducen tres capas nuevas, de abajo hacia arriba:

```
frontend/
├── vite.config.ts              + plugin @tailwindcss/vite  (build de CSS)
├── vitest.config.ts            SIN CAMBIOS (jsdom no procesa CSS)
├── src/
│   ├── index.css               @import "tailwindcss" + theme + legacy
│   ├── styles/
│   │   ├── theme.css           <- UNICA fuente de tokens (@theme de Tailwind v4)
│   │   └── legacy.css          <- CSS artesanal actual, temporal, se borra al final
│   ├── lib/cn.ts               clsx + tailwind-merge
│   ├── components/
│   │   ├── ui/                 <- NUEVO: Button, Input, Select, Card, Table,
│   │   │                          Badge, Toast, Modal, Skeleton, EmptyState,
│   │   │                          AsyncSection
│   │   ├── Spinner / ErrorBanner / Pagination   reimplementados con ui/ + tokens
│   │   └── leads|agenda|dashboard/              migran junto a su página dueña
│   └── routes/                 8 rutas migradas, una por tarea
```

Flujo de estilos en runtime: `theme.css` declara los tokens dentro de `@theme`,
Tailwind v4 los emite como custom properties (`--color-*`, `--radius-*`, ...) y
genera de ellos las utilidades (`bg-surface`, `rounded-card`, `text-muted`). Los
componentes de `ui/` solo usan esas utilidades; las páginas solo usan componentes
de `ui/` y utilidades de layout. Nadie escribe un hex, un tamaño de fuente ni un
radio fuera de `theme.css` (AC-3).

Flujo de trabajo: infraestructura -> primitivas -> una ruta por tarea, en el
orden fijado por la spec, con `npm run test` en verde en cada paso intermedio y
con el CSS legacy vivo hasta la última tarea.

## Entidades / módulos afectados

### Infraestructura y tokens

| Archivo / módulo | Se crea o modifica | Qué cambia |
| --- | --- | --- |
| `frontend/package.json` | modifica | Suma `tailwindcss` + `@tailwindcss/vite` (dev) y `class-variance-authority`, `clsx`, `tailwind-merge` (runtime, ~6 KB min+gzip sumadas). Nada más. |
| `frontend/vite.config.ts` | modifica | Agrega el plugin `tailwindcss()` a `plugins`. Sin archivo de PostCSS. |
| `frontend/vitest.config.ts` | sin cambios | Explícito: `test.css` sigue en `false` (default), jsdom stubea los imports de CSS y el plugin no hace falta ahí. |
| `frontend/src/styles/theme.css` | crea | Archivo ÚNICO de tokens: paleta, tipografía, escala de espaciado, radios, sombras, breakpoints, dentro de un bloque `@theme`. |
| `frontend/src/styles/legacy.css` | crea y luego borra | Recibe tal cual el CSS artesanal actual de `index.css` (selectores de elemento `button`/`input`/`select`/`a`/`label`). Vive solo durante la migración. |
| `frontend/src/index.css` | modifica | Queda como orquestador: import de Tailwind + `theme.css` + `legacy.css` + capa base mínima (font-family, fondo, `box-sizing`). |
| `frontend/src/lib/cn.ts` | crea | Helper `cn(...)` = `twMerge(clsx(...))` para que el `className` del consumidor gane sobre el default del componente. |
| `frontend/Dockerfile` | sin cambios | `npm ci` ya instala devDependencies antes de `npm run build`; Tailwind corre en build time (ver riesgo del binario nativo). |

### Componentes base nuevos (`frontend/src/components/ui/`)

| Archivo | Se crea | Qué contiene |
| --- | --- | --- |
| `ui/Button.tsx` | crea | `<button>` nativo con `cva`: `variant` (primary / secondary / ghost / danger), `size` (sm / md), `loading`. |
| `ui/Input.tsx` | crea | `<input>` nativo + estados focus/disabled/error por token. No envuelve el label (los tests usan `getByLabelText`). |
| `ui/Select.tsx` | crea | `<select>` NATIVO estilado (no combobox custom): preserva `userEvent.selectOptions` de los tests existentes. |
| `ui/Card.tsx` | crea | Superficie (`Card`, `CardHeader`, `CardBody`) con radio, borde y sombra de token. |
| `ui/Table.tsx` | crea | `Table`/`THead`/`TBody`/`Tr`/`Th`/`Td` sobre elementos nativos + wrapper `TableScroll` con `overflow-x-auto` (clave para AC-8). |
| `ui/Badge.tsx` | crea | Píldora con `tone` (neutral / info / success / warning / danger). |
| `ui/Toast.tsx` | crea | `ToastProvider` + `useToast()`; región `aria-live="polite"`; contexto con default NO-OP para que una página renderizada sin provider en un test no explote. |
| `ui/Modal.tsx` | crea | `role="dialog" aria-modal="true"`, overlay, cierre con Escape y click afuera, foco inicial al primer control. Sin portal ni `<dialog>`. |
| `ui/Skeleton.tsx` | crea | Bloque de carga con `animate-pulse`; variantes `text`, `row`, `card`. |
| `ui/EmptyState.tsx` | crea | Estado vacío: glifo, título y mensaje en español, `data-testid` configurable (para conservar `leads-empty`, `call-queue-empty`). |
| `ui/AsyncSection.tsx` | crea | Patrón ÚNICO de carga/error/vacío (ver decisiones). |
| `ui/index.ts` | crea | Barrel de exportación de `ui/`. |
| `ui/*.test.tsx` | crea | Tests nuevos de las primitivas (variantes, passthrough de `className` y props nativas, Escape en Modal, no-op de `useToast` sin provider). |

### Componentes existentes

| Archivo | Se crea o modifica | Qué cambia |
| --- | --- | --- |
| `src/components/Spinner.tsx` | modifica | Reimplementado con Tailwind; mantiene `data-testid="spinner"` y la prop `text`. Se elimina el `<style>` inline con `@keyframes`. |
| `src/components/ErrorBanner.tsx` | modifica | Reimplementado con tokens; mantiene `data-testid="error-banner"` y el texto del mensaje. |
| `src/components/Pagination.tsx` | modifica | Usa `Button`; mantiene los testids `pagination*`. |
| `src/components/index.ts` | modifica | Re-exporta también `./ui`. |
| `src/components/dashboard/MetricCard.tsx`, `DateRangePicker.tsx` | modifica | Migran con `DashboardPage` (usan `Card`, `Input`). |
| `src/components/leads/*` (13 archivos) | modifica | Migran junto a su página dueña: `LeadRow`, `LeadsList`, `LeadChips`, `LeadSearchInput`, `LeadStateFilter` con `LeadsPage`; `MessageTimeline`, `LeadNotes`, `NoteForm`, `AssignmentControl`, `ContactedToggle`, `OptOutButton`, `ReleaseHandoffButton`, `SuppressLeadButton` con `LeadDetailPage`; `CallQueueRow` con `CallQueuePage`. |
| `src/components/agenda/*` (5 archivos) | modifica | Migran con `AgendaPage`; `AppointmentStatusBadge` pasa a usar `Badge`. |

### Rutas (orden de migración fijado por la spec)

| Archivo | Qué cambia |
| --- | --- |
| `src/routes/LoginPage.tsx` | Prueba del patrón: `Card` + `Input` + `Button`; 9 inline styles -> 0. |
| `src/routes/DashboardPage.tsx` | `Card`/`MetricCard`, `AsyncSection` con skeleton de tarjetas, grilla responsive 1 -> 2 -> 4 columnas. |
| `src/routes/LeadsPage.tsx` | `TableScroll` + `Table`, `EmptyState` (conserva `leads-empty`), filtros apilados en mobile. |
| `src/routes/LeadDetailPage.tsx` | `Card` por bloque (ficha, notas, timeline), formularios con `Input`/`Select`/`Button`, modal de supresión sobre `ui/Modal` (conserva `suppress-lead-modal`). |
| `src/routes/AgendaPage.tsx` | `TableScroll`, `Badge` de estado, estado vacío NUEVO (hoy no existe). |
| `src/routes/CallQueuePage.tsx` | `TableScroll` + `EmptyState` (conserva `call-queue-empty`). |
| `src/routes/PeoplePage.tsx` | `Table` + `Card` del alta, modal de contraseña temporal sobre `ui/Modal` (conserva `temporary-password-modal`), estado vacío NUEVO, skeleton de tabla. |
| `src/routes/AppLayout.tsx` | Header responsive con UNA sola lista de links en el DOM (ver riesgos); `main` con padding y `max-w` por token. Última ruta migrada. |
| `src/App.tsx` | Único cambio: montar `<ToastProvider>` alrededor de `AppRoutes` (aditivo, no altera rutas). |

## Decisiones técnicas

- **Tailwind CSS v4 con el plugin oficial de Vite (`@tailwindcss/vite`), no v3 +
  PostCSS.** v4 es CSS-first: el bloque `@theme` es a la vez la declaración de
  tokens y la fuente de las utilidades generadas, lo que hace literal el "único
  archivo de tokens" de AC-3 sin duplicar valores entre un `tailwind.config.ts` y
  variables CSS. El entorno lo soporta (Vite 5.4, Node 24 local / Node 20 en el
  Dockerfile). Alternativas descartadas: (a) Tailwind v3 + `postcss.config.js` +
  `tailwind.config.ts`, que obliga a mantener tokens en JS y además re-exponerlos
  como CSS vars para lo que no es utilidad (dos lugares, contra AC-3); (b) CSS
  Modules o vanilla-extract, que no traen escalas ni utilidades responsive y
  dejarían todo el sistema de tokens hecho a mano.

- **Los tokens viven en `frontend/src/styles/theme.css`, en un único bloque
  `@theme`; `index.css` solo importa.** `theme.css` define paleta semántica
  (`--color-bg`, `--color-surface`, `--color-border`, `--color-text`,
  `--color-text-muted`, `--color-primary` + hover, `--color-danger`,
  `--color-success`, `--color-warning`), familia y escala tipográfica, escala de
  espaciado (base 4px), radios (`--radius-sm/card/pill`) y sombras. Se parte de
  los valores que ya están en `index.css` para que la migración no cambie la
  identidad visual de golpe; el ajuste de marca se hace después, en un solo
  archivo. Alternativa descartada: dejar los tokens dentro de `index.css` junto
  al reset, que mezcla configuración con estilos y complica el gate de AC-3
  porque ese mismo archivo tendría reglas con valores.

- **Sin alias arroba-barra: imports relativos, como en todo el frontend.**
  shadcn asume rutas tipo arroba/components/ui; adoptarlo obliga a tocar
  `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts` y `vitest.config.ts`
  (resolve.alias en los dos últimos, o los tests rompen). Riesgo alto para un
  beneficio cosmético: al copiar cada componente se reescribe su import a
  relativo.

- **shadcn/ui como fuente de código copiado al repo (decisión cerrada de la
  spec), pero sin Radix UI.** Se copian estructura, clases y API de shadcn para
  `Button`, `Input`, `Card`, `Table`, `Badge`, `Skeleton`. Para `Select`, `Dialog`
  y `Toast`, shadcn depende de paquetes `@radix-ui/react-*`, y eso choca con dos
  restricciones duras: (1) los tests existentes manejan el select con
  `userEvent.selectOptions` y `getByLabelText`, y un combobox de Radix (div con
  roles ARIA en un portal) rompe `LeadStateFilter`, `AssignmentControl`,
  `AppointmentStatusFilter` y `PeoplePage`, violando AC-4 y AC-10; (2) sumaría
  entre 3 y 6 paquetes de runtime, contra el "sin dependencia de runtime pesada"
  del alcance. Entonces: `Select` es un select nativo estilado, `Modal` es un div
  con role dialog + Escape + click afuera + foco inicial (el modal de supresión
  actual ya es casero y funciona), y `Toast` es contexto de React + región
  aria-live. Alternativas descartadas: Radix completo (rompe tests y engorda el
  bundle) y el elemento dialog nativo con showModal (jsdom 25 no lo implementa y
  los tests del modal fallarían).

- **`class-variance-authority` + `clsx` + `tailwind-merge` sí entran.** Son las
  tres dependencias que shadcn asume, pesan unos 6 KB min+gzip sumadas y no
  arrastran árbol propio. `cva` da la convención de variantes tipada (variant y
  size con defaults) y evita reimplementar un switch de strings en cada
  primitiva; `tailwind-merge` resuelve el conflicto real de que el consumidor
  pase un padding por `className` mientras el default del componente trae otro,
  que con concatenación simple se resuelve por orden en el CSS generado y no por
  intención. Alternativa descartada: solo `clsx` con variantes a mano, barato al
  principio, pero el bug de clases en conflicto aparece sí o sí con 9 primitivas
  usadas desde 21 archivos.

- **Convención de props de las primitivas.** Todas: `forwardRef`; props que
  extienden `ComponentPropsWithoutRef` del elemento nativo correspondiente (así
  `id`, `name`, `disabled`, atributos aria, `data-testid` y los handlers pasan
  sin declararlos uno por uno); variantes vía `VariantProps` de `cva`;
  `className` mergeado ÚLTIMO con `cn()`; elemento semántico nativo en la raíz,
  sin wrappers extra que agreguen nodos donde los tests hacen `getByRole`. Ningún
  componente de `ui/` hace fetch, conoce rutas ni importa de `api/`: son
  presentacionales puros.

- **Patrón único de carga/error/vacío: `AsyncSection`.** Props: `loading`,
  `error`, `isEmpty`, `skeleton?`, `loadingLabel?`, `emptyTitle?`,
  `emptyMessage?`, `emptyTestId?`, `children`. Render mutuamente excluyente en
  este orden: si `loading`, el `skeleton` recibido o un `Spinner` con
  `loadingLabel`; si `error`, un `ErrorBanner` con `errorMessage(error)`; si
  `isEmpty`, un `EmptyState`; si no, `children`. Se apoya en el helper
  `errorMessage()` que las páginas ya usan y en los testids `spinner` y
  `error-banner` existentes, así que reemplazar los ternarios actuales de cada
  página es mecánico y no cambia lo que los tests observan. Una sola
  implementación cubre AC-5, AC-6 y AC-7 en las 8 rutas. Alternativa descartada:
  un hook `useAsyncState()`, porque el problema no es el estado (ya lo da
  `useApi`, que está fuera de alcance) sino el render repetido.

- **Migración incremental con el CSS legacy convivente.** Tailwind v4 incluye
  Preflight, que resetea button, input y select; si el CSS artesanal se borra en
  la primera tarea, las 7 páginas todavía no migradas quedan sin estilo
  (regresión visual real, aunque los tests pasen). Por eso el CSS actual se mueve
  intacto a `styles/legacy.css` y se importa DESPUÉS del import de Tailwind: sus
  selectores de elemento ganan sobre Preflight (misma capa base, mayor orden) y
  pierden contra cualquier utilidad de Tailwind (capa utilities, de mayor
  precedencia). Resultado: toda página migrada se ve con el sistema nuevo y toda
  página sin migrar sigue viéndose como hoy, en cada commit intermedio. La última
  tarea borra `legacy.css` y su import, y recién ahí corren los gates de AC-1 y
  AC-3. Alternativa descartada: big-bang de las 8 páginas en una rama larga, que
  rompe el requisito de que ningún punto intermedio quede roto y es irrevisable.

- **Orden de tareas.** (1) infraestructura + tokens + `cn`; (2) primitivas de
  `ui/` con sus tests; (3) `Spinner`, `ErrorBanner` y `Pagination`
  reimplementados, porque los usan todas las páginas y tienen que estar antes de
  la primera ruta; (4) `LoginPage`, prueba del patrón, la única ruta sin
  `AppLayout` alrededor y con tests que ya fijan spinner y error; (5 a 10)
  `DashboardPage`, `LeadsPage`, `LeadDetailPage`, `AgendaPage`, `CallQueuePage`
  y `PeoplePage`, cada una junto con sus componentes de `components/leads`,
  `components/agenda` y `components/dashboard` en la MISMA tarea, para que
  ninguna pantalla quede mitad Tailwind mitad artesanal ni por un commit
  (decisión 1 de la spec); (11) `AppLayout` + `ToastProvider` en `App.tsx`; (12)
  limpieza de `legacy.css` y gates finales. `npm run test` completo al cierre de
  cada tarea.

- **Verificación de 375px: checklist manual reproducible + guardrail
  automatizado acotado.** jsdom no tiene motor de layout (no aplica CSS y todo
  `offsetWidth` da 0), así que un test de "no hay scroll horizontal" en Vitest
  sería un falso verde. Automatizarlo de verdad exige Playwright: runner nuevo,
  binarios de navegador y CI, fuera del alcance de dependencias que fija la spec.
  Entonces:
  - **Manual, guiado:** `specs/V-B-design-system/responsive-checklist.md`, con
    una fila por ruta y el procedimiento exacto: viewport 375x667 y, en consola,
    comparar `document.documentElement.scrollWidth` contra
    `document.documentElement.clientWidth` (evidencia objetiva de AC-8), más
    inspección visual de nav, tablas, formularios y targets táctiles (AC-9). Lo
    ejecuta el verificador con el navegador de verificación y deja el resultado
    registrado por ruta.
  - **Automatizado (lo honesto en jsdom):** un `responsive-guardrails.test.tsx`
    que renderiza cada ruta y verifica que toda tabla esté dentro de un
    contenedor con `overflow-x-auto`, más un gate de grep que prohíbe anchos
    fijos en píxeles en `routes/` y `components/`. Es la causa raíz número uno
    del overflow y sí se puede chequear sin layout. Queda documentado que ese
    test NO prueba AC-8: solo previene su causa más común.
  - Alternativa descartada: `matchMedia` con render condicional en JS para la nav
    mobile. Rompe los tests (jsdom no trae `matchMedia`) y duplicaría nodos en el
    DOM; el responsive se resuelve SOLO con clases de breakpoint.

## Riesgos y edge cases

- **Nav duplicada en `AppLayout` rompe los tests.** `AppLayout.test.tsx` usa
  `screen.getByText('Leads')`, que falla si hay más de una coincidencia. El
  patrón típico de nav de desktop + drawer mobile renderiza los links dos veces y
  rompe 6 tests. Mitigación obligatoria: UNA sola lista de links en el DOM,
  adaptada por CSS (fila con scroll horizontal propio o `flex-wrap`). Si se
  quiere un disclosure tipo hamburguesa, tiene que mostrar y ocultar esa misma
  lista, no una copia, y su botón no puede llamarse "Cerrar sesión" (hay un
  `getByRole` de botón con ese nombre exacto).
- **Scroll horizontal del nav frente a AC-8.** `overflow-x-auto` en el contenedor
  del nav es scroll del nav, no de la página: no viola AC-8 y es la salida más
  segura para 5 items en 375px.
- **`useToast()` sin provider.** Los tests renderizan páginas sueltas, sin
  `App.tsx`. Si el contexto lanza al no encontrar provider, cualquier página que
  use toasts rompe su suite. El default del contexto tiene que ser un no-op
  silencioso.
- **Preflight cambia el look de páginas no migradas si el orden de imports está
  mal.** `legacy.css` debe importarse después del import de Tailwind. Si el
  orden de capas no alcanzara, el fallback es envolver el legacy en una capa base
  explícita; en cualquier caso, verificar visualmente al menos una página no
  migrada por commit.
- **Binario nativo de Tailwind v4 en el build de Docker.** El lockfile se genera
  en Windows y `npm ci` dentro de `node:20-slim` necesita la variante linux-x64
  de `@tailwindcss/oxide`. npm registra las optional deps de todas las
  plataformas en el lock v3, pero conviene validar con un `docker build` real
  antes de cerrar la fase; si falla, completar el lock instalando con os y cpu
  forzados a linux/x64.
- **AC-1 tiene un falso negativo fácil.** El gate no puede buscar solo
  `style={{`: `AppLayout` y `Spinner` declaran objetos `CSSProperties` en
  variables y los pasan como `style={navLinkStyle}`. El gate correcto es cero
  ocurrencias de `style={` Y cero de `CSSProperties` bajo `src/routes/` y
  `src/components/`.
- **Los testids y los textos son contrato.** Ningún componente migrado puede
  perder ni renombrar los `data-testid` que usan los tests (`spinner`,
  `error-banner`, `leads-empty`, `call-queue-empty`, `suppress-lead-modal`,
  `temporary-password-modal`, `appointment-*`, `lead-*`, `pagination*`, y el
  resto), ni cambiar los textos en español que los tests matchean.
- **Los estados vacíos nuevos pueden romper tests existentes.** `AgendaPage` y
  `PeoplePage` hoy no tienen empty state; al agregarlo, un test que asuma "tabla
  vacía renderizada" puede fallar. Hay que leer `AgendaPage.test.tsx` y
  `PeoplePage.test.tsx` antes de decidir si el `EmptyState` reemplaza la tabla o
  se muestra debajo del encabezado; AC-4 prohíbe borrar o skipear tests, no
  tocar el DOM.
- **Tablas en 375px.** `overflow-x-auto` en el wrapper evita el overflow de
  página, pero deja columnas fuera de vista. Para `LeadsPage` y `CallQueuePage`,
  que son las de uso en la calle, evaluar ocultar columnas secundarias con
  utilidades de breakpoint (nunca desmontando el nodo en JS: los tests podrían
  buscarlas). Se decide ruta por ruta en el checklist.
- **Foco visible.** La spec deja WCAG fuera de alcance, pero Preflight elimina el
  outline por defecto: cada primitiva interactiva tiene que traer un anillo de
  foco con el token de primario, o el dashboard queda inoperable por teclado.
- **Performance y bundle.** Tailwind v4 emite solo lo usado; el CSS final debería
  quedar en decenas de KB. Verificar que `npm run build` (con minify terser) siga
  funcionando y que el tamaño de la hoja generada sea razonable.
- **Volumen del alcance ampliado (decisión 1 de la spec).** Son 54 ocurrencias en
  21 archivos, 33 de ellas en `components/leads`, `components/agenda` y
  `components/dashboard`. El riesgo real de la fase es de volumen, no de
  dificultad: la mitigación es el troceo por página con la suite completa en
  verde al cierre de cada tarea.

## Trazabilidad

- **AC-1** -> migración página por página con sus componentes hijos en la misma
  tarea, más la tarea final de limpieza y el gate de grep (`style={` y
  `CSSProperties` en cero bajo `src/routes/` y `src/components/`).
- **AC-2** -> `src/components/ui/` con las 9 primitivas más el barrel; cada ruta
  migrada las consume y la revisión de cada tarea rechaza reimplementaciones
  locales.
- **AC-3** -> `styles/theme.css` como único `@theme`; primitivas y páginas solo
  usan utilidades derivadas; gate de grep de hex, `rgb(` y tamaños o radios
  literales fuera de `theme.css`.
- **AC-4** -> ningún test se borra ni se skipea; `npm run test` corre completo al
  cierre de cada una de las 12 tareas; se preservan testids y textos en español;
  `Select` sigue siendo un select nativo y `Modal` no usa portal ni el elemento
  dialog, para no romper las queries actuales.
- **AC-5** -> rama `loading` de `AsyncSection` (skeleton en listados y dashboard,
  spinner en formularios) aplicada en las 8 rutas.
- **AC-6** -> rama `error` de `AsyncSection` con `ErrorBanner` y `errorMessage()`,
  que ya devuelve mensajes en español; render mutuamente excluyente, nunca datos
  parciales.
- **AC-7** -> rama `isEmpty` con `EmptyState` en `LeadsPage`, `AgendaPage`,
  `CallQueuePage` y `PeoplePage` (las dos primeras conservan los testids
  `leads-empty` y `call-queue-empty`; Agenda y People lo suman).
- **AC-8** -> responsive solo con clases; `TableScroll` con `overflow-x-auto` en
  las 4 vistas de tabla; nav de `AppLayout` con scroll propio; gate de grep
  contra anchos fijos y verificación de scrollWidth contra clientWidth a 375px
  por ruta en el checklist.
- **AC-9** -> checklist manual por ruta a 375x667 (nav, tablas, formularios y
  targets táctiles de al menos 40px por el token de tamaño de `Button` e
  `Input`), con resultado registrado ruta por ruta.
- **AC-10** -> no se tocan `api/`, `auth/`, `hooks/useApi.ts` ni las rutas de
  `App.tsx` (único cambio: envolver con `ToastProvider`); la suite existente, que
  fija fetch, acciones y visibilidad por `person.role`, es la red de seguridad.

## Follow-up de V-C (2026-07-25)

V-B declaró en esta spec "no agregar páginas ni rutas nuevas" (decisión 1 de la
spec). Sin embargo, V-C (onboarding de tenant) suma dos rutas nuevas al
frontend: `OnboardingWizardPage` (frontend/src/routes/OnboardingWizardPage.tsx)
y `TenantConfigPage` (frontend/src/routes/TenantConfigPage.tsx).

**Recomendación:** estas dos rutas deben agregarse a la cola de migración de
V-B post-hoc, ya sea como follow-up explícito de esa fase o como tareas
asignadas al siguiente ciclo de refactor del design system. Idealmente, no
deberían quedar como páginas con CSS artesanal una vez que V-B cierre.

(No requiere cambios en V-C ni bloquea V-B; es una nota de coordinación para
el backlog del proyecto.)

## Aprobaciones pendientes

> Fase no crítica (no toca aislamiento multi-tenant ni guardrails de LLM/FSM):
> no requiere aprobación humana por fase. Se listan igual las decisiones que
> conviene que el usuario conozca antes de `task-splitter`:

1. **Tailwind v4 (CSS-first) en vez de v3 con config en JS**, para que el archivo
   único de tokens de AC-3 sea literal.
2. **shadcn/ui copiado sin Radix**: select nativo, modal y toast caseros. Es lo
   que permite cumplir AC-4 sin tocar los tests existentes.
3. **AC-8 y AC-9 se verifican con checklist manual a 375px** (más guardrails
   estructurales en Vitest), no con un test automatizado de layout: jsdom no
   puede probarlo y Playwright excede el alcance de dependencias de la spec.
