---
name: artifact-designer
description: Create polished, self-contained HTML artifacts in any coding-agent harness, with optional artifact tools when available. Use when creating dashboards, timelines, reports, prototypes, diff walkthroughs, benchmark/result viewers, decision documents, or any visual/shareable artifact. Use the bundled portable scripts and references to scaffold, validate, preview, import, list, and publish artifacts when artifact tools are unavailable.
---

# Artifact Designer

Create one polished, shareable artifact that is self-contained and easy to transfer between agent harnesses.

This skill supports two modes:

1. **Harness-tool mode**: if tools such as `artifact_create`, `artifact_validate`, `artifact_preview`, `artifact_publish`, `artifact_import_url`, `artifact_list`, or `artifact_open` are available, use them.
2. **Portable mode**: in any harness with filesystem + shell access, use `scripts/artifact.mjs` from this skill directory.

Artifacts live under the current project at `.artifacts/<id>/` so the same directory layout works in Claude Code, Cursor-like harnesses, and generic coding agents.

## Workflow

### 1. Scaffold

If artifact tools are available:

- Call `artifact_create` with title, instructions, kind, and optional id.
- Edit the created `source/index.html`.

If harness tools are not available, run the bundled helper from this skill directory:

```bash
node <skill-dir>/scripts/artifact.mjs create \
  --title "Artifact title" \
  --instructions "What this artifact should communicate or do" \
  --kind report
```

Then edit:

```text
.artifacts/<id>/source/index.html
```

Use `--id <slug>` when the user needs a stable artifact id. Use `--format md` only when the user explicitly asks for a Markdown artifact.

### 2. Design the artifact

Use the active design system in this priority order:

1. Project override: `.artifacts/DESIGN.md`
2. User default: `~/.artifact-designer/DESIGN.md`
3. Built-in Artifact UI: `references/design-system.md` and `references/artifact-theme.css`

When in doubt, read `references/design-system.md`. For exact CSS classes and tokens, read `references/artifact-theme.css`.

Requirements:

- Produce a single `index.html` artifact unless the user specifically asks for Markdown.
- Use semantic HTML inside `<main class="artifact-shell">`.
- Use the provided classes: `.artifact-header`, `.artifact-title`, `.artifact-subtitle`, `.artifact-card`, `.artifact-grid`, `.artifact-stack`, `.artifact-row`, `.artifact-button`, `.artifact-button-primary`, `.artifact-button-secondary`, `.artifact-badge`, `.artifact-callout`, `.artifact-metric`, `.artifact-table`, `.artifact-code`, `.artifact-tabs`, `.artifact-input`.
- Do not load external scripts, stylesheets, fonts, images, or APIs.
- Do not use `fetch`, `XMLHttpRequest`, or `WebSocket`.
- Inline only small JavaScript needed for local interactions.
- Prefer SVG/CSS/HTML visuals over base64 raster images.
- Keep each generated file under 5 MiB so it can be published with Cloudflare temporary Workers assets.
- Use a minimal, developer-focused aesthetic: whitespace, restrained color, high contrast, crisp borders.
- Use blue for links/focus/positive state, red for errors/destructive state, amber for warnings.
- Use code/mono styling for diffs, IDs, metrics, timestamps, and tabular numbers.
- Include copy/export controls when the artifact is an interactive decision surface so the user can paste results back into the agent harness.

### 3. Validate

If harness tools are available:

```text
artifact_validate({ id: "<id>", strict: true })
```

Portable mode:

```bash
node <skill-dir>/scripts/artifact.mjs validate --id <id> --strict
```

Fix validation errors before previewing or publishing. Warnings are acceptable only when they are intentional and explained.

### 4. Preview

If harness tools are available, use `artifact_preview` or `artifact_open`.

Portable mode:

```bash
node <skill-dir>/scripts/artifact.mjs preview --id <id> --open
```

If the harness cannot open a browser, report the local URL printed by the script.

### 5. Publish only when requested

Do not publish by default. Ask/confirm before making a public URL.

If harness tools are available:

```text
artifact_publish({ id: "<id>", target: "cloudflare-temporary", confirmPublic: true })
```

Portable mode:

```bash
node <skill-dir>/scripts/artifact.mjs publish --id <id> --target temporary
```

Temporary publishing uses Wrangler with an isolated temporary home and strips Cloudflare API env vars so it creates a no-signup temporary preview when possible. Temporary deployments expire unless claimed. Never publish secrets, credentials, customer data, or proprietary data unless the user explicitly confirms the data is safe to publish.

## Portable helper commands

From this skill directory:

```bash
node scripts/artifact.mjs create --title "Title" [--instructions "..."] [--kind report] [--id slug] [--format html|md]
node scripts/artifact.mjs validate --id slug [--strict]
node scripts/artifact.mjs preview --id slug [--open]
node scripts/artifact.mjs publish --id slug [--target temporary|permanent] [--domain example.com]
node scripts/artifact.mjs list
node scripts/artifact.mjs import-url --url https://... [--title "Title"] [--id slug]
```

Use these commands instead of recreating scaffolding/validation logic by hand in generic harnesses.

## Artifact structure

```text
.artifacts/<id>/
├── artifact.json          # metadata and publish history
├── source/index.html      # edit this
├── dist/index.html        # built copy for preview/publish
├── dist/_headers          # safe defaults: noindex, no-referrer, nosniff
├── dist/thumbnail.svg     # generated social/preview image
└── deploy/wrangler.jsonc  # generated on publish
```

The source directory is authoritative. Re-run validation/build after edits so `dist/` stays current.
