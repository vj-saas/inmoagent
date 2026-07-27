# Information Architecture: InmobilApp (agente-inmo/frontend)

## Site Map

- Login `/login` (pública)
- Onboarding `/onboarding` (pública, wizard de 3 pasos)
- Dashboard `/dashboard` (landing post-login)
- Leads `/leads`
  - Detalle de lead `/leads/:leadId`
- Llamar hoy `/llamar-hoy`
- Agenda `/agenda`
- Propiedades `/propiedades`
- Administración (solo rol OWNER)
  - Personas `/people`
  - Configuración `/configuracion`

## Navigation Model

- **Primary navigation**: sidebar vertical persistente, colapsable a solo íconos en desktop. Tres grupos con separadores visuales:
  1. **Actividad** — Dashboard, Llamar hoy, Agenda (lo que pasa hoy)
  2. **Gestión** — Leads, Propiedades (los datos que se administran)
  3. **Administración** (solo OWNER, separado al final) — Personas, Configuración
- **Secondary navigation**: ninguna — no hay tabs internas por sección; el detalle de lead (`/leads/:leadId`) resuelve su propia navegación con un botón "Volver" en vez de breadcrumb.
- **Utility navigation**: en el pie o cabecera del sidebar — email/rol del usuario, toggle de tema (light/dark), botón "Cerrar sesión". El colapsar/expandir el sidebar es un control propio, separado de estos.
- **Mobile navigation**: el sidebar se convierte en drawer overlay, activado por un botón hamburguesa en un header mobile mínimo. Se cierra al navegar o al tocar fuera del drawer. No se usa bottom-tab-bar (los 7 items no entrarían sin recortar labels, y el drawer ya es un patrón conocido para power users que usan esto a diario).

**Sidebar colapsado (desktop, solo íconos)**: cada ítem muestra tooltip con el label completo al hover, sin texto truncado visible por defecto. El toggle de colapsar/expandir es explícito (no solo por ancho de ventana).

## Content Hierarchy

### Dashboard (landing post-login)
1. Métricas clave con tendencia (MetricCards + sparkline) — la primera lectura de "cómo va el negocio hoy", con selector de rango de fechas visible arriba
2. Gráfico de leads en el tiempo — contexto temporal que las cards solas no dan
3. Accesos rápidos a lo urgente (ej. cantidad de "Llamar hoy" pendientes) — conecta el resumen con la acción
4. Detalle secundario / filtros de rango — below the fold si hace falta

### Leads (bandeja)
1. Filtro por estado + búsqueda — lo primero que se usa para encontrar un lead específico
2. Lista de leads con estado, chips de filtros capturados (operación, barrio, precio, ambientes) — la decisión de a quién atender primero se toma acá
3. Paginación — la cola completa importa menos que los primeros resultados relevantes

### Detalle de lead (`/leads/:leadId`)
1. Timeline de mensajes (tipo chat) — es la razón de estar en la página
2. Datos del lead y filtros capturados — contexto para responder con criterio
3. Acciones (asignar, handoff, opt-out, responder manualmente) — disponibles pero no compitiendo visualmente con el timeline
4. Notas internas — secundario, de referencia

### Llamar hoy
1. Cola priorizada de leads a llamar — la lista es el contenido, no hay nada "antes"
2. Acciones inline por fila (llamar, marcar hecho, etc.) — accesibles sin entrar al detalle

### Propiedades
1. Listado con foto/thumbnail, estado, acciones — lo que se busca y compara
2. Alta/edición vía modal — no roba el contexto de la lista
3. Import CSV — acción secundaria, no compite con el flujo principal de gestión

## User Flows

### Operador responde un lead nuevo
1. Usuario aterriza en Dashboard tras login, ve que hay leads nuevos en el resumen de Actividad
2. Entra a Leads desde el sidebar (grupo Gestión)
3. Filtra por estado "nuevo" o busca por nombre/teléfono
4. Hace click en la fila del lead → entra a `/leads/:leadId`
5. Lee el timeline, evalúa filtros capturados (operación/barrio/precio)
   - Si el bot ya cubrió lo necesario → deja que siga automatizado
   - Si el lead pidió humano → ve el estado `HUMAN_HANDOFF`, responde manualmente
6. Usuario vuelve a la bandeja con el botón "Volver" (sin breadcrumb)

### Dueño de agencia revisa el estado del negocio
1. Login → aterriza directo en Dashboard (nuevo landing)
2. Ve métricas con tendencia y el gráfico de leads en el tiempo, ajusta el rango de fechas si necesita comparar períodos
3. Si algo llama la atención (ej. caída de leads nuevos) → navega a Leads o Llamar hoy para investigar
4. Si es OWNER, puede bajar a Administración (Personas/Configuración) para gestionar el equipo o revisar la config del tenant — pero no es el flujo diario

### Alta de tenant nuevo (Onboarding)
1. Usuario llega a `/onboarding` (fuera de sesión, sin sidebar)
2. Paso 1: crea tenant + owner
3. Paso 2: conecta Meta WhatsApp + importa CSV de propiedades
4. Paso 3: configura tenant, ve checklist de "readiness"
5. Al completar, entra al panel autenticado → aterriza en Dashboard como cualquier otro login

## Naming Conventions

| Concept | Label in UI | Notes |
|---------|-------------|-------|
| Grupo de navegación 1 | Actividad | Dashboard, Llamar hoy, Agenda — lo que pasa "hoy" |
| Grupo de navegación 2 | Gestión | Leads, Propiedades — los datos administrados |
| Grupo de navegación 3 | Administración | Personas, Configuración — solo visible para OWNER |
| Botón de retorno en detalle | Volver | No "Atrás", no breadcrumb — consistente en toda página de detalle |
| Control de tema | Tema (o ícono sol/luna) | Evitar "Modo oscuro" como único label si se usa ícono; acompañar con texto en el drawer mobile |
| Cola de llamadas | Llamar hoy | Se mantiene el nombre actual, ya es claro y específico |

## Component Reuse Map

| Component | Used on | Behavior differences |
|-----------|---------|---------------------|
| Sidebar (nuevo) | Todas las rutas autenticadas | Colapsa a íconos en desktop (toggle manual); se convierte en drawer overlay en mobile (< `md`) |
| AppLayout | Todas las rutas autenticadas | Envuelve Sidebar + área de contenido con `Outlet`; header mobile mínimo (hamburguesa + título de sección) solo visible < `md` |
| Botón "Volver" + título contextual | Detalle de lead; potencialmente cualquier futura página de detalle | Reemplaza breadcrumbs en toda la app, no solo en Leads |
| TableScroll / patrón tabla→cards | Leads, Propiedades, Agenda, Llamar hoy | Mismo patrón "single DOM reorder" ya validado, se extiende a las tablas que aún no lo usan |
| Theme toggle | Sidebar (footer) en desktop; dentro del drawer en mobile | Mismo componente, distinta ubicación según breakpoint |
| WizardStepper (onboarding) | Solo `/onboarding` | Layout público, sin sidebar; usa los mismos tokens/tipografía que el resto de la app tras el rediseño |

## Content Growth Plan

- **Leads**: crece indefinidamente — ya tiene paginación y filtro por estado/búsqueda; la IA no cambia esto, solo hereda los tokens visuales nuevos.
- **Propiedades**: crece con el catálogo de cada inmobiliaria — listado ya pagina/filtra; import CSV es la vía de alta masiva, se mantiene como acción secundaria dentro de la página, no en el sidebar.
- **Sidebar**: los 3 grupos (Actividad/Gestión/Administración) dejan lugar para agregar futuras secciones dentro del grupo correspondiente sin reestructurar todo el nav — ej. una futura sección de "Reportes" entraría en Gestión, una futura "Integraciones" entraría en Administración.
- **Dashboard**: el rango de fechas y los gráficos deben soportar picos de volumen (más leads con el tiempo) sin degradar — es responsabilidad de la fase de tokens/build elegir una librería de gráficos que maneje esto con datasets crecientes.

## URL Strategy

- Patrón: `/seccion` para listados, `/seccion/:id` para detalle (ya establecido, se mantiene — `/leads/:leadId`).
- No se introducen nuevas rutas anidadas más allá de las existentes; el rediseño es de navegación y presentación, no de estructura de URLs.
- Sin querystrings nuevos previstos para filtros (los filtros de Leads/Propiedades ya funcionan con estado local, no se migran a la URL en esta etapa — fuera de alcance del brief).
- `/` sigue siendo un redirect, pero ahora apunta a `/dashboard` en vez de `/leads`.
