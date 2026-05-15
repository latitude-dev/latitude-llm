import { WRAPPED_COLORS } from "./personality-copy.ts"

const { accent: ACCENT, muted: MUTED } = WRAPPED_COLORS

/**
 * Public-view climax CTA. Replaces the share button + "Set up your own"
 * link that the member view shows. Links to the Claude Code telemetry
 * docs page — the same destination the member-view "Set up your own"
 * link previously used.
 *
 * Styled to match the existing share button (orange accent, Georgia
 * serif) so the page's visual language stays consistent.
 */
export function GenerateYourOwnCTA() {
  return (
    <section className="text-center">
      <h2 className="text-2xl sm:text-3xl" style={{ fontFamily: "Georgia, serif", color: "#1A1A1A", fontWeight: 500 }}>
        Want your own?
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm sm:text-base" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
        Hook Claude Code up to Latitude and get a weekly Wrapped of your own.
      </p>
      <div className="mt-6 flex justify-center">
        <a
          href="https://docs.latitude.so/telemetry/claude-code"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-base transition-opacity"
          style={{
            backgroundColor: ACCENT,
            color: "#fff",
            fontFamily: "Georgia, serif",
            fontWeight: 500,
          }}
        >
          Generate your own Wrapped →
        </a>
      </div>
    </section>
  )
}
