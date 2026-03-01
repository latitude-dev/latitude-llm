---
status: pending
priority: p2
issue_id: "003"
tags: [testing, auth, magic-link]
dependencies: []
---

# Missing Tests for Magic Link Authentication Flow

## Problem Statement

The Magic Link authentication implementation lacks comprehensive test coverage. While the infrastructure is in place (domain packages, adapters, UI components), there are no automated tests for the critical authentication flow, including token generation, email sending, rate limiting, and UI interactions.

## Findings

**Missing Test Coverage:**

1. **Unit Tests - Domain Layer:**
   - No tests for email template generation
   - No tests for email sender port interface
   - No tests for onboarding use cases

2. **Integration Tests - API Layer:**
   - No tests for Magic Link request endpoint
   - No tests for Magic Link verification endpoint
   - No tests for rate limiting behavior
   - No tests for email delivery

3. **E2E Tests - Frontend:**
   - No tests for MagicLinkForm component
   - No tests for OAuthButtons component
   - No tests for complete auth flow

**Files That Should Have Tests:**

- `packages/domain/email/src/templates/magic-link.ts` - Template generation with XSS protection
- `packages/domain/onboarding/src/use-cases/setup-new-user.ts` - Workspace creation logic
- `apps/api/src/routes/auth.ts` - Magic Link endpoints and email sending
- `apps/api/src/middleware/rate-limiter.ts` - Rate limiting logic
- `apps/web/src/components/auth/MagicLinkForm.tsx` - Form interactions
- `apps/web/src/routes/login.tsx` - Login page integration

## Proposed Solutions

### Option 1: Comprehensive Test Suite (Recommended)

**Approach:** Create a complete test suite covering unit, integration, and E2E tests.

**Test Structure:**
```
tests/
  unit/
    email-template.test.ts
    onboarding.test.ts
  integration/
    magic-link-api.test.ts
    rate-limiter.test.ts
  e2e/
    auth-flow.test.ts
```

**Pros:**
- Full coverage of critical auth flow
- Catches regressions early
- Documents expected behavior
- Enables confident refactoring

**Cons:**
- Time intensive (2-3 days)
- Requires test infrastructure setup

**Effort:** 2-3 days

**Risk:** Low

---

### Option 2: Critical Path Tests Only

**Approach:** Focus on the most critical tests first: Magic Link token generation/verification and rate limiting.

**Priority Tests:**
1. Magic Link token creation and consumption
2. Rate limiting (3/hour email, 10/hour IP)
3. Email template XSS protection
4. Basic form submission

**Pros:**
- Faster implementation (1 day)
- Covers most critical security paths
- Can expand later

**Cons:**
- Incomplete coverage
- May miss edge cases

**Effort:** 1 day

**Risk:** Medium

---

### Option 3: Manual Testing Documentation

**Approach:** Create comprehensive manual testing documentation as an interim solution.

**Pros:**
- Quick to implement (2-3 hours)
- Provides immediate value
- Can be automated later

**Cons:**
- Not automated
- Won't catch regressions
- Requires human effort

**Effort:** 3 hours

**Risk:** Medium

## Recommended Action

Implement Option 2 (Critical Path Tests) as an immediate priority to secure the core authentication flow. Then create a follow-up issue for Option 1 (Comprehensive Test Suite) to be completed within the next sprint.

## Technical Details

**Test Infrastructure:**
- Vitest is already configured (per AGENTS.md)
- Test command: `pnpm test` or `pnpm --filter @app/api test`

**Mocking Requirements:**
- Email sender (for unit tests)
- Redis (for rate limiter tests)
- Better Auth (for API tests)
- Mailpit/SMTP (for integration tests)

**Testing Stack:**
- Unit/Integration: Vitest + @effect/vitest (for Effect-based code)
- E2E: Playwright or Cypress (not yet configured)

## Resources

- **Testing docs:** AGENTS.md in repo root
- **Vitest docs:** https://vitest.dev/
- **Better Auth testing:** Check if they provide test utilities

## Acceptance Criteria

- [ ] Unit tests for email template (XSS protection)
- [ ] Unit tests for rate limiting logic
- [ ] Integration tests for Magic Link API endpoints
- [ ] Tests verify rate limiting (3/hour email, 10/hour IP)
- [ ] Tests verify token expiry (1 hour)
- [ ] All tests passing in CI

## Work Log

### 2026-03-01 - Test Coverage Review

**By:** Claude Code

**Actions:**
- Analyzed existing test structure
- Identified missing test coverage
- Reviewed critical auth paths
- Documented 3 testing strategies

**Learnings:**
- Vitest is configured but no auth tests exist
- Effect-based code needs @effect/vitest
- Rate limiting requires Redis mocking

## Notes

- Authentication is a critical path - should have tests before production
- Better Auth might have test utilities we can leverage
- Consider adding to CI pipeline once tests are created
- Mock email sending in tests to avoid actual email delivery
