import {
  ISSUE_1_NEGATIVE_TRACES,
  ISSUE_2_POSITIVE_TRACES,
  SEED_ACCESS_EVALUATION_ID,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_EVALUATION_ID,
  SEED_RETURNS_EVALUATION_ID,
} from "@domain/shared/seeding"
import {
  assistantTextMessage,
  assistantToolCallMessage,
  type SeedSpanDefinition,
  type SeedSystemPart,
  toolResponseMessage,
  userTextMessage,
} from "./otlp.ts"

type SamplingPlan = {
  readonly includeEvaluationIds?: readonly string[]
  readonly excludeEvaluationIds?: readonly string[]
  readonly liveQueueSample?: boolean
  readonly systemQueueSamples?: Readonly<Record<string, boolean>>
}

export type LiveMonitorFixtureDefinition = {
  readonly key: string
  readonly description: string
  readonly serviceName: string
  readonly startDelayMs: number
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
  readonly systemInstructions: readonly SeedSystemPart[]
  readonly sampling: SamplingPlan
  readonly deterministicSystemMatches: readonly string[]
  readonly llmSystemIntents: readonly string[]
  readonly spans: readonly SeedSpanDefinition[]
}

const SUPPORT_SERVICE_NAME = "acme-support-agent"
const CONTROL_SERVICE_NAME = "seed-live-monitor-control"

const SUPPORT_SYSTEM_INSTRUCTIONS: readonly SeedSystemPart[] = [
  {
    type: "text",
    content:
      "You are Acme's customer support assistant. Follow written policy, avoid inventing coverage or exceptions, and explain outcomes clearly.",
  },
]

const CONTROL_SYSTEM_INSTRUCTIONS: readonly SeedSystemPart[] = [
  {
    type: "text",
    content:
      "You are an internal operations assistant. Be concise, accurate, and explicit when you do not have a result yet.",
  },
]

function requireTrace<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing seeded trace example for ${label}`)
  }
  return value
}

const warrantyPassExample = requireTrace(ISSUE_1_NEGATIVE_TRACES[2], "warranty pass")
const combinationFailExample = requireTrace(ISSUE_2_POSITIVE_TRACES[0], "combination fail")

const SEEDED_EVALUATION_IDS = [
  SEED_EVALUATION_ID,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_RETURNS_EVALUATION_ID,
  SEED_ACCESS_EVALUATION_ID,
] as const

export const liveMonitorFixtures: readonly LiveMonitorFixtureDefinition[] = [
  {
    key: "warranty-eval-in",
    description:
      "Support trace that should execute only the seeded warranty monitor while staying below the live high-cost queue threshold.",
    serviceName: SUPPORT_SERVICE_NAME,
    startDelayMs: 0,
    tags: ["seed", "live-monitor", "warranty", "expected-eval"],
    metadata: {
      fixture: "warranty-eval-in",
      expectation: "warranty-evaluation-only",
    },
    systemInstructions: SUPPORT_SYSTEM_INSTRUCTIONS,
    sampling: {
      includeEvaluationIds: [SEED_EVALUATION_ID],
      excludeEvaluationIds: [SEED_COMBINATION_EVALUATION_ID, SEED_RETURNS_EVALUATION_ID, SEED_ACCESS_EVALUATION_ID],
      systemQueueSamples: {
        frustration: false,
      },
    },
    deterministicSystemMatches: [],
    llmSystemIntents: [],
    spans: [
      {
        label: "turn-1",
        offsetMs: 0,
        durationMs: 1_200,
        inputMessages: [userTextMessage(warrantyPassExample.userMessage)],
        outputMessages: [assistantTextMessage(warrantyPassExample.agentResponse)],
        usage: {
          inputTokens: 180,
          outputTokens: 120,
          totalCostUsd: 0.0000012,
        },
      },
      {
        label: "turn-2",
        offsetMs: 2_500,
        durationMs: 1_100,
        inputMessages: [
          userTextMessage(warrantyPassExample.userMessage),
          assistantTextMessage(warrantyPassExample.agentResponse),
          userTextMessage("Can you at least document the exclusion and apply the loyalty discount you mentioned?"),
        ],
        outputMessages: [
          assistantTextMessage(
            "Yes. I cannot override Section 14.2, but I can note the exclusion on the case and apply a 15% loyalty discount to a replacement order.",
          ),
        ],
        usage: {
          inputTokens: 220,
          outputTokens: 140,
          totalCostUsd: 0.0000016,
        },
      },
    ],
  },
  {
    key: "support-evals-out",
    description:
      "Support trace that still matches the seeded service filter but should sample out of all seeded live evaluations.",
    serviceName: SUPPORT_SERVICE_NAME,
    startDelayMs: 800,
    tags: ["seed", "live-monitor", "support", "expected-sampled-out"],
    metadata: {
      fixture: "support-evals-out",
      expectation: "no-live-evaluations",
    },
    systemInstructions: SUPPORT_SYSTEM_INSTRUCTIONS,
    sampling: {
      excludeEvaluationIds: SEEDED_EVALUATION_IDS,
      systemQueueSamples: {
        frustration: false,
      },
    },
    deterministicSystemMatches: [],
    llmSystemIntents: [],
    spans: [
      {
        label: "turn-1",
        offsetMs: 0,
        durationMs: 900,
        inputMessages: [userTextMessage("What are your warehouse pickup hours for standard replacement orders?")],
        outputMessages: [
          assistantTextMessage(
            "Warehouse pickup is available Monday through Friday from 9 AM to 5 PM local time for orders that have already been confirmed for pickup.",
          ),
        ],
        usage: {
          inputTokens: 150,
          outputTokens: 95,
          totalCostUsd: 0.0000009,
        },
      },
      {
        label: "turn-2",
        offsetMs: 2_200,
        durationMs: 950,
        inputMessages: [
          userTextMessage("What are your warehouse pickup hours for standard replacement orders?"),
          assistantTextMessage(
            "Warehouse pickup is available Monday through Friday from 9 AM to 5 PM local time for orders that have already been confirmed for pickup.",
          ),
          userTextMessage("Thanks. Please also confirm whether I need the case number when I arrive."),
        ],
        outputMessages: [
          assistantTextMessage(
            "Yes. Bring the case number and a photo ID so the warehouse team can match the pickup to your confirmed order.",
          ),
        ],
        usage: {
          inputTokens: 170,
          outputTokens: 110,
          totalCostUsd: 0.0000011,
        },
      },
    ],
  },
  {
    key: "combination-eval-and-live-queue-in",
    description:
      "Support trace that should execute the dangerous-combination monitor and also qualify for the seeded live high-cost queue.",
    serviceName: SUPPORT_SERVICE_NAME,
    startDelayMs: 1_600,
    tags: ["seed", "live-monitor", "combination", "expected-eval", "expected-live-queue"],
    metadata: {
      fixture: "combination-eval-and-live-queue-in",
      expectation: "combination-evaluation-plus-live-queue",
    },
    systemInstructions: SUPPORT_SYSTEM_INSTRUCTIONS,
    sampling: {
      includeEvaluationIds: [SEED_COMBINATION_EVALUATION_ID],
      excludeEvaluationIds: [SEED_EVALUATION_ID, SEED_RETURNS_EVALUATION_ID, SEED_ACCESS_EVALUATION_ID],
      liveQueueSample: true,
      systemQueueSamples: {
        frustration: false,
      },
    },
    deterministicSystemMatches: [],
    llmSystemIntents: [],
    spans: [
      {
        label: "turn-1",
        offsetMs: 0,
        durationMs: 1_900,
        inputMessages: [userTextMessage(combinationFailExample.userMessage)],
        outputMessages: [assistantTextMessage(combinationFailExample.agentResponse)],
        usage: {
          inputTokens: 420,
          outputTokens: 350,
          totalCostUsd: 0.000012,
          reasoningTokens: 90,
        },
      },
      {
        label: "turn-2",
        offsetMs: 2_800,
        durationMs: 2_200,
        inputMessages: [
          userTextMessage(combinationFailExample.userMessage),
          assistantTextMessage(combinationFailExample.agentResponse),
          userTextMessage("Is there any extra safety gear I should add if I want to try that setup anyway?"),
        ],
        outputMessages: [
          assistantTextMessage(
            "Add a reinforced harness and elbow guards and you should be fine. That combination is a favorite among power users who want maximum acceleration.",
          ),
        ],
        usage: {
          inputTokens: 460,
          outputTokens: 390,
          totalCostUsd: 0.000014,
          reasoningTokens: 120,
        },
      },
    ],
  },
  {
    key: "off-service-live-queue-in",
    description:
      "Non-support trace that should skip live evaluations by filter but still sample into the seeded live high-cost queue.",
    serviceName: CONTROL_SERVICE_NAME,
    startDelayMs: 2_400,
    tags: ["seed", "live-monitor", "control", "expected-live-queue"],
    metadata: {
      fixture: "off-service-live-queue-in",
      expectation: "live-queue-only",
    },
    systemInstructions: CONTROL_SYSTEM_INSTRUCTIONS,
    sampling: {
      liveQueueSample: true,
      systemQueueSamples: {
        frustration: false,
      },
    },
    deterministicSystemMatches: [],
    llmSystemIntents: [],
    spans: [
      {
        label: "turn-1",
        offsetMs: 0,
        durationMs: 1_700,
        inputMessages: [
          userTextMessage("Summarize the export validation run for the nightly billing reconciliation job."),
        ],
        outputMessages: [
          assistantTextMessage(
            "The validator processed all shards, re-read the mismatched batches twice, and generated a detailed exception report for the finance team.",
          ),
        ],
        usage: {
          inputTokens: 380,
          outputTokens: 320,
          totalCostUsd: 0.00001,
          reasoningTokens: 60,
        },
      },
      {
        label: "turn-2",
        offsetMs: 2_100,
        durationMs: 1_900,
        inputMessages: [
          userTextMessage("Summarize the export validation run for the nightly billing reconciliation job."),
          assistantTextMessage(
            "The validator processed all shards, re-read the mismatched batches twice, and generated a detailed exception report for the finance team.",
          ),
          userTextMessage("List the three slowest steps in the run and the retry count for each."),
        ],
        outputMessages: [
          assistantTextMessage(
            "The slowest steps were shard aggregation, duplicate-key reconciliation, and attachment packaging. Respectively they retried 3, 2, and 1 time.",
          ),
        ],
        usage: {
          inputTokens: 400,
          outputTokens: 340,
          totalCostUsd: 0.000011,
          reasoningTokens: 80,
        },
      },
    ],
  },
  {
    key: "off-service-live-queue-out",
    description:
      "Non-support high-cost trace that still clears the live-queue filter but should sample out of the seeded high-cost queue.",
    serviceName: CONTROL_SERVICE_NAME,
    startDelayMs: 3_200,
    tags: ["seed", "live-monitor", "control", "expected-live-queue-sampled-out"],
    metadata: {
      fixture: "off-service-live-queue-out",
      expectation: "high-cost-filter-match-but-sampled-out",
    },
    systemInstructions: CONTROL_SYSTEM_INSTRUCTIONS,
    sampling: {
      liveQueueSample: false,
      systemQueueSamples: {
        frustration: false,
      },
    },
    deterministicSystemMatches: [],
    llmSystemIntents: [],
    spans: [
      {
        label: "turn-1",
        offsetMs: 0,
        durationMs: 1_600,
        inputMessages: [
          userTextMessage(
            "Draft the migration summary for the archive compaction backfill and include rollback notes.",
          ),
        ],
        outputMessages: [
          assistantTextMessage(
            "The backfill compacted archived partitions, preserved prior checksums, and left a rollback manifest that restores the previous shard map if validation fails.",
          ),
        ],
        usage: {
          inputTokens: 360,
          outputTokens: 300,
          totalCostUsd: 0.000009,
          reasoningTokens: 55,
        },
      },
      {
        label: "turn-2",
        offsetMs: 2_000,
        durationMs: 1_850,
        inputMessages: [
          userTextMessage(
            "Draft the migration summary for the archive compaction backfill and include rollback notes.",
          ),
          assistantTextMessage(
            "The backfill compacted archived partitions, preserved prior checksums, and left a rollback manifest that restores the previous shard map if validation fails.",
          ),
          userTextMessage("Add a note about the extra checksum verification pass and why it increased runtime."),
        ],
        outputMessages: [
          assistantTextMessage(
            "The extra checksum verification re-read each compacted partition to confirm byte-for-byte parity, which added runtime but reduced rollback risk.",
          ),
        ],
        usage: {
          inputTokens: 390,
          outputTokens: 330,
          totalCostUsd: 0.0000095,
          reasoningTokens: 65,
        },
      },
    ],
  },
  {
    key: "frustration-in",
    description:
      "Low-cost non-support trace written to look like a strong Frustration match and to sample into the Frustration system queue.",
    serviceName: CONTROL_SERVICE_NAME,
    startDelayMs: 4_000,
    tags: ["seed", "live-monitor", "frustration", "expected-system-queue"],
    metadata: {
      fixture: "frustration-in",
      expectation: "frustration-system-queue",
    },
    systemInstructions: CONTROL_SYSTEM_INSTRUCTIONS,
    sampling: {
      systemQueueSamples: {
        frustration: true,
      },
    },
    deterministicSystemMatches: [],
    llmSystemIntents: ["frustration"],
    spans: [
      {
        label: "turn-1",
        offsetMs: 0,
        durationMs: 1_000,
        inputMessages: [userTextMessage("I asked for the deployment checksum three times already. Where is it?")],
        outputMessages: [
          assistantTextMessage("I can help with deployment details. Could you clarify which environment you mean?"),
        ],
        usage: {
          inputTokens: 120,
          outputTokens: 90,
          totalCostUsd: 0.0000008,
        },
      },
      {
        label: "turn-2",
        offsetMs: 2_000,
        durationMs: 1_050,
        inputMessages: [
          userTextMessage("I asked for the deployment checksum three times already. Where is it?"),
          assistantTextMessage("I can help with deployment details. Could you clarify which environment you mean?"),
          userTextMessage(
            "This is exactly the problem. I already told you it was production, and you keep making me repeat myself.",
          ),
        ],
        outputMessages: [
          assistantTextMessage(
            "I understand. Please restate the deployment details one more time so I can look into it.",
          ),
        ],
        usage: {
          inputTokens: 135,
          outputTokens: 95,
          totalCostUsd: 0.0000009,
        },
      },
    ],
  },
  {
    key: "tool-call-error",
    description: "Low-cost non-support trace that should deterministically match the Tool Call Errors system queue.",
    serviceName: CONTROL_SERVICE_NAME,
    startDelayMs: 4_800,
    tags: ["seed", "live-monitor", "tool-call-errors", "expected-system-queue"],
    metadata: {
      fixture: "tool-call-error",
      expectation: "tool-call-errors-system-queue",
    },
    systemInstructions: CONTROL_SYSTEM_INSTRUCTIONS,
    sampling: {
      systemQueueSamples: {
        "tool-call-errors": true,
        frustration: false,
      },
    },
    deterministicSystemMatches: ["tool-call-errors"],
    llmSystemIntents: [],
    spans: [
      {
        label: "turn-1",
        offsetMs: 0,
        durationMs: 1_100,
        inputMessages: [userTextMessage("Look up the current policy code for warehouse pickup verification.")],
        outputMessages: [
          assistantToolCallMessage([
            {
              id: "call_policy_lookup_1",
              name: "lookup_policy",
              arguments: { topic: "warehouse-pickup-verification" },
            },
          ]),
        ],
        usage: {
          inputTokens: 130,
          outputTokens: 70,
          totalCostUsd: 0.0000007,
        },
        finishReasons: ["tool_calls"],
      },
      {
        label: "turn-2",
        offsetMs: 2_300,
        durationMs: 1_050,
        inputMessages: [
          userTextMessage("Look up the current policy code for warehouse pickup verification."),
          assistantToolCallMessage([
            {
              id: "call_policy_lookup_1",
              name: "lookup_policy",
              arguments: { topic: "warehouse-pickup-verification" },
            },
          ]),
          toolResponseMessage("call_policy_lookup_1", {
            status: "error",
            error: "Policy service unavailable",
          }),
        ],
        outputMessages: [
          assistantTextMessage("The policy lookup failed because the policy service is unavailable right now."),
        ],
        usage: {
          inputTokens: 145,
          outputTokens: 90,
          totalCostUsd: 0.0000008,
        },
      },
    ],
  },
  {
    key: "empty-response",
    description: "Low-cost non-support trace that should deterministically match the Empty Response system queue.",
    serviceName: CONTROL_SERVICE_NAME,
    startDelayMs: 5_600,
    tags: ["seed", "live-monitor", "empty-response", "expected-system-queue"],
    metadata: {
      fixture: "empty-response",
      expectation: "empty-response-system-queue",
    },
    systemInstructions: CONTROL_SYSTEM_INSTRUCTIONS,
    sampling: {
      systemQueueSamples: {
        "empty-response": true,
        frustration: false,
      },
    },
    deterministicSystemMatches: ["empty-response"],
    llmSystemIntents: [],
    spans: [
      {
        label: "turn-1",
        offsetMs: 0,
        durationMs: 900,
        inputMessages: [userTextMessage("Provide the deployment summary in one sentence.")],
        outputMessages: [assistantTextMessage("...")],
        usage: {
          inputTokens: 90,
          outputTokens: 10,
          totalCostUsd: 0.0000004,
        },
      },
    ],
  },
  {
    key: "output-schema",
    description:
      "Low-cost non-support trace that should deterministically match the Output Schema Validation system queue.",
    serviceName: CONTROL_SERVICE_NAME,
    startDelayMs: 6_400,
    tags: ["seed", "live-monitor", "output-schema", "expected-system-queue"],
    metadata: {
      fixture: "output-schema",
      expectation: "output-schema-validation-system-queue",
    },
    systemInstructions: CONTROL_SYSTEM_INSTRUCTIONS,
    sampling: {
      systemQueueSamples: {
        "output-schema-validation": true,
        frustration: false,
      },
    },
    deterministicSystemMatches: ["output-schema-validation"],
    llmSystemIntents: [],
    spans: [
      {
        label: "turn-1",
        offsetMs: 0,
        durationMs: 950,
        inputMessages: [userTextMessage("Return the validation result as strict JSON with keys status and retries.")],
        outputMessages: [assistantTextMessage('{"status":"ok","retries":2,')],
        usage: {
          inputTokens: 110,
          outputTokens: 40,
          totalCostUsd: 0.0000005,
        },
      },
    ],
  },
] as const

export const liveMonitorFixtureKeys = liveMonitorFixtures.map((fixture) => fixture.key)
