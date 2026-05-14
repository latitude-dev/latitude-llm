import { OrganizationId, ProjectId, type WrappedReportId } from "@domain/shared"
import type { Report } from "@domain/spans"
import { Img, Link, Section } from "@react-email/components"
// biome-ignore lint/style/useImportType: React is required at runtime for JSX in workers (tsx/esbuild classic transform). Do not downgrade to `import type`.
import React from "react"
import { EmailHeading } from "../../../../components/EmailHeading.tsx"
import { WrappedLayout } from "../../../../components/WrappedLayout.tsx"
import { emailDesignTokens } from "../../../../tokens/design-system.ts"
import { PersonalityCard } from "../-components/PersonalityCard.tsx"
import { StatCard } from "../-components/StatCard.tsx"

/**
 * V1 of the Claude Code Wrapped email.
 *
 * This template is intentionally a teaser, not the report itself: hero +
 * headline numbers + LOC headline + personality reveal + a prominent CTA
 * pointing at `${webAppUrl}/wrapped/${reportId}`. The heatmap, moments,
 * workspace deep-dives, and read/write ratio live on the web page now.
 *
 * Frozen-in-amber when V2 ships — old persisted reports will keep rendering
 * with this template via the version dispatch in `../index.tsx`.
 */

interface EmailTemplateV1Props {
  readonly userName: string
  readonly report: Report
  readonly webAppUrl: string
  readonly reportId: WrappedReportId
}

const DATE_RANGE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

const formatRange = (start: Date, end: Date): string =>
  `${DATE_RANGE_FMT.format(start)} – ${DATE_RANGE_FMT.format(end)}`

const formatDuration = (ms: number): string => {
  if (ms <= 0) return "0m"
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

const formatCompact = (n: number): string => n.toLocaleString("en-US")

const sectionStyle: React.CSSProperties = { marginTop: "32px" }

const bigNumberStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "44px",
  lineHeight: "52px",
  fontWeight: 500,
  color: emailDesignTokens.colors.claude.ink,
  margin: "8px 0 4px 0",
}

const anchorPrefixStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "14px",
  fontStyle: "italic",
  color: emailDesignTokens.colors.claude.mutedInk,
  margin: "12px 0 0 0",
}

const anchorEmphasisStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "26px",
  lineHeight: "32px",
  fontWeight: 500,
  color: emailDesignTokens.colors.claude.accent,
  margin: "2px 0 0 0",
}

function AnchorBlock({ anchor }: { anchor: Report["loc"]["writtenAnchor"] }) {
  if (!anchor.emphasis) return null
  return (
    <>
      {anchor.prefix ? <p style={anchorPrefixStyle}>{anchor.prefix}</p> : null}
      <p style={anchorEmphasisStyle}>{anchor.emphasis}</p>
    </>
  )
}

function HeroSection({ userName, report }: { userName: string; report: Report }) {
  return (
    <Section style={{ paddingTop: "16px", paddingBottom: "8px", textAlign: "center" }}>
      <EmailHeading variant="display">{`Hi ${userName}, your Claude Code week`}</EmailHeading>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "15px",
          color: emailDesignTokens.colors.claude.mutedInk,
          marginTop: "10px",
          marginBottom: 0,
        }}
      >
        {`${report.project.name} · ${formatRange(report.window.start, report.window.end)} (UTC)`}
      </p>
    </Section>
  )
}

function HeadlineNumbersGrid({ totals }: { totals: Report["totals"] }) {
  return (
    <Section style={sectionStyle}>
      <table
        cellPadding={0}
        cellSpacing={8}
        border={0}
        role="presentation"
        style={{ width: "100%", borderCollapse: "separate" }}
      >
        <tbody>
          <tr>
            <StatCard label="Sessions" value={formatCompact(totals.sessions)} />
            <StatCard label="Claude time" value={formatDuration(totals.durationMs)} />
            <StatCard label="Files touched" value={formatCompact(totals.filesTouched)} />
            <StatCard label="Commands" value={formatCompact(totals.commandsRun)} />
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

function LocSection({ loc }: { loc: Report["loc"] }) {
  if (loc.written <= 0) return null
  return (
    <Section style={{ ...sectionStyle, textAlign: "center" }}>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "13px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: emailDesignTokens.colors.claude.mutedInk,
          margin: 0,
        }}
      >
        Lines written
      </p>
      <p style={bigNumberStyle}>{formatCompact(loc.written)}</p>
      <AnchorBlock anchor={loc.writtenAnchor} />
    </Section>
  )
}

function PersonalityRevealSection({
  personality,
  imageBaseUrl,
}: {
  personality: Report["personality"]
  imageBaseUrl: string
}) {
  const [e1 = "", e2 = "", e3 = ""] = personality.evidence
  return (
    <Section style={sectionStyle}>
      <PersonalityCard kind={personality.kind} evidence={[e1, e2, e3]} imageBaseUrl={imageBaseUrl} />
    </Section>
  )
}

function CtaBanner({ url }: { url: string }) {
  return (
    <Section style={{ marginTop: "32px", textAlign: "center" }}>
      <Link
        href={url}
        style={{
          display: "inline-block",
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "16px",
          fontWeight: 500,
          color: emailDesignTokens.colors.claude.accentForegroundOnDark,
          backgroundColor: emailDesignTokens.colors.claude.accent,
          padding: "14px 28px",
          borderRadius: "8px",
          textDecoration: "none",
        }}
      >
        {"See your full week →"}
      </Link>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "12px",
          color: emailDesignTokens.colors.claude.mutedInk,
          margin: "10px 0 0 0",
        }}
      >
        Heatmap, workspaces, files, moments — the full story is on the web.
      </p>
    </Section>
  )
}

const footerLineStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "12px",
  lineHeight: "18px",
  color: emailDesignTokens.colors.claude.mutedInk,
  margin: 0,
  textAlign: "center",
}

const footerLinkStyle: React.CSSProperties = {
  color: emailDesignTokens.colors.claude.accent,
  textDecoration: "underline",
}

function WrappedFooter({
  projectName,
  projectUrl,
  settingsUrl,
  logoUrl,
  homeUrl,
}: {
  projectName: string
  projectUrl: string
  settingsUrl: string
  logoUrl: string
  homeUrl: string
}) {
  return (
    <>
      <p style={footerLineStyle}>
        {"Sent because you are tracking "}
        <Link href={projectUrl} style={footerLinkStyle}>
          {projectName}
        </Link>
        {"'s Claude Code activity with Latitude."}
      </p>
      <p style={{ ...footerLineStyle, marginTop: "4px" }}>
        <Link href={settingsUrl} style={{ ...footerLinkStyle, color: emailDesignTokens.colors.claude.mutedInk }}>
          Stop receiving these emails
        </Link>
      </p>
      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <Link href={homeUrl}>
          <Img src={logoUrl} alt="Latitude" width="120" height="22" style={{ display: "inline-block" }} />
        </Link>
        <p style={{ ...footerLineStyle, marginTop: "8px" }}>Latitude — the AI observability platform.</p>
      </div>
    </>
  )
}

export function ClaudeCodeWrappedEmailV1({ userName, report, webAppUrl, reportId }: EmailTemplateV1Props) {
  const base = webAppUrl.replace(/\/$/, "")
  const imageBaseUrl = `${base}/email-branding/claude-code-wrapped/personalities`
  const projectUrl = `${base}/projects/${report.project.slug}`
  const settingsUrl = `${base}/settings/account`
  const logoUrl = `${base}/latitude-logo.png`
  const fullReportUrl = `${base}/wrapped/${reportId}`

  return (
    <WrappedLayout
      previewText={`${userName}, your Claude Code week in ${report.project.name}`}
      footer={
        <WrappedFooter
          projectName={report.project.name}
          projectUrl={projectUrl}
          settingsUrl={settingsUrl}
          logoUrl={logoUrl}
          homeUrl={base}
        />
      }
    >
      <HeroSection userName={userName} report={report} />
      <HeadlineNumbersGrid totals={report.totals} />
      <LocSection loc={report.loc} />
      <PersonalityRevealSection personality={report.personality} imageBaseUrl={imageBaseUrl} />
      <CtaBanner url={fullReportUrl} />
    </WrappedLayout>
  )
}

ClaudeCodeWrappedEmailV1.PreviewProps = {
  userName: "Alex",
  webAppUrl: "http://localhost:3000",
  reportId: "ccwprv".padEnd(24, "x").slice(0, 24) as WrappedReportId,
  report: {
    project: { id: ProjectId("proj-preview"), name: "poncho-ios", slug: "poncho-ios" },
    organization: { id: OrganizationId("org-preview"), name: "Acme" },
    window: {
      start: new Date("2026-05-04T00:00:00.000Z"),
      end: new Date("2026-05-11T00:00:00.000Z"),
    },
    totals: {
      sessions: 17,
      toolCalls: 482,
      durationMs: 5 * 60 * 60 * 1000,
      filesTouched: 142,
      commandsRun: 87,
      workspaces: 1,
      branches: 4,
      commits: 23,
      repos: 1,
      streakDays: 5,
      testsRun: 32,
      gitWriteOps: 28,
    },
    toolMix: { bash: 87, read: 168, edit: 142, write: 21, search: 52, research: 4, plan: 12, other: 0 },
    loc: {
      written: 14_832,
      read: 184_200,
      added: 9_421,
      removed: 3_402,
      writtenAnchor: { prefix: "≈ 10% of", emphasis: "the Apollo 11 guidance code" },
      readAnchor: { prefix: "≈", emphasis: "a full-length novel" },
    },
    topBashCommand: { pattern: "pnpm", count: 32 },
    workspaceDeepDives: [],
    otherWorkspaceCount: 0,
    heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
    moments: { longestSession: null, busiestDay: null, biggestWrite: null },
    personality: {
      kind: "surgeon",
      score: 0.42,
      evidence: ["42% of your tool calls were Edits", "Touched 142 files this week", "21 Write calls on top"],
    },
  },
} satisfies EmailTemplateV1Props
