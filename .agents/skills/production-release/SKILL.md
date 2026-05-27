---
name: production-release
description: >-
  Preparing a production release, pushing a vX.Y.Z release tag, running
  scripts/release.sh, or updating CHANGELOG.md with the changes that are about
  to be deployed to production.
---

# Production release

Use this skill when preparing a production deployment. Production deploys are
triggered by pushing a `vX.Y.Z` tag; the changelog is updated at release time as
a human-readable diff of the code being pushed to production since the previous
production deploy, focused on the major aspects rather than every commit.

## Release invariants

- `development` is trunk and deploys to staging by default.
- Production is triggered only by pushing a `vX.Y.Z` tag that points at a commit
  reachable from `origin/development`.
- Do not promote by merging `development` into `main`.
- Do not tag unreleased local-only commits. The release commit, including any
  changelog update, must be pushed to `origin/development` before tagging.
- Update `CHANGELOG.md` during release preparation, before running the command
  that pushes the production tag.

## Workflow

1. Start from the commit intended for production and verify it is on
   `origin/development`.
2. Fetch tags and identify the previous production release tag:
   ```bash
   git fetch origin development --tags
   git tag -l 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1
   ```
3. Inspect the release range (`<latest-tag>..HEAD`, or the initial release range
   if no tag exists) as the production diff. Read the commits and changed files
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
5. Commit the changelog update and push it to `origin/development`.
6. Run `scripts/release.sh [version]` from the pushed release commit. Use
   `--dry` first when you want to preview the release summary without tagging.
7. Confirm staging has deployed and been verified before accepting the prompt,
   unless an explicit operator decision authorizes `--skip-staging-check`.

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
