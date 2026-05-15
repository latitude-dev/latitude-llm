import { WRAPPED_COLORS } from "./personality-copy.ts"

const { muted: MUTED } = WRAPPED_COLORS

/**
 * Inline marker for sections of the Wrapped page that aren't shared with
 * public viewers. Renders next to a section title as a small muted pill.
 *
 *   <h2>Top workspaces <PrivateSectionPill /></h2>
 *
 * Only displayed in the member view of `WrappedReportV1` — members see
 * which sections will stay private if they share the page. The actual
 * content gating happens server-side in `getWrappedPageData`.
 */
export function PrivateSectionPill() {
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 align-middle rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
      style={{
        backgroundColor: "#E8E4D8",
        color: MUTED,
        fontFamily: "Georgia, serif",
      }}
    >
      <svg width="9" height="11" viewBox="0 0 9 11" fill="none" aria-hidden="true">
        <path
          d="M2 5V3.5a2.5 2.5 0 1 1 5 0V5"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
        />
        <rect x="1" y="5" width="7" height="5" rx="1" fill="currentColor" />
      </svg>
      Private
    </span>
  )
}
