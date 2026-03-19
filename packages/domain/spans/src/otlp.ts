/**
 * OTLP/protobuf entry point. Import from "@domain/spans/otlp" only in server-side
 * code (e.g. workers, ingest). The main "@domain/spans" barrel does not export
 * this so the client bundle does not pull in protobufjs.
 */
export { decodeOtlpProtobuf } from "./otlp/proto.ts"
export type { TransformContext } from "./otlp/transform.ts"
export { transformOtlpToSpans } from "./otlp/transform.ts"
export type { OtlpExportTraceServiceRequest } from "./otlp/types.ts"
