import type { DestinationCredentials } from "./entities/destination.ts"

/** Reveals `prefix` leading + `suffix` trailing chars, hiding the entropy between; `…` when too short to split safely. */
const maskSecret = (value: string, prefix = 8, suffix = 4): string =>
  value.length <= prefix + suffix ? "…" : `${value.slice(0, prefix)}…${value.slice(-suffix)}`

/**
 * Non-secret display fragment of a destination's credentials, surfaced in the
 * edit form so a user can recognize the stored key without it being returned in
 * full. Per kind — each decides what is safe to reveal; the switch is exhaustive
 * so a new kind must declare its own preview here.
 */
export const previewCredentials = (credentials: DestinationCredentials): string => {
  switch (credentials.kind) {
    case "posthog":
      return maskSecret(credentials.apiKey)
  }
}
