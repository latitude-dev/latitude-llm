---
name: production-release
description: >-
  Preparing a production release, pushing a vX.Y.Z release tag, running
  scripts/release.sh, or updating CHANGELOG.md with the changes that are about
  to be deployed to production.
---

# Production release

Use this skill when preparing a production deployment. If the skill is invoked
without additional context or constraints, assume the user wants the default
patch production release flow: update `CHANGELOG.md`, bump the Helm chart
version, commit both as `release: vX.Y.Z`, push it to `origin/development`, and
run the production tag script for the next patch version. Production deploys are triggered by pushing a
`vX.Y.Z` tag; the changelog is updated at release time as a human-readable diff
of the code being pushed to production since the previous production deploy,
focused on the major aspects rather than every commit.

## Release invariants

- `development` is trunk and deploys to staging by default.
- Production is triggered only by pushing a `vX.Y.Z` tag that points at the
  latest `origin/development` commit.
- Do not promote by merging `development` into `main`.
- Do not tag unreleased local-only commits. The release commit, including any
  changelog update, must be pushed to `origin/development` before tagging.
- The changelog release commit message must always have the exact shape
  `release: vX.Y.Z`, for example `release: v1.2.3`.
- Update `CHANGELOG.md` during release preparation, before running the command
  that pushes the production tag.
- The Helm chart (`charts/latitude/Chart.yaml`) tracks the Latitude release:
  set both `version` and `appVersion` to `X.Y.Z` (no leading `v`) in the same
  `release: vX.Y.Z` commit as the changelog. `scripts/release.sh` refuses to
  tag a release whose chart version does not match.

## Default behavior when no extra context is given

When the user only invokes this skill (or says something like "production
release") without specifying a version, dry run, changelog-only update, or other
constraint:

1. Treat it as approval to perform the full patch release workflow.
2. Determine the next patch version from the latest `vX.Y.Z` tag.
3. Update `CHANGELOG.md` for that next patch version using the production diff.
4. Set `version` and `appVersion` in `charts/latitude/Chart.yaml` to the new
   `X.Y.Z`.
5. Commit both with the exact message `release: vX.Y.Z` and push to
   `origin/development`.
5. Run `scripts/release.sh --yes` (without an explicit version) so it tags the
   latest `origin/development` commit with the next patch version. The `--yes`
   flag is required when running non-interactively (agent or CI): the script's
   confirmation prompt cannot be answered without a terminal, and without
   `--yes` it exits with an error rather than tagging.

Still obey all release invariants: never tag local-only commits, never promote
via `main`, and stop to ask if the working tree or branch state makes the
release unsafe or ambiguous.

## Workflow

1. Push the commit intended for production to `origin/development`; the release
   script always tags the latest `origin/development` commit after fetching.
2. Fetch tags and identify the previous production release tag:
   ```bash
   git fetch origin development --tags
   git tag -l 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1
   ```
3. Inspect the release range (`<latest-tag>..origin/development`, or the initial
   release range if no tag exists) as the production diff. Read the commits and changed files
   enough to understand the main shipped behavior, not just the commit titles.
4. Update `CHANGELOG.md` before deploying:
   - keep `## Unreleased` at the top;
   - add a section for the release version and date, for example
     `## v1.2.3 - 2026-05-27`;
   - summarize the major aspects of the production diff in language humans can
     scan quickly;
   - combine small related commits into one meaningful entry;
   - list only changes included in the release range;
   - group entries by area when helpful;
   - include references such as PR numbers or short commit SHAs when they help
     readers trace the change;
   - skip internal-only noise that does not matter to operators or users.
5. Commit the changelog update with message `release: vX.Y.Z` (matching the
   release version exactly) and push it to `origin/development`.
6. Run `scripts/release.sh [version]`. Use `--dry` first when you want to preview
   the release summary without tagging. Pass `--yes` to skip the confirmation
   prompt — always required when running without a terminal (agent or CI),
   otherwise the script errors out instead of tagging.

## Changelog style

Use concise, past-tense entries that describe the major shipped behavior. The
changelog is not an exhaustive commit log; it is a readable summary of what will
change in production compared with the previous deploy:

```markdown
## v1.2.3 - 2026-05-27

### Traces

- Added hover popovers for histogram incidents (ref: #3252).
- Fixed native OAuth redirect URI handling (ref: #3254).
```

Prefer release accuracy over exhaustive commit transcription. If a PR was merged
but is not part of the tagged range, it does not belong in that release section.
If many commits contribute to one capability, write one entry for the capability
instead of one entry per commit.
