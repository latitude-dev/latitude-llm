import { c as createServerRpc } from "./createServerRpc-wV0Vk4NU.mjs";
import { q as getClickhouseClient, N as SpanRepositoryLive, T as TraceRepositoryLive, Q as SpanRepository, R as TraceId, o as OrganizationId, W as TraceRepository, P as ProjectId, X as SpanId, Y as NotFoundError } from "./index-D2KejSDZ.mjs";
import { w as withClickHouse } from "./with-clickhouse-Ppo_9iAq.mjs";
import { r as requireSession } from "./auth-DDVzs-hN.mjs";
import { e as errorHandler } from "./middlewares-BgvwNBR1.mjs";
import { e as createServerFn } from "./index.mjs";
import { o as object, s as string } from "../_libs/zod.mjs";
import { r as runPromise, g as gen } from "../_libs/effect.mjs";
import "../_libs/react.mjs";
import "../_libs/papaparse.mjs";
import "stream";
import "node:stream";
import "events";
import "crypto";
import "dns";
import "fs";
import "net";
import "tls";
import "path";
import "string_decoder";
import "util";
import "http";
import "https";
import "child_process";
import "assert";
import "url";
import "tty";
import "buffer";
import "zlib";
import "node:os";
import "os";
import "node:crypto";
import "path/posix";
import "node:util";
import "fs/promises";
import "node:fs/promises";
import "node:process";
import "node:path";
import "node:fs";
import "node:zlib";
import "node:async_hooks";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tiny-invariant.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "../_libs/tiny-warning.mjs";
import "../_libs/react-dom.mjs";
import "async_hooks";
import "../_libs/isbot.mjs";
const serializeSpan = (span) => ({
  organizationId: span.organizationId,
  projectId: span.projectId,
  traceId: span.traceId,
  spanId: span.spanId,
  parentSpanId: span.parentSpanId,
  name: span.name,
  serviceName: span.serviceName,
  kind: span.kind,
  statusCode: span.statusCode,
  statusMessage: span.statusMessage,
  operation: span.operation,
  provider: span.provider,
  model: span.model,
  tokensInput: span.tokensInput,
  tokensOutput: span.tokensOutput,
  costTotalMicrocents: span.costTotalMicrocents,
  startTime: span.startTime.toISOString(),
  endTime: span.endTime.toISOString(),
  ingestedAt: span.ingestedAt.toISOString()
});
const serializeSpanDetail = (span) => ({
  ...serializeSpan(span),
  sessionId: span.sessionId,
  apiKeyId: span.apiKeyId,
  responseModel: span.responseModel,
  traceFlags: span.traceFlags,
  traceState: span.traceState,
  errorType: span.errorType,
  tags: span.tags,
  eventsJson: span.eventsJson,
  linksJson: span.linksJson,
  tokensCacheRead: span.tokensCacheRead,
  tokensCacheCreate: span.tokensCacheCreate,
  tokensReasoning: span.tokensReasoning,
  costInputMicrocents: span.costInputMicrocents,
  costOutputMicrocents: span.costOutputMicrocents,
  costTotalMicrocents: span.costTotalMicrocents,
  costIsEstimated: span.costIsEstimated,
  responseId: span.responseId,
  finishReasons: span.finishReasons,
  attrString: span.attrString,
  attrInt: span.attrInt,
  attrFloat: span.attrFloat,
  attrBool: span.attrBool,
  resourceString: span.resourceString,
  scopeName: span.scopeName,
  scopeVersion: span.scopeVersion,
  inputMessages: span.inputMessages,
  outputMessages: span.outputMessages,
  systemInstructions: span.systemInstructions,
  toolDefinitions: span.toolDefinitions
});
const listSpansByTrace_createServerFn_handler = createServerRpc({
  id: "800b8e8ad6740ce92644b5ad4dc13417144ac4761bdc60ddbbd61f6c864f780d",
  name: "listSpansByTrace",
  filename: "src/domains/spans/spans.functions.ts"
}, (opts) => listSpansByTrace.__executeServer(opts));
const listSpansByTrace = createServerFn({
  method: "GET"
}).middleware([errorHandler]).inputValidator(object({
  traceId: string()
})).handler(listSpansByTrace_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const orgId = OrganizationId(organizationId);
  const spans = await runPromise(gen(function* () {
    const repo = yield* SpanRepository;
    return yield* repo.findByTraceId({
      organizationId: orgId,
      traceId: TraceId(data.traceId)
    });
  }).pipe(withClickHouse(SpanRepositoryLive, getClickhouseClient(), orgId)));
  return spans.map(serializeSpan);
});
const getSpanDetail_createServerFn_handler = createServerRpc({
  id: "e95a391f4d8812a9c609d51581f7eaf2fa5490fbba10db09080e066450fd9768",
  name: "getSpanDetail",
  filename: "src/domains/spans/spans.functions.ts"
}, (opts) => getSpanDetail.__executeServer(opts));
const getSpanDetail = createServerFn({
  method: "GET"
}).middleware([errorHandler]).inputValidator(object({
  traceId: string(),
  spanId: string()
})).handler(getSpanDetail_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const orgId = OrganizationId(organizationId);
  const span = await runPromise(gen(function* () {
    const repo = yield* SpanRepository;
    return yield* repo.findBySpanId({
      organizationId: orgId,
      traceId: TraceId(data.traceId),
      spanId: SpanId(data.spanId)
    });
  }).pipe(withClickHouse(SpanRepositoryLive, getClickhouseClient(), orgId)));
  if (!span) {
    throw new NotFoundError({
      entity: "Span",
      id: data.spanId
    });
  }
  return serializeSpanDetail(span);
});
const serializeTrace = (trace) => ({
  organizationId: trace.organizationId,
  projectId: trace.projectId,
  traceId: trace.traceId,
  spanCount: trace.spanCount,
  errorCount: trace.errorCount,
  startTime: trace.startTime.toISOString(),
  endTime: trace.endTime.toISOString(),
  durationNs: trace.durationNs,
  status: trace.status,
  tokensInput: trace.tokensInput,
  tokensOutput: trace.tokensOutput,
  tokensCacheRead: trace.tokensCacheRead,
  tokensCacheCreate: trace.tokensCacheCreate,
  tokensReasoning: trace.tokensReasoning,
  tokensTotal: trace.tokensTotal,
  costInputMicrocents: trace.costInputMicrocents,
  costOutputMicrocents: trace.costOutputMicrocents,
  costTotalMicrocents: trace.costTotalMicrocents,
  tags: trace.tags,
  models: trace.models,
  providers: trace.providers,
  serviceNames: trace.serviceNames,
  rootSpanId: trace.rootSpanId,
  rootSpanName: trace.rootSpanName
});
const listTracesByProject_createServerFn_handler = createServerRpc({
  id: "5d3c51d8394c38a1e428032e68b274508326d6865abac74f7889c4d54f7d8568",
  name: "listTracesByProject",
  filename: "src/domains/spans/spans.functions.ts"
}, (opts) => listTracesByProject.__executeServer(opts));
const listTracesByProject = createServerFn({
  method: "GET"
}).middleware([errorHandler]).inputValidator(object({
  projectId: string()
})).handler(listTracesByProject_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const orgId = OrganizationId(organizationId);
  const traces = await runPromise(gen(function* () {
    const repo = yield* TraceRepository;
    return yield* repo.findByProjectId({
      organizationId: orgId,
      projectId: ProjectId(data.projectId),
      options: {
        limit: 200
      }
    });
  }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId)));
  return traces.map(serializeTrace);
});
export {
  getSpanDetail_createServerFn_handler,
  listSpansByTrace_createServerFn_handler,
  listTracesByProject_createServerFn_handler
};
