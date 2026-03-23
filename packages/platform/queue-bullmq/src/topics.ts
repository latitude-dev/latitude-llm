import type { QueueName } from "@domain/queue"

export const Topics = {
  datasetExport: "dataset-export",
  domainEvents: "domain-events",
  magicLinkEmail: "magic-link-email",
  spanIngestion: "span-ingestion",
} as const satisfies Record<string, QueueName>

export type TopicName = (typeof Topics)[keyof typeof Topics]

export interface DatasetExportPayload {
  readonly datasetId: string
  readonly organizationId: string
  readonly projectId: string
  readonly recipientEmail: string
}

export interface MagicLinkEmailPayload {
  readonly email: string
  readonly magicLinkUrl: string
  readonly authIntentId: string | null
}
