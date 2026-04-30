import type { ReactNode } from "react"
import { ActionRow, type ActionRowProps, ActionsSection } from "../actions-section/section.tsx"

/**
 * Collapsible "Organization actions" panel for the org-detail dashboard.
 * Thin wrapper over the generic `<ActionsSection>` primitive that
 * pre-fills the org-side title and description copy. Mirror of
 * `<AccountActionsSection>`.
 */
export function OrganizationActionsSection({ children }: { children: ReactNode }) {
  return (
    <ActionsSection
      title="Organization actions"
      description="Mutations on this organization — demo project creation, future tenant operations."
    >
      {children}
    </ActionsSection>
  )
}

export type OrganizationActionRowProps = ActionRowProps
export { ActionRow as OrganizationActionRow }
