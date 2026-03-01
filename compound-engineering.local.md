---
review_agents:
  - kieran-typescript-reviewer
  - code-simplicity-reviewer
  - security-sentinel
  - performance-oracle
  - architecture-strategist
  - agent-native-reviewer
plan_review_agents:
  - kieran-typescript-reviewer
  - code-simplicity-reviewer
---

# Review Context

## Project: Latitude LLM Platform

This is a multi-tenant LLM observability platform with a monorepo structure.

### Architecture Context
- **Frontend**: React + Vite (apps/web) using @repo/ui design system
- **Backend**: Hono API (apps/api) with Effect TS for core logic
- **Database**: PostgreSQL (control plane), ClickHouse (telemetry)
- **Package Structure**: packages/domain/* (business logic), packages/platform/* (infrastructure), packages/ui (design system)

### Design System Specifics
- Located in `packages/ui/` - shared across all apps
- Uses Tailwind CSS with custom CSS variables for theming
- Radix UI primitives for accessibility
- class-variance-authority (CVA) for type-safe variants
- No business logic in UI components - pure presentation

### Key Patterns to Review
1. **ESM-first**: All packages use `"type": "module"`
2. **Strict TypeScript**: `strict: true`, `exactOptionalPropertyTypes: true`
3. **No barrel imports**: Direct file imports with `.js` extensions
4. **Forward refs**: All components must forward refs properly
5. **Token-based styling**: All visual values should come from tokens/
6. **No dynamic class names**: Avoid dynamic Tailwind class generation

### Security Considerations
- Components must not execute user-provided code
- Icons should validate icon names to prevent injection
- Form components should work with proper sanitization at API boundaries

### Performance Considerations
- Use React.memo where appropriate for pure components
- Avoid unnecessary re-renders in form fields
- Tree-shaking should work properly with named exports
