---
name: ci-watchdog
description: |
  Continuously monitor GitHub PR CI checks and automatically fix failures until all checks pass.
  
  USE THIS SKILL when:
  - The user wants to "keep an eye on CI" or "wait for checks to pass"
  - The user mentions monitoring PR status, CI status, or GitHub checks
  - The user asks to watch a PR until it's ready or fix failing checks
  - After pushing commits, the user wants to ensure CI stays green
  - The user mentions automated fix loops for CI failures
  
  This skill handles watching GitHub Actions (or other CI) checks, detecting failures,
  diagnosing issues from logs, and applying fixes in a loop until all checks pass.
  
  Works with GitHub CLI (gh) and common CI systems like GitHub Actions.
---

# CI Watchdog

Monitor a GitHub PR's CI checks continuously, automatically fix failures, and loop until everything passes.

## Quick Start

```bash
# Watch current PR until all checks pass (auto-fix enabled)
gh pr checks --watch --fail-fast

# Watch with auto-fix loop
ci-watchdog --fix --loop
```

## Core Workflow

The CI watchdog follows this loop:

1. **Monitor** - Watch PR checks until they complete or fail
2. **Detect** - Identify which checks failed
3. **Diagnose** - Fetch logs and understand the failure
4. **Fix** - Apply appropriate fixes to the codebase
5. **Commit** - Stage, commit, and push fixes
6. **Repeat** - Go back to monitoring until all pass

## Usage Patterns

### Basic Watch Mode

Just monitor without fixing:

```bash
gh pr checks --watch
```

### Auto-Fix Loop (Recommended)

Monitor and automatically fix issues:

```
LOOP:
  1. Run: gh pr checks --watch --fail-fast
  2. IF checks pass → DONE
  3. IF checks fail:
     a. Identify failed check names
     b. Fetch logs: gh run view <run-id> --log-failed
     c. Analyze error patterns
     d. Apply fixes to codebase
     e. Commit and push
     f. GOTO LOOP
```

## Failure Patterns & Fixes

### Type Errors / Lint Errors

**Detection:** `typecheck`, `lint`, `check`, `pyright`, `tsc` failures

**Common fixes:**
- Read the specific file and line from error output
- Fix the type mismatch or syntax error
- Remove references to deleted/renamed properties
- Add missing imports or type annotations

**Example flow:**
```bash
# Check failed with pyright errors in file X
python -m pyright src/path/to/file.py 2>&1 | head -30
# → Shows specific line/column errors
# → Fix the issues
# → Commit and push
```

### Test Failures

**Detection:** `test` check failures

**Common fixes:**
- Read the failing test file
- Update test assertions to match new behavior
- Remove obsolete test cases
- Fix test data/setup issues

**Example flow:**
```bash
# Tests failed
# Read the test file mentioned in error
# Update assertions or remove obsolete tests
# Commit and push
```

### Build Failures

**Detection:** `build`, `bundle`, `compile` failures

**Common fixes:**
- Check for missing dependencies
- Fix import errors
- Resolve circular dependencies
- Update build configuration

### Missing References

**Detection:** Errors about missing attributes, properties, or imports

**Example:**
```
error: Cannot access attribute "name" for class "X"
Attribute "name" is unknown
```

**Fix:**
1. Find all references to the removed/renamed attribute
2. Remove or update those references
3. Check related files (processors, handlers, tests)

## Reference: GitHub CLI Commands

### Check Status
```bash
# List current checks
gh pr checks

# Watch until complete (blocks)
gh pr checks --watch

# Watch and exit immediately on failure
gh pr checks --watch --fail-fast
```

### View Logs
```bash
# View failed check logs
gh run view <run-id> --log-failed

# View specific job
gh run view --job=<job-id>
```

### PR Operations
```bash
# View current PR
gh pr view

# Push changes
gh push

# Create PR (if needed)
gh pr create --draft --title "..." --body "..."
```

## Iteration Guidelines

When fixing CI failures:

1. **Fix minimal changes** - Don't over-fix; address just the reported error
2. **Commit after each fix** - Keep commits atomic and focused
3. **Use Conventional Commits** - `fix(scope): description` or `test(scope): description`
4. **Watch for cascading failures** - One fix may reveal new failures
5. **Know when to stop** - If stuck after 3-5 iterations, ask the user

## Common CI Check Names

Typical checks to watch for:
- `check` / `lint` - General linting
- `typecheck` / `type-check` - TypeScript/Python type checking
- `test` / `tests` - Test suite
- `build` - Build verification
- `knip` - Dead code detection
- `format` - Code formatting

## Example Session

```
User: "Watch this PR and fix any issues until CI passes"

→ Start: gh pr checks --watch --fail-fast
→ Wait for completion...
→ FAILED: pyright errors in latitude_span_processor.py

→ Read the failing file
→ Identify: references to removed 'name' attribute
→ Fix: Remove the name handling code
→ Commit: "fix(telemetry): remove name handling from processor"
→ Push

→ Restart: gh pr checks --watch --fail-fast
→ Wait...
→ FAILED: test failures in capture_test.py

→ Read test file
→ Identify: tests checking ctx.name which no longer exists
→ Fix: Remove ctx.name assertions
→ Commit: "test(telemetry): update tests for removed name field"
→ Push

→ Restart: gh pr checks --watch --fail-fast
→ Wait...
→ ALL PASSED ✓
→ Done!
```

## Edge Cases

### CI Taking Too Long
- Some checks run for 10+ minutes
- Use `--watch` to avoid polling manually
- The `--fail-fast` flag exits immediately on first failure

### Intermittent Failures
- Flaky tests may pass on retry
- If same failure repeats 3+ times, it's likely real

### Required vs Optional Checks
- Some checks may be "required" for merge
- Others may be informational only
- Focus on fixing required checks first

### No Write Access
- If you can't push fixes, report issues to user instead
- Provide specific fix suggestions with code snippets

## Safety Guidelines

- **Never** force push (`--force`) unless explicitly requested
- **Never** rewrite history on shared branches
- Always create new commits for fixes (don't amend)
- If stuck on a failure you can't fix, ask the user for help
- Don't merge the PR yourself unless explicitly asked
