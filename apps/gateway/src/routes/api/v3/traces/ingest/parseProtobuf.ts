import type { Otlp } from '@latitude-data/constants'
import root from '@opentelemetry/otlp-transformer/build/src/generated/root.js'

type ProtobufRoot = {
  opentelemetry: {
    proto: {
      collector: {
        trace: {
          v1: {
            ExportTraceServiceRequest: {
              decode: (buffer: Uint8Array) => unknown
              toObject: (
                decoded: unknown,
                options: {
                  longs: typeof String
                  bytes: typeof Uint8Array
                  defaults: boolean
                },
              ) => Otlp.ServiceRequest
            }
          }
        }
      }
    }
  }
}

const ExportTraceServiceRequest = (root as unknown as ProtobufRoot)
  .opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest

function bytesToHex(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString('hex')
}

function fixIds(obj: Record<string, unknown>): void {
  if (obj.traceId && obj.traceId instanceof Uint8Array) {
    obj.traceId = bytesToHex(obj.traceId)
  }
  if (obj.spanId && obj.spanId instanceof Uint8Array) {
    obj.spanId = bytesToHex(obj.spanId)
  }
  if (obj.parentSpanId && obj.parentSpanId instanceof Uint8Array) {
    obj.parentSpanId = bytesToHex(obj.parentSpanId)
  }
}

function processSpans(request: Otlp.ServiceRequest): void {
  for (const rs of request.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        fixIds(span as unknown as Record<string, unknown>)
        for (const link of span.links ?? []) {
          fixIds(link as unknown as Record<string, unknown>)
        }
      }
    }
  }
}

export function parseProtobufRequest(buffer: Uint8Array): Otlp.ServiceRequest {
  const decoded = ExportTraceServiceRequest.decode(buffer)
  const request = ExportTraceServiceRequest.toObject(decoded, {
    longs: String,
    bytes: Uint8Array,
    defaults: false,
  })

  processSpans(request)

  return request
}
