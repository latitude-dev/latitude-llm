import { Tabs } from "@repo/ui"

export type MonitorCreateMode = "recommended" | "advanced"

export function MonitorModeSwitch({
  mode,
  onModeChange,
}: {
  readonly mode: MonitorCreateMode
  readonly onModeChange: (mode: MonitorCreateMode) => void
}) {
  return (
    <Tabs
      variant="bordered"
      size="sm"
      options={[
        { id: "recommended", label: "Recommended" },
        { id: "advanced", label: "Advanced" },
      ]}
      active={mode}
      onSelect={(next) => onModeChange(next as MonitorCreateMode)}
    />
  )
}
