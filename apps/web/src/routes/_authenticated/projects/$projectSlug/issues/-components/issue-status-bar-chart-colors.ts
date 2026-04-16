import type { ChartCssThemeColors } from "@repo/ui"

/**
 * Bar fills aligned with `Status` / `IssueLifecycleStatuses` lifecycle colors
 * (`status.tsx` dot tones: info=blue, warning=amber, destructive=rose, neutral=muted).
 */
export function issueOccurrenceBarColorForCategory(category: string, theme: ChartCssThemeColors): string {
  if (theme.isDark) {
    switch (category) {
      case "New":
        return "rgb(96 165 250)"
      case "Escalating":
        return "rgb(251 191 36)"
      case "Regressed":
        return "rgb(251 113 133)"
      case "Resolved":
        return theme.mutedForeground
      default:
        return theme.primary
    }
  }
  switch (category) {
    case "New":
      return "rgb(37 99 235)"
    case "Escalating":
      return "rgb(217 119 6)"
    case "Regressed":
      return "rgb(225 29 72)"
    case "Resolved":
      return theme.mutedForeground
    default:
      return theme.primary
  }
}
