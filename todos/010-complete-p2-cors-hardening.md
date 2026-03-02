---
status: complete
priority: p2
issue_id: "010"
tags: [security, cors, configuration]
dependencies: []
---

# IMPORTANT: Harden CORS Configuration

## Problem Statement

The CORS configuration allows credentials with broad method support and dynamic origin validation. This could lead to credential leakage if the origin configuration is compromised or misconfigured.

## Findings

- **Location:** `apps/api/src/server.ts` lines 26-33
- **Vulnerability Type:** Security Misconfiguration (A05: OWASP Top 10)
- **Severity:** P2 - Potential credential exposure

**Current Configuration:**
```typescript
app.use(
  cors({
    origin: webUrl, // Dynamic from env
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"], // All methods
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true, // Credentials allowed
  }),
)
```

**Issues:**
1. **Dynamic Origin from Environment** - If `WEB_URL` is misconfigured, credentials exposed to wrong origins
2. **Broad Method Support** - All HTTP methods allowed globally
3. **Legacy Header** - `X-Requested-With` is legacy, provides no security value
4. **No Origin Whitelist** - Only checks against single env var
5. **No Preflight Caching** - OPTIONS requests on every call

**Exploit Scenario:**
```javascript
// If WEB_URL is misconfigured or compromised:
const maliciousOrigin = 'https://attacker.com'
// Credentials could be sent to attacker domain
fetch('https://api.example.com/v1/data', {
  credentials: 'include',
  headers: { 'Authorization': 'Bearer ...' }
})
```

## Proposed Solutions

### Option 1: Strict Origin Whitelist (Recommended)

**Approach:** Explicitly whitelist allowed origins with validation.

```typescript
const allowedOrigins = [
  'https://app.latitude.com',
  'https://admin.latitude.com',
  'http://localhost:3000', // Development only
].filter(Boolean)

app.use(
  cors({
    origin: (origin, c) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return '*'
      
      // Strict whitelist check
      if (allowedOrigins.includes(origin)) {
        return origin
      }
      
      // Log suspicious origin attempts
      logger.warn({ origin, path: c.req.path }, 'CORS rejected origin')
      return null // Reject
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE"], // Remove OPTIONS, PATCH if not needed
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
    maxAge: 86400, // Cache preflight for 24 hours
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
  }),
)
```

**Pros:**
- Strict origin validation
- Audit logging for rejected origins
- Reduced preflight requests (caching)
- Clear allowlist

**Cons:**
- Need to update whitelist for new domains
- More configuration

**Effort:** 1-2 hours

**Risk:** Low

---

### Option 2: Environment-Based with Validation

**Approach:** Keep env-based but add validation and regex.

```typescript
const validateOrigin = (origin: string): boolean => {
  // Only allow HTTPS in production
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) {
    return false
  }
  
  // Validate against pattern
  const allowedPattern = new RegExp(
    `^https?://([a-z0-9-]+\.)?${process.env.ALLOWED_DOMAIN}$`
  )
  return allowedPattern.test(origin)
}
```

**Pros:**
- Flexible for subdomains
- Pattern-based validation

**Cons:**
- Regex can be error-prone
- Still relies on env vars

**Effort:** 1 hour

**Risk:** Medium

---

### Option 3: Remove CORS for API-Only Access

**Approach:** If API is only accessed programmatically (not browser), remove CORS entirely.

```typescript
// Only add CORS for web app
if (process.env.WEB_URL) {
  app.use(cors({ ... }))
}
```

**Pros:**
- Most secure (no CORS = no credential leakage)
- Simpler

**Cons:**
- Only works if no browser access needed
- Breaks web frontend

**Effort:** 30 minutes

**Risk:** Low (but breaks browser clients)

## Recommended Action

**To be filled during triage.**

Recommended: Implement Option 1 (strict whitelist) for production security. Use different configs for dev/staging.

## Technical Details

**Affected files:**
- `apps/api/src/server.ts:26-33` - CORS configuration
- Environment configuration files

**Related components:**
- Web frontend (apps/web)
- CORS preflight handling
- Security headers

**Database changes:**
- None

## Resources

- **Review finding:** Security Sentinel - A05: Security Misconfiguration
- **OWASP A05:** https://owasp.org/Top10/A05_2021-Security_Misconfiguration/
- **CORS best practices:** https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS

## Acceptance Criteria

- [x] Explicit origin whitelist configured
- [x] Invalid origins rejected and logged
- [x] Credentials only sent to allowed origins
- [x] Preflight cached (maxAge set)
- [x] Security headers reviewed
- [x] Different configs for dev/staging/prod (dev allows localhost)
- [ ] Documentation updated (deferred - whitelist is self-documenting in code)

## Work Log

### 2026-03-02 - Implementation Complete

**By:** Claude Code

**Actions:**
- Implemented strict origin whitelist in `apps/api/src/server.ts`
- Defined explicit allowed origins: `https://app.latitude.com`, `https://admin.latitude.com`, and `http://localhost:3000` (dev only)
- Added origin validation function with proper rejection logging
- Removed unnecessary HTTP methods (OPTIONS, PATCH)
- Removed legacy `X-Requested-With` header
- Added `X-API-Key` to allowed headers
- Added `maxAge: 86400` for 24-hour preflight caching
- Added `exposeHeaders` for rate limiting headers
- Removed unused `parseEnvOptional` import

**Security Improvements:**
- Credentials now only sent to explicitly whitelisted origins
- Invalid origins are rejected and logged for security monitoring
- Preflight requests cached for 24 hours (reduces OPTIONS calls)
- Clear audit trail for suspicious origin attempts

### 2026-03-02 - Code Review Discovery

**By:** Security Sentinel / Claude Code

**Actions:**
- Reviewed CORS configuration
- Identified overly permissive settings
- Designed strict whitelist approach
- Analyzed credential leakage risks

**Learnings:**
- Dynamic origin from env is risky if env is misconfigured
- Strict whitelists are safer but require maintenance
- Preflight caching improves performance
- CORS misconfiguration is common security issue

---

## Notes

- **Priority:** Important for production security
- Consider using helmet.js for additional security headers
- Test CORS configuration with various scenarios
- Document the origin whitelist for ops team
- Monitor logs for rejected origin attempts (attack indicator)
