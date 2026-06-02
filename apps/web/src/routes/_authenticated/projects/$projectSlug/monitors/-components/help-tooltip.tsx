import { Icon, Tooltip } from "@repo/ui"
import { InfoIcon } from "lucide-react"
import type { ReactNode } from "react"

/** Small info-icon tooltip used next to alert-form field labels. */
export function HelpTooltip({ children }: { readonly children: ReactNode }) {
  return (
    <Tooltip
      trigger={
        <span className="inline-flex cursor-help">
          <Icon icon={InfoIcon} size="xs" color="foregroundMuted" />
        </span>
      }
    >
      {children}
    </Tooltip>
  )
}
