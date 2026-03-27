---
name: gh-issue
description: Create clear, actionable GitHub issues for bugs, features, and improvements. Issues are primarily consumed by LLMs, so optimize for agent readability and actionability.
license: LGPL-3.0
compatibility: opencode
---

# GitHub Issue Creation

Create clear, actionable GitHub issues for bugs, features, and improvements. Issues are primarily consumed by LLMs, so optimize for agent readability and actionability.

## When to Create an Issue

- Bugs discovered during development or testing
- Feature requests from product/design
- Technical debt or refactoring needs
- Schema changes requiring migrations
- Missing error handling, telemetry, or validation
- Architectural improvements

## Required: Always Use the `llm` Label

**Every issue MUST include the `llm` label.** This ensures the issue appears in LLM-facing issue feeds and boards.

```bash
gh issue create --title "..." --label llm --body "..."
```

## Issue Structure

Structure issues to help LLMs understand the problem and intended outcome without prescribing implementation details.

### Template

```markdown
## Problem

Clear, concise description of what is wrong or missing. One paragraph maximum.

## Impact

- Bullet points describing why this matters
- What breaks or what capability is missing
- User-facing consequences (if any)

## Proposed Solution (Optional)

High-level approach to fixing the problem. Do NOT include:
- Specific file paths
- Exact code snippets or function names
- Step-by-step implementation instructions
- Migration SQL (unless the issue IS the migration)

DO include:
- Which components/systems are involved
- Expected behavior after the fix
- Any constraints or requirements

## Acceptance Criteria

- [ ] Observable outcome 1
- [ ] Observable outcome 2
- [ ] Tests pass / typechecks pass
```

### Example: Good Issue

```markdown
## Problem

The outbox_events table has an aggregate_id column but no aggregate_type, 
making it impossible to query events by entity type without parsing payloads.

## Impact

- Cannot build audit trails by entity type (e.g., "all organization events")
- Difficult to implement event replay for specific domains
- No way to validate event sources at the database level

## Proposed Solution

Add an aggregate_type column to outbox_events. Events should specify their 
entity type ("organization", "user", "project"). System-level events without 
a clear aggregate should use aggregate_type: "system" with a generated ID.

## Acceptance Criteria

- [ ] Migration adds aggregate_type column with index
- [ ] OutboxWriter interface updated to accept aggregateType
- [ ] All existing outboxWriter.write() calls updated
- [ ] Can query events by aggregate_type
```

### Example: Bad Issue (Too Prescriptive)

```markdown
## Problem

Missing column in outbox_events table.

## Solution

1. Add `aggregate_type VARCHAR(64)` to packages/platform/db-postgres/src/schema/outbox-events.ts
2. In packages/domain/events/src/index.ts, change OutboxWriter interface:
   export interface OutboxWriter {
     write(event: {
       aggregateType: string  // ADD THIS
       ...
     })
   }
3. Update apps/web/src/domains/organizations/organizations.functions.ts line 55:
   await outboxWriter.write({
     aggregateType: "organization",  // ADD THIS
     ...
   })
```

**Why this is bad:** Prescribes exact implementation. Future LLM may find better approaches or hit blockers not anticipated by issue author.

## Creating Issues via CLI

```bash
# Simple inline body
gh issue create --title "Fix type inference in eval scorer" --label llm --body "Problem: Eval scorer returns any type. Impact: No type safety on scores. Solution: Add generic type parameter to score() function."

# From file
gh issue create --title "Add rate limiting to API" --label llm --body "$(cat <<'EOF'
## Problem

API endpoints lack rate limiting, vulnerable to abuse.

## Impact

- Potential for DOS attacks
- No protection against brute force
- Unpredictable resource usage

## Proposed Solution

Implement rate limiting middleware on API routes. Consider per-user and global limits.

## Acceptance Criteria

- [ ] Rate limiting applied to all public API endpoints
- [ ] Returns 429 status when limit exceeded
- [ ] Limits configurable via environment
EOF
)"
```

## Labels Beyond `llm`

Add additional labels when applicable:

- `bug` - Something is broken
- `enhancement` - New feature or improvement
- `tech-debt` - Refactoring or cleanup
- `database` - Schema or migration changes
- `security` - Security-related fix
- `docs` - Documentation only

Always pair these with `llm`.

## What to Avoid

❌ Implementation details (specific files, line numbers, exact code)
❌ Step-by-step instructions
❌ Guessing at root causes without evidence
❌ Multiple unrelated problems in one issue
❌ Vague titles like "Fix stuff" or "Improve code"

## What to Include

✅ Clear problem statement
✅ Impact/rationale for fixing
✅ High-level solution approach (optional)
✅ Acceptance criteria as checkboxes
✅ The `llm` label (always)

## Handling Uncertainty

If the problem is clear but the solution is unknown:

```markdown
## Problem

Intermittent timeouts in background job processing during high load.

## Impact

- Jobs fail silently after 30s
- Data processing delays during peak hours
- No visibility into which jobs are affected

## Proposed Solution

Unknown. Investigation needed to determine if this is:
- Queue worker configuration issue
- Database connection pool exhaustion
- External API timeout handling

## Investigation Notes

- Timeout occurs in @app/workers job handlers
- Correlates with span ingestion volume spikes
- Check worker logs around 2024-01-15 14:00 UTC

## Acceptance Criteria

- [ ] Root cause identified
- [ ] Fix implemented and tested
- [ ] Monitoring added to detect recurrence
```
