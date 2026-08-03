import { FlaskConical, PlusIcon } from "lucide-react"
import { BlankSlate } from "../../../../../../components/blank-slate.tsx"

export function ExperimentsEmptyState({ onCreate }: { readonly onCreate: () => void }) {
  return (
    <BlankSlate
      icon={FlaskConical}
      title="No experiments yet"
      description="Compare variants side by side, each with its own filters, search query, or time range. See how sessions, users, tools, signals, and behaviours differ across them."
      action={{ label: "New experiment", icon: PlusIcon, onClick: onCreate }}
      docsHref="https://docs.latitude.so/experiments/overview"
    />
  )
}
