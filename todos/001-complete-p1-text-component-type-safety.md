---
status: complete
priority: p1
issue_id: 001
tags: [typescript, type-safety, text-component, code-review]
dependencies: []
---

# Text Component Type Safety Issues

## Problem Statement

The Text component has three critical type safety issues that can cause runtime errors and TypeScript compilation failures:

1. **Unsafe array check (line 104)**: `FontSize` type includes "h5", "h6", "h7", "h8" but the `includes` check uses a narrower string array
2. **Missing displayName**: All 25+ namespace components use `forwardRef` but don't set `displayName`, making debugging difficult in React DevTools
3. **Incorrect ref type (line 149)**: `ForwardRefExoticComponent<Common>` loses ref type information

## Findings

### Issue 1: Unsafe Array Check
**Location:** `packages/ui/src/components/text/text.tsx:104`

```typescript
const isDisplay = ["h1", "h2", "h3", "h4"].includes(size);
```

**Error:** TypeScript error - `Argument of type 'FontSize' is not assignable to parameter of type 'string'`

**Evidence:** `FontSize` type includes "h5", "h6", "h7", "h8" but array only has h1-h4.

### Issue 2: Missing displayName
**Location:** `packages/ui/src/components/text/text.tsx:148-294`

All components like `Text.H1`, `Text.H1B`, `Text.H2`, etc. don't have `displayName` set.

**Impact:** React DevTools shows "ForwardRef" instead of component names.

### Issue 3: Incorrect Ref Type
**Location:** `packages/ui/src/components/text/text.tsx:149`

```typescript
export const H1: ForwardRefExoticComponent<Common> = forwardRef<HTMLSpanElement, Common>(
```

**Issue:** The type annotation loses the ref type information.

## Proposed Solutions

### Option 1: Fix Array Check with Const Assertion (Recommended)
**Effort:** Small
**Risk:** Low

```typescript
const displaySizes = ["h1", "h2", "h3", "h4"] as const;
type DisplaySize = typeof displaySizes[number];
const isDisplay = displaySizes.includes(size as DisplaySize);
```

### Option 2: Add displayName to All Components
**Effort:** Medium (25+ components)
**Risk:** Low

Add after each component:
```typescript
Text.H1.displayName = "Text.H1";
Text.H1B.displayName = "Text.H1B";
// ... etc
```

### Option 3: Fix Ref Type Annotation
**Effort:** Small
**Risk:** Low

```typescript
export const H1 = forwardRef<HTMLSpanElement, Common>(function H1(props, ref) {
  return <TextAtom ref={ref} size="h1" {...props} />;
});
H1.displayName = "Text.H1";
```

## Recommended Action

Implement all three fixes:
1. Use const assertion for array check
2. Add displayName to all Text namespace components
3. Remove `ForwardRefExoticComponent` type annotation

## Technical Details

**Affected Files:**
- `packages/ui/src/components/text/text.tsx`

**Components Affected:**
- Text.H1, Text.H1B, Text.H2, Text.H2M, Text.H2B, Text.H3, Text.H3M, Text.H3B
- Text.H4, Text.H4M, Text.H4B, Text.H5, Text.H5M, Text.H5B
- Text.H6, Text.H6M, Text.H6B, Text.H6C, Text.H7, Text.H7C, Text.H8
- Text.Mono

## Acceptance Criteria

- [ ] TypeScript compilation succeeds without errors
- [ ] All Text components show correct names in React DevTools
- [ ] Ref forwarding types are correct
- [ ] `isDisplay` check works without type assertions

## Work Log

- **2026-03-01**: Identified during code review
- **2026-03-01**: Created todo file

## Resources

- **PR:** Design system implementation
- **Review Agents:** kieran-typescript-reviewer
