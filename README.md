# UGT Sales Forecast

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Configure `.env` from `.env.example`.
3. Start the backend: `npm run server`
4. Start the frontend: `npm run dev`

## App modes (NYL vs UFA)

One codebase (`ugt-sales-forecast`), two deploys/links. **Data stays in the same database** — modes only filter what each link can see.

| | Polymer + Composite (Nylon) | UFA |
|--|--|--|
| `APP_MODE` | `nyl` | `ufa` |
| `ALLOWED_BUSINESS_UNITS` | `Polymer,Composite` | `UFA` |
| `APP_BASE_PATH` | `/ugt-sales-forecast/nylon` | `/ugt-sales-forecast/ufa` |
| Local Vite | port **3000** → `http://localhost:3000/ugt-sales-forecast/nylon` | port **3003** → `http://localhost:3003/ugt-sales-forecast/ufa` |
| Local API | port **3001** | port **3002** |
| Prod URL | `https://ugtweb.ube.co.th/ugt-sales-forecast/nylon` | `https://ugtweb.ube.co.th/ugt-sales-forecast/ufa` |

### Local: run both at once

Keep Nylon on 3000/3001, then in another terminal:

```bash
npm run server:ufa
npm run dev:ufa
```

Open UFA at: http://localhost:3003/ugt-sales-forecast/ufa

Config file: `.env.ufa` (ports 3002/3003 — avoids 3000, 3001, 3100, 3101).

## Docker deployment

1. Create `.env` on the deployment server. For production use:
   - `APP_BASE_URL=https://ugtweb.ube.co.th`
   - `APP_BASE_PATH=/ugt-sales-forecast/nylon`
   - `APP_MODE=nyl`
   - `DEV_AUTH_BYPASS=false`
   - Configure `DATABASE_URL`, `SESSION_SECRET`, and Keycloak variables.
2. Build and start: `docker compose up -d --build`
3. Check status: `docker compose ps`
4. Open: `https://ugtweb.ube.co.th/ugt-sales-forecast/nylon`

For UFA, deploy a **second** container/compose project with `APP_MODE=ufa`, `APP_BASE_PATH=/ugt-sales-forecast/ufa`, and a distinct `CONTAINER_NAME` / `HOST_PORT` (same `IMAGE_NAME=ugt-sales-forecast` is fine).

The container runs `prisma migrate deploy` before starting Express. Secrets are read from `.env` at runtime and are excluded from the image build context.
