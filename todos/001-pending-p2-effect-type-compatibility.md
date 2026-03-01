---
status: pending
priority: p2
issue_id: "001"
tags: [typescript, effect, auth]
dependencies: []
---

# Type Compatibility Issue in Auth Routes

## Problem Statement

The auth routes implementation has a type compatibility issue where `Effect<void, EmailSendError, never>` is not assignable to the expected `Effect<unknown, unknown, never>` type when using `Effect.runPromise` with the email sender.

## Findings

**File:** `apps/api/src/routes/auth.ts:131`

```typescript
await Effect.runPromise(
  emailSender.send({
    to: email,
    subject: "Log in to Latitude",
    html,
  })
);
```

**Error:**
```
Argument of type 'Effect<void, EmailSendError, never>' is not assignable to parameter of type 'Effect<unknown, unknown, never>'
  Type 'Effect<void, EmailSendError, never>' is missing the following properties from type 'Effect<unknown, unknown, never>': [TypeId], asEffect
```

This suggests a version mismatch or type incompatibility between the Effect instances being used. The issue is that the email sender's Effect has different type parameters than what Effect.runPromise expects.

## Proposed Solutions

### Option 1: Use Effect.asUnknown

**Approach:** Wrap the email sending Effect with `.pipe(Effect.asUnknown)` before passing to Effect.runPromise.

**Pros:**
- Quick fix without structural changes
- Maintains current architecture

**Cons:**
- Loses some type safety
- Workaround rather than proper fix

**Effort:** 30 minutes

**Risk:** Low

---

### Option 2: Refactor Email Sender to Return Unknown

**Approach:** Modify the EmailSender interface to return `Effect<unknown, EmailSendError, never>` instead of `Effect<void, EmailSendError, never>`.

**Pros:**
- Proper fix at the interface level
- Maintains type safety

**Cons:**
- Requires changes across all email adapter implementations
- Interface change affects multiple packages

**Effort:** 2-3 hours

**Risk:** Medium

---

### Option 3: Use Effect Match API for Error Handling

**Approach:** Refactor the sendMagicLink callback to properly handle the Effect result using Effect's match or either APIs.

**Pros:**
- Follows Effect best practices
- Explicit error handling

**Cons:**
- More code changes required
- Steeper learning curve

**Effort:** 3-4 hours

**Risk:** Low

## Recommended Action

Investigate if this is a catalog version mismatch between packages. Check that all packages use the same Effect version from the workspace catalog. If versions match, implement Option 1 as a temporary fix and create a follow-up issue for Option 2.

## Technical Details

**Affected files:**
- `apps/api/src/routes/auth.ts:131` - Effect.runPromise call
- `packages/domain/email/src/ports/email-sender.ts:20` - EmailSender interface
- All email adapter implementations

**Related components:**
- Email sending infrastructure
- Magic Link authentication flow

## Resources

- **PR:** Magic Link authentication implementation
- **Effect documentation:** Error handling patterns

## Acceptance Criteria

- [ ] Type error resolved
- [ ] Email sending still works correctly
- [ ] No regressions in auth flow
- [ ] All email adapters compile without errors

## Work Log

### 2026-03-01 - Initial Discovery

**By:** Claude Code

**Actions:**
- Identified type compatibility issue during code review
- Analyzed Effect type parameters
- Reviewed email sender interface
- Documented 3 solution approaches

**Learnings:**
- Effect versions must be consistent across packages
- Catalog versioning can help maintain consistency

## Notes

- This is a compile-time error that doesn't affect runtime behavior
- The email sending functionality works despite the type error
- Should be addressed before production deployment to ensure type safety
