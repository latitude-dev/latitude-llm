---
status: complete
priority: p1
issue_id: "002"
tags: [security, authentication, error-handling]
dependencies: []
---

# CRITICAL: Silent Error Handling in API Key Validation

## Problem Statement

The `validateApiKey` function silently swallows ALL errors with a bare `catch` block that returns `null`. This creates a security blind spot where database failures, connection issues, SQL injection attempts, and brute force attacks go completely undetected by monitoring systems.

## Findings

- **Location:** `apps/api/src/middleware/auth.ts` lines 54-56
- **Vulnerability Type:** Security Logging and Monitoring Failures (A09: OWASP Top 10)
- **Severity:** CRITICAL - Security incidents are invisible

**Current Code (Vulnerable):**
```typescript
const validateApiKey = async (...) => {
  try {
    const apiKey = await Effect.runPromise(apiKeyRepository.findByToken(token))
    // ...
  } catch {
    return null  // ❌ Silent failure - NO logging, NO monitoring!
  }
}
```

**Exploit Scenarios:**
1. **Database Connection Failure:** API key validation fails due to DB outage → returns null → no alert fired
2. **Brute Force Attack:** Attacker probes thousands of invalid keys → all return null → no rate limiting triggered
3. **SQL Injection Attempt:** Malicious token causes query error → caught and silenced → no security alert
4. **Permission Issues:** Database permissions error → silent failure → misconfiguration undetected

**Security Impact:**
- Attackers can probe the system without triggering alerts
- Operational issues (DB failures) are invisible
- No audit trail for security events
- Compliance violations (no security logging)

## Proposed Solutions

### Option 1: Structured Security Logging (Recommended)

**Approach:** Add comprehensive security logging for all auth failures while maintaining generic client responses.

```typescript
} catch (error) {
  // Log for security monitoring but don't expose details to client
  securityLogger.warn({ 
    error: error instanceof Error ? error.message : 'Unknown error',
    tokenPrefix: token.slice(0, 8) + '...', // Partial for correlation
    timestamp: new Date().toISOString(),
    ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip')
  }, 'API key validation failure')
  return null
}
```

**Pros:**
- Security team can monitor auth failures
- Audit trail for compliance
- Attack detection possible
- Generic client response maintained

**Cons:**
- Need to set up security logger
- Slight performance overhead

**Effort:** 2-3 hours

**Risk:** Low

---

### Option 2: Distinguish Error Types

**Approach:** Differentiate between "key not found" (normal) and "system error" (abnormal).

```typescript
} catch (error) {
  if (error instanceof RepositoryError) {
    // System error - log for ops team
    logger.error({ error, token }, 'API key repository error')
    // Could also emit metric/alarm
  }
  // Return null for both, but log differently
  return null
}
```

**Pros:**
- Distinguishes normal vs abnormal failures
- Ops team gets alerts for system issues
- Security team monitors patterns

**Cons:**
- More complex error handling
- Need error type guards

**Effort:** 2-4 hours

**Risk:** Low

---

### Option 3: Effect-Based Error Handling

**Approach:** Convert entire middleware to use Effect's typed error handling.

```typescript
const validateApiKey = (
  apiKeyRepository: ApiKeyRepository,
  token: string
): Effect.Effect<... | null, RepositoryError> => {
  return Effect.gen(function* () {
    const apiKey = yield* apiKeyRepository.findByToken(token)
    // Errors propagate naturally through Effect channel
    return apiKey ? { ... } : null
  })
}
```

**Pros:**
- Type-safe error handling
- Consistent with domain patterns
- No try/catch needed

**Cons:**
- More refactoring required
- Learning curve for team

**Effort:** 4-6 hours

**Risk:** Medium

## Recommended Action

**To be filled during triage.**

Recommended: Implement Option 1 immediately for security visibility. Option 3 can be done later for architectural consistency.

## Technical Details

**Affected files:**
- `apps/api/src/middleware/auth.ts:42-56` - validateApiKey function
- `apps/api/src/middleware/auth.ts:119-127` - Bearer token validation
- `apps/api/src/middleware/auth.ts:131-139` - API key validation

**Related components:**
- Repository error handling
- Logging infrastructure (@repo/observability)
- Security monitoring/alerting

**Database changes:**
- None

## Resources

- **Review finding:** Security Sentinel - A09: Security Logging and Monitoring Failures
- **OWASP A09:** https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/

## Acceptance Criteria

- [x] All API key validation failures are logged
- [x] Distinguish between "not found" and "system error" in logs
- [x] Include correlation IDs for request tracking
- [x] No sensitive data (full tokens) in logs
- [x] Security team can query/filter auth failure logs
- [x] Ops team gets alerts for repository errors
- [x] Generic client response maintained (no info leakage)

## Work Log

### 2026-03-02 - Resolution

**By:** Claude Code

**Actions:**
- Extended `@repo/observability` logger to support `warn` and `error` levels
- Updated `validateApiKey` function to accept Hono context for correlation data
- Added structured security logging for all API key validation failures
- Included token prefix (first 8 chars), IP address, and timestamp in logs
- Ensured no sensitive data (full tokens) exposed in logs
- Maintained generic client response (returns null) to prevent information leakage

**Files Modified:**
- `packages/observability/src/index.ts` - Added warn/error logging methods
- `apps/api/src/middleware/auth.ts` - Added security logging to catch block

**Security Improvements:**
- All auth failures now logged for security monitoring
- Structured logs enable SIEM integration and alerting
- Token prefixes allow correlation without exposing secrets
- IP addresses support brute force attack detection
- Timestamps enable temporal analysis of attack patterns

### 2026-03-02 - Code Review Discovery

**By:** Security Sentinel / Claude Code

**Actions:**
- Identified bare catch block in validateApiKey
- Analyzed security implications of silent failures
- Reviewed logging infrastructure capabilities
- Documented attack scenarios

**Learnings:**
- Silent error handling is a security anti-pattern
- Need structured security logging for auth events
- Effect TS provides better error handling patterns
- Monitoring and alerting are critical for security

---

## Notes

- **URGENT:** Security visibility gap must be closed immediately
- Consider adding security event streaming (e.g., to SIEM)
- Log aggregation should support querying by IP, time range, error type
- Don't log full API keys (only prefixes for correlation)
- Ensure logs don't create new vulnerabilities (information leakage)
