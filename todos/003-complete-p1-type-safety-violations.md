---
status: complete
priority: p1
issue_id: "003"
tags: [typescript, type-safety, hono]
dependencies: []
---

# CRITICAL: Unsafe Type Assertions Bypassing Type Safety

## Problem Statement

The authentication middleware uses dangerous `as unknown as` type casting to bypass TypeScript's type system. This completely disables type safety for the Hono context, allowing runtime crashes that TypeScript should prevent at compile time. The `getAuthContext` helper claims to always return `AuthContext` but can return `undefined` at runtime.

## Findings

- **Location:** `apps/api/src/middleware/auth.ts` lines 146, 162
- **Type:** Type Safety Violation / Runtime Crash Risk
- **Severity:** CRITICAL - Type system bypassed, runtime crashes possible

**Current Code (Unsafe):**
```typescript
// Line 146: Dangerous double type cast
;(c as unknown as Context<{ Variables: HonoVariables }>).set("auth", authContext)

// Line 162: Same unsafe pattern
export const getAuthContext = (c: Context): AuthContext => {
  return (c as unknown as Context<{ Variables: HonoVariables }>).get("auth")
  // ❌ Claims to return AuthContext, but can return undefined!
}
```

**Problems:**
1. `as unknown as` completely bypasses TypeScript's type checking
2. No compile-time verification that `auth` variable is actually set
3. `getAuthContext` return type is a lie - it can return `undefined`
4. Calling `getAuthContext` on unauthenticated routes causes runtime crashes
5. False sense of security from type annotations

**Runtime Crash Scenario:**
```typescript
// Route without auth middleware applied:
app.get('/public', (c) => {
  const auth = getAuthContext(c)  // Returns undefined!
  return c.json({ userId: auth.userId })  // 💥 CRASH: Cannot read property of undefined
})
```

## Resolution

### Changes Made

**1. Added Hono Module Augmentation (`apps/api/src/types.ts`)**

```typescript
declare module "hono" {
  interface ContextVariableMap {
    auth?: AuthContext
  }
}
```

This enables type-safe context access without casting.

**2. Removed Type Casts (`apps/api/src/middleware/auth.ts:156`)**

```typescript
// Before (unsafe):
;(c as unknown as Context<{ Variables: HonoVariables }>).set("auth", authContext)

// After (type-safe):
c.set("auth", authContext)
```

**3. Made `getAuthContext` Runtime-Safe (`apps/api/src/middleware/auth.ts:172-183`)**

```typescript
export const getAuthContext = (c: Context): AuthContext => {
  const auth = c.get("auth")
  if (!auth) {
    throw new UnauthorizedError({
      message: "Auth context not found - ensure auth middleware is applied to this route",
    })
  }
  return auth
}
```

The helper now:
- Returns `AuthContext` (non-optional) for type safety
- Throws `UnauthorizedError` at runtime if auth is missing
- Provides a clear error message indicating the middleware wasn't applied

**4. Removed Unused Import**

Removed `HonoVariables` import from `auth.ts` as it's no longer needed.

## Acceptance Criteria

- [x] Module augmentation added to types.ts
- [x] All `as unknown as` casts removed
- [x] `getAuthContext` has proper return type (AuthContext) with runtime validation
- [x] Route handlers work without changes (helper still returns AuthContext)
- [x] TypeScript compiles without errors
- [x] No runtime type casting in auth middleware
- [x] New route handlers get compile-time type safety

## Work Log

### 2026-03-02 - Code Review Discovery

**By:** Kieran TypeScript Reviewer / Claude Code

**Actions:**
- Identified `as unknown as` type casting anti-pattern
- Analyzed Hono's context variable type system
- Reviewed proper TypeScript module augmentation approach
- Documented runtime crash risks

**Learnings:**
- Hono supports module augmentation for type-safe context
- `as unknown as` is a TypeScript escape hatch that disables safety
- Proper typing requires both compile-time and runtime checks
- Type safety is critical for maintainability and reliability

### 2026-03-02 - Resolution

**By:** Claude Code

**Actions:**
- Added Hono module augmentation to `apps/api/src/types.ts`
- Removed `as unknown as` casts from `apps/api/src/middleware/auth.ts`
- Updated `getAuthContext` to throw `UnauthorizedError` when auth context is missing
- Removed unused `HonoVariables` import
- Verified TypeScript compiles without errors

**Files Modified:**
- `apps/api/src/types.ts` - Added module augmentation
- `apps/api/src/middleware/auth.ts` - Removed casts, added runtime validation

---

## Notes

- **RESOLVED:** Type safety violations fixed
- Module augmentation is the idiomatic Hono approach for type-safe context
- Runtime validation provides defense-in-depth for middleware misconfiguration
- Consider adding a lint rule to ban `as unknown as` casting
