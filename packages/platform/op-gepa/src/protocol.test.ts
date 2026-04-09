import { describe, expect, it } from "vitest"
import { createRequest, createResponse, JsonRpcErrorCode, parseMessage, serializeMessage } from "./protocol.ts"

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

  it("ignores invalid JSON-RPC lines", () => {
    expect(parseMessage("not-json")).toBeNull()
    expect(parseMessage(JSON.stringify(["unexpected"]))).toBeNull()
  })
})
