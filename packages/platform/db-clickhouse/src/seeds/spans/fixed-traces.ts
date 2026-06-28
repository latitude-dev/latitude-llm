import { TAU2_SEED_TRAJECTORIES, type Tau2SeedTrajectoryMessage } from "@domain/shared/seed-content/tau2-trajectories"
import { CUSTOMER_USERS, EMPLOYEE_USERS, type SeedScope, type SeedUser, seedUserAt } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { Seeder, TraceSlot } from "../types.ts"
import type { SpanRow } from "./span-builders.ts"

function formatClickHouseTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "000")
}

type Tau2Message = {
  role: "user" | "assistant" | "tool"
  parts: Array<Record<string, unknown>>
}

const TAU2_SYSTEM_PROMPTS = {
  airline:
    "You are an airline customer support AI agent. Use reservation and policy tools before changing flights, baggage, or passenger details, and do not invent exceptions.",
  retail:
    "You are a retail customer support AI agent. Authenticate the customer before account-specific help, follow order and return policy exactly, use tools for account/order state, and do not invent policy exceptions.",
  telecom:
    "You are a telecom technical support AI agent. Troubleshoot customer connectivity problems step by step, use tools for device/network state, and only mark the issue resolved when the observed state meets the customer's success criteria.",
} as const

const TAU2_TOOL_DESCRIPTIONS: Record<string, string> = {
  find_user_id_by_email: "Find a retail user id by email address",
  find_user_id_by_name_zip: "Find a retail user id by customer name and ZIP code",
  get_user_details: "Load retail customer profile, payment methods, and order ids",
  get_order_details: "Load retail order details, items, payments, and status",
  get_product_details: "Load retail product variants and availability",
  return_delivered_order_items: "Request a return for delivered order items",
  exchange_delivered_order_items: "Request an exchange for delivered order items",
  transfer_to_human_agents: "Transfer the customer to a human support agent",
  get_status_bar: "Read the mobile device status bar",
  toggle_airplane_mode: "Toggle airplane mode on the user's phone",
  reset_cellular_settings: "Reset cellular network settings on the user's phone",
  remove_sim_card: "Ask the user to remove the SIM card",
  insert_sim_card: "Ask the user to insert the SIM card",
  get_sim_card_status: "Inspect SIM card state",
  run_speed_test: "Run a mobile data speed test",
  apply_discount_code: "Apply a promotional discount code to an order",
  escalate_to_supervisor: "Escalate the case to a support supervisor",
  schedule_technician_visit: "Schedule an on-site technician visit",
  send_goodwill_credit: "Apply a goodwill credit to the customer's bill",
  request_special_assistance: "Request wheelchair or special assistance for a passenger",
  add_travel_insurance: "Add travel insurance to a reservation",
}

// Advertised on every tau2 chat span for the domain but never called by any
// trajectory — seeds "defined but never used" tools for the tools analytics UI.
const TAU2_UNUSED_TOOLS_BY_DOMAIN: Record<string, readonly string[]> = {
  retail: ["apply_discount_code", "escalate_to_supervisor"],
  telecom: ["schedule_technician_visit", "send_goodwill_credit"],
  airline: ["request_special_assistance", "add_travel_insurance"],
}

function tau2MessageToStoredMessage(message: Tau2SeedTrajectoryMessage): Tau2Message {
  if (message.role === "tool") {
    return {
      role: "tool",
      parts: [{ type: "tool_call_response", id: message.id, response: message.content }],
    }
  }

  const parts: Array<Record<string, unknown>> = []
  if (message.content) parts.push({ type: "text", content: message.content })
  for (const call of message.toolCalls ?? []) {
    parts.push({ type: "tool_call", id: call.id, name: call.name, arguments: call.arguments })
  }
  return { role: message.role, parts }
}

function estimateTau2Tokens(messages: readonly Tau2Message[]): number {
  return Math.max(12, Math.ceil(JSON.stringify(messages).length / 4))
}

// Empty message lists must serialize to "" (not "[]") to match the real span
// writer's contract: the traces/sessions rollups select messages with
// `input_messages != ''`, so a "[]" leading-greeting span would otherwise win
// the earliest-span tie and blank out the whole trace's Input.
function serializeMessages(messages: readonly Tau2Message[]): string {
  return messages.length > 0 ? JSON.stringify(messages) : ""
}

function createTau2LlmSpan(opts: {
  scope: SeedScope
  traceId: string
  spanId: string
  parentSpanId: string
  startTime: Date
  durationMs: number
  inputMessages: readonly Tau2Message[]
  outputMessage: Tau2Message
  systemInstruction: string
  serviceName: string
  tags: readonly string[]
  metadata: Record<string, string>
  toolDefinitions: readonly string[]
  user: SeedUser | undefined
}): SpanRow {
  const inputTokens = estimateTau2Tokens(opts.inputMessages)
  const outputTokens = estimateTau2Tokens([opts.outputMessage])
  const costInput = inputTokens * 25
  const costOutput = outputTokens * 100
  const hasToolCall = opts.outputMessage.parts.some((part) => part.type === "tool_call")
  return {
    organization_id: opts.scope.organizationId,
    project_id: opts.scope.projectId,
    session_id: "",
    user_id: opts.user?.id ?? "",
    user_email: opts.user?.email ?? "",
    trace_id: opts.traceId,
    span_id: opts.spanId,
    parent_span_id: opts.parentSpanId,
    api_key_id: opts.scope.apiKeyId,
    simulation_id: "",
    start_time: formatClickHouseTimestamp(opts.startTime),
    end_time: formatClickHouseTimestamp(new Date(opts.startTime.getTime() + opts.durationMs)),
    name: "chat gpt-4.1",
    service_name: opts.serviceName,
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: [...opts.tags],
    metadata: opts.metadata,
    operation: "chat",
    provider: "openai",
    model: "gpt-4.1",
    response_model: "gpt-4.1-2025-04-14",
    tokens_input: inputTokens,
    tokens_output: outputTokens,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: costInput,
    cost_output_microcents: costOutput,
    cost_total_microcents: costInput + costOutput,
    cost_is_estimated: 1,
    time_to_first_token_ns: hasToolCall ? 0 : 220_000_000,
    is_streaming: hasToolCall ? 0 : 1,
    response_id: `seed-${opts.spanId}`,
    finish_reasons: [hasToolCall ? "tool_calls" : "stop"],
    input_messages: serializeMessages(opts.inputMessages),
    output_messages: serializeMessages([opts.outputMessage]),
    system_instructions: JSON.stringify([{ type: "text", content: opts.systemInstruction }]),
    tool_definitions: JSON.stringify(
      opts.toolDefinitions.map((name) => ({ name, description: TAU2_TOOL_DESCRIPTIONS[name] ?? `${name} tool` })),
    ),
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: { "gen_ai.request.temperature": 0 },
    attr_bool: {},
    resource_string: { "service.name": opts.serviceName },
    scope_name: "openai-instrumentation",
    scope_version: "1.0.0",
  }
}

function createTau2ToolSpan(opts: {
  scope: SeedScope
  traceId: string
  spanId: string
  parentSpanId: string
  startTime: Date
  durationMs: number
  serviceName: string
  tags: readonly string[]
  metadata: Record<string, string>
  toolName: string
  toolCallId: string
  toolInput: Record<string, unknown>
  toolOutput: string
  error: boolean
  user: SeedUser | undefined
}): SpanRow {
  return {
    organization_id: opts.scope.organizationId,
    project_id: opts.scope.projectId,
    session_id: "",
    user_id: opts.user?.id ?? "",
    user_email: opts.user?.email ?? "",
    trace_id: opts.traceId,
    span_id: opts.spanId,
    parent_span_id: opts.parentSpanId,
    api_key_id: opts.scope.apiKeyId,
    simulation_id: "",
    start_time: formatClickHouseTimestamp(opts.startTime),
    end_time: formatClickHouseTimestamp(new Date(opts.startTime.getTime() + opts.durationMs)),
    name: `execute_tool ${opts.toolName}`,
    service_name: opts.serviceName,
    kind: 2,
    status_code: opts.error ? 2 : 1,
    status_message: opts.error ? opts.toolOutput : "",
    error_type: opts.error ? "ToolExecutionError" : "",
    tags: [...opts.tags],
    metadata: opts.metadata,
    operation: "execute_tool",
    provider: "",
    model: "",
    response_model: "",
    tokens_input: 0,
    tokens_output: 0,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: 0,
    cost_total_microcents: 0,
    cost_is_estimated: 0,
    time_to_first_token_ns: 0,
    is_streaming: 0,
    response_id: "",
    finish_reasons: [],
    input_messages: "",
    output_messages: "",
    system_instructions: "",
    tool_definitions: "",
    tool_call_id: opts.toolCallId,
    tool_name: opts.toolName,
    tool_input: JSON.stringify(opts.toolInput),
    tool_output: opts.toolOutput,
    attr_string: {
      "gen_ai.tool.name": opts.toolName,
      "gen_ai.tool.call.id": opts.toolCallId,
      "gen_ai.tool.type": "function",
    },
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: { "service.name": opts.serviceName },
    scope_name: "tool-instrumentation",
    scope_version: "1.0.0",
  }
}

function createCompatibilityChatSpan(opts: {
  scope: SeedScope
  traceKey: string
  index: number
  daysAgo: number
  userPrompt: string
  assistantResponse: string
  tags: readonly string[]
  metadata: Record<string, string>
  serviceName?: string
  systemInstruction?: string
  user?: SeedUser | undefined
}): SpanRow {
  const start = opts.scope.dateDaysAgo(opts.daysAgo, 10 + opts.index, 0)
  const traceId = opts.scope.traceHex(opts.traceKey, opts.index)
  const spanId = opts.scope.spanHex(opts.traceKey, opts.index)
  const inputMessages: Tau2Message[] = [{ role: "user", parts: [{ type: "text", content: opts.userPrompt }] }]
  const outputMessages: Tau2Message[] = [
    { role: "assistant", parts: [{ type: "text", content: opts.assistantResponse }] },
  ]
  const inputTokens = estimateTau2Tokens(inputMessages)
  const outputTokens = estimateTau2Tokens(outputMessages)

  return {
    organization_id: opts.scope.organizationId,
    project_id: opts.scope.projectId,
    session_id: "",
    user_id: opts.user?.id ?? "",
    user_email: opts.user?.email ?? "",
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: "",
    api_key_id: opts.scope.apiKeyId,
    simulation_id: "",
    start_time: formatClickHouseTimestamp(start),
    end_time: formatClickHouseTimestamp(new Date(start.getTime() + 1200)),
    name: "chat gpt-4.1",
    service_name: opts.serviceName ?? "tau2-retail-support-agent",
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: [...opts.tags],
    metadata: opts.metadata,
    operation: "chat",
    provider: "openai",
    model: "gpt-4.1",
    response_model: "gpt-4.1-2025-04-14",
    tokens_input: inputTokens,
    tokens_output: outputTokens,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: inputTokens * 25,
    cost_output_microcents: outputTokens * 100,
    cost_total_microcents: inputTokens * 25 + outputTokens * 100,
    cost_is_estimated: 1,
    time_to_first_token_ns: 180_000_000,
    is_streaming: 1,
    response_id: `seed-${spanId}`,
    finish_reasons: ["stop"],
    input_messages: JSON.stringify(inputMessages),
    output_messages: JSON.stringify(outputMessages),
    system_instructions: JSON.stringify([
      { type: "text", content: opts.systemInstruction ?? TAU2_SYSTEM_PROMPTS.retail },
    ]),
    tool_definitions: "",
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: { "gen_ai.request.temperature": 0 },
    attr_bool: {},
    resource_string: { "service.name": opts.serviceName ?? "tau2-retail-support-agent" },
    scope_name: "openai-instrumentation",
    scope_version: "1.0.0",
  }
}

const COMPATIBILITY_TRACE_SPECS = [
  {
    traceKey: "lifecycle",
    index: 0,
    daysAgo: 12,
    userPrompt: "Can you check whether my delivered keyboard return is still eligible?",
    assistantResponse:
      "I need to authenticate you first, then inspect the delivered order and item status before confirming return eligibility.",
    tags: ["support", "lifecycle", "tau2-retail"],
    metadata: { seed: "tau2-compatibility", story: "retail-return-lifecycle" },
    user: CUSTOMER_USERS[0],
  },
  {
    traceKey: "lifecycle",
    index: 1,
    daysAgo: 11,
    userPrompt: "I accidentally cancelled my order. Can you undo it immediately?",
    assistantResponse:
      "Cancelled orders cannot be reinstated automatically. I can help place a new order or transfer you for an out-of-scope exception review.",
    tags: ["support", "lifecycle", "tau2-retail"],
    metadata: { seed: "tau2-compatibility", story: "cancelled-order-policy" },
    user: CUSTOMER_USERS[1],
  },
  {
    traceKey: "lifecycle",
    index: 2,
    daysAgo: 10,
    userPrompt: "My phone has no service and I need it fixed before I leave the airport.",
    assistantResponse:
      "Let's troubleshoot step by step. I will inspect the device state, verify SIM and roaming settings, then run a speed test before calling this resolved.",
    tags: ["support", "lifecycle", "tau2-telecom"],
    metadata: { seed: "tau2-compatibility", story: "telecom-troubleshooting" },
    user: CUSTOMER_USERS[2],
  },
  {
    traceKey: "lifecycle",
    index: 3,
    daysAgo: 9,
    userPrompt: "Can you waive this mobile data fee as a courtesy?",
    assistantResponse:
      "I need to verify the account and policy eligibility before discussing credits. I cannot promise a waiver before review.",
    tags: ["support", "lifecycle", "tau2-telecom"],
    // Same user as the troubleshooting trace so one profile accumulates
    // multiple issue occurrences.
    metadata: { seed: "tau2-compatibility", story: "telecom-credit-policy" },
    user: CUSTOMER_USERS[2],
  },
  {
    traceKey: "lifecycle",
    index: 4,
    daysAgo: 8,
    userPrompt: "Should I get the premium credit card if I already have a corporate travel card?",
    assistantResponse:
      "I need to compare the card fees, rewards, and your subscription benefits against the policy documents before recommending a product.",
    tags: ["support", "lifecycle", "tau2-banking"],
    metadata: { seed: "tau2-compatibility", story: "banking-knowledge-grounding" },
    user: CUSTOMER_USERS[3],
  },
  {
    traceKey: "annotation-demo",
    index: 0,
    daysAgo: 2,
    userPrompt: "I want to return my gaming keyboard and mouse now that I quit gaming.",
    assistantResponse:
      "I authenticated the account, checked both delivered orders, and requested returns for the eligible keyboard and mouse to the original payment methods.",
    tags: ["support", "annotation", "tau2-retail"],
    metadata: { seed: "tau2-compatibility", story: "annotation-ui-polish" },
    user: CUSTOMER_USERS[0],
  },
  {
    traceKey: "code-block-demo",
    index: 0,
    daysAgo: 1,
    userPrompt: "How do I fetch a trace with the Latitude Node SDK?",
    assistantResponse:
      "Set your API key in the `Authorization` header, then call the SDK. Here's a minimal example:\n\n" +
      "```ts\n" +
      'import { Latitude } from "@latitude-data/sdk"\n\n' +
      "const sdk = new Latitude(process.env.LATITUDE_API_KEY!)\n" +
      'const trace = await sdk.traces.get("trace-id")\n' +
      "console.log(trace.spans.length)\n" +
      "```\n\n" +
      "Keep the key in an environment variable — never hard-code it.",
    tags: ["support", "developer", "code-example"],
    metadata: { seed: "tau2-compatibility", story: "code-block-rendering" },
    user: EMPLOYEE_USERS[0],
    serviceName: "developer-support-agent",
    systemInstruction:
      "You are a developer support AI agent. Help users integrate the Latitude SDK and API, and include short, correct code examples when useful.",
  },
] as const

export function buildCompatibilitySupportSpans(scope: SeedScope): SpanRow[] {
  return COMPATIBILITY_TRACE_SPECS.map((spec) => createCompatibilityChatSpan({ scope, ...spec }))
}

type LargeConversationSpec = {
  readonly traceKey: string
  readonly index: number
  readonly sessionId: string
  readonly daysAgo: number
  readonly turnCount: number
  readonly scenario: string
  readonly serviceName: string
  readonly user: SeedUser | undefined
}

const LARGE_CONVERSATION_CONTEXT = [
  "customer identity",
  "order history",
  "policy window",
  "warehouse status",
  "payment method",
  "fraud review",
  "shipping SLA",
  "loyalty tier",
  "prior escalation",
  "inventory reservation",
  "manager approval",
  "refund ledger",
] as const

function largeConversationText(spec: LargeConversationSpec, turnIndex: number, role: "user" | "assistant"): string {
  const checkpoint = turnIndex + 1
  const context = Array.from({ length: 6 }, (_, index) => {
    const item = LARGE_CONVERSATION_CONTEXT[(turnIndex + index) % LARGE_CONVERSATION_CONTEXT.length]
    return `${item}: ${spec.scenario} checkpoint ${checkpoint}.${index + 1}`
  }).join("; ")

  if (role === "user") {
    return `Large conversation seed ${spec.index + 1}, user turn ${checkpoint}. I need the assistant to keep every previous detail in mind while we test streamed conversation loading. ${context}. Please cross-check these facts before changing the recommendation.`
  }

  return `Large conversation seed ${spec.index + 1}, assistant turn ${checkpoint}. I am retaining the running case state, separating verified facts from pending checks, and keeping the recommendation conditional until the required evidence is complete. ${context}. Next I would verify the newest customer statement against the tool-backed record before committing to an outcome.`
}

function buildLargeConversationMessages(spec: LargeConversationSpec): Tau2Message[] {
  return Array.from({ length: spec.turnCount }).flatMap((_, turnIndex) => [
    { role: "user" as const, parts: [{ type: "text", content: largeConversationText(spec, turnIndex, "user") }] },
    {
      role: "assistant" as const,
      parts: [{ type: "text", content: largeConversationText(spec, turnIndex, "assistant") }],
    },
  ])
}

function createLargeConversationChatSpan(opts: { scope: SeedScope; spec: LargeConversationSpec }): SpanRow {
  const { scope, spec } = opts
  const start = scope.dateDaysAgo(spec.daysAgo, 13 + spec.index, 15)
  const traceId = scope.traceHex(spec.traceKey, spec.index)
  const spanId = scope.spanHex(spec.traceKey, spec.index)
  const inputMessages = buildLargeConversationMessages(spec)
  const renderedMessageCount = inputMessages.length + 2
  const outputMessages: Tau2Message[] = [
    {
      role: "assistant",
      parts: [
        {
          type: "text",
          content: `Large conversation seed ${spec.index + 1} final answer. This trace intentionally contains ${renderedMessageCount} rendered messages so the conversation drawer must page through chunks instead of returning the whole payload at once.`,
        },
      ],
    },
  ]
  const inputTokens = estimateTau2Tokens(inputMessages)
  const outputTokens = estimateTau2Tokens(outputMessages)
  const durationMs = spec.turnCount * 1200

  return {
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    session_id: spec.sessionId,
    user_id: spec.user?.id ?? "",
    user_email: spec.user?.email ?? "",
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: "",
    api_key_id: scope.apiKeyId,
    simulation_id: "",
    start_time: formatClickHouseTimestamp(start),
    end_time: formatClickHouseTimestamp(new Date(start.getTime() + durationMs)),
    name: "chat gpt-4.1 large conversation",
    service_name: spec.serviceName,
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: ["support", "large-conversation", "streaming-fixture"],
    metadata: {
      seed: "large-conversation",
      story: spec.scenario,
      fixture: "conversation-streaming",
      turnCount: String(spec.turnCount),
    },
    operation: "chat",
    provider: "openai",
    model: "gpt-4.1",
    response_model: "gpt-4.1-2025-04-14",
    tokens_input: inputTokens,
    tokens_output: outputTokens,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: inputTokens * 25,
    cost_output_microcents: outputTokens * 100,
    cost_total_microcents: inputTokens * 25 + outputTokens * 100,
    cost_is_estimated: 1,
    time_to_first_token_ns: 260_000_000,
    is_streaming: 1,
    response_id: `seed-${spanId}`,
    finish_reasons: ["stop"],
    input_messages: JSON.stringify(inputMessages),
    output_messages: JSON.stringify(outputMessages),
    system_instructions: JSON.stringify([
      {
        type: "text",
        content:
          "You are a support agent in a deterministic load-test conversation. Preserve context across hundreds of turns and keep conclusions grounded in verified facts.",
      },
    ]),
    tool_definitions: "",
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: { "gen_ai.request.temperature": 0 },
    attr_bool: {},
    resource_string: { "service.name": spec.serviceName },
    scope_name: "openai-instrumentation",
    scope_version: "1.0.0",
  }
}

const LARGE_CONVERSATION_SPECS: readonly LargeConversationSpec[] = [
  {
    traceKey: "large-conversation",
    index: 0,
    sessionId: "seed-large-conversation-1",
    daysAgo: 1,
    turnCount: 120,
    scenario: "return eligibility investigation with repeated shipping and payment updates",
    serviceName: "load-test-retail-support-agent",
    user: CUSTOMER_USERS[4],
  },
  {
    traceKey: "large-conversation",
    index: 1,
    sessionId: "seed-large-conversation-2",
    daysAgo: 1,
    turnCount: 240,
    scenario: "telecom outage troubleshooting with many device-state checkpoints",
    serviceName: "load-test-telecom-support-agent",
    user: CUSTOMER_USERS[5],
  },
  {
    traceKey: "large-conversation",
    index: 2,
    sessionId: "seed-large-conversation-3",
    daysAgo: 1,
    turnCount: 420,
    scenario: "travel itinerary exception review with long-running policy comparisons",
    serviceName: "load-test-travel-support-agent",
    user: CUSTOMER_USERS[6],
  },
]

function buildLargeConversationSpans(scope: SeedScope): SpanRow[] {
  return LARGE_CONVERSATION_SPECS.map((spec) => createLargeConversationChatSpan({ scope, spec }))
}

export function buildTau2TrajectorySpans(scope: SeedScope, maxTrajectories = TAU2_SEED_TRAJECTORIES.length): SpanRow[] {
  const spans: SpanRow[] = []

  TAU2_SEED_TRAJECTORIES.slice(0, maxTrajectories).forEach((trajectory, trajectoryIndex) => {
    const messages: readonly Tau2SeedTrajectoryMessage[] = trajectory.messages
    const traceId = scope.traceHex("tau2-trajectory", trajectoryIndex)
    const rootSpanId = scope.spanHex("tau2-trajectory-root", trajectoryIndex)
    // Deterministic weighted per-trajectory customer: stable user profiles
    // across re-seeds (scores point at these traces), with trace counts
    // following the pool's power-law weights so usage charts look realistic.
    const user = seedUserAt(CUSTOMER_USERS, trajectoryIndex)
    const serviceName = `tau2-${trajectory.domain}-support-agent`
    const tags = ["support", "tau2-bench", trajectory.domain, trajectory.outcome]
    const metadata = {
      seed: "tau2-bench",
      source: "sierra-research/tau2-bench",
      sourceFile: trajectory.sourceFile,
      trial: String(trajectory.trial ?? ""),
      domain: trajectory.domain,
      taskId: trajectory.taskId,
      outcome: trajectory.outcome,
      reward: String(trajectory.reward),
      terminationReason: trajectory.terminationReason,
      reasonForCall: trajectory.reasonForCall,
      expectedActions: trajectory.expectedActions.join(","),
    }
    const toolDefinitions = Array.from(
      new Set([
        ...messages.flatMap((message) =>
          message.role === "assistant" ? (message.toolCalls ?? []).map((call) => call.name) : [],
        ),
        ...(TAU2_UNUSED_TOOLS_BY_DOMAIN[trajectory.domain] ?? []),
      ]),
    )

    const start = scope.dateDaysAgo(
      trajectoryIndex % 14,
      (trajectoryIndex * 17 + Math.floor(trajectoryIndex / 14) * 5) % 24,
      (trajectoryIndex * 37 + Math.floor(trajectoryIndex / 7) * 11) % 60,
    )
    let cursor = new Date(start)
    let spanIndex = 0
    const history: Tau2Message[] = []
    const toolCallsById = new Map<string, { name: string; arguments: Record<string, unknown> }>()
    const root: SpanRow = {
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      session_id: "",
      user_id: user?.id ?? "",
      user_email: user?.email ?? "",
      trace_id: traceId,
      span_id: rootSpanId,
      parent_span_id: "",
      api_key_id: scope.apiKeyId,
      simulation_id: "",
      start_time: formatClickHouseTimestamp(start),
      end_time: formatClickHouseTimestamp(new Date(start.getTime() + messages.length * 900)),
      name: `invoke_agent ${serviceName}`,
      service_name: serviceName,
      kind: 2,
      status_code: trajectory.outcome === "success" ? 1 : 2,
      status_message: trajectory.outcome === "success" ? "" : "tau2 trajectory did not satisfy benchmark reward",
      error_type: trajectory.outcome === "success" ? "" : "BenchmarkFailure",
      tags,
      metadata,
      operation: "invoke_agent",
      provider: "openai",
      model: "gpt-4.1",
      response_model: "gpt-4.1-2025-04-14",
      tokens_input: 0,
      tokens_output: 0,
      tokens_cache_read: 0,
      tokens_cache_create: 0,
      tokens_reasoning: 0,
      cost_input_microcents: 0,
      cost_output_microcents: 0,
      cost_total_microcents: 0,
      cost_is_estimated: 1,
      time_to_first_token_ns: 0,
      is_streaming: 0,
      response_id: "",
      finish_reasons: [],
      input_messages: "",
      output_messages: "",
      system_instructions: JSON.stringify([{ type: "text", content: TAU2_SYSTEM_PROMPTS[trajectory.domain] }]),
      tool_definitions: JSON.stringify(
        toolDefinitions.map((name) => ({ name, description: TAU2_TOOL_DESCRIPTIONS[name] ?? `${name} tool` })),
      ),
      tool_call_id: "",
      tool_name: "",
      tool_input: "",
      tool_output: "",
      attr_string: {},
      attr_int: {},
      attr_float: {},
      attr_bool: {},
      resource_string: { "service.name": serviceName },
      scope_name: "",
      scope_version: "",
    }
    spans.push(root)

    for (const message of messages) {
      if (message.role === "user") {
        history.push(tau2MessageToStoredMessage(message))
        continue
      }

      if (message.role === "assistant") {
        for (const call of message.toolCalls ?? []) {
          toolCallsById.set(call.id, { name: call.name, arguments: call.arguments })
        }
        const outputMessage = tau2MessageToStoredMessage(message)
        const durationMs = message.toolCalls && message.toolCalls.length > 0 ? 650 : 1200
        spans.push(
          createTau2LlmSpan({
            scope,
            traceId,
            spanId: scope.spanHex("tau2-trajectory", trajectoryIndex * 1000 + spanIndex++),
            parentSpanId: rootSpanId,
            startTime: cursor,
            durationMs,
            inputMessages: history,
            outputMessage,
            systemInstruction: TAU2_SYSTEM_PROMPTS[trajectory.domain],
            serviceName,
            tags,
            metadata,
            toolDefinitions,
            user,
          }),
        )
        history.push(outputMessage)
        cursor = new Date(cursor.getTime() + durationMs + 120)
        continue
      }

      const toolMessage = message as Extract<Tau2SeedTrajectoryMessage, { role: "tool" }>
      const call = toolCallsById.get(toolMessage.id)
      spans.push(
        createTau2ToolSpan({
          scope,
          traceId,
          spanId: scope.spanHex("tau2-trajectory", trajectoryIndex * 1000 + spanIndex++),
          parentSpanId: rootSpanId,
          startTime: cursor,
          durationMs: 180,
          serviceName,
          tags,
          metadata,
          toolName: toolMessage.name || call?.name || "unknown_tool",
          toolCallId: toolMessage.id,
          toolInput: call?.arguments ?? {},
          toolOutput: toolMessage.content,
          error: toolMessage.error,
          user,
        }),
      )
      history.push(tau2MessageToStoredMessage(toolMessage))
      cursor = new Date(cursor.getTime() + 260)
    }

    const finalAssistantIndex = history.map((message) => message.role).lastIndexOf("assistant")
    const rootInputMessages = finalAssistantIndex >= 0 ? history.slice(0, finalAssistantIndex) : history
    const rootOutputMessages = finalAssistantIndex >= 0 ? [history[finalAssistantIndex]!] : []
    const rootInputTokens = estimateTau2Tokens(rootInputMessages)
    const rootOutputTokens = estimateTau2Tokens(rootOutputMessages)

    root.tokens_input = rootInputTokens
    root.tokens_output = rootOutputTokens
    root.cost_input_microcents = rootInputTokens * 25
    root.cost_output_microcents = rootOutputTokens * 100
    root.cost_total_microcents = root.cost_input_microcents + root.cost_output_microcents
    root.input_messages = serializeMessages(rootInputMessages)
    root.output_messages = serializeMessages(rootOutputMessages)
    root.end_time = formatClickHouseTimestamp(new Date(cursor.getTime() + 50))
  })

  return spans
}

function buildAllFixedSpans(scope: SeedScope, maxTau2Trajectories?: number): SpanRow[] {
  return [...buildTau2TrajectorySpans(scope, maxTau2Trajectories), ...buildCompatibilitySupportSpans(scope)]
}

const seedFixedTraces: Seeder = {
  name: "spans/fixed-traces",
  run: (ctx) =>
    Effect.gen(function* () {
      // Sentinel: the first deterministic tau2 trace_id. Present iff this
      // seeder has run before against the current scope.
      const sentinel = ctx.scope.traceHex("tau2-trajectory", 0)
      const present = yield* isSentinelPresent(ctx.client, "spans", "trace_id = {sentinel:String}", { sentinel })
      if (present) {
        if (!ctx.quiet) console.log("  -> spans/fixed-traces: already seeded, skipping")
        return
      }
      const allFixedSpans = buildAllFixedSpans(ctx.scope, ctx.maxTau2Trajectories)
      // `insertJsonEachRow` chunks large inserts into multiple requests, so a
      // mid-insert failure can commit some batches but not others. The sentinel
      // above is read back from the `spans` table, so it must only become
      // visible once the *whole* fixture set has landed — otherwise a retry
      // after a partial insert would find the sentinel, skip, and leave spans
      // permanently missing. Insert every non-sentinel span first and the
      // sentinel trace's spans last. A retry that re-inserts earlier batches is
      // safe: `spans` is a ReplacingMergeTree keyed by span_id, so duplicates
      // collapse on merge.
      const sentinelSpans = allFixedSpans.filter((span) => span.trace_id === sentinel)
      const nonSentinelSpans = allFixedSpans.filter((span) => span.trace_id !== sentinel)
      yield* insertJsonEachRow(ctx.client, "spans", nonSentinelSpans)
      yield* insertJsonEachRow(ctx.client, "spans", sentinelSpans)
      if (!ctx.quiet) console.log(`  -> spans/fixed-traces: ${allFixedSpans.length} deterministic tau2 spans`)
    }),
}

const seedLargeConversationTraces: Seeder = {
  name: "spans/large-conversation-traces",
  run: (ctx) =>
    Effect.gen(function* () {
      const sentinel = ctx.scope.traceHex("large-conversation", 0)
      const present = yield* isSentinelPresent(ctx.client, "spans", "trace_id = {sentinel:String}", { sentinel })
      if (present) {
        if (!ctx.quiet) console.log("  -> spans/large-conversation-traces: already seeded, skipping")
        return
      }

      const spans = buildLargeConversationSpans(ctx.scope)
      const sentinelSpans = spans.filter((span) => span.trace_id === sentinel)
      const nonSentinelSpans = spans.filter((span) => span.trace_id !== sentinel)
      yield* insertJsonEachRow(ctx.client, "spans", nonSentinelSpans)
      yield* insertJsonEachRow(ctx.client, "spans", sentinelSpans)
      if (!ctx.quiet) console.log(`  -> spans/large-conversation-traces: ${spans.length} streaming stress traces`)
    }),
}

export const fixedTraceSeeders: readonly Seeder[] = [seedFixedTraces, seedLargeConversationTraces]

/**
 * Every deterministic trace this module seeds, as `(traceKey, index)` slots.
 * Must stay in lockstep with the builders above; the demo-project snapshot
 * import enumerates these to remap trace ids across projects.
 */
export const fixedTraceSlots: readonly TraceSlot[] = [
  ...TAU2_SEED_TRAJECTORIES.map((_, index) => ({ traceKey: "tau2-trajectory", index })),
  ...LARGE_CONVERSATION_SPECS.map((spec) => ({ traceKey: spec.traceKey, index: spec.index })),
  ...COMPATIBILITY_TRACE_SPECS.map((spec) => ({ traceKey: spec.traceKey, index: spec.index })),
]
