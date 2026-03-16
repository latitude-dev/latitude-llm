# Projects

Projects are the main product boundary for reliability workflows.

Issues, evaluations, annotation queues, and simulations are all project-scoped.

## Reliability Additions

Projects gain a `settings` JSONB payload that owns:

- project-level provider override
- project-level model override
- `keepMonitoring`

Projects also start with a project-scoped set of system-created manual annotation queues so annotation review has immediate value before users create their own queues. These queues are marked with `system = true`, provision their sampling from a named default constant, and let users tune sampling or delete the queue later without editing the canonical queue definitions.

## Why Project Scope Matters

Reliability behavior often differs between projects in the same organization:

- different judge models
- different monitoring preferences
- different queue/simulation workflows
- different queue volumes and outlier baselines for system-created review queues

## Product Surface

Project routes are the main surface for:

- Issues
- Evaluations
- score dashboards
- annotation queues
- Simulations

## Product Accessibility

Reliability should be equally usable by humans through the web app UI and by other LLM Agents through MCP/API.

Project-scoped reliability features can still be built in `apps/web` first when that improves iteration speed.

But the underlying schemas, use-cases, and public capabilities should be designed so they can back both human-facing UI flows and agent-facing MCP/API flows instead of becoming UI-only.
