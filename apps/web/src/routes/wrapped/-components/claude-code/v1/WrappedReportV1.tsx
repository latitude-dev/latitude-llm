import type { WrappedReportRecord } from "@domain/spans"
import { InteractiveHeatmap } from "./InteractiveHeatmap.tsx"
import { MomentsRow } from "./MomentsRow.tsx"
import { DESCRIPTOR_FOR_KIND, TITLE_FOR_KIND, WRAPPED_COLORS } from "./personality-copy.ts"
import { ShareSection } from "./ShareSection.tsx"
import { WorkspaceDeepDiveSection } from "./WorkspaceDeepDiveSection.tsx"

/**
 * V1 web renderer for the public Claude Code Wrapped page. Mirrors the data
 * shape of the V1 email but renders for the full-page web context: real
 * responsive layout, no email-table fallbacks, interactive heatmap with
 * per-cell tooltips, plus the full workspace deep dives that the email
 * teaser drops.
 *
 * Frozen-in-amber when V2 ships — old persisted reports keep rendering with
 * this component via the dispatch at the route level.
 */

interface WrappedReportV1Props {
  readonly record: WrappedReportRecord
}

const RANGE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

const formatRange = (start: Date, end: Date): string => `${RANGE_FMT.format(start)} – ${RANGE_FMT.format(end)}`

const formatCompact = (n: number): string => n.toLocaleString("en-US")

const formatDuration = (ms: number): string => {
  if (ms <= 0) return "0m"
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

const { cream: CREAM, accent: ACCENT, ink: INK, muted: MUTED } = WRAPPED_COLORS

function Hero({
  ownerName,
  projectName,
  start,
  end,
}: {
  ownerName: string
  projectName: string
  start: Date
  end: Date
}) {
  return (
    <section className="text-center">
      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
        Claude Code Wrapped
      </p>
      <h1 className="mt-3 text-3xl sm:text-5xl" style={{ fontFamily: "Georgia, serif", color: INK, lineHeight: 1.1 }}>
        {`${ownerName}'s Claude Code week`}
      </h1>
      <p className="mt-3 text-base sm:text-lg" style={{ fontFamily: "Georgia, serif", color: MUTED }}>
        {`${projectName} · ${formatRange(start, end)} (UTC)`}
      </p>
    </section>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl px-4 py-5 text-center" style={{ backgroundColor: "#E8E4D8" }}>
      <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
        {label}
      </p>
      <p className="text-2xl sm:text-3xl" style={{ color: INK, fontFamily: "Georgia, serif", fontWeight: 500 }}>
        {value}
      </p>
    </div>
  )
}

function HeadlineNumbers({ totals }: { totals: WrappedReportRecord["report"]["totals"] }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Sessions" value={formatCompact(totals.sessions)} />
      <StatCard label="Claude time" value={formatDuration(totals.durationMs)} />
      <StatCard label="Files touched" value={formatCompact(totals.filesTouched)} />
      <StatCard label="Commands" value={formatCompact(totals.commandsRun)} />
    </section>
  )
}

function BreadthStrip({ totals }: { totals: WrappedReportRecord["report"]["totals"] }) {
  const parts: string[] = []
  if (totals.workspaces > 0) parts.push(`${formatCompact(totals.workspaces)} workspaces`)
  if (totals.branches > 0) parts.push(`${formatCompact(totals.branches)} branches`)
  if (totals.commits > 0) parts.push(`${formatCompact(totals.commits)} commits`)
  if (totals.repos > 0) parts.push(`${formatCompact(totals.repos)} repos`)

  const sub: string[] = []
  if (totals.streakDays > 0) sub.push(`${totals.streakDays}-day streak`)
  if (totals.testsRun > 0) sub.push(`${formatCompact(totals.testsRun)} test run${totals.testsRun === 1 ? "" : "s"}`)

  if (parts.length === 0 && sub.length === 0) return null
  return (
    <section className="text-center">
      {parts.length > 0 ? (
        <p className="text-sm" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
          {parts.join(" · ")}
        </p>
      ) : null}
      {sub.length > 0 ? (
        <p className="mt-1 text-sm" style={{ color: ACCENT, fontFamily: "Georgia, serif" }}>
          {sub.join(" · ")}
        </p>
      ) : null}
    </section>
  )
}

function LocHeadline({ loc }: { loc: WrappedReportRecord["report"]["loc"] }) {
  if (loc.written <= 0) return null
  return (
    <section className="text-center">
      <p className="text-xs uppercase tracking-[0.14em]" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
        Lines written
      </p>
      <p className="mt-2 text-5xl sm:text-6xl" style={{ color: INK, fontFamily: "Georgia, serif", fontWeight: 500 }}>
        {formatCompact(loc.written)}
      </p>
      {loc.writtenAnchor.emphasis ? (
        <>
          <p className="mt-3 text-sm italic" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
            {loc.writtenAnchor.prefix}
          </p>
          <p
            className="mt-1 text-2xl sm:text-3xl"
            style={{ color: ACCENT, fontFamily: "Georgia, serif", fontWeight: 500 }}
          >
            {loc.writtenAnchor.emphasis}
          </p>
        </>
      ) : null}
      {loc.added > 0 || loc.removed > 0 ? (
        <p className="mt-4 text-sm" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
          <span style={{ color: ACCENT }}>{`+${formatCompact(loc.added)}`}</span>
          {" / "}
          <span>{`−${formatCompact(loc.removed)}`}</span>
          {" across edits"}
        </p>
      ) : null}
    </section>
  )
}

function ReadWriteRatio({ loc }: { loc: WrappedReportRecord["report"]["loc"] }) {
  if (loc.written <= 0 || loc.read <= 0) return null
  const ratio = loc.read / loc.written
  const ratioText = ratio >= 10 ? Math.round(ratio).toString() : ratio.toFixed(1)
  return (
    <section className="text-center">
      <p className="mx-auto max-w-md text-lg sm:text-xl" style={{ color: INK, fontFamily: "Georgia, serif" }}>
        {"For every line you wrote, Claude read "}
        <span style={{ color: ACCENT, fontWeight: 600 }}>{ratioText}</span>.
      </p>
      {loc.readAnchor.emphasis ? (
        <p className="mt-2 text-sm italic" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
          {`${formatCompact(loc.read)} lines read — ${loc.readAnchor.prefix} ${loc.readAnchor.emphasis}`}
        </p>
      ) : null}
    </section>
  )
}

function TopBashCommand({ command }: { command: WrappedReportRecord["report"]["topBashCommand"] }) {
  if (!command) return null
  return (
    <section className="text-center">
      <p className="text-lg sm:text-xl" style={{ color: INK, fontFamily: "Georgia, serif" }}>
        {"Your favorite command: "}
        <span
          className="mx-1 rounded-md px-2 py-0.5 font-mono text-base"
          style={{ backgroundColor: "#E8E4D8", color: ACCENT }}
        >
          {command.pattern}
        </span>
        {` — ${formatCompact(command.count)} run${command.count === 1 ? "" : "s"}.`}
      </p>
    </section>
  )
}

function HeatmapSection({ heatmap }: { heatmap: WrappedReportRecord["report"]["heatmap"] }) {
  const hasActivity = heatmap.some((row) => row.some((cell) => cell > 0))
  if (!hasActivity) return null
  return (
    <section>
      <h2
        className="text-center text-2xl sm:text-3xl"
        style={{ fontFamily: "Georgia, serif", color: INK, fontWeight: 500 }}
      >
        Your week, hour by hour
      </h2>
      <p className="mt-2 text-center text-sm" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
        Hover any cell for the exact count. Times are UTC.
      </p>
      <div className="mt-6 flex justify-center">
        <InteractiveHeatmap heatmap={heatmap} />
      </div>
    </section>
  )
}

function WorkspaceSections({
  deepDives,
  otherCount,
}: {
  deepDives: WrappedReportRecord["report"]["workspaceDeepDives"]
  otherCount: number
}) {
  if (deepDives.length === 0) return null
  return (
    <section className="space-y-10">
      {deepDives.map((ws) => (
        <WorkspaceDeepDiveSection key={ws.name} workspace={ws} />
      ))}
      {otherCount > 0 ? (
        <p className="text-xs" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
          {`You also touched ${otherCount} other workspace${otherCount === 1 ? "" : "s"}.`}
        </p>
      ) : null}
    </section>
  )
}

function PersonalityReveal({ personality }: { personality: WrappedReportRecord["report"]["personality"] }) {
  const title = TITLE_FOR_KIND[personality.kind] ?? "The Wrapped"
  const descriptor = DESCRIPTOR_FOR_KIND[personality.kind] ?? ""
  return (
    <section className="rounded-2xl px-6 py-10 text-center" style={{ backgroundColor: ACCENT, color: "#fff" }}>
      <p
        className="text-[11px] uppercase tracking-[0.2em]"
        style={{ color: "rgba(255,255,255,0.8)", fontFamily: "Georgia, serif" }}
      >
        Your archetype
      </p>
      <img
        src={`/email-branding/claude-code-wrapped/personalities/${personality.kind}.png`}
        alt={title}
        width={160}
        height={160}
        className="mx-auto mt-4 mb-4 block"
      />
      <h2 className="text-3xl sm:text-4xl" style={{ fontFamily: "Georgia, serif" }}>
        {title}
      </h2>
      <p
        className="mx-auto mt-2 max-w-md text-base sm:text-lg"
        style={{ fontFamily: "Georgia, serif", color: "rgba(255,255,255,0.92)" }}
      >
        {descriptor}
      </p>
      <ul
        className="mx-auto mt-5 max-w-md space-y-1 text-sm"
        style={{ fontFamily: "Georgia, serif", color: "rgba(255,255,255,0.95)" }}
      >
        {personality.evidence
          .filter((line) => line.trim().length > 0)
          .map((line, idx) => (
            // Evidence lines are a fixed-order, non-reorderable list, and
            // can plausibly repeat — compound `idx-line` so duplicates
            // don't collide on the React key.
            <li key={`${idx}-${line}`}>{line}</li>
          ))}
      </ul>
    </section>
  )
}

export function WrappedReportV1({ record }: WrappedReportV1Props) {
  const { report, ownerName } = record
  const archetypeTitle = TITLE_FOR_KIND[report.personality.kind] ?? "The Wrapped"
  return (
    <main className="min-h-screen" style={{ backgroundColor: CREAM }}>
      <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-12 sm:py-20">
        <Hero
          ownerName={ownerName}
          projectName={report.project.name}
          start={report.window.start}
          end={report.window.end}
        />
        <HeadlineNumbers totals={report.totals} />
        <BreadthStrip totals={report.totals} />
        <LocHeadline loc={report.loc} />
        <ReadWriteRatio loc={report.loc} />
        <HeatmapSection heatmap={report.heatmap} />
        <MomentsRow moments={report.moments} />
        <TopBashCommand command={report.topBashCommand} />
        <WorkspaceSections deepDives={report.workspaceDeepDives} otherCount={report.otherWorkspaceCount} />
        <PersonalityReveal personality={report.personality} />
        <ShareSection personalityKind={report.personality.kind} archetypeTitle={archetypeTitle} />
        <p className="text-center text-sm" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
          <a
            href="https://docs.latitude.so/telemetry/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:no-underline"
          >
            How is this generated? Set up your own →
          </a>
        </p>
        <footer className="mt-8 text-center text-xs" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
          Generated by Latitude · Claude Code Wrapped
        </footer>
      </div>
    </main>
  )
}
