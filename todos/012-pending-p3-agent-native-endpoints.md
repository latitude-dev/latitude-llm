---
status: pending
priority: p3
issue_id: "012"
tags: [agent-native, api, observability]
dependencies: []
---

# NICE-TO-HAVE: Add Agent-Native Authentication Endpoints

## Problem Statement

The authentication system works for agents but lacks self-service capabilities. Agents cannot programmatically check their auth status, discover accessible organizations, or manage their own API keys. This creates friction for autonomous agent workflows.

## Findings

- **Agent-Native Score:** 33/60 (55%) - NEEDS WORK
- **Severity:** P3 - Usability improvement for agents

**Current Gaps:**

| Capability | Status | Impact |
|------------|--------|--------|
| Auth status endpoint | ❌ Missing | Agents can't self-diagnose |
| Organization discovery | ❌ Missing | Agents must know org IDs upfront |
| Machine-readable errors | ❌ Missing | Agents parse human strings |
| Rate limit visibility | ❌ Missing | No quota tracking |
| API key self-info | ❌ Missing | Can't query own key metadata |
| Bootstrap token flow | ❌ Missing | Need human for initial key |

**Current Error Format:**
```typescript
{ error: "Authentication required" }  // Human-readable only
```

**Needed for Agents:**
```typescript
{
  error: "Authentication required",
  code: "AUTH_INVALID_API_KEY",  // Machine-readable
  details: { header: "X-API-Key", reason: "Key revoked" }
}
```

## Proposed Solutions

### Option 1: Add Agent-Friendly Endpoints (Recommended)

**Approach:** Create new endpoints specifically for agent self-service.

```typescript
// 1. Auth status endpoint
GET /v1/auth/status
Response: {
  authenticated: true,
  userId: "api-key:abc123",
  organizationId: "org_xyz",
  method: "api-key",
  permissions: ["read:projects", "write:projects"],
  rateLimit: { 
    limit: 1000, 
    remaining: 987, 
    resetAt: "2026-03-02T12:00:00Z" 
  }
}

// 2. Organization discovery
GET /v1/auth/organizations
Response: {
  organizations: [
    { id: "org_xyz", name: "Acme Corp", role: "admin" }
  ]
}

// 3. Current key info
GET /v1/auth/self
Response: {
  keyId: "key_abc123",
  name: "Production Agent",
  createdAt: "2026-01-15T10:30:00Z",
  lastUsedAt: "2026-03-02T09:45:00Z",
  organizationId: "org_xyz"
}
```

**Pros:**
- Agents can self-diagnose
- Discovery without human help
- Better observability

**Cons:**
- More endpoints to maintain
- Need to secure these endpoints too

**Effort:** 4-6 hours

**Risk:** Low

---

### Option 2: Enhance Error Responses

**Approach:** Add machine-readable codes to existing error responses.

```typescript
// Update honoErrorHandler to include codes
{
  error: "Authentication required",  // Human message
  code: "AUTH_INVALID_API_KEY",       // Machine code
  requestId: "req_abc123",            // Support correlation
  timestamp: "2026-03-02T10:30:00Z"
}

// Error codes:
// AUTH_INVALID_API_KEY - Key doesn't exist or revoked
// AUTH_INVALID_JWT - JWT signature/expiration invalid
// AUTH_MISSING_ORG - Organization ID required
// AUTH_ORG_ACCESS_DENIED - Valid auth but no org membership
// AUTH_RATE_LIMITED - Too many requests
```

**Pros:**
- Minimal API changes
- Agents can handle errors programmatically
- Support can correlate issues

**Cons:**
- Still need discovery endpoints
- Codes must be maintained

**Effort:** 2-3 hours

**Risk:** Low

---

### Option 3: Add Rate Limit Headers

**Approach:** Include quota info in all API responses.

```typescript
// Add headers to all responses:
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1712345678

// Or include in body:
{ 
  data: {...},
  meta: {
    rateLimit: { limit: 1000, remaining: 987, resetAt: "..." }
  }
}
```

**Pros:**
- Agents can plan usage
- Standard pattern (GitHub, Stripe)
- Simple to implement

**Cons:**
- Only solves one problem
- Need other endpoints too

**Effort:** 2 hours

**Risk:** Low

## Recommended Action

**To be filled during triage.**

Recommended: Implement Option 1 and Option 2 combined. This provides the best agent experience.

## Technical Details

**Affected files:**
- `apps/api/src/routes/auth.ts` - Add new endpoints
- `apps/api/src/middleware/auth.ts` - Add rate limit headers
- `apps/api/src/middleware/error-handler.ts` - Add error codes

**Related components:**
- Rate limiter (for quota info)
- API key repository
- Organization repository
- Better Auth (for permissions)

**Database changes:**
- None

## Resources

- **Review finding:** Agent-Native Reviewer
- **Stripe API pattern:** https://stripe.com/docs/api/errors
- **GitHub API pattern:** https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting

## Acceptance Criteria

- [ ] `/v1/auth/status` endpoint implemented
- [ ] `/v1/auth/organizations` endpoint implemented
- [ ] `/v1/auth/self` endpoint implemented (API key info)
- [ ] Error codes added to all auth failures
- [ ] Rate limit headers on all responses
- [ ] Request ID tracking for support
- [ ] Documentation for agent developers
- [ ] Tests for new endpoints

## Work Log

### 2026-03-02 - Code Review Discovery

**By:** Agent-Native Reviewer / Claude Code

**Actions:**
- Assessed current agent capabilities
- Identified gaps in self-service
- Designed agent-friendly endpoints
- Reviewed industry patterns (Stripe, GitHub)

**Learnings:**
- Agents need machine-readable error codes
- Discovery endpoints reduce human friction
- Rate limit visibility helps agents plan
- Agent-native requires different design than human-UI

---

## Notes

- **Priority:** Nice-to-have for agent adoption
- These endpoints help both agents and human developers
- Follow REST conventions and industry patterns
- Document for external developers
- Consider SDK generation from endpoints
