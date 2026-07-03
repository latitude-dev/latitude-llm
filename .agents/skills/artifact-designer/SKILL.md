---
name: artifact-designer
description: Create, validate, preview, and publish self-contained HTML artifacts. Use for dashboards, reports, timelines, prototypes, diff walkthroughs, benchmark viewers, decision docs, and existing HTML files that need previewing or publishing. Use direct file commands for user-provided HTML; scaffold only when creating a new artifact.
---

# Artifact Designer

Use this skill for HTML artifacts and HTML publishing.

## Core rule

If the user points to an existing `.html` or `.htm` file, operate on that file directly.

Do not:

- create a new artifact
- copy it into `.artifacts/`
- wrap it in the template
- enforce Artifact UI design classes

Use the helper's `--file` commands.

## Existing HTML file

Validate:

```bash
node <skill-dir>/scripts/artifact.mjs validate --file path/to/file.html --strict
```

Preview:

```bash
node <skill-dir>/scripts/artifact.mjs preview --file path/to/file.html --open
```

Publish:

```bash
node <skill-dir>/scripts/artifact.mjs publish --file path/to/file.html --target temporary
```

Add `--name <worker-name>` only when the user asks for a stable Worker name.

File validation checks publish safety and platform limits. It does not check for `.artifact-*` classes or bundled design tokens.

## New artifact

Use this path only when the user asks you to create or redesign an artifact.

If artifact tools are available, use them:

```text
artifact_create({ title, instructions, kind, id? })
artifact_validate({ id, strict: true })
artifact_preview({ id, open: true })
artifact_publish({ id, target: "cloudflare-temporary", confirmPublic: true })
```

Otherwise use the helper:

```bash
node <skill-dir>/scripts/artifact.mjs create --title "Title" --instructions "..." --kind report
node <skill-dir>/scripts/artifact.mjs validate --id <id> --strict
node <skill-dir>/scripts/artifact.mjs preview --id <id> --open
node <skill-dir>/scripts/artifact.mjs publish --id <id> --target temporary
```

Generated artifacts live in:

```text
.artifacts/<id>/source/index.html
```

Edit `source/index.html`; rebuild/validate before previewing or publishing.

## Design rules for new artifacts

Design priority:

1. `.artifacts/DESIGN.md`
2. `~/.artifact-designer/DESIGN.md`
3. `references/design-system.md` and `references/artifact-theme.css`

Requirements for new artifacts:

- single `index.html` unless Markdown is requested
- semantic HTML inside `<main class="artifact-shell">`
- use bundled `.artifact-*` classes before custom CSS
- no external scripts, stylesheets, fonts, images, or APIs
- no `fetch`, `XMLHttpRequest`, or `WebSocket`
- inline only small local-interaction JavaScript
- prefer HTML/CSS/SVG visuals
- keep each file under 5 MiB
- use restrained UI: whitespace, clear hierarchy, crisp borders
- use mono text for code, IDs, metrics, timestamps, and table numbers
- add copy/export controls for interactive decision surfaces

## Publishing

Do not publish unless the user asks.

Publishing creates a public URL. Do not publish secrets, credentials, customer data, or proprietary data unless the user confirms it is safe.

Temporary publishing uses Wrangler with isolated Cloudflare auth and may expire unless claimed.

## Helper commands

```bash
node scripts/artifact.mjs create --title "Title" [--instructions "..."] [--kind report] [--id slug] [--format html|md]
node scripts/artifact.mjs validate --id slug [--strict]
node scripts/artifact.mjs validate --file path/to/file.html [--strict]
node scripts/artifact.mjs preview --id slug [--open]
node scripts/artifact.mjs preview --file path/to/file.html [--open]
node scripts/artifact.mjs publish --id slug [--target temporary|permanent] [--domain example.com]
node scripts/artifact.mjs publish --file path/to/file.html [--target temporary|permanent] [--domain example.com] [--name worker-name]
node scripts/artifact.mjs list
node scripts/artifact.mjs import-url --url https://... [--title "Title"] [--id slug]
```
