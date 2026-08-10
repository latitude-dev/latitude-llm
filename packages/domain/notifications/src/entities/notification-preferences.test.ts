import type { NotificationPreferences } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { shouldSendEmail } from "./notification-preferences.ts"

const prefs = (incidents: NonNullable<NotificationPreferences["incidents"]>): NotificationPreferences => ({ incidents })

describe("shouldSendEmail", () => {
  it("defaults to sending when nothing is configured", () => {
    expect(shouldSendEmail(null, "incident.opened", "low")).toBe(true)
    expect(shouldSendEmail(undefined, "incident.opened", "low")).toBe(true)
  })

  it("applies the group's minimum severity progressively", () => {
    const p = prefs({ email: true, emailMinSeverity: "high" })
    expect(shouldSendEmail(p, "incident.opened", "medium")).toBe(false)
    expect(shouldSendEmail(p, "incident.opened", "high")).toBe(true)
    expect(shouldSendEmail(p, "incident.opened", "urgent")).toBe(true)
  })

  // A kind that should carry a level but has none is unjudged — an untriaged
  // signal, or one whose level was cleared.
  it("does not email a severity-carrying kind that has no severity", () => {
    expect(shouldSendEmail(prefs({ email: true }), "incident.opened", undefined)).toBe(false)
  })

  // Matches the Slack route rule, from the same predicate, so the two channels
  // cannot disagree about what an escalation is worth.
  it("emails a signal escalation regardless of the threshold", () => {
    const p = prefs({ email: true, emailMinSeverity: "urgent" })
    expect(shouldSendEmail(p, "incident.opened", "low", { isEscalation: true })).toBe(true)
    expect(shouldSendEmail(p, "incident.opened", undefined, { isEscalation: true })).toBe(true)
  })

  // Ordering matters: the group toggle is a user saying "no email from this
  // group", not a threshold, so it outranks the escalation bypass.
  it("still honours the group toggle for an escalation", () => {
    const p = prefs({ email: false, emailMinSeverity: "low" })
    expect(shouldSendEmail(p, "incident.opened", "urgent", { isEscalation: true })).toBe(false)
  })
})
