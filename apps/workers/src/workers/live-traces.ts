import type { DomainEvent, EventPayloads, EventsPublisher } from "@domain/events"
import type { QueueConsumer, QueuePublishError } from "@domain/queue"

interface LiveTracesDeps {
  consumer: QueueConsumer
  eventsPublisher: EventsPublisher<QueuePublishError>
}

interface EndPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

const toTraceEndedEvent = (payload: EndPayload): DomainEvent<"TraceEnded", EventPayloads["TraceEnded"]> => ({
  name: "TraceEnded",
  organizationId: payload.organizationId,
  payload: {
    organizationId: payload.organizationId,
    projectId: payload.projectId,
    traceId: payload.traceId,
  },
})

export const createLiveTracesWorker = ({ consumer, eventsPublisher }: LiveTracesDeps) => {
  consumer.subscribe("live-traces", {
    end: (payload: EndPayload) => eventsPublisher.publish(toTraceEndedEvent(payload)),
  })
}
