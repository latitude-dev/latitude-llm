---
status: complete
priority: p2
issue_id: 004
tags: [architecture, dependencies, monorepo, code-review]
dependencies: []
---

# Fix Dependency Management and Tailwind Config

## Problem Statement

The design system has architectural issues with dependency management and configuration duplication:

1. **React listed in both dependencies AND peerDependencies**
2. **Tailwind config duplicated between UI package and app**
3. **Missing animations in app config**

## Findings

### Issue 1: React Dependency Conflict
**Location:** `packages/ui/package.json`

```json
"dependencies": { "react": "catalog:", ... }
"peerDependencies": { "react": "catalog:", ... }
```

**Impact:**
- Version conflicts possible
- Bundle bloat with multiple React instances
- Unpredictable behavior

**Rule:** UI libraries should only have React in `peerDependencies`.

### Issue 2: Tailwind Config Duplication
**Location:** 
- `packages/ui/tailwind.config.ts` (194 lines - source of truth)
- `apps/web/tailwind.config.ts` (143 lines - copy with missing parts)

**Differences Found:**
- Missing `glow` keyframe and animation
- Missing `@tailwindcss/typography` plugin
- Colors copy-pasted (maintenance burden)

**Impact:**
- Violates DRY principle
- Risk of config drift
- 143 lines of duplicated code

### Issue 3: Build Configuration Mismatch
**Location:** `packages/ui/package.json`

```json
"build": "tsc -p tsconfig.json",
"main": "src/index.ts",
"types": "src/index.ts"
```

**Issue:** Build output is ignored; consuming apps transpile source directly.

## Proposed Solutions

### Option 1: Fix React Dependencies (Required)
**Effort:** Small
**Risk:** Low

Remove React from `dependencies`, keep only in `peerDependencies`:
```json
"dependencies": {
  // Remove: "react": "catalog:",
  "class-variance-authority": "^0.7.1",
  ...
},
"peerDependencies": {
  "react": "catalog:",
  "react-dom": "catalog:"
}
```

### Option 2: Share Tailwind Config (Recommended)
**Effort:** Small
**Risk:** Low

App config should import and extend UI config:
```typescript
import uiConfig from "@repo/ui/tailwind.config";

export default {
  ...uiConfig,
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
};
```

**Benefits:**
- Single source of truth
- No duplication
- Consistent theming

### Option 3: Fix Build Exports (Optional)
**Effort:** Small
**Risk:** Low

Either:
- Remove build script and embrace source distribution
- OR fix exports to point to `dist/index.js`

**Recommendation:** Keep source distribution (simpler for dev workflow).

## Recommended Action

1. **Remove React from dependencies** (P2)
2. **Share Tailwind config** from @repo/ui (P2)
3. **Add missing animations** to shared config (P2)

## Technical Details

**Files to Modify:**
1. `packages/ui/package.json` - Fix dependencies
2. `apps/web/tailwind.config.ts` - Import from @repo/ui
3. Consider removing `packages/ui/tailwind.config.ts` animations not in app

**Dependencies to Audit:**
- React: Should only be peerDependency
- lucide-react: Consider moving to peerDependencies
- @radix-ui/*: Consider peerDependencies vs dependencies

## Acceptance Criteria

- [ ] React removed from `dependencies` in packages/ui/package.json
- [ ] React remains in `peerDependencies`
- [ ] apps/web/tailwind.config.ts imports from @repo/ui
- [ ] All theme colors/animations work correctly in app
- [ ] pnpm install works without warnings
- [ ] No duplicate React in bundle

## Work Log

- **2026-03-01**: Identified during code review
- **2026-03-01**: Found React in both deps and peerDeps
- **2026-03-01**: Found 143 lines of duplicated Tailwind config
- **2026-03-01**: Created todo file

## Resources

- **PR:** Design system implementation
- **Review Agents:** architecture-strategist
- **Project Rules:** See SKILL.md for monorepo patterns
