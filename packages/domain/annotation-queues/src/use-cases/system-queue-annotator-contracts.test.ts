import { describe, expect, it } from "vitest"
import {
  systemQueueAnnotateInputSchema,
  systemQueueAnnotateOutputSchema,
  systemQueueAnnotatorOutputSchema,
} from "./system-queue-annotator-contracts.ts"

describe("systemQueueAnnotateInputSchema", () => {
  it("accepts valid input", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      queueSlug: "jailbreaking",
      traceId: "trace_789",
    }
    const result = systemQueueAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it("rejects missing organizationId", () => {
    const input = {
      projectId: "proj_456",
      queueSlug: "jailbreaking",
      traceId: "trace_789",
    }
    const result = systemQueueAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects empty organizationId", () => {
    const input = {
      organizationId: "",
      projectId: "proj_456",
      queueSlug: "jailbreaking",
      traceId: "trace_789",
    }
    const result = systemQueueAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects missing projectId", () => {
    const input = {
      organizationId: "org_123",
      queueSlug: "jailbreaking",
      traceId: "trace_789",
    }
    const result = systemQueueAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects empty projectId", () => {
    const input = {
      organizationId: "org_123",
      projectId: "",
      queueSlug: "jailbreaking",
      traceId: "trace_789",
    }
    const result = systemQueueAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects missing queueSlug", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      traceId: "trace_789",
    }
    const result = systemQueueAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects empty queueSlug", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      queueSlug: "",
      traceId: "trace_789",
    }
    const result = systemQueueAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects missing traceId", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      queueSlug: "jailbreaking",
    }
    const result = systemQueueAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects empty traceId", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      queueSlug: "jailbreaking",
      traceId: "",
    }
    const result = systemQueueAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe("systemQueueAnnotateOutputSchema", () => {
  it("accepts valid output", () => {
    const output = {
      queueId: "queue_123",
      traceId: "trace_456",
      draftAnnotationId: "draft_789",
      wasCreated: true,
    }
    const result = systemQueueAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(true)
  })

  it("accepts wasCreated false", () => {
    const output = {
      queueId: "queue_123",
      traceId: "trace_456",
      draftAnnotationId: "draft_789",
      wasCreated: false,
    }
    const result = systemQueueAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(true)
  })

  it("rejects missing queueId", () => {
    const output = {
      traceId: "trace_456",
      draftAnnotationId: "draft_789",
      wasCreated: true,
    }
    const result = systemQueueAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects empty queueId", () => {
    const output = {
      queueId: "",
      traceId: "trace_456",
      draftAnnotationId: "draft_789",
      wasCreated: true,
    }
    const result = systemQueueAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects missing traceId", () => {
    const output = {
      queueId: "queue_123",
      draftAnnotationId: "draft_789",
      wasCreated: true,
    }
    const result = systemQueueAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects missing draftAnnotationId", () => {
    const output = {
      queueId: "queue_123",
      traceId: "trace_456",
      wasCreated: true,
    }
    const result = systemQueueAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects missing wasCreated", () => {
    const output = {
      queueId: "queue_123",
      traceId: "trace_456",
      draftAnnotationId: "draft_789",
    }
    const result = systemQueueAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })
})

describe("systemQueueAnnotatorOutputSchema", () => {
  it("accepts valid feedback", () => {
    const output = {
      feedback: "This response contains a jailbreak attempt.",
    }
    const result = systemQueueAnnotatorOutputSchema.safeParse(output)
    expect(result.success).toBe(true)
  })

  it("rejects missing feedback", () => {
    const output = {}
    const result = systemQueueAnnotatorOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects empty feedback", () => {
    const output = {
      feedback: "",
    }
    const result = systemQueueAnnotatorOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })
})
