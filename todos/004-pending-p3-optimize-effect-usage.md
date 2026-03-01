---
status: pending
priority: p3
issue_id: "004"
tags: [refactor, effect, performance]
dependencies: []
---

# Optimize Effect.runSync Usage in Email Sender Factory

## Problem Statement

The email sender factory function in auth.ts uses `Effect.runSync` multiple times in sequence to parse environment variables. While functional, this pattern could be optimized by composing the Effects together and running them once, which would be more idiomatic Effect code and potentially more performant.

## Findings

**File:** `apps/api/src/routes/auth.ts:25-68`

```typescript
const createEmailSender = () => {
  // Try SendGrid first
  const sendgridApiKey = Effect.runSync(parseEnvOptional(process.env.SENDGRID_API_KEY, "string"));
  const sendgridFrom = Effect.runSync(parseEnvOptional(process.env.SENDGRID_FROM, "string"));

  if (sendgridApiKey && sendgridFrom) {
    return createSendGridEmailSender({
      apiKey: sendgridApiKey,
      from: sendgridFrom,
    });
  }

  // Try SMTP
  const smtpHost = Effect.runSync(parseEnvOptional(process.env.SMTP_HOST, "string"));
  const smtpPortStr = Effect.runSync(parseEnvOptional(process.env.SMTP_PORT, "string"));
  const smtpUser = Effect.runSync(parseEnvOptional(process.env.SMTP_USER, "string"));
  const smtpPass = Effect.runSync(parseEnvOptional(process.env.SMTP_PASS, "string"));
  const smtpFrom = Effect.runSync(parseEnvOptional(process.env.SMTP_FROM, "string"));

  if (smtpHost && smtpPortStr && smtpUser && smtpPass && smtpFrom) {
    return createSmtpEmailSender({
      host: smtpHost,
      port: Number.parseInt(smtpPortStr, 10),
      user: smtpUser,
      pass: smtpPass,
      from: smtpFrom,
    });
  }

  // Fall back to Mailpit...
  const mailpitHost = Effect.runSync(parseEnvOptional(process.env.MAILPIT_HOST, "string")) ?? "localhost";
  // ... more Effect.runSync calls
};
```

**Issues:**
- 9 separate `Effect.runSync` calls
- Each call runs the Effect interpreter separately
- Not taking advantage of Effect's composition capabilities
- Pattern repeated for each email provider check

## Proposed Solutions

### Option 1: Compose Effects with Effect.gen (Recommended)

**Approach:** Refactor to use Effect.gen to compose all env parsing into a single Effect.

```typescript
const createEmailSender = () => {
  return Effect.gen(function* () {
    // Try SendGrid
    const sendgridApiKey = yield* parseEnvOptional(process.env.SENDGRID_API_KEY, "string");
    const sendgridFrom = yield* parseEnvOptional(process.env.SENDGRID_FROM, "string");
    
    if (sendgridApiKey && sendgridFrom) {
      return createSendGridEmailSender({ apiKey: sendgridApiKey, from: sendgridFrom });
    }
    
    // Try SMTP...
    // etc.
  }).pipe(Effect.runSync);
};
```

**Pros:**
- Idiomatic Effect code
- Single Effect execution
- Better error handling
- Easier to test

**Cons:**
- Requires understanding of Effect.gen
- More code changes

**Effort:** 2-3 hours

**Risk:** Low

---

### Option 2: Create Config Object First

**Approach:** Parse all env vars at startup into a config object, then use the config object to create the sender.

```typescript
// At module level or in a config file
const emailConfig = {
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
    from: process.env.SENDGRID_FROM,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    // ...
  },
  // ...
};

const createEmailSender = () => {
  if (emailConfig.sendgrid.apiKey && emailConfig.sendgrid.from) {
    return createSendGridEmailSender(emailConfig.sendgrid);
  }
  // ...
};
```

**Pros:**
- Simple and straightforward
- No Effect complexity
- Env validation can happen separately

**Cons:**
- Less type-safe
- Loses Effect's error handling benefits
- Not following project patterns

**Effort:** 1-2 hours

**Risk:** Medium

---

### Option 3: Leave As Is

**Approach:** The current code works and the performance difference is negligible for this use case.

**Pros:**
- No work required
- Code is clear and readable
- Performance impact is minimal (only runs once at startup)

**Cons:**
- Not idiomatic Effect
- Technical debt

**Effort:** 0

**Risk:** Very Low

## Recommended Action

Given that this code only runs once at application startup and the performance impact is negligible, Option 3 (Leave As Is) is acceptable. However, if the team wants to follow Effect best practices consistently, implement Option 1 as a refactoring task during a future maintenance cycle.

## Technical Details

**Affected files:**
- `apps/api/src/routes/auth.ts:25-68` - createEmailSender function

**Related patterns:**
- This pattern appears in other files using parseEnvOptional

## Resources

- **Effect documentation:** Effect.gen and composition patterns

## Acceptance Criteria

- [ ] (If implementing) Single Effect.gen composition
- [ ] All env vars still correctly parsed
- [ ] No regressions in email sender creation
- [ ] Code review approved

## Work Log

### 2026-03-01 - Code Review Finding

**By:** Claude Code

**Actions:**
- Identified multiple Effect.runSync calls
- Analyzed Effect composition patterns
- Assessed performance impact (minimal)
- Documented 3 approaches

**Learnings:**
- Effect.runSync overhead is minimal for startup code
- Effect.gen provides better composition
- Current code is readable and functional

## Notes

- This is a code quality/refactoring issue, not a bug
- Performance impact is negligible (startup-only code)
- Can be deferred to a refactoring sprint
- Current implementation is clear and maintainable
