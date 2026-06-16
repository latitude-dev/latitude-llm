import { BellPlusIcon, RadarIcon } from "lucide-react"
import { BlankSlate } from "../../../../../../components/blank-slate.tsx"

export function MonitorsEmptyState({ onCreate }: { readonly onCreate: () => void }) {
  return (
    <BlankSlate
      icon={RadarIcon}
      title="No monitors yet"
      description="Monitors watch your saved searches and your issues. Create one from any search on the Traces page, or right here."
      action={{ label: "New monitor", icon: BellPlusIcon, onClick: onCreate }}
      docsHref="https://docs.latitude.so/monitors/overview"
    />
  )
}
