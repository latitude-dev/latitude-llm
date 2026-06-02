# Contributing to Latitude

Thanks for taking the time to contribute! ❤️

The best ways to contribute:

- Open and vote on [Issues](https://github.com/latitude-dev/latitude-llm/issues)
- Improve the [docs](https://docs.latitude.so)
- Open a pull request

> And if you like the project but don't have time to contribute code, you can also:
> - Star the repo
> - Share Latitude with people who'd find it useful
> - Mention it at meetups or in your project's README

The maintainers hang out in [Slack](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw) if you have questions.

## Making a change

For typos, small docs fixes, and clearly-scoped bugs, just open a PR.

**For new features or anything significant, open an issue first.** Discussing it ahead of time keeps the process smooth, changes that weren't discussed may be rejected.

 We don't assign issues, just comment to claim one, then open a PR. The first quality PR that resolves an issue is the one we merge.

## Reporting issues

Search [existing issues](https://github.com/latitude-dev/latitude-llm/issues) first. A good bug report has a clear description of expected vs. actual behavior, exact repro steps, and your environment. A good feature request explains the problem you're solving, not just the solution.

Found a security vulnerability? Don't open a public issue, see [SECURITY.md](SECURITY.md).


## Pull requests

1. Fork and branch from `development` (our trunk; v1 fixes branch from `latitude-v1`).
2. Keep PRs small and focused. Split large changes, schema separate from logic, refactors first.
3. Make sure lint, type-checking, and tests pass.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit and PR titles (e.g. `fix(traces): handle empty spans`). We squash-merge.
5. Link the issue with `Closes #123`, describe what you tested, and leave "Allow edits from maintainers" checked.

We're a small team, we read everything but may take a few days, longer for big changes. Stale or out-of-scope PRs may be closed, but you're welcome to reopen.

## CLA

The first time you open a PR, a bot will ask you to sign our Contributor License Agreement. It's a one-time step. You keep ownership of your work; you're granting us a license to use it. PRs can't be merged until it's signed.

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
