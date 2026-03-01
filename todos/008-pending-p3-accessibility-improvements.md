---
status: pending
priority: p3
issue_id: 008
tags: [documentation, accessibility, reduced-motion, code-review]
dependencies: []
---

# Add Reduced Motion Support and Accessibility Improvements

## Problem Statement

The design system has animations but lacks support for `prefers-reduced-motion`, which is an accessibility requirement for users with vestibular disorders.

## Findings

### 1. Missing Reduced Motion Support
**Location:** `packages/ui/src/components/button/button.tsx:69-77`

```tsx
{variant === "shiny" && (
  <span
    className={cn(
      "absolute inset-0",
      "bg-gradient-to-r from-transparent via-background to-transparent",
      "opacity-50 transform -translate-x-full group-hover:animate-shine animate-shine",
    )}
  />
)}
```

The "shiny" variant and animated text don't respect `prefers-reduced-motion`.

**Impact:**
- Accessibility violation (WCAG 2.1 - 2.3.3 Animation from Interactions)
- Can cause nausea/vertigo for some users

### 2. Missing Error Alert Role
**Location:** `packages/ui/src/components/form-field/form-field.tsx:46-54`

Error messages lack `role="alert"` or `aria-live` attributes.

**Fix:**
```tsx
<div role="alert" className="mt-1 flex flex-col gap-1">
  {errors.map((error) => (
    <Text.H6 key={error} color="destructive">{error}</Text.H6>
  ))}
</div>
```

### 3. Icon-Only Buttons Lack aria-label
**Location:** `packages/ui/src/components/button/button.tsx`

When `children` is just an icon, there's no accessible name.

**Recommendation:** Document or enforce `aria-label` requirement for icon-only buttons.

### 4. Color Contrast Verification Needed
**Location:** `packages/ui/src/styles/globals.css`

Several color combinations should be verified:
- `muted-foreground` on `muted` background
- `latte-input-foreground` on `latte-input-background`
- `accent-foreground` on `accent` background

**Recommendation:** Run contrast ratio audits.

## Proposed Solutions

### Option 1: Add CSS Media Query for Reduced Motion (Recommended)
**Effort:** Small
**Risk:** None

Add to `globals.css`:
```css
@media (prefers-reduced-motion: reduce) {
  .animate-shine,
  .animate-text-gradient {
    animation: none;
  }
  
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Option 2: Document Accessibility Patterns
**Effort:** Small
**Risk:** None

Add documentation for:
- Icon-only button accessibility
- Color contrast requirements
- Form field best practices

## Recommended Action

1. **Add reduced motion support** via CSS media query
2. **Add `role="alert"`** to error messages
3. **Document accessibility patterns** for consumers

## Acceptance Criteria

- [ ] Reduced motion CSS added to globals.css
- [ ] Animations disabled when `prefers-reduced-motion: reduce`
- [ ] Error messages use `role="alert"`
- [ ] Accessibility patterns documented (README or Storybook)
- [ ] Color contrast audit completed (manual or automated)

## Work Log

- **2026-03-01**: Identified during code review
- **2026-03-01**: 4 accessibility improvements identified
- **2026-03-01**: Created todo file

## Resources

- **PR:** Design system implementation
- **Review Agents:** agent-native-reviewer
- **WCAG Guidelines:** 2.3.3 Animation from Interactions
- **MDN:** https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
