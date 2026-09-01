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

## Typography, Colour, And Surfaces

Use `Text` from `@repo/ui` for text content and its established type hierarchy. Use `Text.Mono` only for code, IDs, paths, timestamps, raw tokens, and short operational identifiers. Do not introduce a different font or custom type scale in route code.

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

Design complete states, not only the happy path. Account for loading, empty, error, permission-limited, disabled, long-content, and destructive-action states where relevant. An empty state explains what is absent, why it matters, and the next available action without becoming a marketing panel.

Use semantic controls and native behavior through `@repo/ui`. Keep visible labels for inputs, keyboard access, focus treatment, meaningful icon labels, and readable contrast in light and dark themes. Never communicate a critical state only through colour, position, hover, or an icon.

## Before You Finish

Review the implementation in context, at desktop and narrow widths, and compare it to adjacent Latitude screens.

- Does it reuse the closest existing components and tokens?
- Is the main user task obvious before secondary detail?
- Is there a clear primary action for the active scope and no competing primary actions?
- Are spacing, typography, surfaces, and icon treatment consistent with nearby UI?
- Does the chosen route, modal, or drawer match the task's size and need for context?
- Are loading, empty, error, disabled, and destructive states handled where applicable?
- Is the change legible and usable with keyboard navigation and in both themes?

If the answer to any of these is no, correct the structure or reuse the existing pattern before adding polish.
