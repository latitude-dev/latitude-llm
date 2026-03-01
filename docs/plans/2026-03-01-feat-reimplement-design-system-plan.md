---
title: Reimplement Design System from Legacy Latitude
type: feat
status: active
date: 2026-03-01
---

# Reimplement Design System from Legacy Latitude

## Overview

Migrate the core design system from the legacy Latitude project (`/home/geclos/code/work/latitude-legacy/packages/web-ui`) into the new v2 monorepo. Focus on design tokens and the most commonly used atomic components that form the foundation of the UI.

The new web app (`apps/web`) is currently a blank React + Vite scaffold with no styling solution in place, making this the ideal time to establish a robust design system package.

## Problem Statement

The v2 rewrite has a minimal web app with no UI components or styling infrastructure. We need to:

1. Establish a maintainable design system package that follows the monorepo's architectural patterns
2. Port essential design tokens (colors, typography, spacing) that maintain brand consistency
3. Migrate core atomic components that will be used across all features
4. Set up Tailwind CSS with the existing CSS variable system from the legacy project
5. Ensure the design system is type-safe and follows Effect TS patterns where applicable

## Proposed Solution

Create a new `@repo/ui` package in `packages/ui/` containing:

- **Design Tokens**: TypeScript-based token system mapping to Tailwind classes
- **CSS Variables**: Light/dark theme system with semantic color naming
- **Core Atoms**: Button, Text, Input, Card, Badge, Select, Icons, Tooltip, Modal, FormField
- **Utilities**: `cn()` helper for class name composition
- **Tailwind Config**: Extended configuration with custom colors, animations, and typography

## Technical Approach

### Architecture

The design system follows the monorepo's established patterns:

```
packages/ui/
├── src/
│   ├── index.ts                    # Main exports
│   ├── tokens/                     # Design tokens
│   │   ├── index.ts
│   │   ├── colors.ts
│   │   ├── font.ts
│   │   ├── shadow.ts
│   │   ├── zIndex.ts
│   │   └── ...
│   ├── components/                 # Atomic components
│   │   ├── button/
│   │   │   ├── button.tsx
│   │   │   ├── button.test.tsx
│   │   │   └── index.ts
│   │   ├── text/
│   │   ├── input/
│   │   ├── card/
│   │   ├── badge/
│   │   ├── select/
│   │   ├── icons/
│   │   ├── tooltip/
│   │   ├── modal/
│   │   ├── form-field/
│   │   ├── checkbox/
│   │   ├── skeleton/
│   │   ├── label/
│   │   └── ...
│   ├── styles/
│   │   ├── globals.css             # CSS variables & Tailwind directives
│   │   └── theme.css               # Theme definitions
│   └── utils/
│       └── cn.ts                   # class-variance-authority + clsx + tailwind-merge
├── tailwind.config.ts              # Extended Tailwind configuration
├── postcss.config.mjs              # PostCSS with autoprefixer
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Key Patterns

1. **CVA (class-variance-authority)**: For type-safe variant management
2. **Radix UI Primitives**: For accessible, unstyled base components
3. **CSS Variables**: For theme-aware styling (light/dark modes)
4. **Token-Based Styling**: All visual values defined in tokens/
5. **Forward Refs**: All components support ref forwarding
6. **Type Safety**: Full TypeScript coverage with exported prop types

### Component Implementation Patterns

```typescript
// Using CVA for variants
const buttonVariants = cva(
  "base-classes",
  {
    variants: {
      variant: { default: "...", destructive: "..." },
      size: { default: "...", small: "..." }
    },
    compoundVariants: [...],
    defaultVariants: { variant: "default", size: "default" }
  }
);

// Forward ref pattern
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant, size, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), props.className)}
        {...props}
      />
    );
  }
);
```

## System-Wide Impact

### Dependencies & Integration

**New Package Dependencies:**
- `class-variance-authority`: Type-safe variant management
- `clsx`: Conditional class name handling
- `tailwind-merge`: Smart Tailwind class merging
- `lucide-react`: Icon library
- Radix UI primitives: `@radix-ui/react-slot`, `@radix-ui/react-label`, `@radix-ui/react-checkbox`, `@radix-ui/react-select`, `@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, etc.

**Build Integration:**
- No build step required - components consumed directly from `src/` via `workspace:*`
- Tailwind CSS scanning configured to include `packages/ui/src/**/*.{ts,tsx}`
- CSS variables defined in `packages/ui/src/styles/globals.css`

**Consumption in apps/web:**
```typescript
// apps/web/src/main.tsx
import "@repo/ui/styles/globals.css"; // Import design system styles

// apps/web/src/components/MyComponent.tsx
import { Button, Text, Card } from "@repo/ui";
```

### State Lifecycle Risks

**Minimal risk** - design system is stateless by design:
- No persistent state in components
- No side effects during rendering
- Form components receive controlled values via props
- Theme state managed via CSS classes (no JS state)

### Error Handling

Components follow defensive patterns:
- Props validated via TypeScript
- No runtime prop validation (trust TS at build time)
- Forward refs always check for null before use
- Icons handle missing names gracefully

## Acceptance Criteria

### Functional Requirements

- [x] Package `@repo/ui` created in `packages/ui/`
- [x] All design tokens migrated (colors, font, shadow, zIndex, opacity, overflow, whiteSpace, wordBreak, skeleton)
- [x] CSS variables system set up with light/dark themes
- [x] Tailwind config extended with custom theme values
- [x] `cn()` utility implemented and exported
- [x] Core atoms implemented:
  - [ ] Button (all variants: default, destructive, outline, secondary, ghost, link, shiny, latte, muted variants)
  - [ ] Text (H1-H8 with weight variants, Mono variant)
  - [ ] Input (with FormField integration)
  - [ ] Card (with header, content, footer subcomponents)
  - [ ] Badge (all color variants)
  - [ ] Select (with Radix UI primitives)
  - [ ] Icons (Lucide + custom icons system)
  - [ ] Tooltip (4 variants)
  - [ ] Modal (6 size variants)
  - [ ] FormField (wrapper for form inputs)
  - [ ] Checkbox (Radix-based)
  - [ ] Skeleton (loading placeholder)
  - [ ] Label (form labels with tooltips)
- [ ] All components forward refs correctly
- [ ] All components have TypeScript prop types exported
- [ ] Dark mode support via CSS variables
- [ ] Components work in apps/web with proper tree-shaking

### Non-Functional Requirements

- [ ] Follow monorepo conventions (Biome linting, strict TS, ESM)
- [ ] Zero business logic (pure presentation components)
- [ ] Accessible (builds on Radix UI primitives)
- [ ] Type-safe (no `any` types, strict null checks)
- [ ] Test coverage for complex components (Button, Select, Modal)
- [ ] No circular dependencies
- [ ] Greppable, explicit code (avoid dynamic dispatch)

### Quality Gates

- [ ] `pnpm lint` passes in `packages/ui/`
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (or `--passWithNoTests`)
- [ ] Components render correctly in apps/web
- [ ] Dark mode toggle works across all components
- [ ] No console warnings or errors

## Implementation Phases

### Phase 1: Foundation (2-3 days)

**Deliverables:**
1. Create `packages/ui/` package structure
2. Set up `package.json` with dependencies
3. Configure Tailwind CSS with CSS variables
4. Migrate `cn()` utility
5. Migrate design tokens (colors, font, shadow, zIndex)
6. Set up CSS variables in `globals.css`
7. Export tokens from `src/index.ts`

**Success Criteria:**
- `pnpm install` works in package
- Tailwind scans UI package files
- Tokens are importable and type-safe
- CSS variables render correctly

**Files to Create:**
- `packages/ui/package.json`
- `packages/ui/tsconfig.json`
- `packages/ui/tailwind.config.ts`
- `packages/ui/postcss.config.mjs`
- `packages/ui/src/index.ts`
- `packages/ui/src/utils/cn.ts`
- `packages/ui/src/tokens/index.ts`
- `packages/ui/src/tokens/colors.ts`
- `packages/ui/src/tokens/font.ts`
- `packages/ui/src/tokens/shadow.ts`
- `packages/ui/src/tokens/zIndex.ts`
- `packages/ui/src/tokens/opacity.ts`
- `packages/ui/src/tokens/overflow.ts`
- `packages/ui/src/tokens/whiteSpace.ts`
- `packages/ui/src/tokens/wordBreak.ts`
- `packages/ui/src/tokens/skeleton.ts`
- `packages/ui/src/styles/globals.css`

### Phase 2: Core Components (3-4 days)

**Deliverables:**
1. Text component (H1-H8, weight variants, Mono)
2. Button component (15+ variants, 5 sizes, fancy styling)
3. Icons system (Lucide + custom icon support)
4. Card component (with subcomponents)

**Success Criteria:**
- All components render in apps/web
- Variants work correctly
- Dark mode applies to all components
- Forward refs work

**Files to Create:**
- `packages/ui/src/components/text/text.tsx`
- `packages/ui/src/components/text/index.ts`
- `packages/ui/src/components/button/button.tsx`
- `packages/ui/src/components/button/button.test.tsx`
- `packages/ui/src/components/button/index.ts`
- `packages/ui/src/components/icons/icons.tsx`
- `packages/ui/src/components/icons/index.ts`
- `packages/ui/src/components/icons/lucide.ts`
- `packages/ui/src/components/card/card.tsx`
- `packages/ui/src/components/card/index.ts`

### Phase 3: Form Components (2-3 days)

**Deliverables:**
1. FormField wrapper component
2. Input component
3. Label component
4. Select component (with Radix UI)
5. Checkbox component (with Radix UI)
6. Tooltip component (with Radix UI)

**Success Criteria:**
- Form components integrate seamlessly
- Validation states display correctly
- Keyboard navigation works
- ARIA attributes applied properly

**Files to Create:**
- `packages/ui/src/components/form-field/form-field.tsx`
- `packages/ui/src/components/form-field/index.ts`
- `packages/ui/src/components/input/input.tsx`
- `packages/ui/src/components/input/index.ts`
- `packages/ui/src/components/label/label.tsx`
- `packages/ui/src/components/label/index.ts`
- `packages/ui/src/components/select/select.tsx`
- `packages/ui/src/components/select/index.ts`
- `packages/ui/src/components/checkbox/checkbox.tsx`
- `packages/ui/src/components/checkbox/index.ts`
- `packages/ui/src/components/tooltip/tooltip.tsx`
- `packages/ui/src/components/tooltip/index.ts`

### Phase 4: Advanced Components (2-3 days)

**Deliverables:**
1. Modal/Dialog component (with Radix UI)
2. Badge component (all color variants)
3. Skeleton component (loading states)
4. Additional supporting atoms (Separator, Switch, etc.)

**Success Criteria:**
- Modal opens/closes correctly
- Focus trapping works
- ESC key closes modal
- Skeleton animations smooth

**Files to Create:**
- `packages/ui/src/components/modal/modal.tsx`
- `packages/ui/src/components/modal/index.ts`
- `packages/ui/src/components/badge/badge.tsx`
- `packages/ui/src/components/badge/index.ts`
- `packages/ui/src/components/skeleton/skeleton.tsx`
- `packages/ui/src/components/skeleton/index.ts`
- `packages/ui/src/components/separator/separator.tsx`
- `packages/ui/src/components/separator/index.ts`
- `packages/ui/src/components/switch/switch.tsx`
- `packages/ui/src/components/switch/index.ts`

### Phase 5: Integration & Polish (1-2 days)

**Deliverables:**
1. Update apps/web to import and use design system
2. Create example page showcasing components
3. Add dark mode toggle
4. Final testing and bug fixes
5. Update root `package.json` exports if needed

**Success Criteria:**
- apps/web displays design system components correctly
- Dark/light mode toggle works
- No console errors
- All quality gates pass

**Files to Modify:**
- `apps/web/package.json` (add `@repo/ui` dependency)
- `apps/web/src/main.tsx` (import styles, add example usage)
- `apps/web/vite.config.ts` (ensure Tailwind scans UI package)
- Root `package.json` (add package to workspaces if not auto-discovered)

## Alternative Approaches Considered

### Option A: Keep Components in apps/web

**Rejected because:**
- Violates monorepo's separation of concerns (apps should only route/auth)
- Duplication risk when multiple apps need UI
- Harder to maintain consistent styling
- No reusability across packages

### Option B: Use Existing UI Library (Chakra, MUI, etc.)

**Rejected because:**
- Legacy project already has custom design system matching brand
- Rebuilding from scratch faster than overriding third-party themes
- Effect TS philosophy favors explicit, minimal abstractions
- Team already familiar with custom component patterns

### Option C: Port All 50+ Components at Once

**Rejected because:**
- Too large a scope for initial PR
- Risk of errors in rarely-used components
- YAGNI - port only what Phase 1-3 UI needs
- Easier to review and test incrementally

## Dependencies & Prerequisites

### Required Dependencies

**Core:**
```json
{
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^2.6.0",
  "lucide-react": "catalog:"
}
```

**Radix UI (select based on components needed):**
```json
{
  "@radix-ui/react-slot": "^1.1.2",
  "@radix-ui/react-label": "^2.1.2",
  "@radix-ui/react-checkbox": "^1.1.4",
  "@radix-ui/react-select": "^2.1.6",
  "@radix-ui/react-dialog": "^1.1.6",
  "@radix-ui/react-tooltip": "^1.1.8",
  "@radix-ui/react-separator": "^1.1.2",
  "@radix-ui/react-switch": "^1.1.3"
}
```

**Dev Dependencies:**
```json
{
  "tailwindcss": "^3.4.17",
  "tailwindcss-animate": "^1.0.7",
  "autoprefixer": "^10.4.21",
  "postcss": "^8.5.3",
  "@tailwindcss/typography": "^0.5.16"
}
```

### Prerequisites

- [ ] Confirm Tailwind CSS installation approach (apps/web vs root)
- [ ] Verify Radix UI versions are compatible with React 19
- [ ] Ensure `lucide-react` catalog version supports needed icons
- [ ] Check if any CSS reset/normalize needed in apps/web

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Radix UI incompatibility with React 19 | Medium | High | Test early in Phase 1; use latest Radix versions |
| Tailwind JIT not scanning UI package | Low | High | Configure content path in tailwind.config.ts |
| Dark mode flash on load | Medium | Medium | Use next-themes or CSS-only approach with no-JS fallback |
| Bundle size from Radix + Lucide | Low | Medium | Tree-shaking should handle; monitor with `pnpm build` |
| Ref forwarding issues | Low | Medium | Follow forwardRef patterns strictly; add tests |
| Missing legacy component features | Medium | Low | Document gaps; add in future PRs as needed |

## Future Considerations

### Phase 6+ (Future PRs)

- Toast notification system
- Table component with sorting
- DatePicker component
- Chart components (recharts integration)
- Markdown rendering component
- CodeBlock with syntax highlighting
- Additional form components (Radio, NumberInput, etc.)
- Organism-level components (layout sections)

### Extensibility

The design system is designed to be extended:
- New tokens added to existing token files
- New components follow established patterns
- Variants added via CVA's variant system
- Custom themes via CSS variable overrides

## Documentation Plan

- [ ] Add README.md to `packages/ui/` with usage examples
- [ ] Document component API in code comments (JSDoc style)
- [ ] Create Storybook or similar if needed (Phase 6+)
- [ ] Update AGENTS.md with design system conventions

## Sources & References

### Origin

**Legacy Design System:** `/home/geclos/code/work/latitude-legacy/packages/web-ui/`

Key files referenced:
- `src/ds/tokens/*.ts` - All design tokens
- `src/ds/atoms/Button/index.tsx` - Button implementation patterns
- `src/ds/atoms/Text/index.tsx` - Text component with namespace pattern
- `src/ds/atoms/Input/index.tsx` - Form input patterns
- `src/lib/utils.ts` - `cn()` utility implementation
- `styles.css` - CSS variables system
- `tailwind.config.js` - Tailwind theme extensions

### Internal References

- **Monorepo structure:** `V2_PLAN.md` - Phase 3 mentions UI implementation
- **Tech stack:** `apps/web/package.json` - React + Vite setup
- **Build system:** Root `turbo.json`, `pnpm-workspace.yaml`
- **Linting:** `biome.json` - Code style conventions
- **TypeScript:** `tsconfig.base.json` - Strict mode settings

### External References

- **CVA Documentation:** https://cva.style/docs
- **Radix UI Primitives:** https://www.radix-ui.com/primitives
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Lucide Icons:** https://lucide.dev/icons/

### Related Work

- **Rewrite context:** `V2_PLAN.md` Phase 3: "Implement UI for baseline domains"
- **Current web state:** `apps/web/src/main.tsx` - Placeholder component only
- **Domain packages:** `packages/domain/*` - Will consume design system for their UIs

## MVP Test File

```typescript
// packages/ui/src/components/button/button.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("renders with default variant", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("renders with destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("forwards ref correctly", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={(r) => (ref.current = r)}>Button</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("is disabled when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText("Disabled")).toBeDisabled();
  });
});
```

## Summary

This plan establishes a robust, type-safe design system package that ports the essential tokens and components from the legacy Latitude project. The phased approach ensures incremental delivery with working components at each stage, following the monorepo's architectural conventions and Effect TS philosophy of explicit, minimal abstractions.
