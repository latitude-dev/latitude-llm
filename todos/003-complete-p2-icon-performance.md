---
status: complete
priority: p2
issue_id: 003
tags: [performance, bundle-size, icons, code-review]
dependencies: []
---

# Fix Icon Component Bundle Size and Performance

## Problem Statement

The Icon component has two critical performance issues:

1. **Full library import**: Imports entire `lucide-react` library (~800+ icons) instead of individual icons
2. **Missing memoization**: Component re-renders even when props haven't changed

## Findings

### Issue 1: Full Library Import
**Location:** `packages/ui/src/components/icons/icons.tsx:1-55`

```typescript
import {
  AlertCircle, AlertTriangle, ArrowDown, ... 54 icons
} from "lucide-react";
```

**Impact:**
- Bundle size increase: ~200-400KB+ uncompressed
- Slower initial page load
- More JavaScript to parse/execute

**Current Size:** Full lucide-react library (~800+ icons)
**Needed:** Only ~40 icons are actually used

### Issue 2: Missing Memoization
**Location:** `packages/ui/src/components/icons/icons.tsx:135-148`

```typescript
const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ name, size = "default", color, className, ...props }, ref) => {
    // ... render logic
  },
);
```

**Impact:**
- Every parent re-render causes icon re-render
- Unnecessary SVG re-creation
- Performance degradation in lists and forms

## Proposed Solutions

### Option 1: Use Individual Icon Imports (Recommended for Bundle Size)
**Effort:** Small
**Risk:** Low

```typescript
// Import individual icons for tree-shaking
import { AlertCircle } from "lucide-react/dist/esm/icons/alert-circle";
import { AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
// ... etc for all 40 icons
```

**Benefits:**
- Proper tree-shaking
- Smaller bundle (~90% reduction)
- Better performance

### Option 2: Add React.memo (Recommended for Re-renders)
**Effort:** Small
**Risk:** Low

```typescript
import { memo } from "react";

const Icon = memo(forwardRef<SVGSVGElement, IconProps>(
  ({ name, size = "default", color, className, ...props }, ref) => {
    // ... existing logic
  },
));
Icon.displayName = "Icon";
```

**Benefits:**
- Prevents unnecessary re-renders
- Better performance in lists/forms

### Option 3: Use React.lazy for Icons (Advanced)
**Effort:** Medium
**Risk:** Medium

Lazy load icons on demand. More complex but best for very large icon sets.

## Recommended Action

**Implement both Option 1 and Option 2:**
1. Switch to individual icon imports for tree-shaking
2. Add React.memo to prevent re-renders

## Technical Details

**Affected File:**
- `packages/ui/src/components/icons/icons.tsx`

**Migration Steps:**
1. Change imports from named exports to individual file imports
2. Add `memo()` wrapper around `forwardRef`
3. Add `displayName` for debugging
4. Test all 40 icons still work correctly

**Bundle Size Impact:**
- Before: ~200-400KB (full library)
- After: ~20-40KB (40 icons only)
- **Reduction: ~80-90%**

## Acceptance Criteria

- [ ] Icons use individual file imports from lucide-react
- [ ] Icon component wrapped with React.memo
- [ ] displayName set on Icon component
- [ ] All 40 icons render correctly
- [ ] Bundle size reduced significantly
- [ ] No console warnings or errors
- [ ] Tests pass

## Work Log

- **2026-03-01**: Identified during code review
- **2026-03-01**: Bundle size impact estimated at ~200-400KB
- **2026-03-01**: Created todo file

## Resources

- **PR:** Design system implementation
- **Review Agents:** performance-oracle
- **Docs:** https://lucide.dev/guide/packages/lucide-react
