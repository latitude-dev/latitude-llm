import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type { WrappedReportRecord } from "@domain/spans"
import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import {
  TITLE_FOR_KIND,
  WRAPPED_COLORS,
} from "../../../../routes/wrapped/-components/claude-code/v1/personality-copy.ts"
import { getOgFonts } from "../fonts.ts"

const OG_WIDTH = 1200
const OG_HEIGHT = 630

/**
 * Server-side OG card renderer.
 *
 * 1200×630 accent-orange card. Left column: the archetype PNG. Right
 * column (top-to-bottom): small "CLAUDE CODE WRAPPED" eyebrow → giant
 * archetype name → owner-name subtitle → a row of two stat columns
 * (Lines written, Sessions).
 *
 * Sized for the small-preview reality: OG cards render at ~250-550px
 * wide in Slack/Twitter/iMessage feeds (a 2-5× downscale of the 1200px
 * source), so anything below ~30px in the source becomes unreadable.
 * Stats numbers at 64px → ~25px at iMessage, ~50px at Slack, both
 * readable. Stat labels at 22px are smaller but contextually anchored
 * by the large number above them.
 *
 * Colours invert the page palette so the unfurl pops in a chat surface:
 * accent background, cream as the primary foreground (archetype, stat
 * numbers), a warm dark (black-ish cream) for the subordinate eyebrow /
 * subtitle / stat labels.
 *
 * No project name anywhere by design — the report identifies via the
 * owner's name only.
 */

// Warm dark tone used for the secondary text. Sits in the cream family
// (no pure black) so the inverted palette stays cohesive against the
// orange.
const BLACKISH_CREAM = "#2A2520"

const personalityImageCache = new Map<string, string>()

const readPersonalityImageAsDataUrl = async (kind: string): Promise<string> => {
  const cached = personalityImageCache.get(kind)
  if (cached) return cached
  // The personality PNGs live under `apps/web/public/email-branding/...`.
  // This module is at `apps/web/src/domains/wrapped/og/claude-code/`, so the
  // file is five directories up from here.
  const path = fileURLToPath(
    new URL(`../../../../../public/email-branding/claude-code-wrapped/personalities/${kind}.png`, import.meta.url),
  )
  const buf = await readFile(path)
  const dataUrl = `data:image/png;base64,${buf.toString("base64")}`
  personalityImageCache.set(kind, dataUrl)
  return dataUrl
}

export const renderClaudeCodeOgImage = async (record: WrappedReportRecord): Promise<Buffer> => {
  const [{ regular, semibold }, imageDataUrl] = await Promise.all([
    getOgFonts(),
    readPersonalityImageAsDataUrl(record.report.personality.kind),
  ])

  const archetype = TITLE_FOR_KIND[record.report.personality.kind] ?? "The Wrapped"
  const linesWritten = record.report.loc.written.toLocaleString("en-US")
  const sessions = record.report.totals.sessions.toLocaleString("en-US")

  const svg = await satori(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        backgroundColor: WRAPPED_COLORS.accent,
        fontFamily: "Source Serif Pro",
        padding: 60,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 420,
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img src={imageDataUrl} width={360} height={360} alt={archetype} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          paddingLeft: 40,
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 30,
            letterSpacing: 5,
            color: BLACKISH_CREAM,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          Claude Code Wrapped
        </div>
        <div
          style={{
            fontSize: 112,
            fontWeight: 600,
            color: WRAPPED_COLORS.cream,
            lineHeight: 1,
          }}
        >
          {archetype}
        </div>
        <div
          style={{
            fontSize: 50,
            color: BLACKISH_CREAM,
            marginTop: 28,
          }}
        >
          {`${record.ownerName}'s week`}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 60,
            marginTop: 44,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 600,
                color: WRAPPED_COLORS.cream,
                lineHeight: 1,
              }}
            >
              {linesWritten}
            </div>
            <div
              style={{
                fontSize: 22,
                color: BLACKISH_CREAM,
                marginTop: 8,
              }}
            >
              Lines written
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 600,
                color: WRAPPED_COLORS.cream,
                lineHeight: 1,
              }}
            >
              {sessions}
            </div>
            <div
              style={{
                fontSize: 22,
                color: BLACKISH_CREAM,
                marginTop: 8,
              }}
            >
              Sessions
            </div>
          </div>
        </div>
      </div>
    </div>,
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: [
        { name: "Source Serif Pro", data: regular, weight: 400, style: "normal" },
        { name: "Source Serif Pro", data: semibold, weight: 600, style: "normal" },
      ],
    },
  )

  return new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng()
}
