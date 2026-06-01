# Command palette (Cmd+K)

The command palette is the global, keyboard-first launcher in `apps/web`. It lets users
navigate (projects, project sections, settings pages), run actions (switch organization,
switch theme, create project/org, log out…), act on the entity currently in view
(resolve an issue, copy a trace id…), and search a project's entities (issues, datasets,
saved searches). It is modeled on Linear/Raycast.

It is always mounted inside the authenticated layout and opens with `Cmd/Ctrl+K` or the
header **Search ⌘K** button.

## Architecture

### Where it lives

- Feature directory: `apps/web/src/components/command-palette/`
- UI primitives: `packages/ui/src/components/command/command.tsx` (a thin `cmdk` wrapper
  styled to our tokens — `CommandDialog`, `CommandInput`, `CommandList`, `CommandGroup`,
  `CommandItem`, `CommandEmpty`, `CommandLoading`, `CommandFooter`).
- Mounted once in `apps/web/src/routes/_authenticated.tsx` (`AuthenticatedLayout`): the
  layout wraps its tree in `CommandPaletteProvider` and renders `<CommandPalette />`. Being
  above the router `Outlet` makes it available on every authenticated page.

### Provider, open state, and the contribution registry

`command-palette-provider.tsx` splits its context in two on purpose:

- **`useCommandPalette()` — stable actions** (`setOpen`, `toggle`, `openCreateProject`,
  `openCreateOrganization`, `register`, `unregister`). This object never changes identity, so
  consumers of it never re-render when the palette's state changes.
- **`useCommandPaletteState()` — volatile state** (`open`, `registeredCommands`), consumed only
  by the palette UI.

This split is load-bearing: command contributors (`useRegisterCommands`) read **only** the
stable actions context. If they subscribed to the volatile state, a registration would
`setState` → re-render the contributor → (with a non-stable `commands` array, e.g. from
`useParamState` setters) re-register → infinite loop. Reading the stable context cuts that edge.

The provider also holds:

- **Open state** (`open`, `setOpen`, `toggle`).
- **Global "create" modals** — it owns `CreateProjectModal` and `CreateOrganizationModal`
  so palette actions can open them from anywhere (`openCreateProject` /
  `openCreateOrganization`), independent of the current route.
- **The contextual command registry.** `useRegisterCommands(commands)` lets any mounted
  view contribute commands while it is on screen and retract them on unmount. Commands are
  keyed by `useId()`; the provider flattens all registrations into `registeredCommands`.
  Callers pass a memoized array that captures the current entity and reuses the same
  handlers the view's own buttons call.

### Command model

`types.ts` defines `PaletteCommand`, a discriminated union over `kind`:

- **`action`** (default, `kind` omitted) — has `perform()`. The palette closes, then runs it.
- **`parent`** (`kind: "parent"`) — has `getChildren()`. Selecting it pushes a sub-page
  listing its child commands (keyboard drill-down).

Shared fields: `id` (globally unique; also the cmdk item `value`), `title`, `icon`
(`LucideIcon`), `section` (`"context" | "search" | "navigation" | "projects" | "actions"`),
optional `leading` (overrides the icon, e.g. a project emoji), `subtitle`, `badge`,
`keywords` (extra search terms), and `group` (sub-heading for contextual commands, e.g.
`"Issue"`, `"Trace"`).

### Command sources

The palette merges, in render order:

1. **Contextual** (`registeredCommands`, grouped by `group`) — contributed by the current
   view; rendered first. Two flavors: **entity-in-view** (an open issue/trace drawer
   contributes actions on that record) and **current-page** (a route contributes its primary
   actions while mounted, e.g. the Search and Traces pages add Save search / toggle-filters /
   tab switches).
2. **In-project search results** (only when inside a project with a non-empty query):
   **Issues**, **Datasets**, **Saved searches**.
3. **Central providers** (always available hooks):
   - `useNavigationCommands` — the current project's sections + settings pages.
   - `useProjectCommands` — switch to any project in the org.
   - `useGlobalCommands` — switch organization (drill-down), switch theme, create
     project/org, docs, backoffice (admins), log out.
4. **Traces fallback** — a single "Search traces for "…"" action, rendered last.

`useCurrentProject` (`commands/use-current-project.ts`) resolves the active project from the
`$projectSlug` route loader via `useMatch({ from, shouldThrow: false })` — **not** by matching
the projects collection against the URL slug. This is correct from the globally-mounted
palette and survives slug drift, matching how the breadcrumb and project layout resolve the
project.

### Filtering happens in React, not in cmdk

The palette runs cmdk with **`shouldFilter={false}`** and filters in `command-palette.tsx`
(`commandMatches`: every whitespace-separated query token must be a substring of the
command's title + subtitle + keywords). This is deliberate:

> cmdk snapshots an item's `keywords` on first registration and only re-filters on its own
> internal search changes. Items with a **stable `value`** (e.g. the `search-traces`
> fallback) keep their first-keystroke keywords forever, so query-driven rows silently stop
> matching as the query grows. Filtering in React avoids that entirely.

Consequences:

- Context / navigation / projects / actions and **datasets / saved searches** are filtered
  by `commandMatches` against the live query.
- **Issue** results are pre-curated by their hook (semantic + substring) and rendered as-is.
- The **traces fallback** always renders (it *is* the query). So inside a project with a
  query you never see a bare "No results found." — there is always at least the fallback.
- cmdk still owns keyboard navigation, selection, groups, and the empty/loading slots.

### Sub-pages (drill-down)

The palette keeps a `pageStack` of `parent` commands. Selecting a parent pushes a page that
renders its `getChildren()` (filtered by the live query). The header shows a back affordance.
A parallel `savedSearches` stack stores each ancestor level's query so going back restores
what you had typed. Example parent: **Switch organization** (children = the org list).

### Keyboard behavior

- **`Cmd/Ctrl+K`** toggles the palette. Registered via `useHotkeys` with
  `options: { ignoreInputs: false }` so it opens even while a text input is focused
  (`ignoreInputs: true` would suppress it in inputs).
- **`Esc`** backs out one step: pop a sub-page → else clear a non-empty query → else close
  (root + empty). Implemented via the dialog's `onEscapeKeyDown` calling `preventDefault()`
  so Radix doesn't dismiss while we pop/clear.
- `↑/↓` navigate, `↵` selects (cmdk). The footer hint reflects the active `Esc` behavior
  (back / clear / close).

### Result ordering convention

Within a group, **switch/navigate actions rank above create actions** (switching is the more
frequent intent), and **Log out** sits last (terminal/destructive). Project switching lives
in the Projects group, which renders before the Actions group, so it already outranks
"New project".

### In-project entity search

- **Issues** (`commands/use-issue-search-commands.ts`): combines an instant client-side
  title-substring match over a cached pool of recent issues (`useIssues({ limit: 50 })`, no
  `searchQuery`) with the debounced semantic search (`useIssues({ searchQuery })`). Substring
  hits rank first, then semantic hits not already shown. Selecting opens the issue drawer via
  the `issueId` search param. The semantic half needs the embedding backend; the substring
  half works offline, which is why "json" reliably finds "JSON output truncated…".
- **Datasets / Saved searches** (`commands/use-project-search-commands.ts`): full project
  lists (`useDatasetsList` / `useSavedSearchesList`, each fetched only while searching via an
  `enabled` option), filtered client-side by `commandMatches`. Selecting navigates to the
  dataset, or applies the saved search on the Search page (`?savedSearch=<slug>`).
- **Monitors** (`commands/use-monitor-search-commands.ts`): the project's monitors
  (`useMonitors`, fetched only while searching), filtered client-side. **Gated behind the
  `monitors` feature flag** — when the flag is off, monitors are neither fetched nor listed,
  mirroring the flag-gated Monitors page/sidebar entry. Selecting opens the monitor drawer
  (`?monitorSlug=<slug>`); muted/system monitors are labelled in their subtitle. Monitor
  *mutations* (mute/unmute, create) are backend-pending, so no monitor actions are wired yet.
- **Traces fallback** (same hook): always-present "Search traces for "<query>"" → opens the
  Search page with `?q=<query>`.

### File map

| Concern | File |
| --- | --- |
| cmdk UI primitives | `packages/ui/src/components/command/command.tsx` |
| Provider + registry + global modals | `apps/web/src/components/command-palette/command-palette-provider.tsx` |
| Palette UI, page stack, React filtering | `apps/web/src/components/command-palette/command-palette.tsx` |
| Command types | `apps/web/src/components/command-palette/types.ts` |
| Current-project resolver | `apps/web/src/components/command-palette/commands/use-current-project.ts` |
| Navigation commands | `apps/web/src/components/command-palette/commands/use-navigation-commands.ts` |
| Project-switch commands | `apps/web/src/components/command-palette/commands/use-project-commands.tsx` |
| Global actions | `apps/web/src/components/command-palette/commands/use-global-commands.tsx` |
| Issue search | `apps/web/src/components/command-palette/commands/use-issue-search-commands.ts` |
| Dataset / saved-search / traces fallback | `apps/web/src/components/command-palette/commands/use-project-search-commands.ts` |
| Shared project sections (source of truth) | `apps/web/src/domains/projects/project-sections.ts` |
| Mount point + header button | `apps/web/src/routes/_authenticated.tsx` |

## Maintaining the palette

**Whenever you add a navigable page, a global action, an entity action, or a searchable
entity, it must also be reflected in the palette.** Use the matching case below.

### 1. New project section or settings page → edit one shared file

Project sections and settings pages are defined once in
`apps/web/src/domains/projects/project-sections.ts` (`PROJECT_SECTIONS`,
`PROJECT_SETTINGS_GROUPS`, `PROJECT_SETTINGS_SECTION`). The **project sidebar**, the
**settings sub-nav**, and the **palette navigation** all consume it via
`useVisibleProjectSections` / `useVisibleProjectSettingsGroups`.

To add a section/settings page: add an entry with `{ key, label, icon, path(slug), flag? }`
(use `flag` for feature-gating, e.g. `"monitors"` / `"slack"`). It then appears in the
sidebar, the settings sub-nav, **and** the palette automatically — no palette-specific change.
Do **not** hardcode a new nav command in the palette; that would duplicate the source of truth.

### 2. New global action → `use-global-commands.tsx`

Add a `PaletteCommand` (or a `parent` for a drill-down) to the array in
`useGlobalCommands`. Reuse the existing handler the feature already uses. Respect the ordering
convention: switch/navigate before create; keep **Log out** last; gate admin-only actions on
the user role.

### 3. New contextual action (entity view or page) → `useRegisterCommands`

In the component that owns the context — an entity drawer (issue lifecycle toolbar, trace
detail body) **or** a route component for "current page" actions (Search/Traces pages) — build
a memoized `PaletteCommand[]` and call `useRegisterCommands(...)` from
`command-palette-provider.tsx`. Set `section: "context"` and a `group` label (`"Issue"`,
`"Trace"`, `"Search"`, `"Traces"`, …). Capture the entity id / page state and reuse the view's
existing handlers (open the same confirmation modal where one exists; flip the same state the
page's own buttons flip). Registration retracts automatically when the view/page unmounts.
References: `issue-lifecycle-actions.tsx`, `trace-detail-drawer.tsx`, and the `search/index.tsx`
/ project `index.tsx` page registrations.

### 4. New searchable entity type → new provider hook + wire it in

1. Add a hook under `commands/` returning `PaletteCommand[]` (and an `isLoading` if it does
   async work). Gate it on `useCurrentProject()` + a non-empty query so it doesn't fetch when
   idle (add an `enabled` option to the underlying list/collection hook if needed).
2. Decide filtering: client-side lists rely on the palette's `commandMatches` (don't
   pre-filter); server-ranked/semantic results should be pre-curated in the hook and rendered
   as-is (the palette doesn't re-filter `issueResults`).
3. Call the hook in `command-palette.tsx` and add a labelled group to the `groups` builder in
   the desired position.

### Gotchas

- **Never rely on cmdk's built-in filter / `keywords` for query-driven rows.** The palette
  filters in React (`shouldFilter={false}`); see "Filtering happens in React".
- **Resolve the current project with `useCurrentProject()`**, not by matching the projects
  collection on the URL slug.
- **Unique `id`s.** `id` doubles as the cmdk `value`; namespace per-entity ids (e.g.
  `trace:${traceId}:copy-id`) so two mounted views can't collide.
- **knip runs in the pre-commit hook.** Only `export` symbols that are imported elsewhere;
  keep internal helpers/types unexported.
- **z-index.** The palette dialog sits at `z-[80]`, above the combobox/popover/tooltip layers.
- **Contributors read the stable actions context only.** `useRegisterCommands` uses
  `useCommandPalette()` (stable); never wire a contributor to `useCommandPaletteState()`, or a
  registration will re-render it and (with an unstable `commands` array) loop. A perfectly
  memoized `commands` array isn't required for correctness thanks to this split, but stable
  deps still avoid needless re-registration churn.
