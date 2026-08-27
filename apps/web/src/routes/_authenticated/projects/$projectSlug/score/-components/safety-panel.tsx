import { cn, Icon, Status, Text, Tooltip } from "@repo/ui"
import { ShieldAlertIcon } from "lucide-react"
import type { SafetyCap } from "./agent-score-mock.ts"
import { DestinationLink } from "./destination-link.tsx"
import { dimensionAnchorId } from "./dimension-anchors.ts"
import { formatSessions, ROW_HOVER } from "./score-formatters.ts"

export function SafetyPanel({ safety, projectSlug }: { readonly safety: SafetyCap; readonly projectSlug: string }) {
  return (
    <div id={dimensionAnchorId("safety")} className="flex scroll-mt-14 flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex min-w-0 flex-row items-center gap-3">
        <div
          className={cn(
            "flex h-12 min-w-[68px] shrink-0 items-center justify-center rounded-md",
            safety.confirmedFailures > 0 ? "bg-rose-500/15 dark:bg-rose-500/20" : "bg-muted",
          )}
        >
          <Icon
            icon={ShieldAlertIcon}
            size="md"
            className={safety.confirmedFailures > 0 ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground"}
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-0.5">
          <div className="flex flex-row flex-wrap items-center gap-2">
            <Text.H4M>Safety</Text.H4M>
            <Status
              variant={safety.isBinding ? "destructive" : safety.confirmedFailures > 0 ? "warning" : "neutral"}
              label={safety.isBinding ? `Holding the score at ${safety.cap}` : `Ceiling ${safety.cap}`}
            />
          </div>
          <Text.H6 color="foregroundMuted">
            What the agent produced that it should not have. Someone attacking your agent is not the same as your agent
            giving in, and only the second one counts.
          </Text.H6>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className={cn("flex min-w-0 flex-row items-center gap-3 rounded-md p-2 transition-colors", ROW_HOVER)}>
          <Text.H5 className="min-w-0 flex-1">
            {safety.confirmedFailures === 0
              ? "Nothing confirmed in the sessions we checked"
              : `${safety.confirmedFailures} confirmed PII leak${safety.confirmedFailures === 1 ? "" : "s"} in ${formatSessions(safety.classifiedSessions)} checked sessions`}
          </Text.H5>
          <Text.H6 color="foregroundMuted" noWrap>
            {`${Math.round(safety.classifiedShare * 100)}% of sessions checked`}
          </Text.H6>
          <DestinationLink projectSlug={projectSlug} destination={{ label: "Signals", section: "signals" }} />
        </div>
        <div className={cn("flex min-w-0 flex-row items-center gap-3 rounded-md p-2 transition-colors", ROW_HOVER)}>
          <Text.H5 className="min-w-0 flex-1">
            {`${formatSessions(safety.exposureCount)} jailbreak or NSFW attempt${safety.exposureCount === 1 ? "" : "s"} came in`}
          </Text.H5>
          <Tooltip
            asChild
            trigger={
              <span className="inline-flex shrink-0 cursor-default">
                <Text.H6 color="foregroundMuted" noWrap>
                  never scored
                </Text.H6>
              </span>
            }
          >
            An attempt only tells you somebody tried. The count above is what your agent actually gave away.
          </Tooltip>
          <DestinationLink projectSlug={projectSlug} destination={{ label: "Signals", section: "signals" }} />
        </div>
        <Text.H6 color="foregroundMuted">
          {`${safety.rateTestNote} You will not see a safety percentage here: these detectors read a 10% sample, so there is no honest denominator.`}
        </Text.H6>
      </div>
    </div>
  )
}
