# Design Brief: Rediseño completo del frontend (InmobilApp / agente-inmo)

## Problem

Quien abre este panel todos los días —el operador que gestiona leads y el dueño de la inmobiliaria que lo paga— se encuentra con una herramienta que no dice nada de sí misma. No hay una marca reconocible (un ícono de librería suelto en un cuadrado), no hay tipografía con personalidad, la navegación de siete links en una fila horizontal ya está saturada, y el dashboard —la primera pantalla que debería transmitir "esto funciona y vale lo que pagás"— son cinco números sueltos sin ninguna tendencia ni contexto. El resultado no es que esté mal hecho técnicamente: es que no comunica nada, y eso mina la confianza del dueño de la inmobiliaria en el producto y ralentiza al operador que necesita encontrar información rápido.

## Solution

Un panel administrativo que se siente como una herramienta profesional construida a medida para el rubro inmobiliario argentino, no como una plantilla genérica de admin. Navegación lateral que escala con la cantidad de secciones sin saturarse, un dashboard que cuenta una historia con tendencias y no solo números, un sistema visual coherente de punta a punta (login, onboarding, día a día) con una identidad de marca propia, y una experiencia que es igual de sólida en el celular que en la computadora — porque el operador entra desde ahí tanto como desde el escritorio.

## Experience Principles

1. **Densidad legible sobre densidad cruda** — mostrar mucha información (leads, propiedades, métricas) sin que se sienta abrumador: jerarquía tipográfica y espaciado hacen el trabajo que en el diseño actual no hace nadie.
2. **Un acento, muchas veces** — un solo color de marca (ámbar/terracota) usado con disciplina para lo que importa (acciones primarias, estados activos, datos clave), en vez de colores sueltos decidiendo caso por caso como hoy.
3. **Paridad mobile real, no responsive de cortesía** — cada pantalla se diseña asumiendo que se va a usar en el celular en movimiento, no que "también funciona" ahí achicada.

## Aesthetic Direction

- **Philosophy**: Swiss / Editorial — grilla estricta, tipografía como protagonista, mucho espacio en blanco, jerarquía clara, un acento de color bien dosificado. Es la base visual de Linear y Notion.
- **Tone**: Profesional y sobrio, pero no frío ni corporativo-pesado. Cálido en los detalles (acento ámbar/terracota, no azul genérico de SaaS), serio en la estructura.
- **Reference points**: Linear, Notion (estructura, tipografía, densidad, sidebar). Stripe Dashboard (seriedad de los datos y gráficos). Toque cálido propio del rubro inmobiliario en el acento de color, no en decoración.
- **Anti-references**: Plantillas genéricas de admin "de stock" (sidebar azul default, cards con sombra fuerte, gradientes morados sin trabajar). Software enterprise pesado de menús anidados y formularios interminables. Estética consumer/juguetona (ilustraciones cartoon, emojis, colores saturados).

## Existing Patterns

- **Typography**: Plus Jakarta Sans (Google Fonts CDN) — se reemplaza. Escala actual xs→xl (0.75rem–1.25rem), 3 pesos (400/500/600), line-height 1.5. La nueva escala debe ampliar el rango (necesita tamaños más grandes para dashboard/hero de login) y definirse en la fase de tokens.
- **Colors**: paleta "stone" cálida (`--color-bg: #fcfbf9`, `--color-text: #1c1917`, `--color-border: #e7e5e4`), primario azul oscuro (`--color-primary: #0f172a`), acento ámbar (`--color-accent: #b45309`), semánticos info/danger/success/warning. Se reemplaza la base por grises neutros fríos, se conserva el espíritu del acento ámbar/terracota como color de marca. Se agrega paleta dark mode completa (hoy no existe: `index.css` fija `color-scheme: light` a fuego).
- **Spacing**: escala custom en rem (0/1/2/3/4/6/8/10/12/16), redundante con la nativa de Tailwind — se puede consolidar en tokens nuevos.
- **Radii/Shadows**: `--radius` 6-14px, sombras muy sutiles (opacidad 0.03-0.07). Mantener el espíritu de sutileza, pero revisar si necesitan un escalón adicional para cards con jerarquía (ej. modal vs card).
- **Components**: `src/components/ui/` — `Button` (cva, variantes primary/secondary/ghost/danger, tamaños sm/md), `Card`/`CardHeader`/`CardBody`, `Badge` (cva, tone neutral/info/success/warning/danger), `Input`, `Select`, `Table` (+`TableScroll`/`THead`/`TBody`/`Tr`/`Th`/`Td`), `Modal`, `AsyncSection`, `EmptyState`, `Skeleton`, `Toast`. Todos con `forwardRef`, `cn()` (clsx+tailwind-merge), sin estilos inline. Base técnica sólida — se extiende, no se reemplaza.
- **Icons**: `lucide-react`, única librería, ~15-20 íconos en uso. Se mantiene para iconografía funcional; el logo/marca se resuelve aparte (no con un ícono de esta librería).
- **Onboarding-specific**: clases `@layer components` en `index.css` (`.onboarding-*`, `.webhook-status-*`) para stepper, cards, checklist, uploader — lenguaje visual propio y más cuidado que el resto de la app. Se unifica bajo el mismo sistema de tokens nuevo en vez de mantenerse aparte.

## Component Inventory

| Component | Status | Notes |
| --- | --- | --- |
| Design tokens (colores, tipografía, spacing, dark mode) | Modify | Reemplazo completo vía `@theme` en `theme.css`, fase 4 del flujo |
| Sidebar de navegación | New | Reemplaza el topbar de `AppLayout.tsx`; colapsable, con estado activo, adaptado a drawer en mobile |
| Logo / isotipo | New | Wordmark o isotipo simple propio, SVG, usado en sidebar + login + favicon |
| Button | Modify | Ampliar variantes (falta `outline` diferenciado de `secondary`, falta tamaño `lg`, falta `icon-only`) |
| Card | Modify | Agregar variantes de énfasis (ej. card destacada para métricas vs card neutra de contenido) |
| MetricCard (dashboard) | Modify | Agregar sparkline/indicador de tendencia, no solo número |
| Gráfico de tendencia (leads en el tiempo) | New | Requiere elegir librería liviana (ej. recharts o visx) en fase de tokens/tasks |
| Badge, Input, Select, Table, Modal, AsyncSection, EmptyState, Skeleton, Toast | Exists | Se mantienen, se revisan contra los tokens nuevos y dark mode |
| Theme toggle (light/dark) | New | Control accesible en sidebar o header, persistido |
| Onboarding wizard components (Stepper, ApiKeyReveal, ReadinessChecklist, WebhookStatusCard, MetaSetupGuide, CsvUploader) | Modify | Migrar de clases CSS ad-hoc en `index.css` a los componentes/tokens unificados |
| MessageTimeline (chat de leads) | Modify | Mantener metáfora de chat tipo WhatsApp, adaptar tonos de color a la paleta nueva y a dark mode |

## Key Interactions

- **Cambio de tema (light/dark)**: toggle visible y persistente; el cambio es inmediato y no debe requerir recargar la página. Todos los componentes (incluyendo `MessageTimeline` con sus 3 tonos de burbuja) deben tener contraparte dark verificada.
- **Sidebar colapsable**: un control para achicar el sidebar a solo íconos en desktop (para maximizar espacio en tablas densas como Propiedades/Leads); en mobile se convierte en drawer que se abre con un botón y se cierra al navegar o tocar afuera.
- **MetricCard con tendencia**: al pasar de solo-número a número+sparkline, el estado de carga y el estado vacío (sin datos suficientes para tendencia) deben tener un tratamiento explícito, no solo ocultar el gráfico.
- **Tabla → tarjetas en mobile**: se mantiene el patrón ya validado de "single DOM, reorder por CSS" (usado hoy en `PropertiesList`) para no duplicar markup ni romper los tests de accesibilidad existentes (`getByLabelText`, etc.).
- **Onboarding wizard**: los tres pasos deben sentirse parte de la misma app que el resto del panel (mismos tokens, misma tipografía, mismo lenguaje de botones/cards), en vez de una sub-app visualmente distinta como hoy.

## Responsive Behavior

- Mobile-first real, no "también anda": breakpoints de Tailwind (`sm`/`md`/`lg`) ya en uso, se mantienen como base.
- Sidebar: drawer overlay en mobile (< `md`), fijo y colapsable a íconos en desktop.
- Tablas (Leads, Propiedades, Agenda, Llamar hoy): patrón "single DOM reorder" existente se preserva y se extiende a las tablas que aún no lo tengan.
- Dashboard: grid de MetricCards pasa de 5 columnas en desktop a 1-2 en mobile; el gráfico de tendencia principal se recorta a una vista simplificada en mobile si el espacio no alcanza para ejes/leyenda completos.
- MessageTimeline: burbujas ya responsive por naturaleza (ancho fluido), verificar que el chrome alrededor (header del lead, acciones) no rompa en pantallas angostas.

## Accessibility Requirements

- WCAG AA como mínimo: contraste 4.5:1 en texto normal, 3:1 en texto grande, verificado en ambos modos (light y dark) — el modo oscuro no es "el mismo diseño invertido", necesita su propia verificación de contraste.
- Navegación completa por teclado, incluyendo el nuevo sidebar colapsable y el theme toggle.
- Focus visible en todos los elementos interactivos nuevos (sidebar, toggle, gráficos si tienen elementos enfocables).
- Mantener el patrón actual de labels asociados a inputs (`getByLabelText`) — no romperlo al rediseñar `Input`/`Select`.
- Gráficos nuevos (sparklines, tendencia) deben tener alternativa textual (ej. `aria-label` con el valor/tendencia resumida) para no depender solo de la lectura visual.

## Out of Scope

- White-label o marca por tenant (logo/color propio de cada inmobiliaria) — decidido explícitamente que no entra en esta etapa.
- Nuevas funcionalidades o cambios de lógica de negocio/FSM — este rediseño es visual y de estructura de UI, no toca reglas de negocio, permisos ni flujos de datos.
- Migración de librería de gráficos más allá de lo necesario para sparklines/tendencias simples del dashboard (no se contempla un motor de BI completo).
- Rediseño de los mensajes salientes de WhatsApp en sí (contenido/redacción del bot) — solo la presentación del timeline en el panel admin.
- Internacionalización / soporte multi-idioma — la app sigue en español rioplatense exclusivamente.
