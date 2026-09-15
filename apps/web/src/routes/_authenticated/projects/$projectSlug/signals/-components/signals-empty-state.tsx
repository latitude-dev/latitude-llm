import { ExternalLinkIcon, PlusIcon, SearchAlert } from "lucide-react"
import { BlankSlate } from "../../../../../../components/blank-slate.tsx"

export function SignalsEmptyState({
  isLoading = false,
  onCreate,
}: {
  readonly isLoading?: boolean
  readonly onCreate?: () => void
}) {
  return (
    <BlankSlate
      icon={SearchAlert}
      title={isLoading ? "Loading signals" : "No signals yet"}
      description={
        isLoading
          ? "Preparing your signals view."
          : "Latitude finds signals automatically by grouping failed annotations on your traces. Start annotating traces and recurring problems will show up here."
      }
      actions={
        isLoading
          ? []
          : [
              ...(onCreate ? [{ label: "New signal", icon: PlusIcon, onClick: onCreate }] : []),
              { label: "Read the docs", icon: ExternalLinkIcon, href: "https://docs.latitude.so/signals/overview" },
            ]
      }
    />
  )
}
