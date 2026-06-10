# Contributing to Latitude

Thanks for taking the time to contribute! ❤️

The best ways to contribute:

- Pick up a [good first issue](https://github.com/latitude-dev/latitude-llm/contribute) (curated, newcomer-friendly tasks)
- Open and vote on [Issues](https://github.com/latitude-dev/latitude-llm/issues)
- Improve the [docs](https://docs.latitude.so)

> And if you like the project but don't have time to contribute code, you can also:
> - Star the repo
> - Share Latitude with people who'd find it useful
> - Mention it at meetups or in your project's README

The maintainers hang out in the [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw) if you have questions.

## Local development

You'll need **Node.js 25** and **Python 3.13** (`mise install`), **pnpm 10** (`corepack enable`), **Docker**, **goose** (`brew install goose`, for ClickHouse migrations) and **uv** (`brew install uv`, for the evaluation optimizer runtime).

```bash
pnpm install                           # also configures the git hooks
cd packages/platform/op-gepa/python \  # installs python dependencies 
 && uv venv \
 && uv sync --all-extras --all-groups
cp .env.example .env.development       # local defaults
cp .env.example .env.test              # then set NODE_ENV=test in it
mkdir -p storage                       # set LAT_STORAGE_FS_ROOT to its absolute path in both env files
pnpm build                             # required before migrations
docker compose up -d                   # start infrastructure only
pnpm migrate                           # run Postgres (Drizzle) + ClickHouse (goose) migrations
pnpm seed                              # create sample org, users and telemetry
pnpm tmux                              # or `pnpm dev`, or per-service `pnpm --filter @app/<svc> dev`
```

Then open [http://localhost:3000](http://localhost:3000), sign in with the seeded `owner@acme.com`, and click the magic link captured by Mailpit at [http://localhost:8025](http://localhost:8025).

More info in our [local development docs](https://docs.latitude.so/development/setup).

## Making a change

For typos, small docs fixes, and clearly-scoped bugs, just open a PR.

**For new features or anything significant, open an issue first.** Discussing it ahead of time keeps the process smooth, changes that weren't discussed may be rejected.

 We don't assign issues, just comment to claim one, then open a PR. The first quality PR that resolves an issue is the one we merge.

## Reporting issues

Search [existing issues](https://github.com/latitude-dev/latitude-llm/issues) first. A good bug report has a clear description of expected vs. actual behavior, exact repro steps, and your environment. A good feature request explains the problem you're solving, not just the solution.

Found a security vulnerability? Don't open a public issue, see [SECURITY.md](SECURITY.md).

## Pull requests

1. Fork and branch from `development` (our trunk).
2. Keep PRs small and focused. Split large changes, schema separate from logic, refactors first.
3. Make sure lint, type-checking, and tests pass.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit and PR titles (e.g. `fix(traces): handle empty spans`). We squash-merge.
5. Link the issue with `Closes #123`, describe what you tested, and leave "Allow edits from maintainers" checked.

We're a small team, we read everything but may take a few days, longer for big changes. Stale or out-of-scope PRs may be closed, but you're welcome to reopen.

## CLA

The first time you open a PR, a bot will ask you to sign our Contributor License Agreement. It's a one-time step. You keep ownership of your work; you're granting us a license to use it. PRs can't be merged until it's signed.

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
