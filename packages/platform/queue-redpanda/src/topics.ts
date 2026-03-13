export const Topics = {
  domainEvents: "domain-events",
  domainEventsDlq: "domain-events-dlq",
} as const

export type TopicName = (typeof Topics)[keyof typeof Topics]
