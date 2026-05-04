import { describe, expect, it } from "vitest"
import {
  flaggerAnnotateInputSchema,
  flaggerAnnotateOutputSchema,
  flaggerAnnotatorOutputSchema,
} from "./flagger-annotator-contracts.ts"

describe("flaggerAnnotateInputSchema", () => {
  it("accepts valid input", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      flaggerId: "flagger_xyz",
      flaggerSlug: "jailbreaking",
      traceId: "trace_789",
      scoreId: "score_abc",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it("rejects missing organizationId", () => {
    const input = {
      projectId: "proj_456",
      flaggerId: "flagger_xyz",
      flaggerSlug: "jailbreaking",
      traceId: "trace_789",
      scoreId: "score_abc",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects empty organizationId", () => {
    const input = {
      organizationId: "",
      projectId: "proj_456",
      flaggerId: "flagger_xyz",
      flaggerSlug: "jailbreaking",
      traceId: "trace_789",
      scoreId: "score_abc",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects missing projectId", () => {
    const input = {
      organizationId: "org_123",
      flaggerId: "flagger_xyz",
      flaggerSlug: "jailbreaking",
      traceId: "trace_789",
      scoreId: "score_abc",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects empty projectId", () => {
    const input = {
      organizationId: "org_123",
      projectId: "",
      flaggerId: "flagger_xyz",
      flaggerSlug: "jailbreaking",
      traceId: "trace_789",
      scoreId: "score_abc",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects missing flaggerSlug", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      traceId: "trace_789",
      scoreId: "score_abc",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects empty flaggerSlug", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      flaggerId: "flagger_xyz",
      flaggerSlug: "",
      traceId: "trace_789",
      scoreId: "score_abc",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects missing traceId", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      flaggerId: "flagger_xyz",
      flaggerSlug: "jailbreaking",
      scoreId: "score_abc",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects empty traceId", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      flaggerId: "flagger_xyz",
      flaggerSlug: "jailbreaking",
      traceId: "",
      scoreId: "score_abc",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects missing scoreId", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      flaggerId: "flagger_xyz",
      flaggerSlug: "jailbreaking",
      traceId: "trace_789",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects empty scoreId", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      flaggerId: "flagger_xyz",
      flaggerSlug: "jailbreaking",
      traceId: "trace_789",
      scoreId: "",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects missing flaggerId", () => {
    const input = {
      organizationId: "org_123",
      projectId: "proj_456",
      flaggerSlug: "jailbreaking",
      traceId: "trace_789",
      scoreId: "score_abc",
    }
    const result = flaggerAnnotateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe("flaggerAnnotateOutputSchema", () => {
  it("accepts valid output", () => {
    const output = {
      flaggerId: "flagger_123",
      traceId: "trace_456",
      draftAnnotationId: "draft_789",
    }
    const result = flaggerAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(true)
  })

  it("rejects missing flaggerId", () => {
    const output = {
      traceId: "trace_456",
      draftAnnotationId: "draft_789",
    }
    const result = flaggerAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects empty flaggerId", () => {
    const output = {
      flaggerId: "",
      traceId: "trace_456",
      draftAnnotationId: "draft_789",
    }
    const result = flaggerAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects missing traceId", () => {
    const output = {
      flaggerId: "flagger_123",
      draftAnnotationId: "draft_789",
    }
    const result = flaggerAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects missing draftAnnotationId", () => {
    const output = {
      flaggerId: "flagger_123",
      traceId: "trace_456",
    }
    const result = flaggerAnnotateOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })
})

describe("flaggerAnnotatorOutputSchema", () => {
  it("accepts valid feedback", () => {
    const output = {
      feedback: "This response contains a jailbreak attempt.",
    }
    const result = flaggerAnnotatorOutputSchema.safeParse(output)
    expect(result.success).toBe(true)
  })

  it("accepts feedback with optional messageIndex", () => {
    const output = {
      feedback: "This response contains a jailbreak attempt.",
      messageIndex: 3,
    }
    const result = flaggerAnnotatorOutputSchema.safeParse(output)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.messageIndex).toBe(3)
    }
  })

  it("rejects negative messageIndex", () => {
    const output = {
      feedback: "valid feedback",
      messageIndex: -1,
    }
    const result = flaggerAnnotatorOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects non-integer messageIndex", () => {
    const output = {
      feedback: "valid feedback",
      messageIndex: 1.5,
    }
    const result = flaggerAnnotatorOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects missing feedback", () => {
    const output = {}
    const result = flaggerAnnotatorOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })

  it("rejects empty feedback", () => {
    const output = {
      feedback: "",
    }
    const result = flaggerAnnotatorOutputSchema.safeParse(output)
    expect(result.success).toBe(false)
  })
})
