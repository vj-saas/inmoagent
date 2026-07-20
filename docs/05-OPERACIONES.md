# 05 — Operaciones: Meta, Onboarding, Deploy y Costos

## 1. Setup de Meta para desarrollo (costo $0)

1. Cuenta en [Meta for Developers](https://developers.facebook.com) → crear app
   tipo **Business** → agregar producto **WhatsApp**.
2. Meta provee un **número de prueba gratuito** con `phone_number_id` propio.
3. Registrar hasta 5 números de teléfono destino autorizados (el tuyo y los de
   quienes testeen).
4. Token temporal de 24 hs para desarrollo; para no renovarlo a mano, crear un
   **System User** en Business Manager y generar token permanente.
5. Webhook local: `ngrok http 3000` → configurar la URL HTTPS en la consola de
   Meta (campo `messages` suscripto) con tu `META_VERIFY_TOKEN`.
6. Cargar en el seed el `phone_number_id` del número de prueba en el tenant demo
   y el token cifrado.

## 2. Checklist e2e de sandbox (cerrar Fase 6)

- [ ] Mensaje "hola" → saludo + aviso de datos + pregunta de operación.
- [ ] Flujo completo texto: calificación → 3 propiedades con foto → interés →
      link de agenda → handoff.
- [ ] Audio de 30 s con filtros → transcripto y procesado correctamente.
- [ ] Ráfaga de 5 mensajes → una sola respuesta coherente.
- [ ] "BAJA" → confirmación y silencio definitivo.
- [ ] "quiero hablar con una persona" → handoff + notificación interna (si template listo).
- [ ] Pregunta de fútbol/política → redirección amable.
- [ ] Mención de competidor → respuesta neutral sin nombrarlo.
- [ ] Webhook duplicado (reenviar payload) → sin doble respuesta.
- [ ] Propiedad pausada por admin → deja de aparecer en búsquedas al instante.

## 3. Onboarding de una inmobiliaria real (runbook)

**Modelo elegido: el Meta Business y el número son del cliente.** La inmobiliaria
tiene CUIT y local: pasa la Business Verification sin fricción. Vos no concentrás
riesgo de baneo ni compliance.

1. **Kickoff (30 min):** la inmobiliaria designa el número (recomendado: número
   nuevo o línea que puedan migrar; un número ya usado en la app WhatsApp
   Business normal debe darse de baja de la app antes de migrar a Cloud API).
2. **Meta Business:** crear/usar el Business Manager del cliente, iniciar
   **Business Verification** (CUIT, constancia, sitio web o redes). Demora
   típica: 1-5 días hábiles. Sin verificación hay límites de mensajería, pero
   para un bot 100 % reactivo se puede operar el piloto mientras tanto.
3. **App y credenciales:** crear app Business en el BM del cliente (o agregarte
   como partner), registrar el número, obtener `phone_number_id`, `waba_id` y
   token de System User. Configurar el webhook apuntando a tu backend
   (`PUBLIC_BASE_URL/webhook/whatsapp`).
4. **Alta del tenant:** `POST /admin/tenants` con credenciales (token queda
   cifrado), configuración del bot (nombre, tono, link de agenda, horarios,
   competidores, zonas) y generación de API key del cliente.
5. **Inventario:** planilla CSV (formato §4) → `POST /admin/properties/import`.
   Verificar fotos accesibles públicamente.
6. **Prueba supervisada:** checklist §2 contra el número real con 2-3 teléfonos.
7. **Go-live:** perfil de WhatsApp Business completo (logo, descripción,
   dirección), y difusión del número (QR en vidriera, link wa.me en portales,
   web, firma de email).
8. **Entrega:** API key + mini manual de uso (cómo pausar propiedades, ver
   leads, liberar handoffs).

## 4. Formato CSV de inventario

Encabezados obligatorios (UTF-8, separador coma):

```
external_ref,title,description,operation,property_type,price,currency,expenses,
neighborhood,city,address,rooms,bedrooms,bathrooms,area_m2,garage,pets_allowed,
features,listing_url,photo_urls
```

- `operation`: `venta` | `alquiler` | `temporario`
- `features`: separadas por `;` ("balcón;luminoso;amenities")
- `photo_urls`: separadas por `;` (URLs https públicas)
- `garage`/`pets_allowed`: `si` | `no` | vacío
- Upsert por `external_ref`: reimportar el CSV actualiza precios y estados.
- Regla operativa clave para el cliente: **propiedad vendida/alquilada = fila
  eliminada del CSV o status pausado en el panel.** Ofrecer una propiedad
  inexistente es el peor error posible del producto.

## 5. Templates de Meta (para notificaciones y re-engagement)

Los mensajes iniciados por el negocio fuera de la ventana de 24 hs requieren
templates pre-aprobados por Meta y **se cobran por mensaje** (pricing por
mensaje vigente desde julio 2025; los mensajes de servicio dentro de la ventana
siguen siendo gratis). Templates a crear en el WABA de cada cliente:

1. `lead_alert` (categoría *utility*, destinatario: la propia inmobiliaria):
   "Nuevo lead calificado: {{1}} ({{2}}). Busca: {{3}}. Propiedad de interés:
   {{4}}. Respondé este chat para tomarlo."
2. `follow_up_24h` (categoría *marketing*, post-MVP): re-engagement de leads
   que no agendaron. Activar solo con opt-out respetado y costo modelado.

## 6. Deploy

El **paso a paso concreto del deploy gratuito** (Render + Supabase + Upstash,
para testing con WhatsApp real) vive en `06-DEPLOY.md`. Acá quedan las
consideraciones agnósticas de proveedor para cuando se pase a **producción**:

- **Un solo proceso:** el backend atiende el webhook y consume las colas BullMQ
  en el mismo contenedor (`Dockerfile`: `node:20-slim` + FFmpeg, corre
  `prisma migrate deploy` al bootear). No hace falta un worker separado.
- **Healthcheck** en `/health` (chequea DB + Redis). Restart on-failure.
- **Dominio público estable** para el webhook de Meta (el `*.onrender.com` sirve;
  un dominio custom evita rehacer la config de Meta si cambia el proveedor).
- **Backups:** agendar dump diario de Postgres (Supabase tiene backups
  automáticos en planes pagos; en free, dump manual con `pg_dump`).
- **Staging:** un entorno separado apuntado al número de prueba de Meta.
- **Producción real:** el plan free de Render duerme el servicio (cold start) —
  ver `06-DEPLOY.md` §6. Para SLA, plan pago de Render o VM (Fly.io / Oracle
  Cloud).

## 7. Costos operativos estimados (por mes)

> El testing actual corre **gratis** (Render + Supabase + Upstash free, ver
> `06-DEPLOY.md`). Esta tabla estima el costo de **producción** con infra paga
> (Render/Railway/Fly), donde una instancia sirve N tenants.

| Ítem | Costo | Nota |
|---|---|---|
| Backend + Redis (Render/Railway pago) | ~7-10 USD | una instancia sirve N tenants |
| Postgres gestionado (Supabase/Railway pago) | ~5-10 USD | compartido entre tenants |
| STT (Groq) | ≈ 0 - 2 USD / cliente | audios de leads; Groq es de los más baratos |
| LLM | ≈ 2-8 USD / cliente | depende de volumen; modelo económico |
| Mensajería Meta | **0 USD** en flujo reactivo | conversaciones iniciadas por el usuario: gratis. Templates (alertas/re-engagement): por mensaje según tarifa AR vigente — verificar rate card de Meta antes de activarlos |
| **Total por cliente (10 tenants en la misma infra)** | **≈ 5-12 USD** | margen amplio contra abono de 150-250 USD |

Regla: revisar precios de LLM/STT trimestralmente; en esta gama rotan rápido.

## 8. Notas comerciales (resumen de estrategia)

- **Pricing recomendado:** setup 400-800 USD (o equivalente ARS ajustable
  trimestral) + abono 150-250 USD/mes. El modelo "por lead calificado" solo como
  oferta puente para el primer piloto, con SQL definido por contrato como
  "visita agendada con fecha confirmada vía el bot".
- **Piloto:** 1 inmobiliaria, 30 días, precio simbólico o gratis a cambio de
  testimonial + métricas. Objetivo de validación: ≥ 20 % de leads que llegan a
  SEARCH_MATCH agendan visita.
- **Métrica estrella para vender:** "leads atendidos fuera de horario" — es el
  argumento del blueprint (respuesta en 15 min o el lead se enfría) y el panel
  debe mostrarla explícitamente.
- **Diferenciales frente a bots genéricos:** audio nativo (los leads argentinos
  mandan audios), fotos automáticas, cero alucinación de inventario, handoff
  limpio a humano.
