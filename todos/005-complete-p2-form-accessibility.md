---
status: complete
priority: p2
issue_id: 005
tags: [accessibility, a11y, form-components, code-review]
dependencies: []
---

# Fix Form Component Accessibility Issues

## Problem Statement

Form components have critical accessibility gaps that prevent proper screen reader support and keyboard navigation:

1. FormField doesn't associate labels with inputs
2. Input doesn't communicate error states to assistive technology
3. Text headings use non-semantic elements
4. Button loading state not announced

## Findings

### Issue 1: Missing Label-Input Association
**Location:** `packages/ui/src/components/form-field/form-field.tsx:20-58`

```tsx
<Label>{label}</Label>
{children} // input element
```

**Problem:** No `htmlFor`/`id` association. Screen readers can't announce which label belongs to which input.

**WCAG Impact:** Violates 1.3.1 (Info and Relationships), 3.3.2 (Labels or Instructions)

### Issue 2: Input Missing ARIA Attributes
**Location:** `packages/ui/src/components/input/input.tsx:38-67`

Input doesn't communicate:
- Invalid state (no `aria-invalid`)
- Error descriptions (no `aria-describedby`)
- Helper text (no `aria-describedby`)

**WCAG Impact:** Violates 3.3.1 (Error Identification), 4.1.2 (Name, Role, Value)

### Issue 3: Text Headings Not Semantic
**Location:** `packages/ui/src/components/text/text.tsx:148-231`

```tsx
export const H1 = forwardRef<HTMLSpanElement, Common>(
  function H1(props, ref) {
    return <TextAtom ref={ref} size="h1" {...props} />; // Renders as span!
  },
);
```

**Problem:** All heading variants render as `<span>` instead of `<h1>`-`<h6>`.

**WCAG Impact:** Violates 1.3.1 (Info and Relationships) - breaks document outline

### Issue 4: Button Loading Not Announced
**Location:** `packages/ui/src/components/button/button.tsx:53-82`

The `isLoading` state shows a spinner but doesn't communicate status to screen readers.

**WCAG Impact:** Violates 4.1.2 (Name, Role, Value) - state change not announced

## Proposed Solutions

### Option 1: Use React.useId for Associations (Recommended)
**Effort:** Small
**Risk:** Low

```tsx
import { useId } from "react";

function FormField({ children, label, description, errors }) {
  const id = useId();
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(children, { 
        id,
        "aria-describedby": errors ? errorId : descriptionId,
        "aria-invalid": errors ? "true" : undefined
      })}
      {errors && (
        <div id={errorId} role="alert">
          {errors.map(error => <Text.H6 key={error}>{error}</Text.H6>)}
        </div>
      )}
    </div>
  );
}
```

### Option 2: Fix Text Headings
**Effort:** Small
**Risk:** Low

```tsx
export const H1 = forwardRef<HTMLHeadingElement, Common>(
  function H1(props, ref) {
    return <TextAtom as="h1" ref={ref} size="h1" {...props} />;
  },
);
```

### Option 3: Add Loading ARIA to Button
**Effort:** Small
**Risk:** Low

```tsx
<Comp
  aria-busy={isLoading ? "true" : undefined}
  aria-label={isLoading ? `${children} (loading)` : undefined}
  disabled={disabled || isLoading}
>
```

## Recommended Action

**Implement all four accessibility fixes:**
1. Add `useId` for label-input association
2. Add `aria-invalid` and `aria-describedby` to Input
3. Convert Text headings to semantic elements (`h1`-`h6`)
4. Add loading state ARIA attributes to Button

## Technical Details

**Files to Modify:**
1. `packages/ui/src/components/form-field/form-field.tsx` - Label association
2. `packages/ui/src/components/input/input.tsx` - ARIA attributes
3. `packages/ui/src/components/text/text.tsx` - Semantic headings
4. `packages/ui/src/components/button/button.tsx` - Loading ARIA

**Components Affected:**
- FormField (all form inputs)
- Input (text inputs)
- Text.H1-H6 (headings)
- Button (loading state)

## Acceptance Criteria

- [ ] FormField generates unique IDs and associates labels with inputs via `htmlFor`
- [ ] Input has `aria-invalid` when errors present
- [ ] Input has `aria-describedby` pointing to errors/description
- [ ] Text.H1 renders as `<h1>`, Text.H2 as `<h2>`, etc.
- [ ] Button has `aria-busy` during loading
- [ ] Error messages use `role="alert"`
- [ ] Test with screen reader (NVDA/VoiceOver)

## Work Log

- **2026-03-01**: Identified during code review
- **2026-03-01**: 4 accessibility issues found
- **2026-03-01**: Created todo file

## Resources

- **PR:** Design system implementation
- **Review Agents:** agent-native-reviewer
- **WCAG Guidelines:** 1.3.1, 3.3.1, 3.3.2, 4.1.2
