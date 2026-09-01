# Latitude UI design guide

Use this guide for every user-facing UI change in `apps/web`. Read it before designing or editing UI, alongside the relevant repository skill. It defines how new work stays coherent with the existing Latitude console.

This is a product UI guide, not a license to restyle the app. Preserve the established visual language. Prefer a small, well-integrated change over a novel composition.

## Priorities

When requirements compete, protect them in this order:

1. Preserve the user's task, supplied facts, permissions, and product behavior.
2. Reuse the existing `@repo/ui` components, tokens, layouts, and route patterns.
3. Make the main task, current state, and next action immediately clear.
4. Keep hierarchy, density, spacing, and action treatment consistent with adjacent console UI.
5. Improve visual detail only when it does not compete with the first four priorities.

Do not invent a new visual system, component family, token scale, icon treatment, font, or interaction pattern for one feature.

## Start With Discovery

Before writing JSX or classes:

1. Read the relevant route and its adjacent `-components/` directory.
2. Search `packages/ui/src/components/`, `packages/ui/src/tokens/`, and `apps/design-system/src/routes/` for an existing primitive or example.
3. Search `apps/web/src/routes/` for the closest existing interaction, especially for forms, tables, empty states, menus, drawers, and modals.
4. Reuse the closest established pattern. Match its structure before changing its styling.

`@repo/ui` is the source of truth for reusable UI. The live component inventory is `apps/design-system` and is published at `design.latitude.so`. Use Tailwind only to compose existing primitives and make route-local layout adjustments. Do not hardcode a colour, font, radius, shadow, z-index, control height, or arbitrary spacing value when an existing token, utility, or component already provides it.

Create or extend a `@repo/ui` component only when a search shows that no existing component can express a pattern that will be reused across more than one feature. A one-off visual difference is not enough. When adding a public component, add its design-system example in the same change.

## Design The Task, Not A Dashboard

Identify the reader's job before choosing a layout: what are they trying to understand, decide, create, edit, or recover from? The first visible region should make that job, its current state, and its most likely next action clear.

Let information architecture follow the task:

- A listing leads with the collection, filters, and the action that creates or imports an item.
- A detail view leads with identity, status, and the information or action needed most often.
- A form leads with the decision being made, then the inputs needed to make it.
- A settings page groups related controls under clear section titles rather than turning every field into a separate panel.
- A data-heavy page gives comparison and lookup enough width. Do not squeeze a meaningful table into a narrow rail to preserve decorative side content.

Use hierarchy, order, alignment, and whitespace before adding borders, cards, colour, or icons. Every section should answer a different user question. Remove duplicated summaries and repeated calls to action.

Avoid generated-design reflexes:

- **Card soup:** wrapping each metric, field, paragraph, or action in its own card. Use a surface only for a real boundary, selection, or independently actionable group.
- **Dashboard-by-default:** turning a focused workflow into a row of generic stats, charts, and cards that do not help the user complete the task.
- **Decoration as hierarchy:** gradients, glows, floating blobs, ornamental illustrations, novelty animations, or colour blocks used to compensate for weak structure.
- **Equal-weight UI:** making every section, button, number, and panel equally prominent. Let importance change scale, placement, density, or contrast.
- **Invented primitives:** recreating a component, token, or interaction already available in `@repo/ui`.
- **Tiny-muted rescue text:** shrinking copy or reducing contrast to fit an overcrowded layout. Reorder, split, simplify, or give the content room instead.
- **Border echo:** putting rounded, bordered cards inside a rounded, bordered section when neither boundary has a distinct job. A parent group and every child must not use the same visual treatment.
- **Run-on hierarchy:** placing a title, status, metric, and description next to one another until they read as one sentence. Stack distinct information roles; do not rely on typography alone to create separation.

## Layout And Spacing

The console should feel compact, calm, and intentional. It is an observability product: show information efficiently without making the page crowded or visually noisy.

Use the existing page shells and nearby routes as the default reference for page padding, maximum widths, sidebars, headers, and responsive behavior. Align sibling sections, labels, values, and actions to common edges. Give every gap one owner: a parent stack, grid, form wrapper, or component controls its children’s rhythm. Do not layer unrelated `mt-*`, `mb-*`, and `gap-*` adjustments until a layout happens to look right.

Use spacing to express relationships:

- Keep a heading close to the text, form, table, or controls it introduces.
- Keep labels close to their fields and help or validation messages.
- Give groups of related controls a consistent internal gap.
- Use a visibly larger separation only when moving to a new task or section.
- Prefer rebalancing a grid or stacking content over leaving a large, accidental empty region.

Use responsive layout to preserve reading and interaction, not just to fit every desktop column onto a smaller screen. Stack when labels, values, filters, or actions can no longer be scanned reliably. Preserve touch targets and do not hide the only label behind an icon on small screens.

## Containers And Surface Hierarchy

Every visible boundary needs a job. Before adding a border, identify whether it marks a page region, a related group, a selectable item, an input, a state change, or an interaction. If it cannot answer one of those, use whitespace and alignment instead.

Use at most one strong container treatment for a given level of information:

- A page region can be flat on the canvas, or it can use one distinct surface.
- Inside a surfaced region, use a grid, stack, or `divide-y` list by default. Do not give every child the same rounded border as its parent.
- A clickable row is still a row, not a card. Navigation, a hover state, or a trailing action alone does not justify a nested border; use a separator and interaction state instead.
- Give a nested item its own surface only when it contains a genuinely separate task, independent persistent object, or dense interaction that cannot be scanned as a row.
- When a section needs grouping but not separation, prefer a subtle background difference before adding a border. Use borders as a precise edge, not as the default way to make content look designed.
- Do not combine `rounded-* border bg-*` at the page, section, and item levels by default. Remove the least meaningful boundary first. In most overview pages, the canvas, a section surface, and a selected or exceptional item are the maximum useful surface levels.

For repeated rows, make the row structure do the work: consistent padding, aligned columns, and separators are usually clearer than a collection of mini-cards. Reserve larger radii and full outlines for an actual panel, dialog, popover, empty state, or selected item.

### Page Headers

Keep page headers lightweight. A header or welcome region orients the user; it does not normally need to become a card.

- Default to a flat header on the page canvas: title, concise context when needed, and actions aligned by layout and spacing. Do not wrap a standard page title, description, badge, and buttons in `Card`, `rounded-* border`, or a background surface.
- Let the first content region establish the first meaningful boundary. This keeps the page from starting with a large, empty rectangle before any work begins.
- A surfaced header is an exception for a product-specific state that needs containment, such as onboarding progress, an urgent project-wide warning, or a dense persistent control set. Reuse an existing V2 pattern and be able to name the state that the surface communicates.
- Do not use a header card simply to make a page look finished. If the header feels too empty, improve the title, context, action placement, or the first content block rather than adding a border.

## Typography, Colour, And Surfaces

Use `Text` from `@repo/ui` for text content and its established type hierarchy. Use `Text.Mono` only for code, IDs, paths, timestamps, raw tokens, and short operational identifiers. Do not introduce a different font or custom type scale in route code.

Treat text styles as roles, not decoration. A heading names a region; a row title identifies an item; a value reports data; a description adds context. Do not use a large heading style for a short status such as "Healthy" or "Watching" merely to make a card feel important.

- Build title, value, status, and supporting copy as a vertical stack unless they are intentionally a compact inline pair, such as a label and a badge.
- `Text` primitives can render inline. When a text role must start a new line, put it in a flex/grid stack or use the component's block display option. Inspect the rendered result: words from separate roles must never run together.
- In project routes, `-components/section-header.tsx` `SectionHeader` is the single route-level header, as used by the Behaviors page inside `Layout.Header`. Use it once to identify the page or route context; do not reuse it inside summary panels, cards, analytics blocks, or sidebars.
- By default, project overview page headers use the standard `SectionHeader` variant, exactly like the Behaviors page. Use `variant="xl"` only when the task needs a different hierarchy and a comparable existing route establishes that pattern. A page title alone is not a reason to choose the larger variant; preserve the familiar Behaviors-size title whenever possible.
- Supporting block labels are low hierarchy. Use the existing muted small-label treatment (`Text.H6` with `foregroundMuted`) rather than a large, bold, black heading. If a block needs a short description, stack it below that muted label with the same low hierarchy; do not use `SectionHeader` to create a mini page header.
- In JSX, text roles that must appear on separate lines must be direct children of a `flex flex-col` or grid stack. Never place a `Text` title and `Text` description as consecutive children of an unstructured `div`; they will render as a run-on line.
- Keep a section title close to its content. Add a section description only when it changes how the user reads or acts on that content; do not use a sentence to restate the heading.
- In repeated panels and rows, use one stable internal order. Do not alternate between title-status-description and title-description-status without a product reason.
- Use muted text for secondary context, not to hide a necessary distinction between a label, value, and status.

Write concise, sentence-case headings that describe the user's task or the information on screen. Prefer specific labels such as "Sampling rules" over generic labels such as "Configuration" when context permits. Do not use all-caps eyebrows, decorative section numbers, or marketing copy in product workflows.

## UI Copy And Help

Write UI copy for scanning. State the core concept, status, constraint, or next action in the fewest clear words. The interface should carry the workflow through structure and labels; descriptions should not narrate it back to the user.

- Use a description only when it changes the user's decision, explains a consequence, or resolves genuine ambiguity. Omit it when the title, label, and surrounding context already make the meaning clear.
- Keep descriptions and empty-state copy to one direct idea. Lead with the important fact or consequence, then add a second sentence only when it gives an actionable next step.
- Treat tooltips as optional clarification, not hidden documentation. Use one short sentence for an unfamiliar term, abbreviation, icon-only control, or non-obvious consequence. Do not repeat the visible label, explain a familiar control, or hide essential instructions in a tooltip.
- Prefer concrete words over qualifiers and filler. Say "Deletes all traces in this project" rather than "This action allows you to permanently remove your existing trace data."
- Name units, scope, and irreversible effects where they matter. Do not add background, implementation detail, or marketing language to routine controls.

If a description needs several sentences to be understood, simplify the workflow, regroup the controls, or move the task to a surface with room for proper guidance.

Use colour semantically and sparingly:

- Use the established primary treatment for the primary action.
- Use success, warning, and destructive colours only to communicate their corresponding state or consequence, and pair critical state with text or an icon.
- Do not use accent colour to make ordinary content feel important.
- Do not add gradients, coloured backgrounds, glows, or decorative shadows.

The default canvas is continuous. Add a card, border, separator, or background only when it expresses a boundary, selection, status, or interaction that whitespace and alignment cannot express. Avoid nested panels.

## Actions And Buttons

Every action belongs to a scope. A page, a section, a selected row, and a modal can each have one primary action, but do not let all of them compete at once.

- Use one primary `Button` (`default`) for the action that advances the current task. A page should normally have at most one visible primary action.
- Use `outline` for secondary, safe actions that remain important, including Cancel and Close when they sit beside a primary submit action.
- Use `ghost` for low-emphasis contextual actions where an adjacent label, row, or toolbar already establishes the action's meaning.
- Use `link` only when navigation should read as inline text rather than a control.
- Use destructive variants only for an immediately destructive action. Do not make a neutral warning or an undoable operation destructive.
- Prefer an existing overflow menu, row menu, or contextual action pattern for rare actions instead of placing a long row of competing buttons in the page header.

Use direct, verb-led labels: "Create monitor", "Save changes", "Delete project". Avoid vague labels such as "Submit", "Continue", and "Confirm" when the outcome can be named. Button labels, icon placement, loading state, and disabled behavior should match nearby examples.

## Forms, Modals, Drawers, And Navigation

Use the smallest surface that keeps the task understandable and recoverable.

- Use a route for a task that needs its own URL, deep linking, substantial information, sustained focus, multi-step work, or navigation context.
- Use a modal for a short, focused task that begins from the current context and can be completed or safely dismissed without losing that context: a rename, a compact create/edit form, a confirmation, or a constrained picker.
- Use a detail drawer when the user needs to inspect or act on an item while keeping a list, timeline, or comparison visible behind it.
- Do not put a full settings area, a complex editor, a long table, or a workflow with several independent sections inside a modal merely to avoid creating a route.

Default to the short `Modal` form from `@repo/ui`. It owns standard header, body, padding, scrolling, and footer behavior. Use `Modal.Root` composition only when the short form cannot express the content. A modal title names the action; its description explains an important consequence or constraint, not the obvious. Use `dismissible` only when abandoning the task is safe. Keep one clear submit action in the footer and preserve entered values and actionable validation errors when submission fails.

Use `FormWrapper`, `FormField`, and existing form examples. Show validation close to the field it concerns. Group fields by the decision they support, not by implementation type. Do not make every field required-looking when the task has a small required core and optional advanced controls.

## Data, States, And Accessibility

Choose the visual form that makes the data quickest to understand:

- Use tables for lookup, comparison, and dense records. Keep headers and values aligned, preserve units, and give the table enough width.
- Use a chart only when it reveals a relationship, trend, distribution, or threshold faster than aligned text or a table.
- Use existing chart, table, badge, status, skeleton, and empty-state components before adding custom visual treatment.

### Metrics And Numerical Data

Numbers are data, not body copy or decoration. Give each metric a clear, repeatable structure: **label, value, then context**. Keep these roles visually and spatially distinct.

- Put the metric label above or beside the value; use muted label text that names the measure and period, such as "Traces this week".
- Make the value the strongest element in its metric group. Keep comparable values at the same type scale, alignment, and precision. Use tabular or monospaced numerals only when comparison benefits from it and an existing pattern supports it.
- Put deltas, units, thresholds, and status on a separate supporting line or aligned metadata slot. Never concatenate a value, a status word, and an explanatory sentence into one text run.
- A badge can communicate state or a bounded delta; it is not a substitute for the metric label or the value. Keep status badges secondary to the number they qualify.
- Use one unit and timeframe per metric. Write the scope in the label or context rather than forcing readers to infer it from a nearby paragraph.
- For a project overview or analytics summary, metrics MUST use one compact horizontal strip, matching the `AggregationItem` composition in the existing users, tools, and sessions analytics panels. Keep every metric in one row with a shared secondary surface, `shrink-0` metric items, and horizontal overflow on narrow screens. Never use a responsive grid that wraps an overview metric strip onto a second row.
- Do not place a `Card`, rounded border, or separate background behind each metric in a summary strip. The strip owns the surface; metrics are aligned label-value pairs inside it.
- When multiple metrics need comparison outside a summary strip, use a shared table or aligned layout. Do not make a distinct card for every number unless each metric is independently actionable.
- Before creating a route-local metric component, search for an existing metric, stats strip, analytics panel, table summary, or comparable V2 view. Extract a shared primitive only after the pattern is needed in more than one product area.

Design complete states, not only the happy path. Account for loading, empty, error, permission-limited, disabled, long-content, and destructive-action states where relevant. An empty state explains what is absent, why it matters, and the next available action without becoming a marketing panel.

Use semantic controls and native behavior through `@repo/ui`. Keep visible labels for inputs, keyboard access, focus treatment, meaningful icon labels, and readable contrast in light and dark themes. Never communicate a critical state only through colour, position, hover, or an icon.

## Before You Finish

Review the implementation in context, at desktop and narrow widths, and compare it to adjacent Latitude screens.

- Does it reuse the closest existing components and tokens?
- Is the main user task obvious before secondary detail?
- Is there a clear primary action for the active scope and no competing primary actions?
- Are spacing, typography, surfaces, and icon treatment consistent with nearby UI?
- Does every container have a distinct purpose, with no repeated parent-and-child border treatment?
- Is the page header flat on the canvas unless a specific persistent state requires a surfaced header?
- Are clickable repeated items rendered as rows with separators and interaction states rather than cards inside a card?
- Is `SectionHeader` used once for the route-level header, following the closest route's variant, and never inside a summary panel?
- Are supporting block labels small and muted rather than large, bold display headings?
- Are labels, values, statuses, and descriptions in an explicit stack or inline layout, never rendered as a run-on text line?
- Do metrics use a consistent label-value-context order in one compact, non-wrapping strip rather than a grid of metric cards?
- Does the chosen route, modal, or drawer match the task's size and need for context?
- Are loading, empty, error, disabled, and destructive states handled where applicable?
- Is the change legible and usable with keyboard navigation and in both themes?

If the answer to any of these is no, correct the structure or reuse the existing pattern before adding polish.
