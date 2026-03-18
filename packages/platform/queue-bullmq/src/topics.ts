export const Topics = {
  datasetExport: "dataset-export",
  domainEvents: "domain-events",
  domainEventsDlq: "domain-events-dlq",
  spanIngestion: "span-ingestion",
} as const

export type TopicName = (typeof Topics)[keyof typeof Topics]

export interface DatasetExportPayload {
  readonly datasetId: string
  readonly organizationId: string
  readonly projectId: string
  readonly recipientEmail: string
}
