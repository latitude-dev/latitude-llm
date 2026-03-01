---
status: pending
priority: p3
issue_id: 006
tags: [performance, memoization, components, code-review]
dependencies: []
---

# Add Memoization to Pure Components (Performance Optimization)

## Problem Statement

Several components are pure presentational components but lack React.memo, causing unnecessary re-renders when parent updates but props haven't changed.

## Findings

### Components Missing Memoization

| Component | Usage Pattern | Re-render Risk |
|-----------|----------------|----------------|
| **Button** | Used frequently in lists/forms | High |
| **Card** & sub-components | Used extensively in lists | High |
| **Input** | Re-renders on every keystroke in parent | High |
| **FormField** | Cascades to all form inputs | Medium |
| **Icon** | SVG re-creation on every render | Medium |

### Current Code Example
```typescript
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    // ... render logic
  },
);
```

## Proposed Solutions

### Option 1: Add React.memo to All Pure Components (Recommended)
**Effort:** Small
**Risk:** Very Low

Wrap all pure components with `memo()`:

```typescript
import { memo } from "react";

const Button = memo(forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    // ... existing logic
  },
));
Button.displayName = "Button";
```

**Components to Update:**
1. Button
2. Card (and CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
3. Input
4. FormField
5. Icon

### Option 2: Use React DevTools Profiler First
**Effort:** Small
**Risk:** None

Measure actual re-render impact before adding memoization everywhere.

**Benefits:**
- Data-driven optimization
- Avoid premature optimization

**Downsides:**
- Extra step before implementation

## Recommended Action

**Add React.memo to Button, Card, Input, FormField, and Icon components.**

This is a low-risk, high-value optimization that follows React best practices.

## Technical Details

**Files to Modify:**
1. `packages/ui/src/components/button/button.tsx`
2. `packages/ui/src/components/card/card.tsx`
3. `packages/ui/src/components/input/input.tsx`
4. `packages/ui/src/components/form-field/form-field.tsx`
5. `packages/ui/src/components/icons/icons.tsx`

**Pattern:**
```typescript
import { memo } from "react";

const Component = memo(forwardRef<...>(...));
Component.displayName = "Component";
```

## Acceptance Criteria

- [ ] Button wrapped with React.memo
- [ ] Card and all sub-components wrapped with React.memo
- [ ] Input wrapped with React.memo
- [ ] FormField wrapped with React.memo
- [ ] Icon wrapped with React.memo
- [ ] All components have displayName set
- [ ] Components still work correctly (no breaking changes)

## Work Log

- **2026-03-01**: Identified during code review
- **2026-03-01**: 5 components need memoization
- **2026-03-01**: Created todo file

## Resources

- **PR:** Design system implementation
- **Review Agents:** performance-oracle
- **React Docs:** https://react.dev/reference/react/memo
