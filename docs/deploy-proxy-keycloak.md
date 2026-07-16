# Production proxy + Keycloak (SSO)

Use **one** path for the app: `/ugt-sales-forecast`.
Mode is selected with `?mode=nylon` or `?mode=ufa` (default nylon).

## Reverse proxy (nginx)

Forward the whole prefix to the container. Do **not** strip the path prefix.
Do **not** force a trailing-slash redirect that fights the app.

```nginx
location /ugt-sales-forecast/ {
  proxy_pass http://127.0.0.1:3000/ugt-sales-forecast/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# Optional: exact path without trailing slash → same upstream (no redirect loop)
location = /ugt-sales-forecast {
  proxy_pass http://127.0.0.1:3000/ugt-sales-forecast;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Remove old locations for `/ugt-sales-forecast/nylon` and `/ugt-sales-forecast/ufa`
(the app itself redirects those to `?mode=`).

Smoke test (must be HTTP 200, not 308 loop):

- `https://ugtweb.ube.co.th/ugt-sales-forecast/healthz` → `{"ok":true}`
- `https://ugtweb.ube.co.th/ugt-sales-forecast/?mode=nylon` → HTML (200)

## Keycloak client settings

| Field | Value |
|-------|-------|
| Root URL | `https://ugtweb.ube.co.th/ugt-sales-forecast` |
| Home URL | `https://ugtweb.ube.co.th/ugt-sales-forecast` |
| Admin URL | `https://ugtweb.ube.co.th/ugt-sales-forecast` |
| Valid redirect URIs | `https://ugtweb.ube.co.th/ugt-sales-forecast/auth/callback` |
| Valid post logout redirect URIs | `https://ugtweb.ube.co.th/ugt-sales-forecast*` |
| Web origins | `https://ugtweb.ube.co.th` |

Avoid trailing `/` on Root/Home/Admin. Callback path must match exactly.

## Server `.env`

```env
APP_BASE_URL=https://ugtweb.ube.co.th
APP_BASE_PATH=/ugt-sales-forecast
DEV_AUTH_BYPASS=false
SESSION_SECRET=at-least-32-random-characters
```

`APP_BASE_PATH` must **not** end with `/`.

## After config changes

1. Save Keycloak client
2. Reload nginx
3. Redeploy app image (`docker compose up -d --build` or Jenkins on `master`/`main`)
4. Clear browser cookies for `ugtweb.ube.co.th`
5. Open `https://ugtweb.ube.co.th/ugt-sales-forecast/?mode=nylon` and sign in again
