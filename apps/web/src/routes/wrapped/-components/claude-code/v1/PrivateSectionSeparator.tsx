import { WRAPPED_COLORS } from "./personality-copy.ts"

const { muted: MUTED } = WRAPPED_COLORS

/**
 * Visual divider placed before the block of org-private sections in the
 * Wrapped member view (currently: `Your favorite command` and
 * `Top workspaces`). One signal that introduces the whole private zone
 * — clearer than per-section badges when the private sections are
 * adjacent.
 *
 * Renders as a centred label flanked by hairline rules, with a single
 * line of explanation underneath. No closing element: the next section
 * (the personality reveal) visually breaks the zone via its own bold
 * accent-coloured card.
 */
export function PrivateSectionSeparator() {
  return (
    <section className="text-center">
      <div className="mx-auto flex max-w-xl items-center gap-4">
        <div className="h-0.5 flex-1" style={{ backgroundColor: "#C9C2AE" }} />
        <span
          className="inline-flex items-center gap-2 text-sm sm:text-base uppercase tracking-[0.22em]"
          style={{ color: MUTED, fontFamily: "Georgia, serif" }}
        >
          <svg width="14" height="17" viewBox="0 0 9 11" fill="none" aria-hidden="true">
            <path
              d="M2 5V3.5a2.5 2.5 0 1 1 5 0V5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
            <rect x="1" y="5" width="7" height="5" rx="1" fill="currentColor" />
          </svg>
          Just for you
        </span>
        <div className="h-0.5 flex-1" style={{ backgroundColor: "#C9C2AE" }} />
      </div>
      <p className="mt-3 text-sm italic" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
        Only you can see this
      </p>
    </section>
  )
}
