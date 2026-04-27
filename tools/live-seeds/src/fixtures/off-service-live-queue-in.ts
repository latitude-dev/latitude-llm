import { assistantTextMessage, userTextMessage } from "../otlp.ts"
import type { LiveSeedFixtureDefinition } from "../types.ts"
import {
  buildConversationCase,
  type GeneratedConversationTurnDefinition,
  INTERNAL_KB_SERVICE_NAME,
  INTERNAL_KB_SYSTEM_INSTRUCTIONS,
} from "./common.ts"

const OPENING_EXCHANGES = [
  {
    user: "What's the safe spacing requirement for TNT storage in the west warehouse?",
    assistant:
      "Warehouse spacing protocol requires a 25-meter minimum separation between TNT storage units and a 50-meter buffer from occupied workspaces.",
  },
  {
    user: "What's the correct procedure for handling a Dehydrated Boulder spill in Warehouse 3?",
    assistant:
      "Evacuate the area, do not add water, contact the Hazmat Response Team, and file an incident report within 24 hours.",
  },
  {
    user: "When was the last safety audit for the Giant Magnet production line, and were there any follow-ups?",
    assistant:
      "The last audit closed in March with two follow-up actions: recalibrating field limiters and refreshing the emergency shutdown drill.",
  },
] as const

const FOLLOW_UP_EXCHANGES = [
  {
    user: "Break that down into the exact clearance distances, occupied-area rules, and exception process.",
    assistant:
      "The policy calls for 25 meters between storage units, 50 meters from occupied workspaces, and supervisor approval for any temporary exception.",
  },
  {
    user: "Expand the spill procedure into a training-ready checklist with escalation contacts and timing.",
    assistant:
      "The checklist starts with evacuation, then hazard containment, then the Hazmat callout, and finally an incident report submitted inside the 24-hour window.",
  },
  {
    user: "Add the audit findings, the corrective actions, and the remaining risks in a concise note.",
    assistant:
      "The audit note should mention the limiter recalibration, the drill refresh, and the residual risk of operator error during startup.",
  },
] as const

const OPTIONAL_CLOSING = [
  {
    user: "Great. Turn that into a short internal handbook note I can paste into the wiki.",
    assistant:
      "Internal note: spacing requirements remain unchanged, exceptions require supervisor approval, and the latest audit follow-ups are still tracked.",
  },
  {
    user: "Please add a short note on residual risk and any required follow-up training.",
    assistant:
      "Residual risk is low, but the next warehouse training cycle should re-cover shutdown drills and spill escalation timing.",
  },
] as const

export const offServiceLiveQueueInFixture: LiveSeedFixtureDefinition = {
  key: "off-service-live-queue-in",
  description:
    "Non-support trace that should skip live evaluations by filter but still sample into the seeded live high-cost queue.",
  sampling: {
    liveQueueSample: true,
    flaggerSamples: {
      frustration: false,
    },
  },
  deterministicFlaggerMatches: [],
  llmSystemIntents: [],
  generateCase: ({ fixtureKey, rng }) => {
    const opening = rng.pick(OPENING_EXCHANGES)
    const followUp = rng.pick(FOLLOW_UP_EXCHANGES)
    const turns: GeneratedConversationTurnDefinition[] = [
      {
        key: "opening",
        inputAdditions: [userTextMessage(opening.user)],
        outputMessages: [assistantTextMessage(opening.assistant)],
        durationRangeMs: [1_400, 2_600] as const,
        usageProfile: "high" as const,
        forceReasoning: true,
      },
      {
        key: "follow-up",
        inputAdditions: [userTextMessage(followUp.user)],
        outputMessages: [assistantTextMessage(followUp.assistant)],
        durationRangeMs: [1_500, 2_700] as const,
        usageProfile: "veryHigh" as const,
        forceReasoning: true,
      },
    ]

    if (rng.chance(0.55)) {
      const closing = rng.pick(OPTIONAL_CLOSING)
      turns.push({
        key: "closing",
        inputAdditions: [userTextMessage(closing.user)],
        outputMessages: [assistantTextMessage(closing.assistant)],
        durationRangeMs: [1_200, 2_000] as const,
        usageProfile: "high" as const,
        forceReasoning: true,
      })
    }

    return buildConversationCase({
      rng,
      fixtureKey,
      family: "control",
      serviceName: INTERNAL_KB_SERVICE_NAME,
      systemInstructions: INTERNAL_KB_SYSTEM_INSTRUCTIONS,
      turns,
      targetTurnIndex: 0,
      startDelayRangeMs: [1_000, 2_600],
      traits: {
        highCost: true,
        supportService: false,
      },
    })
  },
}
