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

const toTraceEndedEvent = (payload: EndPayload) =>
  ({
    name: "TraceEnded",
    organizationId: payload.organizationId,
    payload,
  }) satisfies DomainEvent<"TraceEnded", EventPayloads["TraceEnded"]>

export const createLiveTracesWorker = ({ consumer, eventsPublisher }: LiveTracesDeps) => {
  consumer.subscribe("live-traces", {
    end: (payload: EndPayload) => eventsPublisher.publish(toTraceEndedEvent(payload)),
  })
}
