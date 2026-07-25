# Spec V-B: Design system y UI base del dashboard

## Contexto

El dashboard (`frontend/`) hoy se construye con CSS artesanal: variables de
color/borde/sombra centralizadas en `frontend/src/index.css`, pero tipografía,
espaciado, radios y estados de foco resueltos ad hoc, más `style={{...}}`
inline repartido en 21 archivos (54 ocurrencias), incluyendo las 8 páginas de
`frontend/src/routes/` (`LoginPage`, `DashboardPage`, `LeadsPage`,
`LeadDetailPage`, `AgendaPage`, `CallQueuePage`, `PeoplePage`, `AppLayout`).

No hay una librería de componentes: existen extracciones parciales
(`Spinner`, `ErrorBanner`, `Pagination`, `MetricCard`, `DateRangePicker`) pero
ningún `Button`/`Input`/`Select`/`Card`/`Table`/`Badge`/`Toast`/`Modal`
reutilizable. Cada página resuelve sus propios estados de carga/error, sin un
patrón único, y no hay verificación de que el dashboard sea usable desde un
celular — algo relevante porque el asesor inmobiliario lo va a mirar en la
calle, según `docs/07-PLAN-VENTA.md` (Fase B).

Esta spec no reescribe la lógica de negocio de ninguna página: cada una ya
tiene tests (`*.test.tsx`) que fijan su comportamiento (fetch de datos,
mensajes en español, roles visibles según `person.role`, testids). El cambio
es puramente de presentación — reemplazar el CSS artesanal y los estilos
inline por un sistema de diseño consistente, sin alterar qué hace cada
pantalla ni con qué endpoints habla.

## Alcance

- Incorporar Tailwind CSS al proyecto `frontend/` y una librería de
  componentes headless copiados al repo (shadcn/ui u equivalente), sin sumar
  una dependencia de runtime pesada.
- Definir en un único archivo de configuración los tokens de marca: paleta de
  color, tipografía, espaciado y radios, reemplazando las variables sueltas de
  `frontend/src/index.css`.
- Construir componentes base reutilizables, usados de forma consistente en
  toda la app: `Button`, `Input`, `Select`, `Card`, `Table`, `Badge`,
  `Toast`/notificación, `Modal`, `Skeleton` de carga.
- Migrar las 8 rutas existentes a los componentes base y los tokens nuevos, en
  este orden: `LoginPage` primero (prueba de patrón, ya tiene tests), luego
  `DashboardPage`, `LeadsPage`, `LeadDetailPage`, `AgendaPage`,
  `CallQueuePage`, `PeoplePage`, `AppLayout`.
- Agregar (o migrar al patrón nuevo) estado de carga, estado de error y estado
  vacío explícito en cada una de las 8 rutas.
- Verificar y ajustar cada ruta para que sea usable en un viewport de 375px de
  ancho (celular gama media/baja), sin scroll horizontal ni elementos
  cortados o superpuestos.

## Fuera de alcance

- Cambiar la lógica de negocio, el fetching de datos, las rutas de navegación
  o el contrato con el backend de cualquier página. Esta spec es solo de
  presentación.
- Migrar los componentes ya extraídos bajo `frontend/src/components/leads/`,
  `frontend/src/components/agenda/` y `frontend/src/components/dashboard/`
  más allá de lo estrictamente necesario para que las 8 rutas queden libres de
  `style={{...}}` inline (ver pregunta abierta más abajo sobre si esto deja
  inconsistencia visual visible).
- La bandeja de toma manual de conversación y sus componentes específicos
  (burbujas de chat, toggle de modo IA/humano, indicador de ventana de 24hs) —
  eso es Fase B2 de `docs/07-PLAN-VENTA.md` y depende de que esta spec esté
  cerrada.
- Dark mode, internacionalización, o cualquier variante de tema más allá de la
  paleta única definida acá.
- Auditoría de accesibilidad (WCAG) formal; la verificación de esta spec se
  limita a responsive en 375px, no a lectores de pantalla, contraste WCAG AA
  exhaustivo, o navegación por teclado completa.
- Agregar páginas o rutas nuevas.
- Cambios en `frontend/package.json` fuera de las dependencias de
  Tailwind/shadcn necesarias para esta fase.

## Criterios de aceptación (EARS)

**AC-1.** THE SYSTEM SHALL NOT contener ninguna ocurrencia de `style={{...}}`
(estilo inline vía prop `style`) en ningún archivo bajo `frontend/src/routes/`
ni `frontend/src/components/` una vez completada la migración.

**AC-2.** THE SYSTEM SHALL exponer un conjunto de componentes base
reutilizables (`Button`, `Input`, `Select`, `Card`, `Table`, `Badge`,
`Toast`/notificación, `Modal`, `Skeleton`) usados por al menos una de las 8
rutas migradas, sin duplicar su implementación visual dentro de cada página.

**AC-3.** THE SYSTEM SHALL definir paleta de color, tipografía, espaciado y
radios en un único archivo de configuración de tokens, de modo que ningún
componente base ni ruta migrada declare un valor de color, tamaño de fuente,
espaciado o radio fuera de ese archivo (hardcodeado o repetido).

**AC-4.** WHEN se ejecuta `npm run test` en `frontend/` después de la
migración THE SYSTEM SHALL pasar la suite completa existente
(`LoginPage.test.tsx`, `DashboardPage.test.tsx`, `LeadsPage.test.tsx`,
`LeadDetailPage.test.tsx`, `AgendaPage.test.tsx`, `CallQueuePage.test.tsx`,
`PeoplePage.test.tsx`, `AppLayout.test.tsx`, y el resto de tests de
`components/`) sin que ningún test se haya eliminado, comentado o marcado
como `skip` para lograrlo.

**AC-5.** WHEN cualquiera de las 8 rutas migradas (`LoginPage`,
`DashboardPage`, `LeadsPage`, `LeadDetailPage`, `AgendaPage`, `CallQueuePage`,
`PeoplePage`, `AppLayout`) está esperando una respuesta de su(s) llamada(s) a
la API THE SYSTEM SHALL mostrar un estado de carga visible (spinner o
skeleton) en vez de una pantalla en blanco o contenido a medio cargar.

**AC-6.** IF la llamada a la API subyacente de cualquiera de las 8 rutas
migradas falla THEN THE SYSTEM SHALL mostrar un estado de error con un mensaje
legible en español, sin dejar la pantalla en blanco ni mostrar datos
parciales o inconsistentes.

**AC-7.** WHEN una vista basada en listado (`LeadsPage`, `AgendaPage`,
`CallQueuePage`, `PeoplePage`) recibe cero resultados para el filtro/rango
actual THE SYSTEM SHALL mostrar un estado vacío distinguible (mensaje o
ilustración), no una tabla o lista en blanco sin explicación.

**AC-8.** WHEN cualquiera de las 8 rutas migradas se visualiza en un viewport
de 375px de ancho THE SYSTEM SHALL NOT producir scroll horizontal de la
página.

**AC-9.** WHEN cualquiera de las 8 rutas migradas se visualiza en un viewport
de 375px de ancho THE SYSTEM SHALL NOT mostrar ningún elemento interactivo o
de texto visualmente cortado, superpuesto o inaccesible al tacto (incluye
navegación de `AppLayout`, tablas de `LeadsPage`/`AgendaPage`/`CallQueuePage`/
`PeoplePage`, y formularios de `LoginPage`/`LeadDetailPage`).

**AC-10.** THE SYSTEM SHALL preservar el comportamiento funcional existente de
cada ruta migrada (mismos datos solicitados a la API, mismas acciones
disparadas, mismos roles visibles según `person.role` en `AppLayout`) — la
migración de esta spec es exclusivamente visual/estructural.

## Decisiones (aprobadas por el usuario, 2026-07-24)

1. **Alcance de inline styles ampliado.** Se migran también los componentes
   bajo `frontend/src/components/{leads,agenda,dashboard}/` (33 de las 54
   ocurrencias), no solo `frontend/src/routes/`. Se amplía `AC-1` para cubrir
   todo `frontend/src/` (routes + components), evitando mezcla visual
   Tailwind/CSS-artesanal dentro de la misma pantalla.
2. **shadcn/ui es decisión cerrada**, no negociable por el `planner`. Se usa
   tal cual lo indica el plan original (componentes copiados al repo).
