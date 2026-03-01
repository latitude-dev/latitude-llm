---
status: complete
priority: p1
issue_id: 002
tags: [yagni, dead-code, text-component, code-review]
dependencies: []
---

# Remove Unused Text Variants and Props (YAGNI Violations)

## Problem Statement

The Text component has significant over-engineering with ~40% unused code. This violates YAGNI (You Aren't Gonna Need It) principle and creates maintenance burden.

## Findings

### Unused Text Variants (22 components, ~83 lines)
**Location:** `packages/ui/src/components/text/text.tsx:164-231`

Only 7 variants are needed (H1-H6, Mono), but 22 are defined:
- **Used:** H1, H2, H3, H4, H5, H6, Mono
- **Unused:** H1B, H2M, H2B, H3M, H3B, H4M, H4B, H5M, H5B, H6M, H6B, H6C, H7, H7C, H8

**Impact:** 83 lines of dead code (28% of file)

### Unused Props (7 props)
**Location:** `packages/ui/src/components/text/text.tsx:22-49`

- `animate` (line 46) - 0 usages
- `monospace` (line 44) - 0 usages (Mono component used instead)
- `centered` (line 45) - 0 usages
- `isItalic` (line 47) - 0 usages
- `darkColor` (line 28) - 0 usages
- `lineClamp` (line 36) - 0 usages
- `showNativeTitle` (line 35) - 0 usages

### Unused Button Variants (5 variants)
**Location:** `packages/ui/src/components/button/button.tsx:23-30`

- `shiny` - Has complex animation logic, never used
- `latte` - 0 usages
- `primaryMuted` - 0 usages
- `destructiveMuted` - 0 usages
- `successMuted` - 0 usages

### Unused FormField Props (3 props)
**Location:** `packages/ui/src/components/form-field/form-field.tsx:11-17`

- `errorStyle` - Prop exists but only "inline" is implemented
- `autoGrow` - 0 usages, not implemented
- `fullWidth` - 0 usages, not implemented

## Proposed Solutions

### Option 1: Remove All Unused Code (Recommended)
**Effort:** Medium
**Risk:** Low
**Approach:** Delete unused variants and props

**Benefits:**
- ~120 lines of dead code removed
- Simpler API surface
- Less maintenance burden
- Faster compilation

### Option 2: Document as "Reserved for Future Use"
**Effort:** Small
**Risk:** Medium
**Approach:** Add comments explaining unused code

**Downsides:**
- Still have to maintain unused code
- Doesn't solve the core problem

### Option 3: Keep but Deprecate
**Effort:** Medium
**Risk:** Low
**Approach:** Mark as @deprecated with console warnings

**Downsides:**
- Extra complexity
- Runtime overhead

## Recommended Action

**Remove all unused variants and props immediately.**

For weight variations, use prop pattern instead:
```typescript
<Text.H1 weight="bold"> instead of <Text.H1B>
```

## Technical Details

**Files to Modify:**
1. `packages/ui/src/components/text/text.tsx` - Remove 15 unused variants, 7 unused props
2. `packages/ui/src/components/button/button.tsx` - Remove 5 unused variants
3. `packages/ui/src/components/form-field/form-field.tsx` - Remove 3 unused props

**Estimated Code Reduction:**
- Text.tsx: ~83 lines removed
- Button.tsx: ~17 lines removed + shiny animation logic
- FormField.tsx: ~3 interface lines removed

**Total:** ~100+ lines of dead code

## Acceptance Criteria

- [ ] All unused text variants removed (keep H1-H6, Mono only)
- [ ] All unused text props removed
- [ ] All unused button variants removed
- [ ] All unused form-field props removed
- [ ] TypeScript compilation succeeds
- [ ] Tests pass (or update tests if any reference removed components)
- [ ] Demo page in apps/web updated if needed

## Work Log

- **2026-03-01**: Identified during code review
- **2026-03-01**: Found 22 unused text variants, 5 unused button variants, 13 unused props total
- **2026-03-01**: Created todo file

## Resources

- **PR:** Design system implementation
- **Review Agents:** code-simplicity-reviewer
