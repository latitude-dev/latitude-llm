import type { PersonalityKind } from "@domain/spans"

/**
 * Title + descriptor copy for each archetype. Lifted out of the React tree
 * so the OG image generator (server-side, no JSX runtime) can read the same
 * values without pulling in the component bundle.
 */
export const TITLE_FOR_KIND: Record<PersonalityKind, string> = {
  surgeon: "The Surgeon",
  architect: "The Architect",
  detective: "The Detective",
  conductor: "The Conductor",
  strategist: "The Strategist",
  scholar: "The Scholar",
  consultant: "The Consultant",
  shipper: "The Shipper",
  tester: "The Tester",
}

export const DESCRIPTOR_FOR_KIND: Record<PersonalityKind, string> = {
  surgeon: "You changed code with sub-line precision.",
  architect: "You started from a blank page more than most.",
  detective: "You read and searched before you wrote.",
  conductor: "You ran the orchestra from the terminal.",
  strategist: "You planned twice, coded once.",
  scholar: "You sent Claude to the library.",
  consultant: "You dropped in, asked, and moved on.",
  shipper: "You closed the loop, again and again.",
  tester: "You don't trust it until it's green.",
}

/** Shared with the email template + the V1 web renderer + the OG card. */
export const WRAPPED_COLORS = {
  cream: "#F0EEE6",
  creamDeep: "#E8E4D8",
  accent: "#D97555",
  ink: "#1A1A1A",
  muted: "#6E6A5E",
} as const
