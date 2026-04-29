import type { ReactNode } from "react"
import { ActionRow, type ActionRowProps, ActionsSection } from "../actions-section/section.tsx"

/**
 * Collapsible "Account actions" panel for the user-detail dashboard.
 * Thin wrapper over the generic `<ActionsSection>` primitive that
 * pre-fills the user-side title and description copy. See
 * `actions-section/section.tsx` for the underlying shape.
 */
export function AccountActionsSection({ children }: { children: ReactNode }) {
  return (
    <ActionsSection
      title="Account actions"
      description="Mutations on this user — impersonation, role changes, email, sign-outs."
    >
      {children}
    </ActionsSection>
  )
}

/**
 * One row inside `<AccountActionsSection>`. Re-export of the generic
 * `<ActionRow>` so existing imports under `account-actions/` keep
 * working without churn.
 */
export type AccountActionRowProps = ActionRowProps
export { ActionRow as AccountActionRow }
