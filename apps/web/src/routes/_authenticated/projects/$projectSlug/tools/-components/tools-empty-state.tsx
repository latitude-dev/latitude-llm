import { ExternalLinkIcon, WrenchIcon } from "lucide-react"
import { BlankSlate } from "../../../../../../components/blank-slate.tsx"

export function ToolsEmptyState({ isLoading = false }: { readonly isLoading?: boolean }) {
  return (
    <BlankSlate
      icon={WrenchIcon}
      title={isLoading ? "Loading tools" : "No tools detected yet"}
      description={
        isLoading
          ? "Preparing your tools view."
          : "Tools appear automatically when your traces include tool definitions on LLM spans or tool-call spans."
      }
      actions={
        isLoading
          ? []
          : [{ label: "Read the docs", icon: ExternalLinkIcon, href: "https://docs.latitude.so/observability/tools" }]
      }
    />
  )
}
