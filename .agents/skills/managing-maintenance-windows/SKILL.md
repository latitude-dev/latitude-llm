---
name: managing-maintenance-windows
description: Enables or disables Latitude production maintenance mode by redirecting all publicly exposed production services to the Better Stack status page. Use when asked to start, stop, toggle, verify, or prepare a maintenance window.
---

# Managing maintenance windows

Use this skill when a user asks to enable, disable, verify, or prepare Latitude's production maintenance window.

## What maintenance mode does

- Maintenance mode is an ALB-level switch in `infra/lib/alb.ts`.
- When enabled, all public production service hostnames redirect to `https://status.latitude.so/`: `console.latitude.so`, `api.latitude.so`, `ingest.latitude.so`, and `bull-board.latitude.so`.
- The switch is controlled by the Pulumi production config key `enableWebMaintenanceRedirect`.
- Do not implement this in `apps/web`: if a service is unhealthy, app-level redirects may not run.

## Enable maintenance mode

From `infra/`:

```bash
pulumi config set enableWebMaintenanceRedirect true --stack production
pulumi preview --stack production
pulumi up --stack production
```

Then verify from outside the VPC:

```bash
curl -I https://console.latitude.so/
curl -I https://api.latitude.so/health
curl -I https://ingest.latitude.so/health
curl -I https://bull-board.latitude.so/
```

Expected result: all requests return an HTTP redirect with `Location: https://status.latitude.so/`.

## Disable maintenance mode

From `infra/`:

```bash
pulumi config rm enableWebMaintenanceRedirect --stack production
pulumi preview --stack production
pulumi up --stack production
```

Then verify:

```bash
curl -I https://console.latitude.so/
curl -I https://api.latitude.so/health
curl -I https://ingest.latitude.so/health
curl -I https://bull-board.latitude.so/
```

Expected result: none of the requests redirects to `https://status.latitude.so/`. Services may return normal responses or auth redirects depending on the requested path.

## Safety checklist

Before enabling:

1. Confirm the user wants all publicly exposed production services redirected.
2. Confirm `https://status.latitude.so/` is live and has the relevant Better Stack maintenance or incident notice.
3. Run `pulumi preview --stack production` and check that the ALB HTTPS listener default action and all public host rules change from forwarding to redirecting.
4. Apply only after the user has approved the production change, unless they already explicitly asked to execute it.

Before disabling:

1. Confirm the maintenance window is complete or the user explicitly asked to restore service.
2. Run `pulumi preview --stack production` and check that the ALB HTTPS listener default action and all public host rules change from redirecting back to forwarding.
3. Verify every public hostname after `pulumi up`.

## Notes for agents

- Use `eval "$(mise env)"` if local shell commands cannot find `node`, `pnpm`, or Pulumi-related tooling.
- Do not change the hardcoded redirect target to an incident-specific URL. The reusable target is the status page root, `https://status.latitude.so/`.
- If Pulumi credentials or stack access are unavailable, report the exact command the operator should run and do not fake success.
