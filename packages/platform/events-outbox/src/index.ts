import { Context } from "effect";

export class EventsOutboxAdapterTag extends Context.Tag("EventsOutboxAdapterTag")<
  EventsOutboxAdapterTag,
  {
    readonly type: "outbox";
  }
>() {}

export const eventsOutboxAdapter = {
  type: "outbox" as const,
};
