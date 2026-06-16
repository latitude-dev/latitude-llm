import { DESTINATION_KINDS, type DestinationKind } from "@domain/destinations"
import { posthogFormModule } from "./posthog-form.tsx"
import type { DestinationFormModule } from "./types.ts"

// biome-ignore lint/suspicious/noExplicitAny: per-kind value shapes differ and are erased at this registry boundary
export const DESTINATION_FORM_MODULES: Record<DestinationKind, DestinationFormModule<any>> = {
  posthog: posthogFormModule,
}

/** Kind a freshly opened create form starts on (kind is fixed per modal; the picker is disabled in v1). */
export const DEFAULT_DESTINATION_KIND: DestinationKind = DESTINATION_KINDS[0]

export const DESTINATION_KIND_OPTIONS = DESTINATION_KINDS.map((kind) => ({
  label: DESTINATION_FORM_MODULES[kind].label,
  value: kind,
}))
