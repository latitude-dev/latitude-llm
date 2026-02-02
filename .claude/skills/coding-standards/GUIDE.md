# Coding Standards Guide

This codebase will outlive you. Every shortcut becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

---

## 1. Null is the Absence of Value

> Never give semantic meaning to null. It will make your code worse in unexpected places.

The problem with `null` (or `undefined`, `nil`) is that it's impossible to enforce as a contract. A null value will produce an exception far from where it originated, making bugs difficult to trace and fix.

If you need to communicate something other than "this value doesn't exist," use a different mechanism: an enum, a Result type, or an explicit error.

### The Problem

```typescript
// users.ts
const ROLES = { admin: 'admin', manager: 'manager' }
const role = ROLES[user.role] // Returns undefined for unknown roles
displayRole(role)

// roleDisplay.ts
function displayRole(role: string | undefined) {
  if (role === 'admin') return 'Administrator'
  return formatManagerRole(role)
}

// roleFormatter.ts
function formatManagerRole(role: string) {
  return `${role.toUpperCase()} - Team Lead` // TypeError: Cannot read property 'toUpperCase' of undefined
}
```

The error appears in `roleFormatter.ts`, but the bug is in `users.ts`. This separation makes debugging painful.

### The Solution

Validate at the boundary. Fail fast with clear errors.

```typescript
// users.ts
const ROLES = { admin: 'admin', manager: 'manager' } as const
type Role = typeof ROLES[keyof typeof ROLES]

function getRole(roleKey: string): Role {
  const role = ROLES[roleKey as keyof typeof ROLES]
  if (!role) {
    throw new Error(`Unknown role: ${roleKey}. Valid roles: ${Object.keys(ROLES).join(', ')}`)
  }
  return role
}

const role = getRole(user.role) // Fails here with clear message
displayRole(role)
```

### Guidelines

- Validate inputs at system boundaries (API handlers, form submissions, external data)
- Use discriminated unions or Result types for operations that can fail
- When a function can legitimately return nothing, make that explicit in the type signature and handle it immediately
- Never pass null through multiple function calls hoping someone else will handle it

---

## 2. The Grep Test

> If you can't find it with grep, it's a bad design.

If you can't find your code statically, you're writing code that's too clever. Code must be easy to find, replace, and delete. Dependencies between components should be explicit.

Always ask: "If I need to delete this code, how will I find all the places that reference it?" If you don't have a clear answer, think about the next developer—or yourself in a year.

### The Problem

```typescript
// Dynamic method dispatch - ungrepable
const eventType = 'UserCreated'
const handler = `handle${eventType}`
this[handler](event) // How do you find handleUserCreated?

// Dynamic imports with computed paths
const component = await import(`./components/${name}`)

// String concatenation for identifiers
const action = `${namespace}_${operation}` // What actions exist?
```

### The Solution

```typescript
// Explicit handler mapping
const eventHandlers = {
  UserCreated: this.handleUserCreated.bind(this),
  UserDeleted: this.handleUserDeleted.bind(this),
  UserUpdated: this.handleUserUpdated.bind(this),
} as const

const handler = eventHandlers[eventType]
if (!handler) throw new Error(`No handler for event: ${eventType}`)
handler(event)

// Explicit imports
import { UserCard } from './components/UserCard'
import { UserList } from './components/UserList'

const components = { UserCard, UserList }

// Explicit action constants
const ACTIONS = {
  USER_FETCH: 'user/fetch',
  USER_UPDATE: 'user/update',
} as const
```

### Guidelines

- Avoid metaprogramming that generates method names dynamically
- Use explicit mappings instead of computed property access
- Keep imports static when possible
- Name things so they can be found with simple text search
- If you must use dynamic behavior, document the pattern and where to find all cases

---

## 3. Data Structures First

> Bad programmers worry about the code. Good programmers worry about data structures and their relationships. — Linus Torvalds

The shape of your data determines the shape of your code. Poor data modeling leads to complex, brittle code. Good data modeling makes the code almost write itself.

Invest time in designing your database schema, API contracts, and internal data structures before writing business logic.

### The Principle

```
Data structure quality → Code complexity
Good data structures  → Simple, obvious code
Bad data structures   → Complex, defensive code
```

### Examples

**Bad**: Implicit relationships and denormalized data

```typescript
type User = {
  id: string
  name: string
  teamName: string      // Duplicated across all team members
  teamManagerId: string // Duplicated across all team members
  permissions: string[] // What do these strings mean?
}
```

**Good**: Normalized, explicit relationships

```typescript
type User = {
  id: string
  name: string
  teamId: string
  roleId: string
}

type Team = {
  id: string
  name: string
  managerId: string
}

type Role = {
  id: string
  name: string
  permissions: Permission[]
}

type Permission = 'read' | 'write' | 'delete' | 'admin'
```

### Guidelines

- Design your data model before writing code
- Normalize data to eliminate duplication
- Make relationships explicit through IDs and foreign keys
- Use types to constrain valid values
- When code is complex, ask if the data structure is the problem

---

## 4. Depend on Stable Things

> Depend on things that change less often than you do. — Sandi Metz

Every dependency is a liability. When your dependency changes, you must change too. The art of good architecture is depending on things that are stable.

### The Dependency Matrix

```
                    Changes Frequently    Changes Rarely
Many Dependents     DANGER ZONE (D)       Stable Core (A)
Few Dependents      Acceptable (C)        Ideal (B)
```

Zone A is where your abstractions should live. Zone D is where projects go to die.

### What Changes Less Often?

- Interfaces change less than implementations
- Core domain concepts change less than UI details
- Standard library APIs change less than third-party libraries
- Configuration changes less than code (when designed well)

### The Problem

```typescript
// Direct dependency on implementation details
class ReportGenerator {
  private stripe = new StripeClient(process.env.STRIPE_KEY)

  async generateRevenueReport() {
    const charges = await this.stripe.charges.list({ limit: 100 })
    // Tightly coupled to Stripe's API shape
    return charges.data.map(c => ({
      amount: c.amount / 100,
      currency: c.currency,
      date: new Date(c.created * 1000),
    }))
  }
}
```

### The Solution

```typescript
// Depend on abstraction
interface PaymentGateway {
  getTransactions(limit: number): Promise<Transaction[]>
}

interface Transaction {
  amount: number
  currency: string
  date: Date
}

class ReportGenerator {
  constructor(private payments: PaymentGateway) {}

  async generateRevenueReport() {
    const transactions = await this.payments.getTransactions(100)
    return transactions // Already in our format
  }
}

// Implementation details isolated
class StripeGateway implements PaymentGateway {
  constructor(private client: StripeClient) {}

  async getTransactions(limit: number): Promise<Transaction[]> {
    const charges = await this.client.charges.list({ limit })
    return charges.data.map(c => ({
      amount: c.amount / 100,
      currency: c.currency,
      date: new Date(c.created * 1000),
    }))
  }
}
```

### Corollaries

**Depend on APIs, not data structures**: Direct access to nested data creates tight coupling.

```typescript
// Bad: Deep coupling to structure
const userName = response.data.users[0].profile.name

// Good: API that hides structure
const userName = userService.getPrimaryUserName(response)
```

**Avoid hashes/objects as input**: They're opaque, hard to type, and hide dependencies.

```typescript
// Bad
processUser({ user, options: { sendEmail: true, format: 'pdf' } })

// Good
processUser(user, { sendEmail: true, format: 'pdf' })
// Or even better:
processUserWithEmailNotification(user, format: 'pdf')
```

**Use named parameters**: Remove order dependencies in function signatures.

```typescript
// Bad: Order-dependent
createUser('John', 'john@example.com', true, false, 'admin')

// Good: Named parameters
createUser({
  name: 'John',
  email: 'john@example.com',
  isActive: true,
  requiresVerification: false,
  role: 'admin',
})
```

---

## 5. Fail Loudly

> If something can fail, it should do so loudly.

Hidden failures are worse than crashes. A crash tells you something is wrong. A silent failure lets bugs compound until the system is in an inconsistent state.

### The Problem

```typescript
// Silent failure - typo creates undefined
class Config {
  @foreignKey: string

  hasForeignKey(): boolean {
    return this.foreingnKey !== undefined // Typo! Always returns false
  }
}

// Swallowed exception
try {
  await criticalOperation()
} catch (e) {
  console.log('Something went wrong') // What went wrong? Where? Why?
}

// Ignored return value
saveToDatabase(user) // Did it work? Who knows!
```

### The Solution

```typescript
// Use accessors to catch typos
class Config {
  private _foreignKey: string

  get foreignKey(): string {
    return this._foreignKey
  }

  hasForeignKey(): boolean {
    return this.foreignKey !== undefined // Typo would be a compile error
  }
}

// Handle or propagate, never swallow
try {
  await criticalOperation()
} catch (error) {
  captureException(error) // Log with full context
  throw error // Or handle meaningfully
}

// Use Result types for fallible operations
const result = await saveToDatabase(user)
if (result.error) {
  captureException(result.error)
  return Result.error(result.error)
}
```

### Guidelines

- Use TypeScript strict mode to catch undefined access
- Never use empty catch blocks
- Use Result types for operations that can fail in expected ways
- Use exceptions for unexpected failures
- Log errors with full context (stack traces, relevant data)
- Monitor and alert on error rates

---

## 6. Tell, Don't Ask

> Tell objects what to do. Don't ask for their state and make decisions for them.

Object-orientation bundles data with the functions that operate on that data. When you query an object's internal state to make decisions externally, you've broken encapsulation.

### The Problem

```typescript
// Asking and deciding externally
class Monitor {
  value: number
  limit: number

  getValue() { return this.value }
  getLimit() { return this.limit }
}

// External code makes the decision
if (monitor.getValue() > monitor.getLimit()) {
  alarm.trigger()
}
```

The logic for "when to alarm" is scattered. The Monitor doesn't own its behavior.

### The Solution

```typescript
// Tell the monitor what happened, let it decide
class Monitor {
  private value: number
  private limit: number
  private alarm: Alarm

  setValue(newValue: number) {
    this.value = newValue
    if (this.value > this.limit) {
      this.alarm.trigger()
    }
  }
}

// External code just tells
monitor.setValue(newValue)
```

### Recognizing "Ask" Patterns

- Multiple getters called before taking an action
- If statements that check object state externally
- External code that knows about object internals

### Guidelines

- If you're calling multiple getters before doing something, consider moving that logic into the object
- Objects should expose behavior, not just data
- Ask "who should own this decision?" and put the code there

---

## 7. Reject False Dichotomies

> Dichotomies are the easiest—but rarely the correct—way to solve a problem.

When faced with a problem, the easiest mental shortcut is to find two opposing sides. "Should we use microservices or a monolith?" "Should we optimize for speed or correctness?"

Reality is more nuanced. The optimal solution often lies between the extremes or requires reframing the question entirely.

### Examples of False Dichotomies

- "Fast vs. correct" — You can often have both with better algorithms
- "Monolith vs. microservices" — Consider modular monoliths
- "SQL vs. NoSQL" — Use both where appropriate
- "DRY vs. readable" — Premature abstraction harms both
- "Move fast vs. maintain quality" — Technical debt slows you down

### Guidelines

- When presented with two options, ask "what else?"
- Challenge binary framing: "Why can't we have both?"
- Look for the underlying tension and address it directly
- Consider that both options might be wrong

---

## 8. Single Source of Truth

> Derived state is an anti-pattern. Never copy state from its source.

When you copy state, you create a synchronization problem. Now you must keep the copy in sync with the original. You will fail. Bugs will ensue.

### The Problem

```typescript
// Derived state in React
function UserProfile({ user }: { user: User }) {
  // WRONG: Copying props to state
  const [name, setName] = useState(user.name)

  // Now you need useEffect to sync... and it's already broken
  useEffect(() => {
    setName(user.name)
  }, [user.name])

  return <input value={name} onChange={e => setName(e.target.value)} />
}
```

### The Solution

```typescript
// Single source of truth
function UserProfile({ user, onNameChange }: Props) {
  return (
    <input
      value={user.name}
      onChange={e => onNameChange(e.target.value)}
    />
  )
}

// Or for local edits before save:
function UserProfile({ user, onSave }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const displayName = draft ?? user.name

  return (
    <>
      <input
        value={displayName}
        onChange={e => setDraft(e.target.value)}
      />
      <button onClick={() => { onSave(displayName); setDraft(null) }}>
        Save
      </button>
    </>
  )
}
```

### Guidelines

- Derive values at render time, don't cache them in state
- If you need local edits, make it explicit (draft state)
- Use selectors/computed values instead of derived state
- When you feel the urge to sync state, you have a design problem

---

## 9. Boolean Arguments Are a Code Smell

> Boolean parameters leak implementation details and increase complexity.

A boolean parameter means the function does two different things. Callers must know implementation details to understand what `true` means. Future readers must look up the signature.

### The Problem

```typescript
// What does true mean here?
dialog.show(content, true)
user.save(true)
report.generate(false, true)
```

### The Solution

```typescript
// Explicit methods
dialog.showModal(content)
dialog.showInline(content)

user.saveWithValidation()
user.saveWithoutValidation()

report.generatePDF()
report.generateCSV()

// Or use options objects for complex cases
report.generate({ format: 'pdf', includeCharts: true })
```

### When Booleans Might Be Acceptable

- Well-named boolean options in an options object: `{ verbose: true }`
- Toggle functions where the boolean is the point: `setEnabled(true)`
- Internal implementation details not exposed to callers

### Guidelines

- If you're adding a boolean parameter, consider two methods instead
- If the boolean controls behavior, the function is doing two things
- Use enums or string literals for multiple modes
- Options objects are better than positional booleans

---

## 10. Pass IDs to Async Tasks, Not Models

> Tasks are asynchronous. The model you pass might be stale by execution time.

When you enqueue a background job with a full model object, you're taking a snapshot. By the time the job runs, the database may have different data. The job will operate on stale information.

### The Problem

```typescript
// Dangerous: passing full model
await queue.add('sendWelcomeEmail', {
  user: user  // Snapshot at enqueue time
})

// Job runs minutes later
async function sendWelcomeEmail({ user }: { user: User }) {
  await sendEmail(user.email, welcomeTemplate(user.name))
  // User might have changed email or name since enqueue!
}
```

### The Solution

```typescript
// Safe: pass identifiers
await queue.add('sendWelcomeEmail', {
  userId: user.id
})

// Job fetches fresh data
async function sendWelcomeEmail({ userId }: { userId: string }) {
  const user = await userRepository.find(userId)
  if (!user) {
    // Handle deleted user
    return
  }
  await sendEmail(user.email, welcomeTemplate(user.name))
}
```

### When Snapshots Are Appropriate

For event notifications where you want the point-in-time state:

```typescript
// Events capture the moment
await publishEvent('documentCreated', {
  document: document,     // Snapshot is intentional
  createdAt: new Date(),
})
```

### Guidelines

- Background jobs should fetch fresh data using IDs
- Events can include snapshots when point-in-time data is needed
- Consider what happens if the entity is modified or deleted before the job runs
- Include version/timestamp if you need optimistic concurrency control
