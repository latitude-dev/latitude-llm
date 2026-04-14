import { describe, expect, it } from "vitest"
import {
  createInternalErrorResponse,
  createRequest,
  createResponse,
  JsonRpcErrorCode,
  JsonRpcResponseError,
  parseMessage,
  serializeMessage,
} from "./protocol.ts"

class TestAIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AIError"
  }
}

class TestActivityError extends Error {
  readonly _tag = "EvaluationAlignmentActivityError"
  readonly httpStatus = 500
  readonly httpMessage = 'Evaluation alignment activity "optimizeEvaluationDraft" failed'

  constructor(cause: unknown) {
    super("")
    this.name = "EvaluationAlignmentActivityError"
    this.cause = cause
  }
}

describe("op-gepa protocol", () => {
  it("serializes and parses JSON-RPC requests", () => {
    const request = createRequest("gepa_optimize", { baseline: { "evaluation-script": "hash-1" } }, 1)
    const parsed = parseMessage(serializeMessage(request).trim())

    expect(parsed).toEqual(request)
  })

  it("serializes and parses script-hash propose requests", () => {
    const request = createRequest(
      "gepa_propose",
      {
        component: "evaluation-script",
        script: "hash-1",
        context: [{ id: "trajectory-1" }],
      },
      2,
    )
    const parsed = parseMessage(serializeMessage(request).trim())

    expect(parsed).toEqual(request)
  })

  it("serializes and parses JSON-RPC error responses", () => {
    const response = createResponse(1, undefined, {
      code: JsonRpcErrorCode.internalError,
      message: "boom",
    })
    const parsed = parseMessage(serializeMessage(response).trim())

    expect(parsed).toEqual(response)
  })

  it("serializes nested handler failures into a JSON-RPC internal error response", () => {
    const response = createInternalErrorResponse(
      1,
      new TestActivityError(new TestAIError("Bedrock is unable to process your request.")),
    )

    expect(response.error).toMatchObject({
      code: JsonRpcErrorCode.internalError,
      message:
        'Evaluation alignment activity "optimizeEvaluationDraft" failed: Bedrock is unable to process your request.',
      data: {
        type: "TestActivityError",
        httpMessage: 'Evaluation alignment activity "optimizeEvaluationDraft" failed',
        cause: {
          type: "TestAIError",
          message: "Bedrock is unable to process your request.",
        },
      },
    })
  })

  it("exposes stripped messages and remote causes on response errors", () => {
    const error = new JsonRpcResponseError({
      code: JsonRpcErrorCode.internalError,
      message: "RPC error -32603: Evaluation alignment activity failed",
      data: {
        remoteError: {
          message: "Bedrock is unable to process your request.",
        },
      },
      method: "gepa_optimize",
      requestId: 1,
    })

    expect(error.strippedMessage).toBe("Evaluation alignment activity failed")
    expect(error.remoteCause).toEqual({
      message: "Bedrock is unable to process your request.",
    })
  })

  it("ignores invalid JSON-RPC lines", () => {
    expect(parseMessage("not-json")).toBeNull()
    expect(parseMessage(JSON.stringify(["unexpected"]))).toBeNull()
  })
})
