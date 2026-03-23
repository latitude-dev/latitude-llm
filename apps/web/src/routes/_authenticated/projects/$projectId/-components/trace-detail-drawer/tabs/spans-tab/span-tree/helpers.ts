export const ROW_HEIGHT = 32
export const INDENT_PX = 16
export const MIN_TREE_WIDTH = 180
export const MIN_WATERFALL_WIDTH = 120
export const DEFAULT_TREE_FRACTION = 0.5
export const MINIMIZED_MAX_HEIGHT = 192

export function statusBarColor(statusCode: string): string {
  switch (statusCode) {
    case "error":
      return "bg-destructive"
    case "ok":
      return "bg-primary"
    default:
      return "bg-muted-foreground/40"
  }
}

export function statusTextColor(statusCode: string): "foregroundMuted" | "destructive" {
  return statusCode === "error" ? "destructive" : "foregroundMuted"
}
