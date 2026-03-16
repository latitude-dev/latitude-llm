import { q as queryCollectionOptions } from "../_libs/tanstack__query-db-collection.mjs";
import { u as useLiveQuery } from "../_libs/tanstack__react-db.mjs";
import { t as getQueryClient } from "./router-DWBQ1rk2.mjs";
import { e as errorHandler, c as createSsrRpc } from "./middlewares-BgvwNBR1.mjs";
import { e as createServerFn } from "./index.mjs";
import { o as object, s as string, a as array, n as number } from "../_libs/zod.mjs";
import { a as createCollection } from "../_libs/tanstack__db.mjs";
const listDatasetsQuery = createServerFn({
  method: "GET"
}).middleware([errorHandler]).inputValidator(object({
  projectId: string()
})).handler(createSsrRpc("48d062fe6a5a1f447c6e4f13bf5175712bce5d379adaf5d3e613cea840bbc5b8"));
const listRowsQuery = createServerFn({
  method: "GET"
}).middleware([errorHandler]).inputValidator(object({
  datasetId: string(),
  versionId: string().optional(),
  search: string().optional(),
  limit: number().int().min(1).max(500).default(50),
  offset: number().default(0)
})).handler(createSsrRpc("98f757db498c57d1ba60cf462ac311f796c0eb73e3b53d3b6d53edc39b271fa5"));
const createDatasetMutation = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  projectId: string(),
  name: string().min(1)
})).handler(createSsrRpc("3f2457886c4ba6570d2ce4752fd2f6df521434d79b64bc1739563cad59017f24"));
const saveDatasetCsv = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator((input) => {
  if (!(input instanceof FormData)) throw new Error("Expected FormData");
  return input;
}).handler(createSsrRpc("8786eb41b238a1254f11f0c8183b4e3bf7b0ebb5ef15abb504a2f7a7ee33e04a"));
const updateRowMutation = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  datasetId: string(),
  rowId: string(),
  input: string(),
  output: string(),
  metadata: string()
})).handler(createSsrRpc("ed2845e5e84f6721e1e379ca1c4d90bc0b226b516127cf7ff40521940616d015"));
const deleteRowsMutation = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  datasetId: string(),
  rowIds: array(string()).min(1)
})).handler(createSsrRpc("26fa2fea4798cbdddd6b12a345925d4dc52bb48d62093b94f846c94d8b13e7d0"));
const queryClient = getQueryClient();
const makeDatasetsCollection = (projectId) => createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["datasets", projectId],
    queryFn: async () => {
      const result = await listDatasetsQuery({ data: { projectId } });
      return result.datasets;
    },
    getKey: (item) => item.id
  })
);
const datasetsCollectionsCache = /* @__PURE__ */ new Map();
const getDatasetsCollection = (projectId) => {
  const cached = datasetsCollectionsCache.get(projectId);
  if (cached) return cached;
  const collection = makeDatasetsCollection(projectId);
  datasetsCollectionsCache.set(projectId, collection);
  return collection;
};
const useDatasetsCollection = (projectId, queryFn, deps) => {
  const collection = getDatasetsCollection(projectId);
  return useLiveQuery(
    (q) => {
      const datasets = q.from({ dataset: collection });
      return datasets;
    },
    [projectId, ...[]]
  );
};
const makeDatasetRowsCollection = (datasetId, search) => createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["datasetRows", datasetId, search ?? ""],
    queryFn: async () => {
      const result = await listRowsQuery({
        data: {
          datasetId,
          ...search ? { search } : {},
          limit: 50,
          offset: 0
        }
      });
      return result.rows;
    },
    getKey: (item) => item.rowId
  })
);
const MAX_ROW_COLLECTIONS = 10;
const rowsCollectionsCache = /* @__PURE__ */ new Map();
const getDatasetRowsCollection = (datasetId, search) => {
  const cacheKey = `${datasetId}:${search ?? ""}`;
  const cached = rowsCollectionsCache.get(cacheKey);
  if (cached) {
    rowsCollectionsCache.delete(cacheKey);
    rowsCollectionsCache.set(cacheKey, cached);
    return cached;
  }
  const collection = makeDatasetRowsCollection(datasetId, search);
  rowsCollectionsCache.set(cacheKey, collection);
  if (rowsCollectionsCache.size > MAX_ROW_COLLECTIONS) {
    const oldest = rowsCollectionsCache.keys().next().value;
    if (oldest) {
      rowsCollectionsCache.delete(oldest);
    }
  }
  return collection;
};
const useDatasetRowsCollection = (datasetId, search) => {
  const collection = getDatasetRowsCollection(datasetId, search);
  return useLiveQuery((q) => q.from({ row: collection }), [datasetId, search]);
};
export {
  useDatasetRowsCollection as a,
  updateRowMutation as b,
  createDatasetMutation as c,
  deleteRowsMutation as d,
  saveDatasetCsv as s,
  useDatasetsCollection as u
};
