# 06 — Deploy gratis: Render + Supabase + Upstash

Guía para dejar el backend online sin costo, para **testing con WhatsApp real**
(no producción con SLA — ver §6, "Límites del plan free").

## Arquitectura del deploy

| Servicio | Rol | Qué provee |
|---|---|---|
| **Supabase** | Base de datos | Postgres gestionado → `DATABASE_URL` |
| **Upstash** | Cola/cache | Redis (BullMQ + debounce) → `REDIS_URL` |
| **Render** | Backend | Corre el proceso Node (webhook + workers BullMQ + FFmpeg), todo en un mismo contenedor Docker |

> **Cloudflare NO se usa.** Workers corre en un runtime de edge (V8 aislado),
> no Node.js: no soporta BullMQ con Redis persistente, ni el binario de FFmpeg,
> ni un worker de cola 24/7. Render ya da URL pública con HTTPS gratis.

El backend es **un solo proceso**: el mismo contenedor atiende el webhook HTTP
y consume las colas BullMQ (`inbound`, `media`, `outbound`, `maintenance`). No
hace falta un servicio worker separado.

## 1. Supabase (Postgres)

1. Cuenta gratis en [supabase.com](https://supabase.com) → **New project**.
   Anotá la contraseña de la base que elijas al crear el proyecto.
2. **Project Settings → Database → Connection string → URI.** Copiá esa cadena
   (formato `postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres`).
   - Usá la conexión **directa** (puerto 5432), no la del pooler (6543): Prisma
     Migrate necesita la directa para aplicar migraciones.
3. Esa cadena, con la contraseña real, es tu `DATABASE_URL`.

## 2. Upstash (Redis)

1. Cuenta gratis en [upstash.com](https://upstash.com) → **Create Database**
   (tipo Redis). Elegí una región cercana a la de Render.
2. En la página de la base, sección **Connect** / **TLS**, copiá el endpoint
   con formato `rediss://default:[TOKEN]@xxxx.upstash.io:6379`.
   - **Tiene que ser `rediss://` (con TLS), NO la API REST de Upstash.** BullMQ
     usa el protocolo TCP de Redis; ioredis maneja el TLS solo por el esquema
     `rediss://`. El código no necesita cambios (`src/common/redis.module.ts`).
3. Ese endpoint es tu `REDIS_URL`.

## 3. Render (backend)

1. Cuenta gratis en [render.com](https://render.com), conectada a tu GitHub.
2. **New → Blueprint** y elegí el repo: Render lee `render.yaml` de la raíz y
   crea el Web Service (runtime Docker, plan free, healthcheck en `/health`).
   - Alternativa manual: **New → Web Service** → repo → Render detecta el
     `Dockerfile` solo.
3. En el paso de variables de entorno, Render pide las declaradas con
   `sync: false` en `render.yaml`. Cargá (valores reales):
   - `DATABASE_URL` — de Supabase (§1)
   - `REDIS_URL` — de Upstash (§2)
   - `META_APP_SECRET`, `META_VERIFY_TOKEN` — de la app de Meta (ver
     `05-OPERACIONES.md` §1)
   - `APP_ENCRYPTION_KEY` — 32 bytes hex:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `OPENAI_API_KEY`, `GROQ_API_KEY`
   - `ADMIN_MASTER_KEY` — string secreto propio (alta de tenants)
   - `PUBLIC_BASE_URL` — la URL `https://<algo>.onrender.com` que asigna Render.
     Se conoce recién tras el primer deploy: dejala provisoria, y una vez que
     Render te dé la URL definitiva, actualizála y redesplegá.
   - Las no-secretas (`NODE_ENV`, `LLM_MODEL`, `STT_PROVIDER`,
     `DEBOUNCE_SECONDS`, `WA_SANDBOX_AR_RECIPIENT`) ya vienen fijadas en
     `render.yaml`, no hace falta cargarlas.
4. **Deploy.** El `CMD` del `Dockerfile` corre `prisma migrate deploy` (aplica
   las migraciones a Supabase) y después `node dist/main.js`.
5. Verificá: `https://<tu-app>.onrender.com/health` → `{ "db": "ok", "redis": "ok" }`.

### Seed (opcional, primera vez)

El seed (`prisma/seed.ts`) crea un tenant demo con propiedades de prueba. No
corre solo en Render. Para sembrar la base de Supabase una vez, desde tu
máquina con el `DATABASE_URL` de Supabase apuntado:

```bash
DATABASE_URL="postgresql://...supabase..." npx prisma db seed
```

(Imprime la API key del tenant demo una única vez — guardala.)

## 4. Conectar el webhook de Meta

Con la app online, en la consola de Meta (WhatsApp → Configuration → Webhook):

- **Callback URL:** `https://<tu-app>.onrender.com/webhook/whatsapp`
- **Verify token:** el mismo valor que pusiste en `META_VERIFY_TOKEN`.
- Suscribir el campo `messages`.

Meta hace un `GET` de verificación; el backend responde el `hub.challenge` si el
token coincide. Detalle completo en `05-OPERACIONES.md` §1.

## 5. Actualizaciones

Render redepliega automáticamente en cada push a la rama conectada (`main`). Una
migración nueva se aplica sola al bootear (`prisma migrate deploy`). No hay
paso manual.

## 6. Límites del plan free (importante)

- **Render free duerme el servicio tras ~15 min sin tráfico.** El próximo
  webhook sufre un cold start de ~30-60s. Como el `POST /webhook` sólo encola y
  Meta reintenta si no recibe 200 a tiempo, y la idempotencia por
  `wa_message_id` evita doble proceso, no se pierde el mensaje — pero la primera
  respuesta tras la inactividad tarda. Para producción real conviene un plan
  pago o un cron que mantenga el servicio despierto.
- **Supabase pausa el proyecto tras ~1 semana sin actividad.** Se reactiva con
  un click en el dashboard, pero mientras está pausado la app no conecta a la
  DB. Para uso esporádico de testing, reactivar antes de probar.
- **Upstash free** tiene un tope de comandos/día holgado para testing; con
  tráfico real de varios tenants conviene revisar el uso.

Estos límites son aceptables para seguir probando con WhatsApp real. Para una
inmobiliaria en producción, migrar el backend a un plan pago de Render (o una VM
como Fly.io / Oracle Cloud) elimina el cold start; la DB y el Redis pueden
quedar en Supabase/Upstash pagos o volver a un proveedor único.
