import { show as showIntercom } from "@intercom/messenger-js-sdk"
import { Button, Icon, Text } from "@repo/ui"
import { ExternalLinkIcon, MessagesSquareIcon } from "lucide-react"

export function SessionsOrphanFragmentsBlankSlate({ onShowAllSessions }: { readonly onShowAllSessions: () => void }) {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={MessagesSquareIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>Sessions lack LLM activity</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            Latitude received telemetry for this project, but none of the sessions in this time range include an LLM
            call (no tokens or model recorded). Review your instrumentation so LLM spans are captured correctly, or
            contact support if you think this is wrong.
          </Text.H5>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" onClick={onShowAllSessions}>
            Show all sessions
          </Button>
          <a href="https://docs.latitude.so/telemetry/start-tracing" target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <Icon size="sm" icon={ExternalLinkIcon} />
              Read the docs
            </Button>
          </a>
          <Button variant="outline" onClick={() => showIntercom()}>
            Contact support
          </Button>
        </div>
      </div>
    </div>
  )
}
