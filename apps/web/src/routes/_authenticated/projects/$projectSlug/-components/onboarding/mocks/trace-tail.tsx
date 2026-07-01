import { showNewMessage } from "@intercom/messenger-js-sdk"
import { Alert, Icon, Skeleton, Text, useToast } from "@repo/ui"
import { Check, Headset } from "lucide-react"
import { useSupportEnabled } from "../../../../../-route-data.ts"

const TOTAL_ROWS = 4

const ONBOARDING_SETUP_HELP_MESSAGE = "Hi, I need help with setting up Latitude in my project ASAP!"

export function TraceTail({ traceReceived }: { readonly traceReceived: boolean }) {
  const skeletonCount = traceReceived ? TOTAL_ROWS - 1 : TOTAL_ROWS

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text.H5M>{traceReceived ? "Your first trace just arrived" : "Waiting for your first trace…"}</Text.H5M>
        <Text.H6 color="foregroundMuted">
          {traceReceived
            ? "Latitude is now monitoring your project. More will appear as your app runs."
            : "We're polling for incoming traces. Send a request from your app to see them appear here."}
        </Text.H6>
      </div>

      <div className="flex w-full flex-col gap-2">
        {traceReceived ? <ConfirmedTraceRow /> : null}
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <SkeletonTraceRow key={i} />
        ))}
      </div>
    </div>
  )
}

export function TelemetryHelpAlert() {
  const supportEnabled = useSupportEnabled()
  const { toast } = useToast()

  const openSupportChat = () => {
    if (!supportEnabled) {
      toast({ variant: "destructive", description: "Support chat isn't available in this environment." })
      return
    }
    showNewMessage(ONBOARDING_SETUP_HELP_MESSAGE)
  }

  return (
    <Alert
      showIcon={false}
      spacing="xsmall"
      className="rounded-lg shadow-none"
      title={
        <span className="flex items-center gap-2">
          <Icon icon={Headset} size="sm" color="accentForeground" weight="L" />
          Need help with setting up?
        </span>
      }
      description={
        <>
          <button
            type="button"
            className="font-semibold underline underline-offset-2 hover:opacity-80"
            onClick={openSupportChat}
          >
            Click here
          </button>{" "}
          and we'll come back to you to help you install Latitude in your project
        </>
      }
    />
  )
}

function ConfirmedTraceRow() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-card p-3 shadow-sm ring-1 ring-primary/20 animate-in fade-in-0 zoom-in-95 duration-300">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
        <Check className="h-4 w-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text.H5M>chat.completion</Text.H5M>
        <Text.H6 color="foregroundMuted">gpt-4o-mini · 1.2s · 247 tokens</Text.H6>
      </div>
      <Text.H6 color="foregroundMuted" className="shrink-0">
        just now
      </Text.H6>
    </div>
  )
}

function SkeletonTraceRow() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/50 p-3">
      <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-3 w-12 shrink-0" />
    </div>
  )
}
