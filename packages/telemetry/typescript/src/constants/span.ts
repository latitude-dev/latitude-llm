export enum SpanType {
  Prompt = "prompt",
  Chat = "chat",
  External = "external",
  UnresolvedExternal = "unresolved_external",
  Http = "http",
  Completion = "completion",
  Tool = "tool",
  Embedding = "embedding",
  Unknown = "unknown",
}

export type SpanSpecification = {
  name: string
  description: string
  isGenAI: boolean
  isHidden: boolean
}

export const SPAN_SPECIFICATIONS = {
  [SpanType.Prompt]: {
    name: "Prompt",
    description: "A prompt span",
    isGenAI: false,
    isHidden: false,
  },
  [SpanType.Chat]: {
    name: "Chat",
    description: "A chat continuation span",
    isGenAI: false,
    isHidden: false,
  },
  [SpanType.External]: {
    name: "External",
    description: "An external capture span",
    isGenAI: false,
    isHidden: false,
  },
  [SpanType.UnresolvedExternal]: {
    name: "Unresolved External",
    description: "An external span that needs path resolution before storage",
    isGenAI: false,
    isHidden: true,
  },
  [SpanType.Completion]: {
    name: "Completion",
    description: "A completion call",
    isGenAI: true,
    isHidden: false,
  },
  [SpanType.Embedding]: {
    name: "Embedding",
    description: "An embedding call",
    isGenAI: true,
    isHidden: false,
  },
  [SpanType.Tool]: {
    name: "Tool",
    description: "A tool call",
    isGenAI: true,
    isHidden: false,
  },
  [SpanType.Http]: {
    name: "HTTP",
    description: "An HTTP request",
    isGenAI: false,
    isHidden: true,
  },
  [SpanType.Unknown]: {
    name: "Unknown",
    description: "An unknown span",
    isGenAI: false,
    isHidden: true,
  },
} as const satisfies {
  [T in SpanType]: SpanSpecification
}
