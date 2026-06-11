import type { Icon } from "@repo/ui"
import {
  type LucideIcon,
  MinusIcon,
  SignalHighIcon,
  SignalLowIcon,
  SignalMediumIcon,
  TriangleAlertIcon,
} from "lucide-react"
import type { ComponentProps } from "react"

/** Manual issue triage priority. Mirrors `ISSUE_PRIORITIES` in `@domain/issues`. */
export type IssuePriorityValue = "low" | "medium" | "high" | "urgent"

/** Priority bucket on the grouped issues list; `"none"` = `priority: null`. */
export type IssuePriorityGroupId = IssuePriorityValue | "none"

interface IssuePriorityMeta {
  readonly label: string
  readonly icon: LucideIcon
  readonly iconColor: NonNullable<ComponentProps<typeof Icon>["color"]>
}

/**
 * Single source for priority icons/labels/colors so the triage picker, the
 * list group headers, the palette commands, and the notification renderers
 * can't drift apart.
 */
export const ISSUE_PRIORITY_META: Record<IssuePriorityGroupId, IssuePriorityMeta> = {
  urgent: { label: "Urgent", icon: TriangleAlertIcon, iconColor: "destructive" },
  high: { label: "High", icon: SignalHighIcon, iconColor: "warningForeground" },
  medium: { label: "Medium", icon: SignalMediumIcon, iconColor: "foreground" },
  low: { label: "Low", icon: SignalLowIcon, iconColor: "foregroundMuted" },
  none: { label: "No priority", icon: MinusIcon, iconColor: "foregroundMuted" },
}
