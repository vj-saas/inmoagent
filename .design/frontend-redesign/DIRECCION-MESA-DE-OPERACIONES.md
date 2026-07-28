# Dirección de arte: "Mesa de operaciones"

Reemplaza la dirección Swiss/Editorial "Linear-like" descrita en `DESIGN_BRIEF.md`
(sección _Aesthetic Direction_). El resto del brief —problema, principios de
experiencia, IA, accesibilidad, alcance— sigue vigente tal cual está.

Fecha: 2026-07-28.

## Tesis

Este producto vende **tiempo**: la ventana de 24 hs de WhatsApp y los minutos que
un lead pasa esperando a una persona. El sistema visual se construye sobre eso,
no sobre contenedores decorados. La estética es editorial / neo-brutalista
refinada: tinta sobre papel, bloques macizos, reglas, y tipografía como
estructura.

## Las cinco reglas duras

1. **Radio cero y sombra cero.** `theme.css` sobreescribe toda la escala
   `--radius-*` y `--shadow-*` de Tailwind. Ningún `rounded-*` ni `shadow-*` del
   codebase redondea o eleva nada: la jerarquía la hacen las reglas (hairline /
   2px / bloque macizo). No se agregan gradientes en ningún lado; el único
   `repeating-linear-gradient` del sistema (`u-hatch`) es un rayado técnico de
   bordes duros para estados vacíos.
2. **Un solo acento.** Terracota ácida. `--color-accent` es la versión AA-safe
   para texto sobre papel; `--color-accent-loud` es el bloque macizo, y solo
   admite texto tinta (`--color-on-accent`, el único color que no cambia entre
   modos).
3. **Tipografía en dos registros.** `u-display` (Archivo con el eje de ancho al
   125%, versalita, tracking negativo) para titulares y cifras protagonistas.
   `u-meta` (IBM Plex Mono 11px, versalita, tracking abierto) para **toda**
   etiqueta, rótulo de columna, estado y unidad. `u-num` (cifras tabulares) para
   todo número que se compare en columna.
4. **La inversión es la microinteracción.** Hover de fila, hover de botón,
   ítem de navegación activo: todos usan el mismo gesto, `bg-invert` /
   `text-on-invert`. Nada se levanta, escala ni se desenfoca. El par de tokens
   se da vuelta solo en modo oscuro, así que ningún componente necesita
   condicionales por tema.
5. **Ledger, no cards.** Las listas son libro mayor: filas al ras separadas por
   hairline, barra maciza de señal a la izquierda (crítico / advertencia / ok /
   inactivo) y datos en monoespaciada alineados en columna.

## Navegación

Índice numerado (`01 PANEL`, `02 LLAMAR HOY`, …) en un rail tipográfico **sin
íconos** — el número es la dirección de la sección y aparece también en el
encabezado de cada página. El ítem activo es un bloque invertido con el número
en acento. En mobile el mismo índice se abre como overlay a tamaño display
(botón `ÍNDICE`, no hamburguesa). `⌘K` / `Ctrl+K` abre la paleta de comandos, que
acepta el nombre de la sección o su número.

Fuente única: `src/components/layout/nav-items.ts`. Los `label` son contrato con
`AppLayout.test.tsx`.

## Primitivas nuevas (`src/components/ui/`)

| Componente | Rol |
|---|---|
| `Slab` / `SlabHead` / `SlabBody` | Contenedor definido por su regla superior (`rule="ink" \| "accent" \| "hairline"`) y su tono (`paper` / `bare` / `ink` / `accent`). Reemplaza a `Card`. |
| `Ledger` / `LedgerRow` / `LedgerHead` | Lista densa con barra de señal e inversión al hover. Reemplaza la pila de cards. |
| `Meta` | La etiqueta del sistema (mono, versalita). |
| `Num` | Cifra tabular en dos registros: `hero`/`display` (titular) y `data` (mono). |
| `SectionHead` | Encabezado de página: número de sección + título display + regla de 2px. |
| `CommandPalette` (en `layout/`) | ⌘K. Solo se monta cuando está abierta, para no duplicar los labels del índice en el DOM. |

`Card` sigue existiendo, alineada al lenguaje nuevo, para las pantallas todavía
no migradas.

## Estado de la migración

Migradas a la dirección nueva:

- Tokens y utilidades (`styles/theme.css`, `index.css`), fuentes (`index.html`),
  logo e `favicon.svg`.
- Shell completo: `AppLayout`, `Sidebar` (rail + drawer), `CommandPalette`.
- Primitivas: `Button`, `Badge`, `Card`, `Input`, `Select`, `EmptyState`,
  `Spinner`, `ErrorBanner`, `ThemeToggle`.
- Pantallas ancla: **Panel** (`DashboardPage`, `MetricCard`, `LeadsTrendChart`,
  `DateRangePicker`), **Llamar hoy** (`CallQueuePage`, `CallQueueRow`,
  `LeadChips`) y **Ficha de lead** (`LeadDetailPage`, `MessageTimeline`).

Pendientes (heredan tokens y primitivas, falta el pase de layout):

- `LeadsPage` / `LeadsList` / `LeadRow` → pasar a `Ledger`.
- `AgendaPage` y `components/agenda/*` → `Ledger` + señal por estado de cita.
- `PropertiesPage` y `components/properties/*` → preservar el patrón
  "single DOM reorder" ya cubierto por `responsive-guardrails.test.tsx`.
- `PeoplePage`, `TenantConfigPage`, `LoginPage`.
- Onboarding: migrar las clases `@layer components` (`.onboarding-*`,
  `.webhook-status-*`) de `index.css` a `Slab`/`Meta`/`Button`.
- `/conversaciones` (ver `docs/09-CONVERSACIONES-HANDOFF.md`): nace directo con
  esta dirección — tres columnas separadas por hairlines y burbujas como
  bloques rectos.

## Guardrails que no se negocian

- No renombrar tokens de color existentes: cientos de clases Tailwind ya
  generadas dependen de esos nombres.
- Contrato con los tests: las clases `bg-primary` / `bg-surface` /
  `bg-transparent` / `bg-danger` de `Button`, `bg-bg` y `text-*` de `Badge`, y
  el `bg-warning/10 | bg-success/10 | bg-danger/10` del header de mensajes de la
  ficha de lead.
- Contraste AA verificado en ambos modos para todos los pares semánticos
  (mínimo medido: 4.7:1 en claro, 5.0:1 en oscuro).
- Nada de utilidades `translate-x-*` para el drawer: no resolvían en v4 y
  dejaban el drawer tapando la pantalla en mobile. El desplazamiento vive en
  CSS plano (`.nav-drawer[data-open]`, en `index.css`).
