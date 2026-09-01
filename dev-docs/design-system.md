# Design system site

`apps/design-system` is a standalone Vite SPA that documents and demos `@repo/ui` — the shared component library consumed by `apps/web`. It is the engineering reference for tokens, primitives, and composition patterns; production console UI still lives in `apps/web`.

## Layout

```
apps/design-system/
  src/routes/           ← TanStack Router file routes (one page per component/topic)
  src/routes/-components/  ← Shell, sidebar nav, demo frames, theme toggle
  package.json          ← @app/design-system
```

Each route renders live examples inside `DemoFrame` / `DesignSystemShell`. Navigation is driven by `nav-config.ts`. Component pages import directly from `@repo/ui` — there is no duplicate implementation layer.

## Local development

```bash
pnpm --filter @app/design-system dev
```

Vite serves the app on its default port (check terminal output). No backend services are required — the site is static component demos only.

## Deployment

Production hosts at **https://design.latitude.so** (Vercel, SPA rewrites in `apps/design-system/vercel.json`). DNS is managed in `infra/lib/dns.ts`.

## When to update

- Adding or changing a public `@repo/ui` component → add or refresh the matching route under `apps/design-system/src/routes/`.
- Token / typography / spacing changes → update the foundations pages (`colors`, `typography`, `spacing`, `shadows`) and any affected component demos.
- For web-app UI conventions (forms, modals, route organization), see the [web-frontend skill](../.agents/skills/web-frontend/SKILL.md).
