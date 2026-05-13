import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type { WrappedReportRecord } from "@domain/spans"
import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import { TITLE_FOR_KIND, WRAPPED_COLORS } from "../../../routes/cc-wrapped/-components/v1/personality-copy.ts"
import { getOgFonts } from "./fonts.ts"

const OG_WIDTH = 1200
const OG_HEIGHT = 630

/**
 * Server-side OG card renderer.
 *
 * 1200×630 cream card. Left column: the archetype PNG (read from disk,
 * inlined as base64 so Satori doesn't have to do its own image fetch).
 * Right column: eyebrow + giant archetype title + owner-name subtitle +
 * accent divider + a single-line headline-numbers strip.
 *
 * No project name anywhere by design — the report identifies via the
 * owner's name only.
 */

const personalityImageCache = new Map<string, string>()

const readPersonalityImageAsDataUrl = async (kind: string): Promise<string> => {
  const cached = personalityImageCache.get(kind)
  if (cached) return cached
  // The personality PNGs live under `apps/web/public/email-branding/...`.
  // This module is at `apps/web/src/domains/cc-wrapped/og/`, so the file is
  // four directories up from here.
  const path = fileURLToPath(
    new URL(`../../../../public/email-branding/claude-code-wrapped/personalities/${kind}.png`, import.meta.url),
  )
  const buf = await readFile(path)
  const dataUrl = `data:image/png;base64,${buf.toString("base64")}`
  personalityImageCache.set(kind, dataUrl)
  return dataUrl
}

const formatCompact = (n: number): string => n.toLocaleString("en-US")

export const renderWrappedOgImage = async (record: WrappedReportRecord): Promise<Buffer> => {
  const [{ regular, semibold }, imageDataUrl] = await Promise.all([
    getOgFonts(),
    readPersonalityImageAsDataUrl(record.report.personality.kind),
  ])

  const archetype = TITLE_FOR_KIND[record.report.personality.kind] ?? "The Wrapped"
  const stats = [
    `${formatCompact(record.report.loc.written)} lines`,
    `${formatCompact(record.report.totals.sessions)} sessions`,
    `${formatCompact(record.report.totals.commandsRun)} commands`,
  ].join(" · ")

  const svg = await satori(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        backgroundColor: WRAPPED_COLORS.cream,
        fontFamily: "Source Serif 4",
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
            fontSize: 18,
            letterSpacing: 4,
            color: WRAPPED_COLORS.muted,
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          Claude Code Wrapped
        </div>
        <div
          style={{
            fontSize: 92,
            fontWeight: 600,
            color: WRAPPED_COLORS.ink,
            lineHeight: 1,
          }}
        >
          {archetype}
        </div>
        <div
          style={{
            fontSize: 30,
            color: WRAPPED_COLORS.muted,
            marginTop: 22,
          }}
        >
          {`${record.ownerName}'s week`}
        </div>
        <div
          style={{
            width: 96,
            height: 4,
            backgroundColor: WRAPPED_COLORS.accent,
            marginTop: 32,
            marginBottom: 32,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            fontSize: 24,
            color: WRAPPED_COLORS.ink,
          }}
        >
          {stats}
        </div>
      </div>
    </div>,
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: [
        { name: "Source Serif 4", data: regular, weight: 400, style: "normal" },
        { name: "Source Serif 4", data: semibold, weight: 600, style: "normal" },
      ],
    },
  )

  return new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng()
}
