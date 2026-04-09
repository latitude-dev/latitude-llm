import type { ModelConfig } from "./models.ts"
import { EMBEDDING_MODELS, MODELS } from "./models.ts"
import {
  COPYWRITER_PROMPTS,
  COPYWRITER_RESPONSES,
  COPYWRITER_SYSTEM_PROMPT,
  KNOWLEDGE_ASSISTANT_PROMPTS,
  KNOWLEDGE_ASSISTANT_RESPONSES,
  KNOWLEDGE_ASSISTANT_SYSTEM_PROMPT,
  ORDER_ROUTER_PROMPTS,
  ORDER_ROUTER_RESPONSES,
  ORDER_ROUTER_SYSTEM_PROMPT,
  QA_CLASSIFIER_PROMPTS,
  QA_CLASSIFIER_RESPONSES,
  QA_CLASSIFIER_SYSTEM_PROMPT,
  SAFETY_REVIEWER_PROMPTS,
  SAFETY_REVIEWER_RESPONSES,
  SAFETY_REVIEWER_SYSTEM_PROMPT,
} from "./prompts.ts"
import type { ToolConfig } from "./tools.ts"
import { ORDER_ROUTER_TOOLS, SAFETY_REVIEWER_TOOLS, SUPPORT_AGENT_TOOLS } from "./tools.ts"
import type { ConversationTopic } from "./topics.ts"
import { SUPPORT_AGENT_TOPICS } from "./topics.ts"
import { CUSTOMER_EMAILS, EMPLOYEE_EMAILS } from "./users.ts"

export type TracePattern = "simple_chat" | "tool_call" | "rag" | "multi_step" | "complex_agent" | "error"

export type AgentProfile = {
  readonly name: string
  readonly serviceName: string
  readonly tag: string
  readonly environments: readonly string[]
  readonly systemPrompt: string
  readonly models: readonly ModelConfig[]
  readonly embeddingModels?: readonly ModelConfig[]
  readonly tools?: readonly ToolConfig[]
  readonly userIdPool: readonly string[]
  readonly userIdProbability: number
  readonly sessionConfig: {
    readonly enabled: boolean
    readonly alwaysAssign: boolean
    readonly sizeDistribution: readonly { size: number; weight: number }[]
  }
  readonly patternWeights: readonly {
    pattern: TracePattern
    weight: number
  }[]
  readonly errorTypes: readonly { type: string; message: string }[]
  readonly traceBudgetWeight: number
  readonly topics?: readonly ConversationTopic[]
  readonly prompts?: {
    readonly user: readonly string[]
    readonly assistant: readonly string[]
  }
}

const openaiModels = MODELS.filter((m) => m.provider === "openai")
const anthropicModels = MODELS.filter((m) => m.provider === "anthropic")
const deepseekModels = MODELS.filter((m) => m.provider === "deepseek")
const googleModels = MODELS.filter((m) => m.provider === "google")

function requiredModel(
  models: readonly ModelConfig[],
  predicate: (model: ModelConfig) => boolean,
  name: string,
): ModelConfig {
  const model = models.find(predicate)
  if (!model) {
    throw new Error(`Missing required seed model: ${name}`)
  }
  return model
}

function requiredAt<T>(items: readonly T[], index: number, name: string): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`Missing required seeded item: ${name}`)
  }
  return item
}

const openAiMiniModel = requiredModel(openaiModels, (model) => model.model === "gpt-4o-mini", "gpt-4o-mini")
const knowledgeAssistantModel = requiredModel(
  anthropicModels,
  (model) => model.model === "claude-3-5-haiku",
  "claude-3-5-haiku",
)
const defaultEmbeddingModel = requiredAt(EMBEDDING_MODELS, 0, "default embedding model")

export const AGENT_PROFILES: readonly AgentProfile[] = [
  {
    name: "Acme Assist",
    serviceName: "acme-support-agent",
    tag: "support",
    environments: ["production", "staging"],
    systemPrompt:
      "You are Acme Assist, the customer support AI for Acme Corporation. Help customers with orders, returns, product information, and technical support. Always refer to Acme's warranty policy, which covers manufacturing defects but explicitly excludes misuse involving roadrunners, cliffs, or violations of the laws of physics. Be friendly and professional. At Acme, satisfaction is guaranteed. (Guarantee does not constitute a legally binding promise.)",
    models: openaiModels,
    tools: SUPPORT_AGENT_TOOLS,
    userIdPool: CUSTOMER_EMAILS,
    userIdProbability: 0.6,
    sessionConfig: {
      enabled: true,
      alwaysAssign: true,
      sizeDistribution: [
        { size: 1, weight: 50 },
        { size: 2, weight: 20 },
        { size: 3, weight: 13 },
        { size: 4, weight: 5 },
        { size: 5, weight: 5 },
        { size: 6, weight: 3 },
        { size: 7, weight: 2 },
        { size: 8, weight: 2 },
      ],
    },
    patternWeights: [
      { pattern: "simple_chat", weight: 25 },
      { pattern: "tool_call", weight: 40 },
      { pattern: "rag", weight: 10 },
      { pattern: "multi_step", weight: 20 },
    ],
    errorTypes: [
      {
        type: "RateLimitError",
        message: "Rate limit exceeded. Please retry after 30 seconds.",
      },
      { type: "TimeoutError", message: "Request timed out after 30000ms." },
      {
        type: "ServiceUnavailableError",
        message: "The model is currently overloaded. Please try again later.",
      },
    ],
    traceBudgetWeight: 0.4,
    topics: SUPPORT_AGENT_TOPICS,
  },
  {
    name: "Order Router",
    serviceName: "acme-order-router",
    tag: "order-fulfillment",
    environments: ["production"],
    systemPrompt: ORDER_ROUTER_SYSTEM_PROMPT,
    models: [openAiMiniModel],
    tools: ORDER_ROUTER_TOOLS,
    userIdPool: [],
    userIdProbability: 0,
    sessionConfig: {
      enabled: false,
      alwaysAssign: false,
      sizeDistribution: [],
    },
    patternWeights: [
      { pattern: "tool_call", weight: 25 },
      { pattern: "multi_step", weight: 70 },
    ],
    errorTypes: [
      { type: "TimeoutError", message: "Request timed out after 30000ms." },
      {
        type: "InvalidRequestError",
        message: "The model does not support the provided parameters.",
      },
    ],
    traceBudgetWeight: 0.15,
    prompts: { user: ORDER_ROUTER_PROMPTS, assistant: ORDER_ROUTER_RESPONSES },
  },
  {
    name: "Product Copywriter",
    serviceName: "acme-copywriter",
    tag: "product-copywriting",
    environments: ["production", "staging"],
    systemPrompt: COPYWRITER_SYSTEM_PROMPT,
    models: anthropicModels,
    userIdPool: EMPLOYEE_EMAILS,
    userIdProbability: 0.5,
    sessionConfig: {
      enabled: true,
      alwaysAssign: false,
      sizeDistribution: [
        { size: 1, weight: 70 },
        { size: 2, weight: 20 },
        { size: 3, weight: 10 },
      ],
    },
    patternWeights: [{ pattern: "simple_chat", weight: 90 }],
    errorTypes: [
      {
        type: "ContentFilterError",
        message: "Content was filtered due to policy violations.",
      },
      { type: "TimeoutError", message: "Request timed out after 30000ms." },
    ],
    traceBudgetWeight: 0.1,
    prompts: { user: COPYWRITER_PROMPTS, assistant: COPYWRITER_RESPONSES },
  },
  {
    name: "Safety Incident Reviewer",
    serviceName: "acme-safety-reviewer",
    tag: "safety-review",
    environments: ["production"],
    systemPrompt: SAFETY_REVIEWER_SYSTEM_PROMPT,
    models: [...MODELS.filter((m) => m.model === "o3-mini"), ...googleModels],
    embeddingModels: [defaultEmbeddingModel],
    tools: SAFETY_REVIEWER_TOOLS,
    userIdPool: [],
    userIdProbability: 0,
    sessionConfig: {
      enabled: false,
      alwaysAssign: false,
      sizeDistribution: [],
    },
    patternWeights: [
      { pattern: "rag", weight: 50 },
      { pattern: "complex_agent", weight: 40 },
    ],
    errorTypes: [
      {
        type: "ContextLengthExceededError",
        message: "Maximum context length exceeded. Reduce input or use a larger model.",
      },
      { type: "TimeoutError", message: "Request timed out after 30000ms." },
    ],
    traceBudgetWeight: 0.15,
    prompts: {
      user: SAFETY_REVIEWER_PROMPTS,
      assistant: SAFETY_REVIEWER_RESPONSES,
    },
  },
  {
    name: "QA Complaint Classifier",
    serviceName: "acme-qa-classifier",
    tag: "qa-triage",
    environments: ["production", "canary"],
    systemPrompt: QA_CLASSIFIER_SYSTEM_PROMPT,
    models: [openAiMiniModel, ...deepseekModels],
    userIdPool: [],
    userIdProbability: 0,
    sessionConfig: {
      enabled: false,
      alwaysAssign: false,
      sizeDistribution: [],
    },
    patternWeights: [{ pattern: "simple_chat", weight: 80 }],
    errorTypes: [
      {
        type: "InvalidRequestError",
        message: "The model does not support the provided parameters.",
      },
      {
        type: "ContentFilterError",
        message: "Content was filtered due to policy violations.",
      },
      { type: "TimeoutError", message: "Request timed out after 30000ms." },
    ],
    traceBudgetWeight: 0.1,
    prompts: {
      user: QA_CLASSIFIER_PROMPTS,
      assistant: QA_CLASSIFIER_RESPONSES,
    },
  },
  {
    name: "Internal Knowledge Assistant",
    serviceName: "acme-knowledge-assistant",
    tag: "internal-kb",
    environments: ["production", "development"],
    systemPrompt: KNOWLEDGE_ASSISTANT_SYSTEM_PROMPT,
    models: [knowledgeAssistantModel],
    embeddingModels: [defaultEmbeddingModel],
    userIdPool: EMPLOYEE_EMAILS,
    userIdProbability: 0.7,
    sessionConfig: {
      enabled: true,
      alwaysAssign: false,
      sizeDistribution: [
        { size: 1, weight: 70 },
        { size: 2, weight: 20 },
        { size: 3, weight: 10 },
      ],
    },
    patternWeights: [
      { pattern: "simple_chat", weight: 30 },
      { pattern: "rag", weight: 60 },
    ],
    errorTypes: [
      {
        type: "RateLimitError",
        message: "Rate limit exceeded. Please retry after 30 seconds.",
      },
      {
        type: "ServiceUnavailableError",
        message: "The model is currently overloaded. Please try again later.",
      },
    ],
    traceBudgetWeight: 0.1,
    prompts: {
      user: KNOWLEDGE_ASSISTANT_PROMPTS,
      assistant: KNOWLEDGE_ASSISTANT_RESPONSES,
    },
  },
]

/**
 * Error rate for trace generation. When a random roll falls within this range,
 * the trace becomes an error trace instead of its assigned pattern.
 * Per design section 5.2: 5-20% per agent.
 */
export const AGENT_ERROR_RATES: Record<string, number> = {
  "acme-support-agent": 0.05,
  "acme-order-router": 0.05,
  "acme-safety-reviewer": 0.1,
  "acme-copywriter": 0.1,
  "acme-qa-classifier": 0.2,
  "acme-knowledge-assistant": 0.1,
}
