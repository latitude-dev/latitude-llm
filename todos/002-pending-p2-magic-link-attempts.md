---
status: pending
priority: p2
issue_id: "002"
tags: [security, magic-link, auth]
dependencies: []
---

# Security: Add allowedAttempts to Magic Link Configuration

## Problem Statement

The Magic Link plugin configuration in Better Auth does not explicitly set `allowedAttempts`, relying on the library's default value. While Better Auth likely has sensible defaults, explicitly configuring this security parameter ensures the application has clear security boundaries and prevents potential brute force attacks on magic link verification.

## Findings

**File:** `packages/platform/auth-better/src/index.ts:102-107`

```typescript
const magicLinkPlugin = magicLink({
  sendMagicLink: async ({ email, url, token }) => {
    await sendMagicLinkFn({ email, url, token });
  },
  expiresIn: 3600, // 1 hour
}) as unknown as BetterAuthPlugin;
```

**Missing Configuration:**
- `allowedAttempts` is not specified
- According to Better Auth docs, this controls how many times a magic link can be attempted before it's invalidated
- The default might be reasonable, but explicit configuration is better for security auditing

**Security Impact:**
- Without explicit limits, attackers could potentially attempt to guess magic link tokens
- Each attempt should ideally consume the token or count against an attempt limit
- Single-use tokens (which Better Auth supports) are already configured, but attempt limits add another layer

## Proposed Solutions

### Option 1: Add allowedAttempts = 1 (Recommended)

**Approach:** Configure `allowedAttempts: 1` to strictly enforce single-use magic links.

**Pros:**
- Most secure option
- Explicit security boundary
- Matches the single-use token intent

**Cons:**
- If user clicks link twice (accident or browser prefetch), it fails
- May frustrate users with aggressive browser prefetching

**Effort:** 10 minutes

**Risk:** Low

---

### Option 2: Add allowedAttempts = 3

**Approach:** Configure `allowedAttempts: 3` for a balance between security and usability.

**Pros:**
- Allows for accidental double-clicks
- Still prevents brute force attacks
- Better user experience

**Cons:**
- Slightly less strict than single-use
- Browser prefetch could consume attempts

**Effort:** 10 minutes

**Risk:** Low

---

### Option 3: Investigate Better Auth Default First

**Approach:** Check Better Auth's actual default value before making changes.

**Pros:**
- Informed decision
- May discover default is already appropriate

**Cons:**
- Requires research
- Delay in implementing

**Effort:** 30 minutes

**Risk:** Very Low

## Recommended Action

Implement Option 2 (allowedAttempts: 3) for a good balance of security and user experience. Magic links with 1-hour expiry and 3 attempts provides strong security while allowing for accidental clicks or browser behavior.

## Technical Details

**Affected files:**
- `packages/platform/auth-better/src/index.ts:102-107` - Magic Link plugin configuration

**Related components:**
- Better Auth Magic Link plugin
- Authentication security model

## Resources

- **Better Auth Magic Link docs:** https://www.better-auth.com/docs/plugins/magic-link
- **Security best practices:** OWASP Authentication Cheat Sheet

## Acceptance Criteria

- [ ] `allowedAttempts` explicitly configured
- [ ] Value documented in code comments
- [ ] Tested with multiple attempts
- [ ] Security audit log updated

## Work Log

### 2026-03-01 - Security Review

**By:** Claude Code

**Actions:**
- Identified missing allowedAttempts configuration
- Reviewed Better Auth Magic Link plugin options
- Assessed security implications
- Documented 3 configuration options

**Learnings:**
- Better Auth supports granular attempt limiting
- Default values should be explicitly configured for security auditing
- Browser prefetch behavior is a consideration for attempt limits

## Notes

- Better Auth may have a default (possibly 1 or 3)
- Explicit configuration makes security posture clear
- Should be coordinated with rate limiting already in place (3/hour per email, 10/hour per IP)
