import { createFakeProductFeedbackClient } from "@domain/product-feedback/testing"
import { describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/test-queue-consumer.ts"
import { createProductFeedbackWorker } from "./product-feedback.ts"

const QUEUE = "product-feedback"

describe("product-feedback worker", () => {
  it("submitSystemAnnotatorReview (approve, no comment) writes through the client", async () => {
    const consumer = new TestQueueConsumer()
    const fake = createFakeProductFeedbackClient()
    createProductFeedbackWorker({ consumer, productFeedbackClient: fake.client })

    await consumer.dispatchTask(QUEUE, "submitSystemAnnotatorReview", {
      upstreamScoreId: "score-sys-1",
      review: { decision: "approve" },
    })

    expect(fake.writes).toHaveLength(1)
    expect(fake.writes[0]).toEqual({
      upstreamScoreId: "score-sys-1",
      passed: true,
      value: 1,
      feedback: "Approved",
    })
  })

  it("submitSystemAnnotatorReview (reject) passes the required comment as feedback", async () => {
    const consumer = new TestQueueConsumer()
    const fake = createFakeProductFeedbackClient()
    createProductFeedbackWorker({ consumer, productFeedbackClient: fake.client })

    await consumer.dispatchTask(QUEUE, "submitSystemAnnotatorReview", {
      upstreamScoreId: "score-sys-2",
      review: { decision: "reject", comment: "Too harsh." },
    })

    expect(fake.writes[0]).toEqual({
      upstreamScoreId: "score-sys-2",
      passed: false,
      value: 0,
      feedback: "Too harsh.",
    })
  })

  it("submitEnrichmentReview (good) writes the fixed 'Good enrichment' feedback", async () => {
    const consumer = new TestQueueConsumer()
    const fake = createFakeProductFeedbackClient()
    createProductFeedbackWorker({ consumer, productFeedbackClient: fake.client })

    await consumer.dispatchTask(QUEUE, "submitEnrichmentReview", {
      upstreamScoreId: "score-enrich-1",
      review: { decision: "good" },
    })

    expect(fake.writes[0]).toEqual({
      upstreamScoreId: "score-enrich-1",
      passed: true,
      value: 1,
      feedback: "Good enrichment",
    })
  })

  it("submitEnrichmentReview (bad) carries the reason through", async () => {
    const consumer = new TestQueueConsumer()
    const fake = createFakeProductFeedbackClient()
    createProductFeedbackWorker({ consumer, productFeedbackClient: fake.client })

    await consumer.dispatchTask(QUEUE, "submitEnrichmentReview", {
      upstreamScoreId: "score-enrich-2",
      review: { decision: "bad", comment: "Changed the meaning." },
    })

    expect(fake.writes[0]).toEqual({
      upstreamScoreId: "score-enrich-2",
      passed: false,
      value: 0,
      feedback: "Changed the meaning.",
    })
  })

  it("swallows ProductFeedbackRequestError so a 4xx does not poison the queue", async () => {
    const consumer = new TestQueueConsumer()
    const fake = createFakeProductFeedbackClient({
      fail: { kind: "request", statusCode: 400, message: "validation failed" },
    })
    createProductFeedbackWorker({ consumer, productFeedbackClient: fake.client })

    // Must resolve (no thrown rejection). BullMQ completes the job; a warn is
    // logged. Retrying a malformed body would just produce the same 4xx.
    await expect(
      consumer.dispatchTask(QUEUE, "submitSystemAnnotatorReview", {
        upstreamScoreId: "score-bad",
        review: { decision: "reject", comment: "reason" },
      }),
    ).resolves.toBeUndefined()
  })

  it("propagates ProductFeedbackTransportError so BullMQ retries the job", async () => {
    const consumer = new TestQueueConsumer()
    const fake = createFakeProductFeedbackClient({
      fail: { kind: "transport", cause: new Error("ECONNRESET") },
    })
    createProductFeedbackWorker({ consumer, productFeedbackClient: fake.client })

    // Rejection = BullMQ marks the job failed and schedules a retry. Swallowing
    // here would hide intermittent outages and cause silent data loss.
    await expect(
      consumer.dispatchTask(QUEUE, "submitEnrichmentReview", {
        upstreamScoreId: "score-transport",
        review: { decision: "good" },
      }),
    ).rejects.toMatchObject({ _tag: "ProductFeedbackTransportError" })
  })
})
