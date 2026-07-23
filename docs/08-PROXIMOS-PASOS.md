# 08 — Próximos pasos: de "motor terminado" a producto vendible

> Plan de trabajo posterior al MVP conversacional descrito en
> `07-ESTADO-ACTUAL.md`. Objetivo: que la inmobiliaria pueda **usar** el sistema y
> que el lead calificado **no se pierda** — que alguien lo vea, lo llame y cierre la
> visita. Fecha base: **2026-07-23**.

## Tesis del plan

El bot ya capta y califica leads de forma excelente, pero después **los suelta en el
vacío**: nadie de la inmobiliaria tiene dónde verlos ni con qué cerrar la visita. El
valor que se paga no es que el bot charle; es **recibir una lista de gente caliente,
calificada, lista para llamar, y una agenda que se confirma sola**. Por eso el próximo
trabajo se centra en dos cosas: **ponerle cara** (panel) y **cerrar el loop de la
visita** (agenda + cola de llamado).

### Orden de prioridad
```
Fase A  Panel de gestión de leads       ← desbloqueante comercial (sin esto no hay venta)
Fase B  Agenda + cola de "llamar hoy"    ← cierra el loop de valor
Fase C  Onboarding sin fricción          ← baja el costo de vender cada cliente
Fase D  Retención y follow-up            ← sube la conversión (post-piloto)
Fase P  Piloto real + pricing            ← en paralelo a A, antes de la primera venta
```

---

## Fase A — Panel de gestión de leads (~2-3 semanas)

**Meta:** que la inmobiliaria entre a una web, vea sus leads, lea la conversación y
sepa a quién llamar. El backend ya expone casi todo para leer; falta la cara y la auth
de personas.

### A.1 — Autenticación de personas y roles *(backend, alto)*
Hoy solo hay API keys de máquina. Hace falta:
- Modelo `User` (email, password argon2, `role`, `tenantId`) y sesión (JWT o cookie
  de sesión).
- Roles: **owner** (ve todo, gestiona usuarios y config) y **agent** (ve leads y
  agenda de su tenant).
- Guard de sesión de usuario, separado del `TenantApiKeyGuard` existente.
- **Criterio de aceptación:** un agent solo ve datos de su propio tenant; un request
  sin sesión válida recibe 401.

### A.2 — Frontend base *(nuevo)*
- Stack sugerido: **Next.js** (App Router) o Vite + React. Reusar el tono en español.
- Login, layout con navegación, manejo de sesión, estados de carga/error.
- Consumir los endpoints admin existentes (leads, messages, metrics, properties).

### A.3 — Bandeja de leads *(frontend + endpoint de detalle)*
- Lista filtrable por estado (nuevo / calificado / en handoff / agendó / opt-out),
  ordenada por `lastMessageAt`, con búsqueda por teléfono/nombre.
- Chips con los filtros capturados (operación, barrio, presupuesto, ambientes) para
  leer de un vistazo qué quiere el lead.
- Ya existe `GET /leads` y `GET /leads/:id/messages`; sumar un `GET /leads/:id` con la
  ficha consolidada.

### A.4 — Ficha del lead *(frontend + endpoints de acción)*
- Timeline completo de la conversación (ya disponible).
- Acciones humanas: **agregar nota**, **cambiar estado manual**, **liberar handoff**
  (endpoint `release` ya existe), **suprimir** (ya existe).
- Nuevos campos en `Lead` (o tabla `LeadNote`): notas libres, `assignedUserId`,
  `nextActionAt`.
- **Criterio de aceptación:** un asesor puede leer el chat, dejar una nota y marcar el
  lead como "contactado" desde la web.

### A.5 — Dashboard *(frontend)*
- Tarjetas con las métricas que ya calcula `MetricsService` (leads nuevos,
  conversaciones activas, handoffs, citas). Selector de rango de fechas.

---

## Fase B — Agenda y cola de "llamar hoy" (~2 semanas)

**Meta:** cerrar el ciclo que hoy queda a medias. La cita deja de ser una fila muerta.

### B.1 — Completar `appointments` en el backend *(alto)*
Hoy solo existe `propose()`. Agregar:
- Transiciones reales: `PROPOSED → CONFIRMED → DONE`, y `→ CANCELLED` / `NO_SHOW`
  (sumar `NO_SHOW` al enum).
- Campos: `scheduledAt` (fecha/hora efectiva), `assignedUserId`, `outcome`, `notes`.
- Endpoints:
  - `GET  /admin/tenants/:id/appointments` (filtro por rango y estado)
  - `POST /admin/tenants/:id/appointments/:aid/confirm` (fija `scheduledAt`)
  - `POST /.../reschedule`, `POST /.../cancel`, `POST /.../done`, `POST /.../no-show`
- **Criterio de aceptación:** una cita `PROPOSED` se puede confirmar con fecha/hora,
  y la métrica de "confirmadas" (hoy siempre 0 en la práctica) refleja algo real.

### B.2 — Vista de agenda *(frontend)*
- Calendario/lista de visitas por día. Confirmar, reprogramar y marcar resultado con
  un click.

### B.3 — Cola de "llamar hoy" *(frontend + query)*
- Lista priorizada de leads calificados que pidieron humano o quedaron tibios,
  ordenada por prioridad (caliente reciente primero).
- Botón para registrar el resultado de la llamada (contactado / no atendió / agendó /
  descartado) + nota, y setear `nextActionAt`.
- **Criterio de aceptación:** al lunes a la mañana, el asesor abre una sola pantalla y
  tiene la lista exacta de a quién llamar, en orden.

### B.4 — Recordatorio automático de visita *(backend, cola)*
- Job programado (ya hay `maintenance` + BullMQ) que envía recordatorio al lead 24h
  antes de la visita confirmada.
- **Ojo Meta:** fuera de la ventana de 24h hay que usar un **template aprobado**;
  respetar opt-out. Reusar el patrón de `LeadAlertService`.

### B.5 — Cerrar el loop de alerta al asesor *(backend)*
- El `lead_alert` ya existe; activar `alertsEnabled` end-to-end una vez aprobado el
  template en un WABA real, para que el asesor reciba el aviso en tiempo real.

---

## Fase C — Onboarding sin fricción (~1 semana)

**Meta:** bajar el costo operativo de dar de alta cada inmobiliaria.

- **Carga de propiedades con formulario + fotos** (además del CSV que ya existe):
  subida de imágenes a un bucket público accesible por Meta, reordenar fotos.
- **Wizard de alta de tenant:** conectar número de Meta, cargar credenciales
  (cifradas), configurar bot (nombre, tono, zonas, competidores), y guiar la
  aprobación del template `lead_alert`.
- **Criterio de aceptación:** dar de alta una inmobiliaria nueva no requiere tocar la
  base a mano ni curl.

---

## Fase D — Retención y follow-up (post-piloto)

**Meta:** subir conversión sobre los leads que ya entraron.

- **Re-enganche de leads tibios:** follow-up automático a las 48h ("¿seguís buscando
  en Palermo?") vía template, respetando ventana de 24h y opt-out.
- **Recuperación de no-show:** al marcar `NO_SHOW`, ofrecer reprogramar.
- **Reporte semanal** al owner por email/WhatsApp con el resumen del pipeline.
- **Post-MVP ya previsto:** re-ranking semántico con embeddings (dejar como está).

---

## Fase P — Piloto real y pricing (en paralelo a la Fase A)

Imprescindible antes de la primera venta:
- **1 inmobiliaria piloto** con número de Meta productivo (hoy todo es fixtures).
- Cerrar el ciclo del template `lead_alert` aprobado en un WABA real.
- Definir **pricing** y límites (¿por lead calificado? ¿por tenant? ¿por número?) y
  el modelo de costos (LLM + STT + Meta + infra).
- Métricas de éxito del piloto: % de leads calificados, % de visitas agendadas, y
  sobre todo **feedback del asesor** sobre la utilidad del panel.

---

## Qué se decidió NO hacer (o posponer)

- **STT con doble proveedor (Groq + OpenAI):** excelente de ingeniería, pero es
  complejidad y costo extra para el MVP comercial. Se puede simplificar a uno solo
  hasta tener volumen. *(No romper lo que anda; solo no invertir más ahí ahora.)*
- **Alquiler temporario** como operación de primera línea, si el ICP es venta/alquiler
  tradicional. Reduce superficie de prueba.
- **Embeddings / re-ranking semántico:** ya marcado como post-MVP en el schema. Queda.

---

## Secuencia recomendada y dependencias

```
A.1 (auth personas) ──► A.2 (frontend base) ──► A.3 (bandeja) ──► A.4 (ficha) ──► A.5 (dashboard)
                                                                      │
B.1 (appointments backend) ─────────────────────────────────────────┼──► B.2 (agenda UI)
                                                                      ├──► B.3 (cola llamar hoy)
                                                                      └──► B.4 (recordatorio) + B.5 (alerta)
Fase P (piloto + pricing) corre en paralelo desde el arranque de A.
C y D empiezan una vez que A+B están en manos del piloto.
```

**Primer entregable con valor vendible:** A.1 → A.4 + B.1 → B.3. Con eso una
inmobiliaria ve sus leads, los llama en orden y confirma visitas. Es el mínimo por el
que alguien paga.
