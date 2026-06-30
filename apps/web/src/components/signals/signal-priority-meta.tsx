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

/** Manual issue triage priority. Mirrors `SIGNAL_PRIORITIES` in `@domain/signals`. */
export type SignalPriorityValue = "low" | "medium" | "high" | "urgent"

/** Priority bucket on the grouped issues list; `"none"` = `priority: null`. */
export type SignalPriorityGroupId = SignalPriorityValue | "none"

interface SignalPriorityMeta {
  readonly label: string
  readonly icon: LucideIcon
  readonly iconColor: NonNullable<ComponentProps<typeof Icon>["color"]>
}

/**
 * Single source for priority icons/labels/colors so the triage picker, the
 * list group headers, the palette commands, and the notification renderers
 * can't drift apart.
 */
export const SIGNAL_PRIORITY_META: Record<SignalPriorityGroupId, SignalPriorityMeta> = {
  urgent: { label: "Urgent", icon: TriangleAlertIcon, iconColor: "destructive" },
  high: { label: "High", icon: SignalHighIcon, iconColor: "warningForeground" },
  medium: { label: "Medium", icon: SignalMediumIcon, iconColor: "foreground" },
  low: { label: "Low", icon: SignalLowIcon, iconColor: "foregroundMuted" },
  none: { label: "No priority", icon: MinusIcon, iconColor: "foregroundMuted" },
}

/**
 * Fixed section order for the grouped issues list: most urgent first, "no
 * priority" last. Section order is independent of the selected sort (which
 * applies within each section). Mirrors `SIGNAL_PRIORITY_GROUPS` in
 * `@domain/signals`.
 */
export const SIGNAL_PRIORITY_GROUP_ORDER: readonly SignalPriorityGroupId[] = ["urgent", "high", "medium", "low", "none"]
