/**
 * Attribute keys for trace-wide context set via capture().
 * Propagated to all spans within the trace by the BaggageSpanProcessor.
 */
export const ATTRIBUTES = {
  tags: "latitude.tags",
  metadata: "latitude.metadata",
  sessionId: "session.id",
  userId: "user.id",
} as const
