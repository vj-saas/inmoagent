# Build Tasks: Rediseño completo del frontend (InmobilApp)

Generated from: `.design/frontend-redesign/DESIGN_BRIEF.md`, `INFORMATION_ARCHITECTURE.md`
Date: 2026-07-27

Filosofía: **Swiss / Editorial** — grilla estricta, tipografía protagonista (Archivo/IBM Plex Mono), mucho blanco, un acento terracota bien dosificado. Tokens ya implementados en `src/styles/theme.css` e `src/index.css` (fase 4, completa).

## Foundation

- [ ] **Componentes base — Button, Card, Badge (variantes ampliadas)**: extender `components/ui/Button.tsx` (agregar variante `outline` diferenciada de `secondary`, tamaño `lg`, variante `icon-only`) y `components/ui/Card.tsx` (agregar variante `raised`/con énfasis para métricas vs. card neutra de contenido, usando `--color-surface-raised` y `--shadow-md`). _Modifica: Button, Card. Reusa: tokens de color/radius/shadow ya definidos._
- [ ] **Logo / isotipo**: diseñar un isotipo SVG simple propio (reemplaza el ícono `Building2` de lucide-react en cuadrado) para usar en Sidebar, Login y favicon. _Nuevo componente `components/ui/Logo.tsx` + `public/favicon.svg`._
- [ ] **Theme toggle**: componente de toggle light/dark/sistema, persistido (localStorage), que setea `data-theme` en `<html>`. _Nuevo `components/ui/ThemeToggle.tsx` + hook `useTheme.ts`. Depende de: tokens dark mode (ya implementados)._
- [ ] **Sidebar + AppLayout nuevo**: reemplazar el topbar de `routes/AppLayout.tsx` por el sidebar colapsable definido en la IA — 3 grupos (Actividad / Gestión / Administración separada para OWNER), colapsa a solo íconos con tooltip en desktop, se convierte en drawer overlay en mobile (< `md`), incluye Logo + Theme toggle + email/rol/cerrar sesión. _Modifica: `routes/AppLayout.tsx`, `routes/AppLayout.test.tsx`. Depende de: Logo, Theme toggle. Es la pieza más transversal — bloquea la verificación visual de todas las páginas siguientes._

## Core UI

- [ ] **Login**: rediseñar `routes/LoginPage.tsx` con la nueva identidad (Logo, tipografía Archivo, paleta terracota/cool-neutral, dark mode), manteniendo la estructura de card centrada + inputs con ícono ya validada como la más pulida de la app hoy. _Modifica: LoginPage. Reusa: Input, Button, Logo._
- [ ] **Dashboard — MetricCard con tendencia**: agregar sparkline/indicador de tendencia a `components/dashboard/MetricCard.tsx` usando recharts, con estado de carga y estado "sin datos suficientes para tendencia" explícitos (no solo ocultar el gráfico). _Modifica: MetricCard, MetricCard.test.tsx. Nueva dependencia: recharts (ya instalado)._
- [ ] **Dashboard — gráfico de tendencia de leads**: nuevo componente de gráfico de línea/área (leads en el tiempo) para `routes/DashboardPage.tsx`, respetando el rango de fechas ya seleccionable, con `--color-chart-*` tokens y alternativa textual (`aria-label` con el resumen de tendencia) para accesibilidad. _Nuevo `components/dashboard/LeadsTrendChart.tsx`. Depende de: MetricCard con tendencia (para consistencia visual de los mismos tokens de chart)._
- [ ] **Dashboard — página completa**: integrar MetricCards nuevas + gráfico de tendencia + selector de rango en `routes/DashboardPage.tsx` bajo el grid responsive (5 cols desktop → 1-2 mobile), como landing post-login (`/` redirige acá en vez de a `/leads`). _Modifica: DashboardPage.tsx, DashboardPage.test.tsx, `App.tsx` (redirect de `/`)._
- [ ] **Leads — bandeja**: aplicar tokens nuevos a `routes/LeadsPage.tsx`, `components/leads/LeadsList.tsx`, `LeadRow.tsx`, `LeadChips.tsx`, `LeadModeBadge.tsx`, `LeadStateFilter.tsx`, `LeadSearchInput.tsx` — verificar jerarquía (filtro/búsqueda primero, lista con chips después, paginación al final) según la IA. _Modifica: componentes listados. Reusa: Table/TableScroll, Badge._
- [ ] **Leads — detalle**: rediseñar `routes/LeadDetailPage.tsx` con el timeline como protagonista (`MessageTimeline.tsx` con los 3 tonos de burbuja adaptados a la paleta nueva y verificados en dark mode), botón "Volver" + título contextual (sin breadcrumb, según IA), acciones (asignar/handoff/opt-out/responder) sin competir visualmente con el timeline. _Modifica: LeadDetailPage.tsx, MessageTimeline.tsx, AssignmentControl.tsx, OptOutButton.tsx, ReleaseHandoffButton.tsx, ManualReplyBox.tsx, LeadNotes.tsx, NoteForm.tsx._

## Interacciones y páginas restantes

- [ ] **Llamar hoy**: aplicar tokens nuevos a `routes/CallQueuePage.tsx` y `components/leads/CallQueueRow.tsx`, `ContactedToggle.tsx` — cola priorizada con acciones inline por fila, adyacente conceptualmente a Agenda en el sidebar pero independiente. Covers: estados hover/loading/vacío de la cola.
- [ ] **Agenda**: aplicar tokens nuevos a `routes/AgendaPage.tsx` y `components/agenda/*` (`AppointmentsList.tsx`, `AppointmentRow.tsx`, `AppointmentStatusBadge.tsx`, `AppointmentStatusFilter.tsx`, `AppointmentActionForm.tsx`). Covers: estados de cita (pendiente/confirmada/cancelada) con Badge tone actualizado.
- [ ] **Propiedades**: aplicar tokens nuevos a `routes/PropertiesPage.tsx` y `components/properties/*` (`PropertiesList.tsx`, `PropertyForm.tsx`, `PropertyFilters.tsx`, `PropertyStatusControl.tsx`, `DeletePropertyButton.tsx`, `PhotoListEditor.tsx`) — preservar el patrón "single DOM reorder" tabla→cards en mobile ya validado por `responsive-guardrails.test.tsx`. Covers: alta/edición en modal, import CSV, thumbnail/placeholder de foto con nueva paleta.
- [ ] **Personas y Configuración (solo OWNER)**: aplicar tokens nuevos a `routes/PeoplePage.tsx` y `routes/TenantConfigPage.tsx`, verificar que aparezcan agrupadas bajo "Administración" en el sidebar nuevo, separadas visualmente del resto.
- [ ] **Onboarding — unificación de sistema**: migrar las clases `@layer components` ad-hoc de `index.css` (`.onboarding-*`, `.webhook-status-*`) a los componentes/tokens unificados del resto de la app — `components/onboarding/WizardStepper.tsx`, `ApiKeyReveal.tsx`, `ReadinessChecklist.tsx`, `WebhookStatusCard.tsx`, `MetaSetupGuide.tsx`, `CsvUploader.tsx`, `TenantCreateForm.tsx`, `TenantConfigForm.tsx` y `routes/OnboardingWizardPage.tsx`. Es la brecha de calidad más grande hoy (CSS propio vs. Tailwind utilitario suelto) — se unifica bajo Button/Card/Input ya extendidos.

## Responsive & Polish

- [ ] **Verificación responsive completa**: correr `responsive-guardrails.test.tsx` y revisar manualmente cada página migrada (Dashboard, Leads, Llamar hoy, Agenda, Propiedades, Personas, Configuración, Login, Onboarding) en mobile (375px), tablet (768px) y desktop (1280px) — especial atención al sidebar (drawer en mobile) y al header mobile mínimo (hamburguesa + título).
- [ ] **Verificación dark mode completa**: recorrer las mismas páginas con el theme toggle en modo oscuro, confirmando contraste AA en texto, badges/semánticos, MessageTimeline (3 tonos de burbuja) y gráficos (chart tokens).
- [ ] **Accessibility pass**: navegación completa por teclado del sidebar nuevo (expandir/colapsar, tooltips) y theme toggle; focus visible (`--shadow-focus`) en todos los elementos interactivos nuevos; `aria-label` en gráficos nuevos (sparklines, tendencia); verificar que `Input`/`Select` mantengan el patrón `getByLabelText` existente tras el rediseño.

## Review

- [ ] **Design review**: correr `/design-review` contra `DESIGN_BRIEF.md`, con capturas de las páginas clave (Login, Dashboard, Leads, detalle de lead) en desktop/tablet/mobile y en ambos modos de color.
