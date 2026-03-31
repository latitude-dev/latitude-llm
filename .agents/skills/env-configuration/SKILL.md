---
name: env-configuration
description: Adding or reading env vars, updating .env.example, or validating config at startup with parseEnv / parseEnvOptional.
---

# Environment configuration

**When to use:** Adding or reading env vars, updating `.env.example`, or validating config at startup with `parseEnv` / `parseEnvOptional`.

## `LAT_` prefix convention

All application environment variables **must** be prefixed with `LAT_` so they do not collide with third-party services, Docker, or common names.

**Use `LAT_` for:**

- Database URLs and pool settings (`LAT_DATABASE_URL`, `LAT_PG_POOL_MAX`, …)
- Service endpoints the app reads (`CLICKHOUSE_URL`, `LAT_REDIS_HOST`, …)
- App ports (`LAT_API_PORT`, `LAT_WEB_PORT`, `LAT_INGEST_PORT`)
- Auth, email, OAuth, billing, CORS (`LAT_BETTER_AUTH_SECRET`, `LAT_MAILPIT_HOST`, …)
- Any new variable consumed by Latitude application code

**Do not use `LAT_` for:**

- `NODE_ENV`
- Docker-only init variables (`POSTGRES_USER`, `CLICKHOUSE_USER`, …)
- Config read only by container images (Weaviate, Redis in compose, etc.)
- Browser-exposed Vite vars: use **`VITE_LAT_*`** (Vite requires the `VITE_` prefix)

**Reference:** `.env.example` lists Docker “Services” vs “Latitude Application” (`LAT_*`) variables.

## `.env.example` maintenance

Every new variable **must** appear in `.env.example`:

- **Required:** uncommented with a sensible local default (e.g. `LAT_API_PORT=3001`)
- **Optional:** commented with a placeholder (e.g. `# LAT_STRIPE_SECRET_KEY=sk_test_xxx`)

## Parsing in code

**Always** use `parseEnv` or `parseEnvOptional` from `@platform/env` — never `process.env.FOO` ad hoc or unprefixed names for app config.

```typescript
// ❌ Bad - unprefixed or direct access
const port = Number(process.env.PORT)

// ✅ Good - pass the variable name string (parseEnv reads process.env internally)
import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

const port = Effect.runSync(parseEnv("LAT_API_PORT", "number", 3001))
const dbUrl = Effect.runSync(parseEnv("LAT_DATABASE_URL", "string"))
```

For where configuration is wired in apps (clients, routes), see [architecture-boundaries](../architecture-boundaries/SKILL.md).
