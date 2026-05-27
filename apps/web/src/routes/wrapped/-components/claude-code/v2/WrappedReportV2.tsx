import type { PersonalityKind, ReportV2, WrappedReportRecord } from "@domain/spans"
import type { LeaderboardData } from "../../../../../domains/wrapped/wrapped.functions.ts"
import { Route } from "../../../$id.tsx"
import { GenerateYourOwnCTA } from "../v1/GenerateYourOwnCTA.tsx"
import { MomentsRow } from "../v1/MomentsRow.tsx"
import { PrivateSectionSeparator } from "../v1/PrivateSectionSeparator.tsx"
import { TITLE_FOR_KIND, WRAPPED_COLORS } from "../v1/personality-copy.ts"
import { ShareSection } from "../v1/ShareSection.tsx"
import {
  BreadthStrip,
  formatCompact,
  formatDuration,
  HeatmapSection,
  Hero,
  PersonalityReveal,
  ReadWriteRatio,
  SHARE_DISCLAIMER,
  TopBashCommand,
  WorkspaceSections,
} from "../v1/WrappedReportV1.tsx"

interface WrappedReportV2Props {
  readonly record: WrappedReportRecord
  readonly isMember: boolean
}

// ─── Delta utilities ─────────────────────────────────────────────────────────

type DeltaResult =
  | { readonly kind: "same" }
  | { readonly kind: "up"; readonly percent: number }
  | { readonly kind: "down"; readonly percent: number }
  | { readonly kind: "none" }

const computeDelta = (current: number, previous: number | null): DeltaResult => {
  if (previous === null) return { kind: "none" }
  if (previous === 0) return { kind: "none" }
  const ratio = (current - previous) / previous
  if (Math.abs(ratio) < 0.01) return { kind: "same" }
  return { kind: ratio > 0 ? "up" : "down", percent: Math.round(Math.abs(ratio) * 100) }
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const { cream: CREAM, accent: ACCENT, ink: INK, muted: MUTED } = WRAPPED_COLORS
const DELTA_UP = "#16a34a" // green-600
const DELTA_DOWN = "#dc2626" // red-600

// ─── Stat card with optional delta ───────────────────────────────────────────

function StatCard({
  label,
  value,
  delta,
}: {
  readonly label: string
  readonly value: string
  readonly delta?: DeltaResult
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl px-4 py-5 text-center" style={{ backgroundColor: "#E8E4D8" }}>
      <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
        {label}
      </p>
      <p className="text-2xl sm:text-3xl" style={{ color: INK, fontFamily: "Georgia, serif", fontWeight: 500 }}>
        {value}
      </p>
      {delta && delta.kind !== "none" ? (
        <p
          className="text-xs"
          style={{
            fontFamily: "Georgia, serif",
            color: delta.kind === "up" ? DELTA_UP : delta.kind === "down" ? DELTA_DOWN : MUTED,
          }}
        >
          {delta.kind === "same" ? "= same" : `${delta.kind === "up" ? "▲" : "▼"} ${delta.percent}%`}
        </p>
      ) : null}
    </div>
  )
}

// ─── Headline numbers (4 cards, tokens live in their own hero section) ───────

function HeadlineNumbers({
  totals,
  lastReport,
}: {
  readonly totals: ReportV2["totals"]
  readonly lastReport: ReportV2["lastReport"]
}) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Sessions"
        value={formatCompact(totals.sessions)}
        delta={computeDelta(totals.sessions, lastReport.sessions)}
      />
      <StatCard
        label="Claude time"
        value={formatDuration(totals.durationMs)}
        delta={computeDelta(totals.durationMs, lastReport.durationMs)}
      />
      <StatCard
        label="Files touched"
        value={formatCompact(totals.filesTouched)}
        delta={computeDelta(totals.filesTouched, lastReport.filesTouched)}
      />
      <StatCard label="Commands" value={formatCompact(totals.commandsRun)} />
    </section>
  )
}

// ─── Token headline — hero number + WoW delta + leaderboard ──────────────────

const leaderboardText = (lb: LeaderboardData): string =>
  lb.rank <= 10 ? `#${lb.rank} this week` : `top ${Math.ceil((lb.rank / lb.total) * 100)}% this week`

function TokenHeadline({
  totals,
  lastReport,
  leaderboard,
}: {
  readonly totals: ReportV2["totals"]
  readonly lastReport: ReportV2["lastReport"]
  readonly leaderboard: LeaderboardData | null
}) {
  const delta = computeDelta(totals.tokensTotal, lastReport.tokensTotal)
  return (
    <section className="rounded-2xl px-6 py-10 text-center sm:px-10 sm:py-14" style={{ backgroundColor: "#E8E4D8" }}>
      <p className="text-xs uppercase tracking-[0.14em]" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
        Total tokens
      </p>
      <p className="mt-2 text-5xl sm:text-6xl" style={{ color: INK, fontFamily: "Georgia, serif", fontWeight: 500 }}>
        {formatCompact(totals.tokensTotal)}
      </p>
      {delta.kind !== "none" ? (
        <p
          className="mt-1 text-sm"
          style={{
            fontFamily: "Georgia, serif",
            color: delta.kind === "up" ? DELTA_UP : delta.kind === "down" ? DELTA_DOWN : MUTED,
          }}
        >
          {delta.kind === "same"
            ? "= same as last week"
            : `${delta.percent}% ${delta.kind === "up" ? "more" : "less"} than last week`}
        </p>
      ) : null}
      {leaderboard !== null ? (
        <p
          className="mt-2 text-2xl sm:text-3xl"
          style={{ color: ACCENT, fontFamily: "Georgia, serif", fontWeight: 500 }}
        >
          {leaderboardText(leaderboard)}
        </p>
      ) : null}
    </section>
  )
}

// ─── LOC headline with WoW delta ─────────────────────────────────────────────

function LocHeadline({
  loc,
  lastReport,
}: {
  readonly loc: ReportV2["loc"]
  readonly lastReport: ReportV2["lastReport"]
}) {
  if (loc.written <= 0) return null
  const delta = computeDelta(loc.written, lastReport.locWritten)
  return (
    <section className="text-center">
      <p className="text-xs uppercase tracking-[0.14em]" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
        Lines written
      </p>
      <p className="mt-2 text-5xl sm:text-6xl" style={{ color: INK, fontFamily: "Georgia, serif", fontWeight: 500 }}>
        {formatCompact(loc.written)}
      </p>
      {delta.kind !== "none" ? (
        <p
          className="mt-1 text-sm"
          style={{
            fontFamily: "Georgia, serif",
            color: delta.kind === "up" ? DELTA_UP : delta.kind === "down" ? DELTA_DOWN : MUTED,
          }}
        >
          {delta.kind === "same"
            ? "= same as last week"
            : `${delta.percent}% ${delta.kind === "up" ? "more" : "less"} than last week`}
        </p>
      ) : null}
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

// ─── Main V2 renderer ────────────────────────────────────────────────────────

export function WrappedReportV2({ record, isMember }: WrappedReportV2Props) {
  // The dispatcher only routes here when reportVersion === 2; cast is safe.
  const report = record.report as ReportV2
  const archetypeTitle = TITLE_FOR_KIND[report.personality.kind as PersonalityKind] ?? "The Wrapped"
  const { leaderboard } = Route.useLoaderData()
  return (
    <main className="min-h-screen" style={{ backgroundColor: CREAM }}>
      <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-12 sm:py-20">
        <Hero
          ownerName={record.ownerName}
          projectName={report.project.name}
          start={report.window.start}
          end={report.window.end}
        />
        <HeadlineNumbers totals={report.totals} lastReport={report.lastReport} />
        <BreadthStrip totals={report.totals} />
        <TokenHeadline totals={report.totals} lastReport={report.lastReport} leaderboard={leaderboard} />
        <LocHeadline loc={report.loc} lastReport={report.lastReport} />
        <ReadWriteRatio loc={report.loc} />

        <HeatmapSection heatmap={report.heatmap} />
        <MomentsRow moments={report.moments} isMember={isMember} />

        <PersonalityReveal personality={report.personality} />

        {isMember ? (
          <>
            <ShareSection
              personalityKind={report.personality.kind}
              archetypeTitle={archetypeTitle}
              disclaimer={SHARE_DISCLAIMER}
            />
            <PrivateSectionSeparator />
            <TopBashCommand command={report.topBashCommand} />
            <WorkspaceSections deepDives={report.workspaceDeepDives} otherCount={report.otherWorkspaceCount} />
          </>
        ) : (
          <GenerateYourOwnCTA />
        )}

        <footer className="mt-8 text-center text-xs" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
          Generated by Latitude · Claude Code Wrapped
        </footer>
      </div>
    </main>
  )
}
