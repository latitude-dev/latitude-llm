import { q as queryCollectionOptions } from "../_libs/tanstack__query-db-collection.mjs";
import { u as useLiveQuery } from "../_libs/tanstack__react-db.mjs";
import { u as useQuery } from "../_libs/tanstack__react-query.mjs";
import { t as getQueryClient } from "./router-DWBQ1rk2.mjs";
import { e as errorHandler, c as createSsrRpc } from "./middlewares-BgvwNBR1.mjs";
import { e as createServerFn } from "./index.mjs";
import { a as createCollection } from "../_libs/tanstack__db.mjs";
import { o as object, s as string } from "../_libs/zod.mjs";
const listSpansByTrace = createServerFn({
  method: "GET"
}).middleware([errorHandler]).inputValidator(object({
  traceId: string()
})).handler(createSsrRpc("800b8e8ad6740ce92644b5ad4dc13417144ac4761bdc60ddbbd61f6c864f780d"));
const getSpanDetail = createServerFn({
  method: "GET"
}).middleware([errorHandler]).inputValidator(object({
  traceId: string(),
  spanId: string()
})).handler(createSsrRpc("e95a391f4d8812a9c609d51581f7eaf2fa5490fbba10db09080e066450fd9768"));
const listTracesByProject = createServerFn({
  method: "GET"
}).middleware([errorHandler]).inputValidator(object({
  projectId: string()
})).handler(createSsrRpc("5d3c51d8394c38a1e428032e68b274508326d6865abac74f7889c4d54f7d8568"));
const queryClient = getQueryClient();
const makeSpansByTraceCollection = (traceId) => createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["spans", "trace", traceId],
    queryFn: () => listSpansByTrace({ data: { traceId } }),
    getKey: (item) => `${item.traceId}-${item.spanId}`
  })
);
const traceCollectionsCache = {};
const getSpansByTraceCollection = (traceId) => {
  if (!traceCollectionsCache[traceId]) {
    traceCollectionsCache[traceId] = makeSpansByTraceCollection(traceId);
  }
  return traceCollectionsCache[traceId];
};
const useSpansByTraceCollection = (traceId) => {
  const collection = getSpansByTraceCollection(traceId);
  return useLiveQuery((q) => q.from({ span: collection }));
};
const useSpanDetail = ({ traceId, spanId }) => {
  return useQuery({
    queryKey: ["spanDetail", traceId, spanId],
    queryFn: () => getSpanDetail({ data: { traceId, spanId } })
  });
};
const makeTracesCollection = (projectId) => createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["traces", projectId],
    queryFn: () => listTracesByProject({ data: { projectId } }),
    getKey: (item) => item.traceId
  })
);
const projectCollectionsCache = {};
const getTracesCollection = (projectId) => {
  if (!projectCollectionsCache[projectId]) {
    projectCollectionsCache[projectId] = makeTracesCollection(projectId);
  }
  return projectCollectionsCache[projectId];
};
const useTracesCollection = (projectId) => {
  const collection = getTracesCollection(projectId);
  return useLiveQuery((q) => q.from({ trace: collection }));
};
export {
  useSpansByTraceCollection as a,
  useSpanDetail as b,
  useTracesCollection as u
};
