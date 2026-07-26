# 06 — Deploy en Railway

Guía paso a paso para dejar el backend online en [Railway](https://railway.app).

## Arquitectura del deploy

| Servicio | Rol | Qué provee |
|---|---|---|
| **Railway — Postgres** (plugin) | Base de datos | `DATABASE_URL` (variable de referencia automática) |
| **Railway — Redis** (plugin) | Cola/cache | `REDIS_URL` (BullMQ + debounce) |
| **Railway — backend** | App | Corre el proceso Node (webhook + workers BullMQ + FFmpeg), todo en un mismo contenedor Docker |

El backend es **un solo proceso**: el mismo contenedor atiende el webhook HTTP
y consume las colas BullMQ (`inbound`, `media`, `outbound`, `maintenance`). No
hace falta un servicio worker separado.

Railway lee `railway.toml` de la raíz: usa el `Dockerfile` como builder,
healthcheck en `/health`, y reinicia el servicio ante fallas
(`ON_FAILURE`, 3 reintentos).

## 1. Crear el proyecto

1. Cuenta en [railway.app](https://railway.app), conectada a tu GitHub.
2. **New Project → Deploy from GitHub repo** → elegí este repo. Railway detecta
   `railway.toml` y construye con el `Dockerfile` de la raíz.

## 2. Agregar Postgres y Redis

1. Dentro del proyecto: **New → Database → Add PostgreSQL**. Railway crea el
   plugin y expone `DATABASE_URL` como variable de ese servicio.
2. **New → Database → Add Redis**, análogo, expone `REDIS_URL`.
3. En el servicio del **backend**, pestaña **Variables**, referenciá esas dos
   (Railway permite enlazar la variable de otro servicio del mismo proyecto en
   vez de copiar el valor a mano — así si rota la contraseña no hay que tocar
   nada acá).

## 3. Volumen persistente para fotos

Las fotos de propiedades se almacenan en el filesystem bajo `UPLOADS_DIR`
(`/data/uploads` en producción). Para que persistan entre redeploys y reintentos
automáticos, necesitás un volumen persistente.

1. **Opción A (recomendada, si el schema de `railway.toml` lo soporta):**
   El archivo `railway.toml` ya declara el volumen:
   ```toml
   [[deploy.volumes]]
   mountPath = "/data/uploads"
   name = "uploads"
   ```
   Railway crea el volumen automáticamente en el primer deploy. No hay pasos
   manuales.

2. **Opción B (si A no valida):** Desde la CLI de Railway o la consola web:
   ```bash
   railway volume add --name uploads --mount-path /data/uploads --size 5
   ```
   (crea un volumen de 5 GB con mount path `/data/uploads`).

   En ese caso, configura en el `railway.toml` solo lo que sea soportado por
   tu versión, y Railway reconocerá el volumen ya creado.

**Restricción operativa:** mientras uses volumen local (no compartido entre
réplicas), el backend debe correr **en una sola réplica**. En Railway: pestaña
**Settings** del servicio → **Deployment** → **Processes** → `1` (default).
Levantar más réplicas sin un filesystem compartido haría que cada una escribiera
en su propio disco y se perdería coherencia. Si necesitás escalar horizontalmente,
migrá a un almacenamiento externo (ej. S3, ver `docs/07-S3.md` si se agrega).

## 4. Variables de entorno del backend

En el servicio del backend, pestaña **Variables**, cargá (valores reales):

- `DATABASE_URL` — referenciada del plugin de Postgres (§2)
- `REDIS_URL` — referenciada del plugin de Redis (§2)
- `UPLOADS_DIR` — path del volumen persistente para fotos; debe ser `/data/uploads`
  (se monta en §3)
- `META_APP_SECRET`, `META_VERIFY_TOKEN` — de la app de Meta (ver
  `05-OPERACIONES.md` §1)
- `APP_ENCRYPTION_KEY` — 32 bytes hex:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `OPENAI_API_KEY`, `GROQ_API_KEY`
- `ADMIN_MASTER_KEY` — string secreto propio (alta de tenants)
- `PUBLIC_BASE_URL` — ver §4 (se completa después de generar el dominio)
- Opcionales, ya tienen default razonable si no se cargan: `NODE_ENV=production`,
  `LLM_MODEL`, `STT_PROVIDER`, `DEBOUNCE_SECONDS`, `USD_ARS_RATE`,
  `WA_SANDBOX_AR_RECIPIENT=false`.

## 5. Dominio público

1. En el servicio del backend: **Settings → Networking → Generate Domain**.
   Railway asigna una URL `https://<algo>.up.railway.app`.
2. Copiá esa URL a `PUBLIC_BASE_URL` en Variables y hacé **Redeploy** (el valor
   se conoce recién después de generar el dominio).

## 6. Deploy

Railway despliega solo al conectar el repo y en cada push a la rama conectada
(`main`). El `CMD` del `Dockerfile` corre `prisma migrate deploy` (aplica
migraciones contra el Postgres del plugin) y después `node dist/main.js`.

Verificá: `https://<tu-app>.up.railway.app/health` → `{ "db": "ok", "redis": "ok" }`.

### Seed (opcional, primera vez)

El seed (`prisma/seed.ts`) crea un tenant demo con propiedades de prueba. No
corre solo en el deploy. Para sembrar la base, desde tu máquina con el
`DATABASE_URL` del Postgres de Railway (Settings del plugin → **Connect** →
cadena pública):

```bash
DATABASE_URL="postgresql://...railway..." npx prisma db seed
```

(Imprime la API key del tenant demo una única vez — guardala.)

## 7. Conectar el webhook de Meta

Con la app online, en la consola de Meta (WhatsApp → Configuration → Webhook):

- **Callback URL:** `https://<tu-app>.up.railway.app/webhook/whatsapp`
- **Verify token:** el mismo valor que pusiste en `META_VERIFY_TOKEN`.
- Suscribir el campo `messages`.

Meta hace un `GET` de verificación; el backend responde el `hub.challenge` si el
token coincide. Detalle completo en `05-OPERACIONES.md` §1.

## 8. Actualizaciones y costos

- Railway redeploya automáticamente en cada push a `main`; una migración nueva
  se aplica sola al bootear. No hay paso manual.
- Railway es de pago por uso (no hay cold start por inactividad como en un
  plan free tradicional), pero **verificá la tarifa vigente** en
  [railway.app/pricing](https://railway.app/pricing) antes de comprometerte a
  un volumen — cambia con el tiempo y no está fijada en este repo.
- **Backups:** agendar dump periódico de Postgres (`pg_dump`) además de lo que
  ofrezca el plan de Railway.
