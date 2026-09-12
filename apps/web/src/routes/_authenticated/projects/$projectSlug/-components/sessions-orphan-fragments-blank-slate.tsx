import { show as showIntercom } from "@intercom/messenger-js-sdk"
import { ExternalLinkIcon, MessagesSquareIcon } from "lucide-react"
import { BlankSlate } from "../../../../../components/blank-slate.tsx"

export function SessionsOrphanFragmentsBlankSlate({ onShowAllSessions }: { readonly onShowAllSessions: () => void }) {
  return (
    <BlankSlate
      icon={MessagesSquareIcon}
      title="Sessions lack LLM activity"
      description="Latitude received telemetry for this project, but none of the sessions in this time range include an LLM call (no tokens or model recorded). Review your instrumentation so LLM spans are captured correctly, or contact support if you think this is wrong."
      actions={[
        { label: "Show all sessions", onClick: onShowAllSessions, variant: "outline" },
        {
          label: "Read the docs",
          icon: ExternalLinkIcon,
          href: "https://docs.latitude.so/telemetry/start-tracing",
          variant: "outline",
        },
        { label: "Contact support", onClick: () => showIntercom(), variant: "outline" },
      ]}
    />
  )
}
