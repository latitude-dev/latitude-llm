import { Icon, Text } from "@repo/ui"
import { ChevronDownIcon, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Generic collapsible "actions" panel for the backoffice dashboards.
 *
 * Card-shaped like `DashboardSection`, but uses a native
 * `<details>` / `<summary>` so it gets keyboard-toggle accessibility
 * (Enter / Space on the summary expand / collapse) and the open state
 * survives SSR — no useState, no client-only flicker. The chevron
 * rotates via `group-open:rotate-180`.
 *
 * Collapsed by default because the read-only routine view of a record
 * (identity, memberships, sessions, members, projects) is what staff
 * are usually here for; opening the actions section is an explicit
 * "I'm about to mutate this record" gesture.
 *
 * Use the per-page wrappers (`<AccountActionsSection>`,
 * `<OrganizationActionsSection>`) rather than this primitive directly
 * — they pre-fill the title/description copy that staff have come to
 * recognise.
 */
export interface ActionsSectionProps {
  readonly title: ReactNode
  readonly description: ReactNode
  readonly children: ReactNode
}

export function ActionsSection({ title, description, children }: ActionsSectionProps) {
  return (
    <details className="group rounded-lg border border-border bg-background">
      <summary
        className={[
          "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3",
          // Suppress the default `<summary>` triangle marker — we
          // render our own chevron on the right so the section reads
          // like the rest of the dashboard cards.
          "[&::-webkit-details-marker]:hidden",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg",
        ].join(" ")}
      >
        <div className="flex flex-col min-w-0">
          <Text.H6 weight="semibold" noWrap>
            {title}
          </Text.H6>
          <Text.H6 color="foregroundMuted">{description}</Text.H6>
        </div>
        <Icon
          icon={ChevronDownIcon}
          size="sm"
          color="foregroundMuted"
          className="shrink-0 transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col border-t border-border">{children}</div>
    </details>
  )
}

/**
 * One row inside an actions section. Icon + title + description on the
 * left, action button on the right. Each row is its own divider
 * (`border-b last:border-b-0`) so the section visually reads as a
 * list of small cards stacked inside a container.
 */
export interface ActionRowProps {
  /** Lucide icon rendered in a subtle round on the left edge. */
  readonly icon: LucideIcon
  readonly title: ReactNode
  /** Single sentence explaining what the action does. Renders muted under the title. */
  readonly description: ReactNode
  /** The trigger — typically a `<Button>` paired with its own `<Modal>`. The row is purely visual; mutation state lives in the action component. */
  readonly action: ReactNode
}

export function ActionRow({ icon, title, description, action }: ActionRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon icon={icon} size="sm" color="foregroundMuted" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text.H5 weight="medium" ellipsis noWrap>
            {title}
          </Text.H5>
          <Text.H6 color="foregroundMuted">{description}</Text.H6>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}
