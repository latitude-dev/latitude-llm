---
status: pending
priority: p3
issue_id: 007
tags: [typescript, minor-fixes, code-review]
dependencies: []
---

# Minor TypeScript and Code Quality Fixes

## Problem Statement

Collection of minor TypeScript and code quality improvements that don't block functionality but should be addressed for code hygiene.

## Findings

### 1. Input.tsx: Missing React Import Type
**Location:** `packages/ui/src/components/input/input.tsx:30`

```typescript
label?: React.ReactNode;  // Uses global React namespace
```

**Fix:** Add explicit import:
```typescript
import type { ReactNode } from "react";
// Use: label?: ReactNode;
```

### 2. Card.tsx: Mismatched Ref Type
**Location:** `packages/ui/src/components/card/card.tsx:28`

```typescript
const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>
```

Renders `<h3>` but ref type is `HTMLParagraphElement`.

**Fix:**
```typescript
const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>
```

### 3. FormField.tsx: Redundant `| undefined`
**Location:** `packages/ui/src/components/form-field/form-field.tsx:11-17`

```typescript
info?: string | undefined;      // ?: already implies | undefined
inline?: boolean | undefined;
errors?: string[] | undefined;
className?: string | undefined;
```

**Fix:** Remove `| undefined` from all optional properties.

### 4. Label.tsx: Unnecessary cva Usage
**Location:** `packages/ui/src/components/label/label.tsx:7-9`

```typescript
const labelVariants = cva(
  "text-sm font-medium leading-none...",
);  // No variants defined!
```

**Fix:** Use simple string instead:
```typescript
const labelBaseClasses = "text-sm font-medium leading-none...";
```

### 5. Icons.tsx: Console Warning in Production
**Location:** `packages/ui/src/components/icons/icons.tsx:140`

```typescript
console.warn(`Icon "${name}" not found`);  // Always executes
```

**Fix:** Guard with environment check:
```typescript
if (process.env.NODE_ENV !== "production") {
  console.warn(`Icon "${name}" not found`);
}
```

### 6. Text.tsx: Array Literal in Render
**Location:** `packages/ui/src/components/text/text.tsx:104`

```typescript
const isDisplay = ["h1", "h2", "h3", "h4"].includes(size);  // New array every render
```

**Fix:** Move outside component or use Set:
```typescript
const DISPLAY_SIZES = new Set(["h1", "h2", "h3", "h4"]);
// In component:
const isDisplay = DISPLAY_SIZES.has(size);
```

### 7. FormField.tsx: Error Key Using String
**Location:** `packages/ui/src/components/form-field/form-field.tsx:49`

```typescript
{errors.map((error) => (
  <Text.H6 key={error} ...  // Risky if duplicate errors
```

**Fix:** Use index or combine with unique ID:
```typescript
{errors.map((error, index) => (
  <Text.H6 key={`${error}-${index}`} ...
```

## Recommended Action

**Bundle all minor fixes into a single PR** for efficiency. These are all low-risk, mechanical changes that improve code quality without changing functionality.

## Acceptance Criteria

- [ ] Input.tsx uses explicit ReactNode import
- [ ] Card.tsx ref types match rendered elements
- [ ] FormField.tsx removes redundant `| undefined`
- [ ] Label.tsx removes unnecessary cva usage
- [ ] Icons.tsx guards console.warn for production
- [ ] Text.tsx moves array outside render
- [ ] FormField.tsx uses stable error keys
- [ ] All TypeScript compilation passes
- [ ] No breaking changes

## Work Log

- **2026-03-01**: Identified during code review
- **2026-03-01**: 7 minor issues found across 5 files
- **2026-03-01**: Created todo file

## Resources

- **PR:** Design system implementation
- **Review Agents:** kieran-typescript-reviewer, code-simplicity-reviewer
