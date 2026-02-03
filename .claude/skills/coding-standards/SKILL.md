---
name: coding-standards
description: Core coding principles and design aphorisms for writing maintainable code. Use when writing, reviewing, or refactoring code. Triggers on discussions about null handling, error handling, encapsulation, data structures, dependencies, state management, method signatures, or general code quality.
license: MIT
metadata:
  author: latitude
  version: "1.0.0"
---

# Coding Standards

Principles for writing maintainable, debuggable code that stands the test of time.

## When to Apply

Reference these guidelines when:
- Writing new code or reviewing pull requests
- Debugging issues caused by unclear data flow
- Designing APIs, method signatures, or data structures
- Refactoring code for maintainability
- Deciding how to handle errors and edge cases
- Managing state in applications

## Principles at a Glance

| Principle | Core Idea | Key Rule |
|-----------|-----------|----------|
| Nil Values | Null means absence, nothing else | Never give semantic meaning to null |
| Grep Test | Code must be findable | If you can't grep it, it's too clever |
| Data First | Structure determines code | Design data structures before algorithms |
| Stable Dependencies | Depend on what's stable | Depend on abstractions, not implementations |
| Loud Failures | Hidden bugs are worse | If it can fail, make it fail loudly |
| Tell, Don't Ask | Objects own their behavior | Don't query state to make external decisions |
| Avoid Dichotomies | Reality is nuanced | Reject false binary choices |
| Single Source of Truth | State lives in one place | Never derive state from state |
| Explicit Parameters | Clarity over cleverness | Avoid booleans and hashes as arguments |
| Task Parameters | Fresh data in async code | Pass IDs to tasks, not models |

## Quick Reference

### Null Handling

**Bad**: Using null to signal a semantic condition
```typescript
const role = ROLES[user.role] // Returns undefined if not found
processRole(role) // Explodes somewhere far away
```

**Good**: Validate at boundaries, use explicit types
```typescript
const role = ROLES[user.role]
if (!role) throw new Error(`Unknown role: ${user.role}`)
processRole(role)
```

### Findable Code

**Bad**: Dynamic method dispatch
```typescript
const method = `handle${eventType}`
this[method](data) // Good luck finding handleUserCreated
```

**Good**: Explicit mapping
```typescript
const handlers = {
  userCreated: this.handleUserCreated,
  userDeleted: this.handleUserDeleted,
}
handlers[eventType]?.(data)
```

### Dependency Direction

**Bad**: Concrete depends on concrete
```typescript
class PaymentService {
  private stripe = new StripeClient() // Locked to Stripe forever
}
```

**Good**: Depend on abstractions
```typescript
class PaymentService {
  constructor(private gateway: PaymentGateway) {} // Any gateway works
}
```

### Error Handling

**Bad**: Silent failures
```typescript
try {
  await saveUser(user)
} catch (e) {
  // Swallowed silently
}
```

**Good**: Fail loudly or handle explicitly
```typescript
const result = await saveUser(user)
if (result.error) {
  captureException(result.error)
  throw result.error
}
```

### Tell, Don't Ask

**Bad**: Query state, then act
```typescript
if (monitor.getValue() > monitor.getLimit()) {
  monitor.triggerAlarm()
}
```

**Good**: Let the object decide
```typescript
monitor.setValue(newValue) // Triggers alarm internally if needed
```

### State Management

**Bad**: Derived state
```typescript
const [items, setItems] = useState(props.items) // Copied from props
```

**Good**: Single source of truth
```typescript
const items = props.items // Always read from source
```

### Method Signatures

**Bad**: Boolean parameter
```typescript
viewController.present(other, true) // What does true mean?
```

**Good**: Explicit methods
```typescript
viewController.animatePresentation(other)
viewController.immediatelyPresent(other)
```

### Async Tasks

**Bad**: Passing models to queues
```typescript
queue.add('processUser', { user }) // Stale by execution time
```

**Good**: Pass identifiers
```typescript
queue.add('processUser', { userId: user.id }) // Fetch fresh data in job
```

## Detailed Guide

Read the `GUIDE.md` file for comprehensive explanations, rationale, and additional examples for each principle.
