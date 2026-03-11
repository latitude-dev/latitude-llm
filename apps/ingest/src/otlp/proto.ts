import protobuf from "protobufjs"
import type { OtlpExportTraceServiceRequest } from "./types.ts"

/**
 * Protobuf schema for OTLP ExportTraceServiceRequest.
 * Field IDs match the official opentelemetry-proto definitions exactly.
 */
const root = protobuf.Root.fromJSON({
  nested: {
    ExportTraceServiceRequest: {
      fields: {
        resourceSpans: { rule: "repeated", type: "ResourceSpans", id: 1 },
      },
    },
    ResourceSpans: {
      fields: {
        resource: { type: "Resource", id: 1 },
        scopeSpans: { rule: "repeated", type: "ScopeSpans", id: 2 },
        schemaUrl: { type: "string", id: 3 },
      },
    },
    Resource: {
      fields: {
        attributes: { rule: "repeated", type: "KeyValue", id: 1 },
        droppedAttributesCount: { type: "uint32", id: 2 },
      },
    },
    ScopeSpans: {
      fields: {
        scope: { type: "InstrumentationScope", id: 1 },
        spans: { rule: "repeated", type: "Span", id: 2 },
        schemaUrl: { type: "string", id: 3 },
      },
    },
    InstrumentationScope: {
      fields: {
        name: { type: "string", id: 1 },
        version: { type: "string", id: 2 },
        attributes: { rule: "repeated", type: "KeyValue", id: 3 },
        droppedAttributesCount: { type: "uint32", id: 4 },
      },
    },
    Span: {
      fields: {
        traceId: { type: "bytes", id: 1 },
        spanId: { type: "bytes", id: 2 },
        traceState: { type: "string", id: 3 },
        parentSpanId: { type: "bytes", id: 4 },
        name: { type: "string", id: 5 },
        kind: { type: "int32", id: 6 },
        startTimeUnixNano: { type: "fixed64", id: 7 },
        endTimeUnixNano: { type: "fixed64", id: 8 },
        attributes: { rule: "repeated", type: "KeyValue", id: 9 },
        droppedAttributesCount: { type: "uint32", id: 10 },
        events: { rule: "repeated", type: "Event", id: 11 },
        droppedEventsCount: { type: "uint32", id: 12 },
        links: { rule: "repeated", type: "Link", id: 13 },
        droppedLinksCount: { type: "uint32", id: 14 },
        status: { type: "Status", id: 15 },
        flags: { type: "fixed32", id: 16 },
      },
    },
    Status: {
      fields: {
        message: { type: "string", id: 2 },
        code: { type: "int32", id: 3 },
      },
    },
    Event: {
      fields: {
        timeUnixNano: { type: "fixed64", id: 1 },
        name: { type: "string", id: 2 },
        attributes: { rule: "repeated", type: "KeyValue", id: 3 },
        droppedAttributesCount: { type: "uint32", id: 4 },
      },
    },
    Link: {
      fields: {
        traceId: { type: "bytes", id: 1 },
        spanId: { type: "bytes", id: 2 },
        traceState: { type: "string", id: 3 },
        attributes: { rule: "repeated", type: "KeyValue", id: 4 },
        droppedAttributesCount: { type: "uint32", id: 5 },
        flags: { type: "fixed32", id: 6 },
      },
    },
    KeyValue: {
      fields: {
        key: { type: "string", id: 1 },
        value: { type: "AnyValue", id: 2 },
      },
    },
    AnyValue: {
      oneofs: {
        value: {
          oneof: ["stringValue", "boolValue", "intValue", "doubleValue", "arrayValue", "kvlistValue", "bytesValue"],
        },
      },
      fields: {
        stringValue: { type: "string", id: 1 },
        boolValue: { type: "bool", id: 2 },
        intValue: { type: "int64", id: 3 },
        doubleValue: { type: "double", id: 4 },
        arrayValue: { type: "ArrayValue", id: 5 },
        kvlistValue: { type: "KeyValueList", id: 6 },
        bytesValue: { type: "bytes", id: 7 },
      },
    },
    ArrayValue: {
      fields: {
        values: { rule: "repeated", type: "AnyValue", id: 1 },
      },
    },
    KeyValueList: {
      fields: {
        values: { rule: "repeated", type: "KeyValue", id: 1 },
      },
    },
  },
})

const ExportTraceServiceRequestType = root.lookupType("ExportTraceServiceRequest")

function bytesToHex(bytes: Uint8Array | number[]): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let hex = ""
  for (const b of arr) {
    hex += b.toString(16).padStart(2, "0")
  }
  return hex
}

/**
 * Recursively normalize a decoded protobuf object to match the OTLP/JSON shape:
 * - Uint8Array bytes fields → lowercase hex strings
 * - Long objects → decimal strings
 */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Uint8Array) return bytesToHex(value)
  if (Array.isArray(value)) return value.map(normalizeValue)

  // protobufjs Long objects have low/high/unsigned properties
  if (typeof value === "object" && "low" in value && "high" in value) {
    const long = value as { low: number; high: number; unsigned: boolean }
    const bigint = BigInt(long.high >>> 0) * BigInt(2 ** 32) + BigInt(long.low >>> 0)
    return bigint.toString()
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const normalized: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      normalized[key] = normalizeValue(obj[key])
    }
    return normalized
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return value
  }

  return value
}

export function decodeOtlpProtobuf(buffer: Uint8Array): OtlpExportTraceServiceRequest {
  const message = ExportTraceServiceRequestType.decode(buffer)
  const raw = ExportTraceServiceRequestType.toObject(message, {
    arrays: true,
    objects: true,
    defaults: false,
    oneofs: true,
  })
  return normalizeValue(raw) as OtlpExportTraceServiceRequest
}
