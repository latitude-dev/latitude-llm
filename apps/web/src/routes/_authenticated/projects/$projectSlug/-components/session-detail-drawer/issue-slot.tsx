import { SignalDetailBody } from "../../issues/-components/issue-detail-drawer.tsx"

/**
 * The issue slot reuses the standalone issue drawer's body (`SignalDetailBody`)
 * — same header, lifecycle actions, trend, evaluations, traces table, and
 * trace overlay — minus the `DetailDrawer` chrome and next/prev nav.
 *
 * Clicking a trace inside this slot opens the body's fixed-position overlay
 * on top of everything (same pattern as the standalone issues route), so
 * Escape returns the user to the issue panel, not to the session view.
 */
export function SignalSlot({ projectId, signalId }: { readonly projectId: string; readonly signalId: string }) {
  return <SignalDetailBody projectId={projectId} signalId={signalId} />
}
