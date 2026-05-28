import { Link, Section } from "@react-email/components"
// biome-ignore lint/style/useImportType: React is required at runtime for JSX in workers (tsx/esbuild classic transform). Do not downgrade to `import type`.
import React from "react"

/**
 * Promotional banner pointing at the 41st.latitude.so merch drop. Gated by
 * the `wrapped-merch-promo` feature flag — see the dispatcher in
 * `../index.tsx`.
 *
 * Visually departs from the warm-cream Claude-themed sections above on
 * purpose: matches the 41st landing page's pale-blue + cobalt + black
 * aesthetic so the reader's eye registers it as a separate "offer" surface
 * rather than another piece of the recap narrative.
 */

const PROMO_URL = "https://41st.latitude.so/?utm_source=wrapped_email&utm_medium=email&utm_campaign=merch_41st#howto"

const monoStack = '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
const sansStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

const colors = {
  bandBg: "#EEF2FB",
  cardBg: "#FFFFFF",
  ink: "#0F1115",
  muted: "#5A6275",
  accent: "#2D5BFF",
  cta: "#000000",
  ctaText: "#FFFFFF",
  hairline: "#D7DEEC",
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: monoStack,
  fontSize: "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: colors.accent,
  margin: 0,
}

const headlineStyle: React.CSSProperties = {
  fontFamily: sansStack,
  fontSize: "22px",
  lineHeight: "28px",
  fontWeight: 600,
  color: colors.ink,
  margin: "10px 0 0 0",
}

const bodyStyle: React.CSSProperties = {
  fontFamily: sansStack,
  fontSize: "14px",
  lineHeight: "20px",
  color: colors.muted,
  margin: "8px 0 0 0",
}

const ctaStyle: React.CSSProperties = {
  display: "inline-block",
  fontFamily: sansStack,
  fontSize: "13px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: colors.ctaText,
  backgroundColor: colors.cta,
  padding: "12px 22px",
  textDecoration: "none",
  marginTop: "18px",
}

const ribbonStyle: React.CSSProperties = {
  fontFamily: monoStack,
  fontSize: "10px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: colors.muted,
  margin: 0,
}

const ribbonStrongStyle: React.CSSProperties = {
  color: colors.ink,
  fontWeight: 600,
}

const ribbonAccentStyle: React.CSSProperties = {
  color: colors.accent,
  fontWeight: 600,
}

export function MerchPromoBanner() {
  return (
    <Section
      style={{
        marginTop: "32px",
        backgroundColor: colors.bandBg,
        padding: "28px 24px",
      }}
    >
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        width="100%"
        style={{ borderCollapse: "separate" }}
      >
        <tbody>
          <tr>
            <td align="center" style={{ paddingBottom: "16px" }}>
              <p style={ribbonStyle}>
                <span style={ribbonAccentStyle}>{"DROP 001 · FREE"}</span>
                {"  ·  "}
                <span style={ribbonStrongStyle}>{"5 tees · 5 winners"}</span>
                {"  ·  worldwide shipping"}
              </p>
            </td>
          </tr>
          <tr>
            <td
              align="center"
              style={{
                backgroundColor: colors.cardBg,
                border: `1px solid ${colors.hairline}`,
                padding: "28px 24px",
                textAlign: "center",
              }}
            >
              <p style={eyebrowStyle}>{"// HOW TO WIN · 3 STEPS"}</p>
              <p style={headlineStyle}>{"Share your Wrapped on X · win free Latitude merch"}</p>
              <p style={bodyStyle}>
                {"Post this week's Wrapped on X and tag "}
                <span style={{ color: colors.accent, fontWeight: 600 }}>@trylatitude</span>
                {". Top 5 posts each week get a free tee, DM'd by us, shipped worldwide."}
              </p>
              <Link href={PROMO_URL} style={ctaStyle}>
                {"› Start now"}
              </Link>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}
