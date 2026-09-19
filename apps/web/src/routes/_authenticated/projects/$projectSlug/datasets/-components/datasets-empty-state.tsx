import { DatabaseAddIcon } from "@repo/ui"
import { DatabaseIcon, ExternalLinkIcon } from "lucide-react"
import { BlankSlate } from "../../../../../../components/blank-slate.tsx"

export function DatasetsEmptyState({
  onCreate,
  creating,
}: {
  readonly onCreate: () => void
  readonly creating: boolean
}) {
  return (
    <BlankSlate
      icon={DatabaseIcon}
      title="No datasets yet"
      description="Datasets let you curate traces for evaluation and regression testing."
      actions={[
        { label: "Dataset", icon: DatabaseAddIcon, onClick: onCreate, disabled: creating, isLoading: creating },
        { label: "Read the docs", icon: ExternalLinkIcon, href: "https://docs.latitude.so/evaluations/overview" },
      ]}
    />
  )
}
