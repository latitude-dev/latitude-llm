export const Topics = {
  domainEvents: "domain-events",
  domainEventsDlq: "domain-events-dlq",
  spanIngestion: "span-ingestion",
} as const

export type TopicName = (typeof Topics)[keyof typeof Topics]
