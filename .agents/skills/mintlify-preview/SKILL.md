---
name: mintlify-preview
description: Run the public Mintlify product docs site locally for live preview. Use when previewing or iterating on docs under `docs/` (`.mdx`/`.md` pages, `docs.json` nav), or when the user says "start the docs", "run mintlify", "preview the docs site".
license: MIT
compatibility: opencode
---

# Mintlify docs local preview

The public product docs site lives in **`docs/`** (`docs.json` + topical `.mdx`/`.md` pages). It is served locally with the **Mintlify CLI** (`mint dev`). This is the **product docs site**, not `dev-docs/` — for durable internal domain docs see the [docs skill](../docs/SKILL.md).

## TL;DR — start the server

Run from the **`docs/` directory** (where `docs.json` lives), on a non-default port so it doesn't collide with the web app on `3000`:

```bash
cd docs
PATH="$(ls -d "$HOME"/.nvm/versions/node/v22.*/bin 2>/dev/null | sort -V | tail -1):$PATH" mint dev --port 3333
```

Then open **http://localhost:3333**. A page at `docs/<folder>/<file>.mdx` is served at `http://localhost:3333/<folder>/<file>` (e.g. `docs/monitors/overview.mdx` → `/monitors/overview`). The server hot-reloads on edits to any `.mdx`/`.md` or `docs.json`.

Prefer running it in the background and tailing the output until you see `✓ preview ready`.

## Why the `PATH` prefix (node version gotcha)

**Mintlify does not run on Node 25+.** This repo's default/active Node is often 25, which fails with:

```
erro mintlify is not supported on node versions 25+ (current version 25.9.0).
```

The `PATH=...` prefix above pins an installed **Node 22 LTS** (from nvm) for just this command, without changing the repo's active Node. If no `v22.*` is installed, install one (`nvm install 22`) or use any LTS `<25`. `mise`/`nvm activate` in a child shell won't help — prefix the `PATH` on the command itself.

## Keep the CLI current (schema gotcha)

`docs.json` uses current Mintlify schema features (e.g. `styling.codeblocks` as an object). An **outdated CLI** rejects valid config with:

```
🚨 Invalid docs.json: #.styling.codeblocks: Expected ... received 'object'
```

Fix by updating the CLI, **not** by editing `docs.json` (the checked-in config is correct for the real deploy):

```bash
PATH="$(ls -d "$HOME"/.nvm/versions/node/v22.*/bin 2>/dev/null | sort -V | tail -1):$PATH" mint update
```

> The `mint` and legacy `mintlify` binaries can live under different Node versions and update independently. Update the **same** binary you run `mint dev` with (i.e. under Node 22).

## Verify it's up

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3333/        # 307 redirect to first page — fine
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3333/monitors/overview   # 200 = page resolves
```

## Rules

- **Never edit `docs.json` to satisfy a stale local CLI.** Update the CLI instead.
- Add new pages to the nav in `docs.json` (the `navigation.groups[].pages` arrays). A `.mdx` file that isn't referenced there won't appear in the sidebar.
- Use **port 3333** (or any free port ≠ 3000) so the docs server and the web dev server can run together.
- `<Frame>`/`<img>` blocks pointing at missing `docs/images/...` files render as broken-image placeholders — expected until the assets land.
