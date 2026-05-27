import { type WrappedReportId } from "@domain/shared"
import type { Report, ReportV2 } from "@domain/spans"
import { Img, Link, Section } from "@react-email/components"
// biome-ignore lint/style/useImportType: React is required at runtime for JSX in workers (tsx/esbuild classic transform). Do not downgrade to `import type`.
import React from "react"
import { EmailHeading } from "../../../../../components/EmailHeading.tsx"
import { WrappedLayout } from "../../../../../components/WrappedLayout.tsx"
import { emailDesignTokens } from "../../../../../tokens/design-system.ts"
import { PersonalityCard } from "../-components/PersonalityCard.tsx"
import { StatCard } from "../-components/StatCard.tsx"

/**
 * V2 of the Claude Code Wrapped email. Adds:
 *  - Total tokens stat card in the headline grid
 *  - Week-over-week delta captions on each headline stat and lines written
 *
 * Frozen-in-amber when V3 ships — old V2 reports keep rendering with this
 * template via the version dispatch in `../index.tsx`.
 */

interface EmailTemplateV2Props {
  readonly userName: string
  /**
   * Typed as `Report` to satisfy the shared template interface in the
   * dispatcher. The V2 renderer only receives this component when
   * `reportVersion === 2`, so the cast to `ReportV2` below is safe.
   */
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

type DeltaCaption = string | undefined

const deltaCaption = (current: number, previous: number | null): DeltaCaption => {
  if (previous === null || previous === 0) return undefined
  const ratio = (current - previous) / previous
  if (Math.abs(ratio) < 0.01) return "= same as last week"
  const sign = ratio > 0 ? "+" : "−"
  return `${sign}${Math.round(Math.abs(ratio) * 100)}% vs last week`
}

function AnchorBlock({ anchor }: { anchor: ReportV2["loc"]["writtenAnchor"] }) {
  if (!anchor.emphasis) return null
  return (
    <>
      {anchor.prefix ? <p style={anchorPrefixStyle}>{anchor.prefix}</p> : null}
      <p style={anchorEmphasisStyle}>{anchor.emphasis}</p>
    </>
  )
}

function HeroSection({ userName, report }: { userName: string; report: ReportV2 }) {
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

function HeadlineNumbersGrid({ report }: { report: ReportV2 }) {
  const { totals, lastReport } = report
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
            <StatCard
              label="Sessions"
              value={formatCompact(totals.sessions)}
              caption={deltaCaption(totals.sessions, lastReport.sessions)}
            />
            <StatCard
              label="Claude time"
              value={formatDuration(totals.durationMs)}
              caption={deltaCaption(totals.durationMs, lastReport.durationMs)}
            />
            <StatCard
              label="Files touched"
              value={formatCompact(totals.filesTouched)}
              caption={deltaCaption(totals.filesTouched, lastReport.filesTouched)}
            />
            <StatCard label="Commands" value={formatCompact(totals.commandsRun)} />
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

function TokenSection({ report }: { report: ReportV2 }) {
  const { totals, lastReport } = report
  const caption = deltaCaption(totals.tokensTotal, lastReport.tokensTotal)
  return (
    <Section
      style={{
        ...sectionStyle,
        textAlign: "center",
        backgroundColor: emailDesignTokens.colors.claude.creamDeep,
        borderRadius: "16px",
        padding: "40px 48px",
      }}
    >
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
        Total tokens
      </p>
      <p style={bigNumberStyle}>{formatCompact(totals.tokensTotal)}</p>
      {caption ? (
        <p
          style={{
            fontFamily: emailDesignTokens.fonts.serif,
            fontSize: "12px",
            color: emailDesignTokens.colors.claude.mutedInk,
            margin: "4px 0 0 0",
          }}
        >
          {caption}
        </p>
      ) : null}
    </Section>
  )
}

function LocSection({ report }: { report: ReportV2 }) {
  const { loc, lastReport } = report
  if (loc.written <= 0) return null
  const caption = deltaCaption(loc.written, lastReport.locWritten)
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
      {caption ? (
        <p
          style={{
            fontFamily: emailDesignTokens.fonts.serif,
            fontSize: "12px",
            fontStyle: "italic",
            color: emailDesignTokens.colors.claude.mutedInk,
            margin: "4px 0 0 0",
          }}
        >
          {caption}
        </p>
      ) : null}
      <AnchorBlock anchor={loc.writtenAnchor} />
    </Section>
  )
}

function PersonalityRevealSection({
  personality,
  imageBaseUrl,
}: {
  personality: ReportV2["personality"]
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

export function ClaudeCodeWrappedEmailV2({ userName, report: reportBase, webAppUrl, reportId }: EmailTemplateV2Props) {
  // Safe: dispatcher only routes here when reportVersion === 2.
  const report = reportBase as ReportV2
  const base = webAppUrl.replace(/\/$/, "")
  const imageBaseUrl = `${base}/email-branding/claude-code-wrapped/personalities`
  const projectUrl = `${base}/projects/${report.project.slug}`
  const settingsUrl = `${base}/settings/account?group=wrapped_reports`
  const logoUrl = `${base}/latitude-logo.png`
  const homeUrl = base
  const reportUrl = `${base}/wrapped/${reportId}`

  return (
    <WrappedLayout previewText={`Your Claude Code week: ${report.project.name}`}>
      <HeroSection userName={userName} report={report} />
      <HeadlineNumbersGrid report={report} />
      <TokenSection report={report} />
      <LocSection report={report} />
      <PersonalityRevealSection personality={report.personality} imageBaseUrl={imageBaseUrl} />
      <CtaBanner url={reportUrl} />
      <WrappedFooter
        projectName={report.project.name}
        projectUrl={projectUrl}
        settingsUrl={settingsUrl}
        logoUrl={logoUrl}
        homeUrl={homeUrl}
      />
    </WrappedLayout>
  )
}
