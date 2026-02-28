import { Context } from "effect";

export class BullmqQueueAdapterTag extends Context.Tag("BullmqQueueAdapterTag")<
  BullmqQueueAdapterTag,
  {
    readonly type: "bullmq";
  }
>() {}

export const bullmqQueueAdapter = {
  type: "bullmq" as const,
};
