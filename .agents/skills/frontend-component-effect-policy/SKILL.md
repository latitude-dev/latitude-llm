# Frontend Component `useEffect` Policy

Use this skill when creating or refactoring React components in this repository.

## Core Rule

- Do not call `useEffect` directly in components.
- Use `useMountEffect` for mount/unmount-only synchronization with external systems.
- If a direct `useEffect` is truly unavoidable, leave a `TODO(frontend-use-effect-policy)` comment explaining why.

## Allowed Patterns

### 1) Derive values during render

- Compute values from props/state inline.
- Do not mirror props into state unless the state is truly user-editable local draft state.

### 2) Use event handlers for actions

- Perform mutations, network calls, and side effects directly in click/submit/input handlers.
- Avoid action relays like `setFlag(true) -> effect runs -> reset flag`.

### 3) Use controlled/uncontrolled component patterns

- For reusable UI components, decide controlled vs uncontrolled via prop presence (`value !== undefined`).
- Avoid syncing local state from props with effects.

### 4) Use mount-only effects through `useMountEffect`

- Good for:
  - DOM subscriptions (`addEventListener` / cleanup)
  - Third-party imperative widget lifecycle
  - One-time setup/cleanup on mount/unmount

```ts
import { useMountEffect } from "@repo/ui"

useMountEffect(() => {
  const cleanup = subscribeToExternalSystem()
  return () => cleanup()
})
```

### 5) Reset with `key` when entity changes

- If component state must fully reset when an id changes, key the child by that id.
- Prefer remount semantics over effect-driven reset choreography.

## Disallowed Patterns

- `useEffect(() => setDerivedX(deriveFromY(y)), [y])`
- `useEffect(() => { fetch(...).then(setState) }, [...])` in components
- `useEffect` used to mirror prop changes into local state
- `useEffect` used as command dispatcher for user actions

## Implementation Checklist

- [ ] No direct `useEffect` call added.
- [ ] Derived state computed during render where possible.
- [ ] User-triggered work handled in event handlers.
- [ ] Mount-only sync uses `useMountEffect`.
- [ ] Key-based remount considered for reset-on-id behavior.
