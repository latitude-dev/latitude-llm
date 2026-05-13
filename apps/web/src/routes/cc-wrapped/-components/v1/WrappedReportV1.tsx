import type { WrappedReportRecord } from "@domain/spans"

/**
 * V1 web renderer for the public Claude Code Wrapped page. Mirrors the data
 * shape of the V1 email but renders for the full-page web context: real
 * responsive layout, no email-table fallbacks. Step 8 will plug in the
 * interactive heatmap, moments, and workspace deep dives. Step 7 ships a
 * minimal "it loads" surface — hero + headline numbers + LOC headline +
 * personality reveal.
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

const TITLE_FOR_KIND: Record<string, string> = {
  surgeon: "The Surgeon",
  architect: "The Architect",
  detective: "The Detective",
  conductor: "The Conductor",
  strategist: "The Strategist",
  scholar: "The Scholar",
  consultant: "The Consultant",
  shipper: "The Shipper",
  tester: "The Tester",
}

const DESCRIPTOR_FOR_KIND: Record<string, string> = {
  surgeon: "You changed code with sub-line precision.",
  architect: "You started from a blank page more than most.",
  detective: "You read and searched before you wrote.",
  conductor: "You ran the orchestra from the terminal.",
  strategist: "You planned twice, coded once.",
  scholar: "You sent Claude to the library.",
  consultant: "You dropped in, asked, and moved on.",
  shipper: "You closed the loop, again and again.",
  tester: "You don't trust it until it's green.",
}

const CREAM = "#F0EEE6"
const ACCENT = "#D97555"
const INK = "#1A1A1A"
const MUTED = "#6E6A5E"

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
          .map((line) => (
            <li key={line}>{line}</li>
          ))}
      </ul>
    </section>
  )
}

export function WrappedReportV1({ record }: WrappedReportV1Props) {
  const { report, ownerName } = record
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
        <LocHeadline loc={report.loc} />
        <PersonalityReveal personality={report.personality} />
        <footer className="mt-8 text-center text-xs" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
          Generated by Latitude · Claude Code Wrapped
        </footer>
      </div>
    </main>
  )
}
