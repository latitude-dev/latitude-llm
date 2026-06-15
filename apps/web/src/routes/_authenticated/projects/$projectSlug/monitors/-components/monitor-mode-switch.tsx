import { cn } from "@repo/ui"

export type MonitorCreateMode = "recommended" | "advanced"

export function MonitorModeSwitch({
  mode,
  onModeChange,
}: {
  readonly mode: MonitorCreateMode
  readonly onModeChange: (mode: MonitorCreateMode) => void
}) {
  return (
    <div className="flex rounded-lg bg-muted p-1">
      {(["recommended", "advanced"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onModeChange(option)}
          className={cn("flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors", {
            "bg-background text-foreground shadow-sm": mode === option,
            "text-muted-foreground hover:text-foreground": mode !== option,
          })}
        >
          {option === "recommended" ? "Recommended" : "Advanced"}
        </button>
      ))}
    </div>
  )
}
