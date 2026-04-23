import {
  ALL_ANNOTATION_TRACE_DAYS_AGO,
  ALL_ANNOTATION_TRACES,
  COMBINATION_DATASET_ROWS,
  type DatasetRow,
  ISSUE_2_ADDITIONAL_NEGATIVES,
  SEED_ADDITIONAL_ISSUE_OCCURRENCES,
  SEED_ALIGNMENT_FIXTURE_SPAN_IDS,
  SEED_ALIGNMENT_FIXTURE_TRACE_IDS,
  SEED_ANNOTATION_DEMO_SPAN_ID,
  SEED_ANNOTATION_DEMO_TRACE_ID,
  SEED_ANNOTATION_SPAN_IDS,
  SEED_ANNOTATION_TRACE_IDS,
  SEED_API_KEY_ID,
  SEED_COMBINATION_SIMULATION_SPAN_IDS,
  SEED_COMBINATION_SIMULATION_TRACE_IDS,
  SEED_ISSUE_FIXTURES_BY_ID,
  SEED_JSON_RESPONSE_SPAN_IDS,
  SEED_JSON_RESPONSE_TRACE_IDS,
  SEED_LIFECYCLE_SPAN_IDS,
  SEED_LIFECYCLE_TRACE_IDS,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_SIMULATION_ID,
  SEED_WARRANTY_SIMULATION_ID,
  SEED_WARRANTY_SIMULATION_SPAN_IDS,
  SEED_WARRANTY_SIMULATION_TRACE_IDS,
  seedDateDaysAgo,
  seedIssueOccurrenceSpanId,
  seedIssueOccurrenceTraceId,
  WARRANTY_DATASET_ROWS,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import type { Seeder } from "../types.ts"
import type { SpanRow } from "./span-builders.ts"

const SUPPORT_AGENT_SYSTEM_PROMPT =
  "You are Acme Assist, the customer support AI for Acme Corporation. Help customers with orders, returns, product information, and technical support. Always refer to Acme's warranty policy, which covers manufacturing defects but explicitly excludes misuse involving roadrunners, cliffs, or violations of the laws of physics. Be friendly and professional. At Acme, satisfaction is guaranteed. (Guarantee does not constitute a legally binding promise.)"

function toMessageJson(role: "user" | "assistant", content: string): string {
  return JSON.stringify([{ role, parts: [{ type: "text", content }] }])
}

function toSystemJson(content: string): string {
  return JSON.stringify([{ type: "text", content }])
}

function createFixedSpan(opts: {
  traceId: string
  spanId: string
  startTime: string
  endTime: string
  userPrompt: string
  assistantResponse: string
  systemInstruction: string
  serviceName: string
  tags: string[]
  simulationId?: string
  metadata?: Record<string, string>
}): SpanRow {
  return {
    organization_id: SEED_ORG_ID,
    project_id: SEED_PROJECT_ID,
    session_id: "",
    user_id: "",
    trace_id: opts.traceId,
    span_id: opts.spanId,
    parent_span_id: "",
    api_key_id: SEED_API_KEY_ID,
    simulation_id: opts.simulationId ?? "",
    start_time: opts.startTime,
    end_time: opts.endTime,
    name: "chat gpt-4o",
    service_name: opts.serviceName,
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: opts.tags,
    metadata: {
      environment: opts.simulationId ? "simulation" : "production",
      seed: opts.simulationId ? "fixed-simulation-traces" : "fixed-traces",
      ...opts.metadata,
    },
    operation: "chat",
    provider: "openai",
    model: "gpt-4o",
    response_model: "gpt-4o-2024-08-06",
    tokens_input: 64,
    tokens_output: 48,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 1600,
    cost_output_microcents: 4800,
    cost_total_microcents: 6400,
    cost_is_estimated: 1,
    time_to_first_token_ns: 180_000_000,
    is_streaming: 0,
    response_id: `seed-${opts.spanId}`,
    finish_reasons: ["stop"],
    input_messages: toMessageJson("user", opts.userPrompt),
    output_messages: toMessageJson("assistant", opts.assistantResponse),
    system_instructions: toSystemJson(opts.systemInstruction),
    tool_definitions: "",
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: { "service.name": opts.serviceName },
    scope_name: "openai-instrumentation",
    scope_version: "1.0.0",
  }
}

function formatClickHouseTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "000")
}

function generateTime(daysAgo: number, hour: number, minute = 0): { start: string; end: string } {
  const start = seedDateDaysAgo(daysAgo, hour, minute)
  const end = new Date(start.getTime() + 4000)
  return { start: formatClickHouseTimestamp(start), end: formatClickHouseTimestamp(end) }
}

function requiredAt<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`Missing seeded item at index ${index}`)
  }
  return item
}

function buildAnnotationTraceSpans(): SpanRow[] {
  return ALL_ANNOTATION_TRACES.map((trace, i) => {
    const daysAgo = ALL_ANNOTATION_TRACE_DAYS_AGO[i]
    if (daysAgo === undefined) {
      throw new Error(`Missing seeded annotation trace day at index ${i}`)
    }
    const time = generateTime(daysAgo, 9 + (i % 4))
    return createFixedSpan({
      traceId: requiredAt(SEED_ANNOTATION_TRACE_IDS, i),
      spanId: requiredAt(SEED_ANNOTATION_SPAN_IDS, i),
      startTime: time.start,
      endTime: time.end,
      userPrompt: trace.userMessage,
      assistantResponse: trace.agentResponse,
      systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
      serviceName: "acme-support-agent",
      tags: ["support", "annotation"],
      metadata: { story: "issue-annotation-corpus" },
    })
  })
}

function buildAlignmentFixtureSpans(): SpanRow[] {
  return ISSUE_2_ADDITIONAL_NEGATIVES.map((fixture, i) => {
    const time = generateTime(26 - Math.floor(i / 5), 10 + (i % 5))
    return createFixedSpan({
      traceId: requiredAt(SEED_ALIGNMENT_FIXTURE_TRACE_IDS, i),
      spanId: requiredAt(SEED_ALIGNMENT_FIXTURE_SPAN_IDS, i),
      startTime: time.start,
      endTime: time.end,
      userPrompt: fixture.userMessage,
      assistantResponse: fixture.agentResponse,
      systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
      serviceName: "acme-support-agent",
      tags: ["support", "alignment"],
      metadata: { story: "issue-2-alignment-fixtures" },
    })
  })
}

function buildIssueOccurrenceTraceSpans(): SpanRow[] {
  return SEED_ADDITIONAL_ISSUE_OCCURRENCES.map((occurrence, i) => {
    const issue = SEED_ISSUE_FIXTURES_BY_ID.get(occurrence.issueId)
    const issueName = issue?.name ?? "seeded issue"
    const time = generateTime(occurrence.daysAgo, occurrence.hour, occurrence.minute)
    const userPrompt =
      occurrence.source === "evaluation"
        ? `Run the seeded monitor case for ${issueName.toLowerCase()}.`
        : `Review the seeded audit case for ${issueName.toLowerCase()}.`

    return createFixedSpan({
      traceId: seedIssueOccurrenceTraceId(i),
      spanId: seedIssueOccurrenceSpanId(i),
      startTime: time.start,
      endTime: time.end,
      userPrompt,
      assistantResponse: occurrence.feedback,
      systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
      serviceName: "acme-support-agent",
      tags: ["support", "issue-occurrence", occurrence.source],
      metadata: {
        story: "issue-occurrence-corpus",
        issueId: occurrence.issueId,
        issueName,
        source: occurrence.source,
        sourceId: occurrence.sourceId,
      },
    })
  })
}

function buildJsonResponseSpans(): SpanRow[] {
  const prettyOrderDetails = JSON.stringify(
    {
      orderId: "ACM-98731",
      status: "delivered",
      customer: { id: "cust_2041", name: "Wile E. Coyote" },
      items: [
        { sku: "RKT-SKT-01", name: "Rocket Skates Pro", quantity: 1, priceCents: 29_900 },
        { sku: "SFT-GEAR-02", name: "Deluxe Safety Gear Bundle", quantity: 1, priceCents: 7_999 },
      ],
      shipping: { carrier: "FastShip", trackingNumber: "FS654321987", deliveredAt: "2026-04-22T16:04:11Z" },
      totalCents: 37_899,
    },
    null,
    2,
  )

  const specs = [
    {
      userPrompt: "Give me the latest metrics snapshot in JSON.",
      assistantResponse:
        '{"period":"last_24h","requests":18432,"errors":47,"p50_ms":112,"p95_ms":418,"p99_ms":1024,"topEndpoints":[{"path":"/v1/traces","share":0.61},{"path":"/v1/projects","share":0.22},{"path":"/v1/issues","share":0.11}]}',
    },
    {
      userPrompt: "Return the warranty policy as a structured JSON object.",
      assistantResponse:
        '{"policy":"Acme Standard Warranty","durationDays":90,"covers":["manufacturing_defects","normal_wear_and_tear"],"excludes":["roadrunner_incidents","cliff_falls","physics_violations"],"extension":{"name":"Protection Plus","priceCents":4999,"extraDays":640}}',
    },
    {
      userPrompt: "List three upcoming releases as a JSON array.",
      assistantResponse:
        '[{"id":"rel-2026-17","title":"Faster semantic search","ship":"2026-04-30"},{"id":"rel-2026-18","title":"Trace comparison view","ship":"2026-05-07"},{"id":"rel-2026-19","title":"Issue auto-triage","ship":"2026-05-14"}]',
    },
    {
      userPrompt: "Show me the order details for ACM-98731.",
      assistantResponse: prettyOrderDetails,
    },
  ] as const

  return specs.map((spec, i) => {
    const time = generateTime(0, 10 + i, 30)
    return createFixedSpan({
      traceId: requiredAt(SEED_JSON_RESPONSE_TRACE_IDS, i),
      spanId: requiredAt(SEED_JSON_RESPONSE_SPAN_IDS, i),
      startTime: time.start,
      endTime: time.end,
      userPrompt: spec.userPrompt,
      assistantResponse: spec.assistantResponse,
      systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
      serviceName: "acme-support-agent",
      tags: ["support", "json-response"],
      metadata: { story: "json-assistant-response-demo" },
    })
  })
}

function buildLifecycleSpans(): SpanRow[] {
  const specs = [
    {
      userPrompt: "Summarize the deployment checklist for tonight's release.",
      assistantResponse:
        "Verify database migrations, confirm rollback steps, check dashboards after deploy, and alert the team if latency or errors spike.",
    },
    {
      userPrompt: "Draft a release note headline for the search improvements.",
      assistantResponse: "Release note headline draft: Faster semantic search with clearer result grouping.",
    },
    {
      userPrompt: "What's the warranty coverage for the Rocket-Powered Roller Skates?",
      assistantResponse:
        "The Rocket-Powered Roller Skates have a 12-month warranty covering manufacturing defects. Section 14.2 excludes cliff-related incidents.",
    },
    {
      userPrompt: "What is the blast radius for the TNT Bundle?",
      assistantResponse: "The TNT Bundle (10-Pack) has a rated blast radius of 15 meters in open terrain.",
    },
    {
      userPrompt: "Can you check the status of order ACM-12345?",
      assistantResponse:
        "Order ACM-12345 is currently in transit via Acme Ground. Estimated delivery: 3-5 business days.",
    },
  ] as const

  return specs.map((spec, i) => {
    const time = generateTime(12 - i, 10 + i)
    return createFixedSpan({
      traceId: requiredAt(SEED_LIFECYCLE_TRACE_IDS, i),
      spanId: requiredAt(SEED_LIFECYCLE_SPAN_IDS, i),
      startTime: time.start,
      endTime: time.end,
      userPrompt: spec.userPrompt,
      assistantResponse: spec.assistantResponse,
      systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
      serviceName: "acme-support-agent",
      tags: ["support", "lifecycle"],
      metadata: { story: "score-ui-lifecycle-states" },
    })
  })
}

function buildSimulationTraceSpans(opts: {
  rows: readonly DatasetRow[]
  traceIds: readonly string[]
  spanIds: readonly string[]
  simulationId: string
  startIndex: number
  datasetName: string
  story: string
}): SpanRow[] {
  return opts.rows.map((row, i) => {
    const time = generateTime(opts.startIndex + i, 9 + (i % 5), i % 2 === 0 ? 6 : 7)
    return createFixedSpan({
      traceId: requiredAt(opts.traceIds, i),
      spanId: requiredAt(opts.spanIds, i),
      startTime: time.start,
      endTime: time.end,
      userPrompt: row.input,
      assistantResponse: row.output,
      systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
      serviceName: "acme-support-agent",
      tags: ["support", "simulation", opts.story],
      simulationId: opts.simulationId,
      metadata: {
        story: opts.story,
        dataset: opts.datasetName,
        difficulty: row.metadata.difficulty,
      },
    })
  })
}

const allFixedSpans = [
  ...buildAnnotationTraceSpans(),
  ...buildAlignmentFixtureSpans(),
  ...buildIssueOccurrenceTraceSpans(),
  ...buildJsonResponseSpans(),
  ...buildLifecycleSpans(),
  ...buildSimulationTraceSpans({
    rows: WARRANTY_DATASET_ROWS,
    traceIds: SEED_WARRANTY_SIMULATION_TRACE_IDS,
    spanIds: SEED_WARRANTY_SIMULATION_SPAN_IDS,
    simulationId: SEED_WARRANTY_SIMULATION_ID,
    startIndex: 6,
    datasetName: "Warranty Coverage Guardrails",
    story: "warranty-simulation",
  }),
  ...buildSimulationTraceSpans({
    rows: COMBINATION_DATASET_ROWS,
    traceIds: SEED_COMBINATION_SIMULATION_TRACE_IDS,
    spanIds: SEED_COMBINATION_SIMULATION_SPAN_IDS,
    simulationId: SEED_SIMULATION_ID,
    startIndex: 4,
    datasetName: "Dangerous Combination Guardrails",
    story: "combination-simulation",
  }),
  buildKitchenSinkTrace(),
]

function buildKitchenSinkTrace(): SpanRow {
  const baseTime = seedDateDaysAgo(2, 8, 0)
  const startTime = baseTime.toISOString().slice(0, 23).replace("T", " ")
  const endTime = new Date(baseTime.getTime() + 45_000).toISOString().slice(0, 23).replace("T", " ")

  const messages: Array<{
    role: "user" | "assistant" | "tool"
    parts: Array<{ type: string; content?: string; toolCallId?: string; toolName?: string; result?: string }>
  }> = []

  // System instructions are stored separately in system_instructions field,
  // not in the messages array (to avoid duplication when toDomainTraceDetail prepends them)

  messages.push({
    role: "user",
    parts: [{ type: "text", content: "lord of the ring" }],
  })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content: `Certainly! Here is an example of a concise Wikipedia-style article for **"The Lord of the Rings"**. Let me know if you want more sections, specific details, or focus on any particular aspect (such as the books, films, or adaptations).

---

# The Lord of the Rings

**The Lord of the Rings** is an epic high-fantasy novel by English author and scholar **J. R. R. Tolkien**. Written in stages between 1937 and 1949, it is one of the best-selling novels ever written, with over 150 million copies sold. It was originally published in three volumes in 1954 and 1955, although it was conceived as a single book.

## Background and Publication

The Lord of the Rings is a sequel to Tolkien's 1937 work *The Hobbit*, but quickly developed into a much larger story. Set in the fictional world of Middle-earth, the narrative follows the quest to destroy the One Ring, crafted by the Dark Lord Sauron to gain dominion over the world. The story began as a children's tale but evolved into a much more serious and complex work intended for adult readers.

## Plot Summary

The story centers on Frodo Baggins, a hobbit who inherits the One Ring from his uncle, Bilbo. Accompanied by a fellowship of allies—including Aragorn, Gandalf, Legolas, Gimli, Boromir, Sam, Merry, and Pippin—Frodo sets out on a perilous journey to the fires of Mount Doom in Mordor, the only place where the Ring can be destroyed. Along the way, the fellowship faces various challenges and is ultimately broken, with members pursuing different paths in the larger conflict against Sauron.

## Structure

*The Lord of the Rings* is commonly published in three volumes:

1. *The Fellowship of the Ring* (1954)
2. *The Two Towers* (1954)
3. *The Return of the King* (1955)

Each volume contains two books, totaling six books plus appendices.

## Reception and Legacy

*The Lord of the Rings* has had a profound and wide-reaching impact on modern fantasy literature, inspiring numerous authors and works. The books have been translated into dozens of languages and adapted multiple times for radio, stage, and film.

## Adaptations

The most well-known adaptation is the film trilogy directed by **Peter Jackson**, released between 2001 and 2003. The films received critical and commercial success, winning multiple Academy Awards, and are considered among the greatest and most influential film franchises in history.

Other adaptations include animated films, radio serials, video games, and stage productions.

## Cultural Influence

*The Lord of the Rings* is regarded as a foundational text in the fantasy genre and has influenced countless subsequent works in literature, film, music, and art. The series has an extensive fan following and has been the subject of scholarly study, conventions, and fan works.

## See Also

- J. R. R. Tolkien
- The Hobbit
- Middle-earth
- The Lord of the Rings (film series)

## References

1. Tolkien, J. R. R. *The Lord of the Rings*. Allen & Unwin, 1954–1955.
2. Carpenter, Humphrey. *J. R. R. Tolkien: A Biography*. Allen & Unwin, 1977.

---

Let me know if you'd like the article expanded with more sections (e.g., adaptations, themes, detailed plot, etc.)!`,
      },
    ],
  })

  messages.push({
    role: "user",
    parts: [{ type: "text", content: "Hi, I need help with my Acme Rocket Skates order #12345." }],
  })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "Hello! I'd be happy to help you with your Acme Rocket Skates order #12345. Let me look that up for you.",
      },
      { type: "tool-call", toolCallId: "call_001", toolName: "lookup_order" },
    ],
  })
  messages.push({
    role: "tool",
    parts: [
      {
        type: "tool-result",
        toolCallId: "call_001",
        toolName: "lookup_order",
        result: JSON.stringify({
          orderId: "12345",
          status: "in_transit",
          product: "Rocket Skates Pro",
          shipDate: "2024-01-15",
          eta: "2024-01-18",
        }),
      },
    ],
  })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "I found your order! Your Rocket Skates Pro were shipped on January 15th and are currently in transit. The expected delivery date is January 18th. What seems to be the issue?",
      },
    ],
  })

  messages.push({
    role: "user",
    parts: [
      { type: "text", content: "I ordered them last week but they haven't arrived yet. Can you check the tracking?" },
    ],
  })
  messages.push({
    role: "assistant",
    parts: [{ type: "tool-call", toolCallId: "call_002", toolName: "get_tracking_info" }],
  })
  messages.push({
    role: "tool",
    parts: [
      {
        type: "tool-result",
        toolCallId: "call_002",
        toolName: "get_tracking_info",
        result: JSON.stringify({
          carrier: "FastShip",
          trackingNumber: "FS123456789",
          lastUpdate: "2024-01-17 14:30",
          location: "Distribution Center - Phoenix",
          status: "Out for delivery tomorrow",
        }),
      },
    ],
  })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "I've checked the tracking for you. Your package is with FastShip (tracking: FS123456789). It was last scanned at the Phoenix Distribution Center yesterday at 2:30 PM and is scheduled for delivery tomorrow. The expected delivery is on track!",
      },
    ],
  })

  messages.push({
    role: "user",
    parts: [{ type: "text", content: "That's good to know. But I'm worried about the warranty." }],
  })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "Great question about the warranty! Your Acme Rocket Skates come with our standard 90-day warranty that covers manufacturing defects. However, please note that the warranty explicitly excludes any damage from misuse, especially involving roadrunners, cliffs, or violations of the laws of physics.",
      },
    ],
  })

  messages.push({ role: "user", parts: [{ type: "text", content: "What if they break during normal use?" }] })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "If your Rocket Skates break during normal use within the 90-day warranty period, we'll either repair or replace them at no cost to you. Normal use includes standard running, jogging, and skating on flat surfaces. Just keep your receipt and contact us if you experience any issues.",
      },
    ],
  })

  messages.push({ role: "user", parts: [{ type: "text", content: "Can I use them on hills?" }] })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "Yes, you can use Rocket Skates on gentle hills! However, we recommend caution on steep inclines. The warranty covers normal wear from moderate slopes, but extreme downhill use at high speeds may void certain coverage. Our recommendation is to start slow and always maintain control.",
      },
    ],
  })

  messages.push({ role: "user", parts: [{ type: "text", content: "What about in the rain?" }] })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "The Rocket Skates are water-resistant but not waterproof. Light rain shouldn't cause issues, but we don't recommend using them in heavy rain or puddles. Water damage from submersion or heavy exposure is not covered under the standard warranty.",
      },
    ],
  })

  messages.push({ role: "user", parts: [{ type: "text", content: "I also wanted to ask about returns." }] })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "Of course! Acme has a 30-day return policy for unused items in original packaging. If you're not satisfied with your Rocket Skates, you can return them within 30 days of delivery for a full refund. Used items may be eligible for store credit depending on condition.",
      },
    ],
  })

  messages.push({ role: "user", parts: [{ type: "text", content: "What if I already opened the box?" }] })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "If you've opened the box but haven't used the Rocket Skates, they're still eligible for full return. If you've tried them on briefly indoors and they're in like-new condition, we can still process a return. However, if there are signs of outdoor use or wear, we'd offer store credit instead.",
      },
    ],
  })

  messages.push({
    role: "user",
    parts: [{ type: "text", content: "That sounds fair. Now about the speed settings..." }],
  })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "The Rocket Skates have three speed settings: Slow (walking pace), Medium (jogging pace), and Fast (running pace). You can adjust the speed using the dial on the left skate. We recommend starting on Slow until you're comfortable with the controls.",
      },
    ],
  })

  messages.push({ role: "user", parts: [{ type: "text", content: "Is there a maximum speed?" }] })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "The maximum speed on the Fast setting is approximately 15 mph under optimal conditions. However, actual speed may vary based on terrain, user weight, and battery level. Please always wear appropriate safety gear including helmet, knee pads, and elbow pads.",
      },
    ],
  })

  messages.push({ role: "user", parts: [{ type: "text", content: "How long does the battery last?" }] })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "On a full charge, the battery typically lasts 2-3 hours of continuous use on Medium setting. Fast setting will drain the battery more quickly (about 1.5-2 hours), while Slow setting can extend battery life to 4+ hours. Charging takes approximately 2 hours.",
      },
    ],
  })

  messages.push({ role: "user", parts: [{ type: "text", content: "Can I replace the battery myself?" }] })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "The battery is user-replaceable! You can purchase replacement batteries from our website or authorized retailers. The battery compartment is accessible via the panel on each skate's heel. Instructions are included in your user manual. Replacement batteries are covered under a separate 6-month warranty.",
      },
    ],
  })

  messages.push({ role: "user", parts: [{ type: "text", content: "What about repairs for non-warranty issues?" }] })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "For issues not covered by warranty, we offer repair services at our service centers. Costs vary depending on the repair needed. Common repairs like wheel replacement or brake adjustment typically range from $25-50. More complex repairs involving the motor or electronics may cost more.",
      },
    ],
  })

  messages.push({
    role: "user",
    parts: [{ type: "text", content: "Do you have service centers near me? I'm in Phoenix, Arizona." }],
  })
  messages.push({
    role: "assistant",
    parts: [{ type: "tool-call", toolCallId: "call_003", toolName: "find_service_centers" }],
  })
  messages.push({
    role: "tool",
    parts: [
      {
        type: "tool-result",
        toolCallId: "call_003",
        toolName: "find_service_centers",
        result: JSON.stringify({
          centers: [
            { name: "Acme Phoenix Downtown", address: "123 Main Street, Phoenix, AZ 85001", hours: "Mon-Sat 9am-6pm" },
            {
              name: "Acme Scottsdale",
              address: "456 Innovation Drive, Scottsdale, AZ 85251",
              hours: "Mon-Sat 9am-6pm",
            },
          ],
        }),
      },
    ],
  })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "Great news! We have two service centers in the Phoenix area: one in downtown Phoenix at 123 Main Street and another in Scottsdale at 456 Innovation Drive. Both are open Monday-Saturday, 9am-6pm. Would you like me to schedule an appointment?",
      },
    ],
  })

  messages.push({
    role: "user",
    parts: [{ type: "text", content: "Not yet, but good to know. Can you tell me about accessories?" }],
  })
  messages.push({
    role: "assistant",
    parts: [{ type: "tool-call", toolCallId: "call_004", toolName: "list_accessories" }],
  })
  messages.push({
    role: "tool",
    parts: [
      {
        type: "tool-result",
        toolCallId: "call_004",
        toolName: "list_accessories",
        result: JSON.stringify({
          accessories: [
            { name: "Premium Carrying Case", price: 39.99 },
            { name: "Extra Charging Cable", price: 14.99 },
            { name: "Wheel Replacement Kit", price: 29.99 },
            { name: "Deluxe Safety Gear Bundle", price: 79.99 },
          ],
        }),
      },
    ],
  })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "Absolutely! We offer a range of accessories for your Rocket Skates. Popular items include: premium carrying case ($39.99), extra charging cable ($14.99), wheel replacement kit ($29.99), and our deluxe safety gear bundle ($79.99). All accessories are available on our website or at authorized retailers.",
      },
    ],
  })

  messages.push({ role: "user", parts: [{ type: "text", content: "Is there a protection plan I can buy?" }] })
  messages.push({
    role: "assistant",
    parts: [
      {
        type: "text",
        content:
          "Yes! We offer the Acme Protection Plus plan for $49.99 which extends your warranty to 2 years and includes accidental damage coverage. This covers drops, spills, and even some misuse scenarios (though roadrunner-related incidents are still excluded). You can purchase this within 30 days of your original purchase.",
      },
    ],
  })

  return {
    organization_id: SEED_ORG_ID,
    project_id: SEED_PROJECT_ID,
    session_id: "",
    user_id: "",
    trace_id: SEED_ANNOTATION_DEMO_TRACE_ID,
    span_id: SEED_ANNOTATION_DEMO_SPAN_ID,
    parent_span_id: "",
    api_key_id: SEED_API_KEY_ID,
    simulation_id: "",
    start_time: startTime,
    end_time: endTime,
    name: "chat gpt-4o",
    service_name: "acme-support",
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: ["support", "warranty", "product-info", "kitchen-sink-demo"],
    metadata: {
      environment: "production",
      seed: "kitchen-sink-demo",
      demo: "annotation-ui-polish",
    },
    operation: "chat",
    provider: "openai",
    model: "gpt-4o",
    response_model: "gpt-4o-2024-08-06",
    tokens_input: 2450,
    tokens_output: 1820,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 61250,
    cost_output_microcents: 182000,
    cost_total_microcents: 243250,
    cost_is_estimated: 1,
    time_to_first_token_ns: 280_000_000,
    is_streaming: 0,
    response_id: `seed-${SEED_ANNOTATION_DEMO_SPAN_ID}`,
    finish_reasons: ["stop"],
    input_messages: JSON.stringify(messages.slice(0, -1)),
    output_messages: JSON.stringify([messages[messages.length - 1]]),
    system_instructions: JSON.stringify([{ type: "text", content: SUPPORT_AGENT_SYSTEM_PROMPT }]),
    tool_definitions: JSON.stringify([
      { name: "lookup_order", description: "Look up order details by order ID" },
      { name: "get_tracking_info", description: "Get shipping tracking information" },
      { name: "find_service_centers", description: "Find nearby service centers" },
      { name: "list_accessories", description: "List available accessories for a product" },
    ]),
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: {},
    scope_name: "",
    scope_version: "",
  }
}

const seedFixedTraces: Seeder = {
  name: "spans/fixed-traces",
  run: (ctx) =>
    insertJsonEachRow(ctx.client, "spans", allFixedSpans).pipe(
      Effect.tap(() =>
        Effect.sync(() => console.log(`  -> spans/fixed-traces: ${allFixedSpans.length} deterministic traces`)),
      ),
    ),
}

export const fixedTraceSeeders: readonly Seeder[] = [seedFixedTraces]
