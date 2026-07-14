/** Horizontal inset for waterfall bars & time labels so bars don’t touch column edges (matches `px-3`). */
export const WATERFALL_H_INSET_PX = 12

export const ROW_HEIGHT = 32
export const INDENT_PX = 16
export const MIN_TREE_WIDTH = 180
export const MIN_WATERFALL_WIDTH = 120
export const DEFAULT_TREE_FRACTION = 0.5
export const MINIMIZED_MAX_HEIGHT = 192
export const KEYBOARD_STEP = 8
export const KEYBOARD_STEP_LARGE = 32

export function statusBarColor(statusCode: string, operation: string): string {
  if (statusCode === "error") return "bg-destructive"
  if (operation === "invoke_agent") return "bg-primary"
  if (operation === "chat") return "bg-primary/40"
  if (operation === "execute_tool") return "bg-success/40"
  return "bg-muted-foreground/40"
}

export function statusTextColor(statusCode: string): "foregroundMuted" | "destructive" {
  return statusCode === "error" ? "destructive" : "foregroundMuted"
}
