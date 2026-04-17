---
name: web-frontend
description: apps/web UI — routes, @repo/ui, TanStack Start server functions and collections, forms (useForm + createFormSubmitHandler + fieldErrorsAsStrings for Zod field errors), Tailwind layout rules, design-system updates, and useEffect / useMountEffect policy.
---

# Web app frontend (`apps/web`)

**When to use:** `apps/web` UI — routes, `@repo/ui`, TanStack Start server functions and collections, forms (**`useForm`** with **`createFormSubmitHandler`** + **`fieldErrorsAsStrings`** when Zod validation errors should appear on fields), Tailwind layout rules, design-system updates, and **`useEffect` / `useMountEffect` policy**.

## Legacy UI reference

- Before building new UI, inspect the old v1 UI/components and product patterns as a reference when relevant.
- Reuse as much as possible when the old implementation is still solid.
- Do not copy v1 UI blindly; review it critically and improve it to match v2 conventions, architecture, and quality expectations when needed.

## React 19

The project uses **React 19**. Follow modern patterns and avoid deprecated APIs:

- **No `forwardRef`** — `ref` is a regular prop in React 19. Declare it in the props type and destructure it directly.
- **No `ElementRef`** — use `React.ComponentRef<typeof SomeComponent>` instead (the `ElementRef` alias is deprecated).
- **No gratuitous `useMemo` / `useCallback` / `React.memo`** — the React Compiler (enabled in the build) auto-memoizes. Only add manual memoization when profiling shows a concrete bottleneck; remove existing wrappers when they have no measured benefit.
- **Prefer `use()`** for consuming promises and context where appropriate.

```tsx
// ❌ Deprecated React 18 pattern
const Input = forwardRef<ElementRef<typeof Primitive>, InputProps>(({ className, ...props }, ref) => (
  <Primitive ref={ref} {...props} />
))
Input.displayName = "Input"

// ✅ React 19 — ref is a regular prop
function Input({ className, ref, ...props }: InputProps & { ref?: React.Ref<React.ComponentRef<typeof Primitive>> }) {
  return <Primitive ref={ref} {...props} />
}
```

## Components

- **Always** use `Text` from `@repo/ui` for text content
- **Always** use `Button` from `@repo/ui` for buttons
- **Do not** nest `Text` inside `Button`. `Button` already sets font size, weight, and color; use plain text (and optional icons) as direct children. Wrapping the label in `Text` duplicates styles (e.g. avoid `<Button><Text.H5>Save</Text.H5></Button>`).
- **Lucide icons:** import from `lucide-react` and pass the component to `@repo/ui`’s `Icon` via the `icon` prop (e.g. `<Icon icon={Pencil} size="sm" />`). Prefer that over raw `<Pencil />` so shared sizing and color tokens apply. Buttons and other primitives that accept an `icon` prop follow the same pattern; otherwise wrap with `Icon`.
- **Always** use `GoogleIcon` and `GitHubIcon` from `@repo/ui` for OAuth provider icons

## Route-level component organization

Place React components close to the routes that use them, inside a `-components/` subfolder within the route directory. This keeps route files (which TanStack Router auto-discovers) clearly separated from supporting components.

```
routes/_authenticated/projects/$projectId/datasets/
├── index.tsx                       # route file
├── $datasetId.tsx                  # route file
└── -components/                    # supporting components for these routes
    ├── dataset-table.tsx
    ├── row-detail-panel.tsx
    └── version-badge.tsx
```

- Route files live directly in the route directory — TanStack Router discovers them
- Supporting UI for those routes lives in the adjacent `-components/` folder
- `domains/` directories (`apps/web/src/domains/`) are for state management only: server functions (writes) and collections/queries (reads) — **not** UI components

## Design system showcase

- When adding a new implemented UI component in `packages/ui` (or replacing a placeholder export with a real implementation), update `apps/web/src/routes/design-system.tsx` to include a usage example for that component in both light and dark mode previews.
- Treat `apps/web/src/routes/design-system.tsx` as the canonical visual inventory for `@repo/ui` components.

## State management (TanStack)

The web app uses a **server-centric, query-driven** architecture built on the TanStack ecosystem. No Zustand, Redux, or global stores.

**Server functions** — All data fetching and mutations use `createServerFn` from `@tanstack/react-start`:

```typescript
import { Effect } from "effect"
import { ProjectRepository, createProjectUseCase } from "@domain/projects"
import { ProjectRepositoryLive, SqlClientLive } from "@platform/db-postgres"
import { getPostgresClient } from "../../server/clients.ts"

// Query (GET)
export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId } = await requireSession()
  const client = getPostgresClient()

  return await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      return yield* repo.findAll()
    }).pipe(
      Effect.provide(ProjectRepositoryLive),
      Effect.provide(SqlClientLive(client, organizationId)),
    ),
  )
})

// Mutation (POST) with Zod validation
export const createProject = createServerFn({ method: "POST" })
  .inputValidator(createProjectSchema)
  .handler(async ({ data }) => {
    const { userId, organizationId } = await requireSession()
    const client = getPostgresClient()

    return await Effect.runPromise(
      createProjectUseCase({...}).pipe(
        Effect.provide(ProjectRepositoryLive),
        Effect.provide(SqlClientLive(client, organizationId)),
      ),
    )
  })
```

Server functions live in `apps/web/src/domains/*/functions.ts`.

**Collections** — Client-side reactive state uses TanStack React DB + Query via `queryCollectionOptions`:

```typescript
const projectsCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["projects"],
    queryFn: () => listProjects(),
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => { /* optimistic insert */ },
    onUpdate: async ({ transaction }) => { /* optimistic update */ },
    onDelete: async ({ transaction }) => { /* optimistic delete */ },
  }),
)

export const useProjectsCollection = (...) => useLiveQuery(...)
```

Collection files live in `apps/web/src/domains/*/collection.ts`.

**Route middleware vs route data**

- Use `beforeLoad` for middleware-style checks that should block the route tree early: auth redirects, authorization gates, and other preconditions.
- Use `loader` for data the route or layout actually renders. This keeps rendered data in TanStack Router's loader lifecycle, so it can use `staleTime`, `useLoaderData({ select })`, and avoid unnecessary refetching on same-route search-param navigations.
- If the same lookup is both your guard and your rendered data source, prefer doing that work in `loader` once instead of duplicating it across `beforeLoad` and `loader`.
- When multiple descendant routes need parent loader data, prefer a small route-scoped wrapper around `getRouteApi("...")` instead of repeating the route id string in every file.

```typescript
export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session?.user.isAdmin) throw redirect({ to: "/" })
  },
})
```

```typescript
export const Route = createFileRoute("/_authenticated")({
  staleTime: Infinity,
  loader: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login" })

    const sessionData = session.session as Record<string, unknown>
    const organizationId =
      typeof sessionData.activeOrganizationId === "string" ? sessionData.activeOrganizationId : null
    if (!organizationId) throw redirect({ to: "/welcome" })

    return {
      user: session.user,
      organizationId,
    }
  },
})
```

```typescript
const authenticatedRoute = getRouteApi("/_authenticated")

export function useAuthenticatedUser() {
  return authenticatedRoute.useLoaderData({ select: (data) => data.user })
}
```

**Key rules:**

- Server functions are the only data-fetching mechanism — no direct REST API calls from the client
- Use collections for reactive, queryable client state with automatic server sync
- Use `useState` for local UI state (modals, form visibility); no global stores
- Invalidate query cache after mutations: `getQueryClient().invalidateQueries({ queryKey: [...] })`
- Forms use TanStack React Form (`useForm` + `form.Field`)

## TanStack Form + Zod field errors (`createFormSubmitHandler` + `fieldErrorsAsStrings`)

**When:** `useForm` submits work that can fail with **Zod validation** (for example server functions using `inputValidator`), and you want **inline errors on `@repo/ui` fields** (not only a toast).

**Module:** `apps/web/src/lib/form-server-action.ts`

| Helper | Use |
| --- | --- |
| **`createFormSubmitHandler`** | Pass as `useForm({ onSubmit: createFormSubmitHandler(async (value) => { ... }, { onSuccess, onError }) })`. On validation failure it maps serialized Zod issues onto TanStack Form field meta via `extractFieldErrors` in `apps/web/src/lib/errors.ts`. Non-field errors go to `onError`. On success it resets the form and runs `onSuccess`. |
| **`fieldErrorsAsStrings`** | On every `Input`, `Textarea`, or other control with an `errors` prop inside `form.Field`, set `errors={fieldErrorsAsStrings(field.state.meta.errors)}` so those meta errors display. |

**Always use both** when you want Zod-driven field errors: the submit handler wires errors into form state; the helper wires form state into `@repo/ui`.

**Do not** duplicate the inline pattern `field.state.meta.errors.length > 0 ? field.state.meta.errors.map(String) : undefined` — use `fieldErrorsAsStrings` instead.

**Reference:** `apps/web/src/routes/_authenticated/index.tsx` — `RenameProjectModal`: `createFormSubmitHandler` in `useForm` (~line 225), `fieldErrorsAsStrings` on the name field `Input` (~line 287).

## Layout and spacing

- **Always** use flexbox for layout (`flex`, `flex-col`, `flex-row`)
- **Never** use margin utilities (no `m-*`, `mx-*`, `my-*`, `mt-*`, etc.)
- **Always** use `gap` utilities for spacing between elements (`gap-*`, `gap-x-*`, `gap-y-*`)
- **Always** use `p-*` (padding) for internal spacing within containers

## Conditional classes (`cn`)

With `cn()`, use **object syntax** `{ "class-name": condition }` — not short-circuit `condition && "class-name"`.

```tsx
// ❌ Bad
<div className={cn("base-class", isActive && "bg-accent")} />

// ✅ Good
<div className={cn("base-class", { "bg-accent": isActive })} />
```

### Example

```tsx
// ❌ Bad - using margins and space-y
<div className="space-y-4 mt-4">
  <div className="mb-2">Item 1</div>
  <div className="mb-2">Item 2</div>
</div>

// ✅ Good - using flexbox with gap
<div className="flex flex-col gap-4 pt-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

## React effects (`useEffect` policy)

- Do **not** call `useEffect` directly in components; use **`useMountEffect`** from `@repo/ui` for mount/unmount-only sync (listeners, imperative widgets, one-time setup).
- If raw `useEffect` is unavoidable, add `TODO(frontend-use-effect-policy)` with a short reason.

**Prefer:** derive values during render; run work in event handlers; controlled vs uncontrolled via `value !== undefined`; reset by **`key`** when an entity id changes.

**Avoid:** deriving state from props in an effect; fetching in effects to set state; mirroring props into local state; effects as command dispatchers.

```ts
import { useMountEffect } from "@repo/ui"

useMountEffect(() => {
  const cleanup = subscribeToExternalSystem()
  return () => cleanup()
})
```
