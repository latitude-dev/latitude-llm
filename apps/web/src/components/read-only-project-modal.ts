/**
 * Bridge between the (non-React) mutation-error sink and the read-only modal.
 *
 * `handleMutationError` and the write-gate client middleware run outside React,
 * so they can't render the modal directly. They call {@link openReadOnlyProjectModal},
 * which dispatches a `window` CustomEvent; the {@link ReadOnlyProjectModal}
 * provider mounted at the app root listens for it and holds the open state.
 *
 * Kept in a plain `.ts` (no JSX) so the write-gate middleware — imported into
 * the server bundle via `start.ts` — can reference the dispatcher without
 * pulling React/`@repo/ui` server-side.
 */
export const READ_ONLY_PROJECT_MODAL_EVENT = "showcase:read-only-write"

/** Open the "this is a read-only demo" modal. No-op on the server. */
export function openReadOnlyProjectModal(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(READ_ONLY_PROJECT_MODAL_EVENT))
}
