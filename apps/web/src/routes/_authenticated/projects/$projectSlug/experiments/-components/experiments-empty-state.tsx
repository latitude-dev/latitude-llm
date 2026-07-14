import { FlaskConical, PlusIcon } from "lucide-react"
import { BlankSlate } from "../../../../../../components/blank-slate.tsx"

export function ExperimentsEmptyState({ onCreate }: { readonly onCreate: () => void }) {
  return (
    <BlankSlate
      icon={FlaskConical}
      title="No experiments yet"
      description="Experiments compare sessions, users, tools, signals, and behaviours across variants of filters, search queries and time ranges."
      action={{ label: "New experiment", icon: PlusIcon, onClick: onCreate }}
      docsHref="https://docs.latitude.so/experiments/overview"
    />
  )
}
