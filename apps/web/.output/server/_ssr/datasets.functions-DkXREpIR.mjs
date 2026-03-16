import { c as createServerRpc } from "./createServerRpc-wV0Vk4NU.mjs";
import { P as ProjectId, a as getPostgresClient, D as DatasetRepositoryLive, q as getClickhouseClient, r as DatasetRowRepositoryLive, s as DatasetRowId, t as DatasetId, u as DatasetVersionId, v as putInDisk, w as getStorageDisk, x as DatasetRepository, o as OrganizationId, y as DatasetRowRepository, z as generateId$2, V as ValidationError$2 } from "./index-D2KejSDZ.mjs";
import { w as withClickHouse } from "./with-clickhouse-Ppo_9iAq.mjs";
import { w as withPostgres } from "./with-postgres-EljO6Rpw.mjs";
import { P as Papa } from "../_libs/papaparse.mjs";
import { r as requireSession } from "./auth-DDVzs-hN.mjs";
import { e as errorHandler } from "./middlewares-BgvwNBR1.mjs";
import { a as applyMapping } from "./column-mapping-BO7NtC1c.mjs";
import { e as createServerFn } from "./index.mjs";
import { o as object, s as string, a as array, n as number } from "../_libs/zod.mjs";
import { r as runPromise, g as gen, a as all, f as forEach, b as map, s as succeed, d as fail } from "../_libs/effect.mjs";
import "../_libs/react.mjs";
import "node:stream";
import "events";
import "crypto";
import "dns";
import "fs";
import "net";
import "tls";
import "path";
import "stream";
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
function createDataset(args) {
  return gen(function* () {
    const repo = yield* DatasetRepository;
    return yield* repo.create(args);
  });
}
function deleteRows(args) {
  return gen(function* () {
    if (args.rowIds.length === 0) return { versionId: null, version: 0 };
    const datasetRepo = yield* DatasetRepository;
    const rowRepo = yield* DatasetRowRepository;
    yield* all(
      args.rowIds.map(
        (rowId) => rowRepo.findById({
          organizationId: args.organizationId,
          datasetId: args.datasetId,
          rowId
        })
      )
    );
    const version = yield* datasetRepo.incrementVersion({
      organizationId: args.organizationId,
      id: args.datasetId,
      rowsDeleted: args.rowIds.length,
      source: "web"
    });
    yield* rowRepo.deleteBatch({
      organizationId: args.organizationId,
      datasetId: args.datasetId,
      rowIds: args.rowIds,
      version: version.version
    });
    return { versionId: version.id, version: version.version };
  });
}
const MAX_ROW_ID_LENGTH = 128;
const ROW_ID_PATTERN = /^[\w.~-]+$/;
function buildValidRowId(id) {
  if (id === void 0) {
    return succeed(DatasetRowId(generateId$2()));
  }
  if (id.length > MAX_ROW_ID_LENGTH) {
    return fail(
      new ValidationError$2({ field: "rowId", message: `Row ID must be at most ${MAX_ROW_ID_LENGTH} characters` })
    );
  }
  if (!ROW_ID_PATTERN.test(id)) {
    return fail(
      new ValidationError$2({
        field: "rowId",
        message: "Row ID must contain only alphanumeric characters, hyphens, underscores, dots, or tildes"
      })
    );
  }
  return succeed(id);
}
function insertRows(args) {
  return gen(function* () {
    const resolvedRows = yield* forEach(
      args.rows,
      (row) => buildValidRowId(row.id).pipe(map((id) => ({ ...row, id })))
    );
    const datasetRepo = yield* DatasetRepository;
    const rowRepo = yield* DatasetRowRepository;
    const version = yield* datasetRepo.incrementVersion({
      organizationId: args.organizationId,
      id: args.datasetId,
      rowsInserted: resolvedRows.length,
      source: args.source ?? "api"
    });
    const rowIds = yield* rowRepo.insertBatch({
      organizationId: args.organizationId,
      datasetId: args.datasetId,
      version: version.version,
      rows: resolvedRows
    });
    return { versionId: version.id, version: version.version, rowIds };
  });
}
function listDatasets(args) {
  return gen(function* () {
    const repo = yield* DatasetRepository;
    return yield* repo.listByProject(args);
  });
}
function listRows(args) {
  return gen(function* () {
    const rowRepo = yield* DatasetRowRepository;
    let version;
    if (args.versionId) {
      const datasetRepo = yield* DatasetRepository;
      version = yield* datasetRepo.resolveVersion({
        datasetId: args.datasetId,
        versionId: args.versionId
      });
    }
    return yield* rowRepo.list({
      organizationId: args.organizationId,
      datasetId: args.datasetId,
      ...version !== void 0 ? { version } : {},
      ...args.search ? { search: args.search } : {},
      ...args.limit !== void 0 ? { limit: args.limit } : {},
      ...args.offset !== void 0 ? { offset: args.offset } : {}
    });
  });
}
function updateRow(args) {
  return gen(function* () {
    const datasetRepo = yield* DatasetRepository;
    const rowRepo = yield* DatasetRowRepository;
    yield* rowRepo.findById({
      organizationId: args.organizationId,
      datasetId: args.datasetId,
      rowId: args.rowId
    });
    const version = yield* datasetRepo.incrementVersion({
      organizationId: args.organizationId,
      id: args.datasetId,
      rowsUpdated: 1,
      source: "web"
    });
    yield* rowRepo.updateRow({
      organizationId: args.organizationId,
      datasetId: args.datasetId,
      rowId: args.rowId,
      version: version.version,
      input: args.input,
      output: args.output,
      metadata: args.metadata
    });
    return { versionId: version.id, version: version.version };
  });
}
const toDatasetRecord = (d) => ({
  id: d.id,
  organizationId: d.organizationId,
  projectId: d.projectId,
  name: d.name,
  description: d.description,
  fileKey: d.fileKey,
  currentVersion: d.currentVersion,
  latestVersionId: d.latestVersionId,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString()
});
const toRowRecord = (r) => ({
  rowId: r.rowId,
  datasetId: r.datasetId,
  input: typeof r.input === "string" ? r.input : r.input,
  output: typeof r.output === "string" ? r.output : r.output,
  metadata: typeof r.metadata === "string" ? r.metadata : r.metadata,
  createdAt: r.createdAt.toISOString(),
  version: r.version
});
const listDatasetsQuery_createServerFn_handler = createServerRpc({
  id: "48d062fe6a5a1f447c6e4f13bf5175712bce5d379adaf5d3e613cea840bbc5b8",
  name: "listDatasetsQuery",
  filename: "src/domains/datasets/datasets.functions.ts"
}, (opts) => listDatasetsQuery.__executeServer(opts));
const listDatasetsQuery = createServerFn({
  method: "GET"
}).middleware([errorHandler]).inputValidator(object({
  projectId: string()
})).handler(listDatasetsQuery_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const orgId = OrganizationId(organizationId);
  const result = await runPromise(listDatasets({
    organizationId: orgId,
    projectId: ProjectId(data.projectId)
  }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId), withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId)));
  return {
    datasets: result.datasets.map(toDatasetRecord),
    total: result.total
  };
});
const listRowsQuery_createServerFn_handler = createServerRpc({
  id: "98f757db498c57d1ba60cf462ac311f796c0eb73e3b53d3b6d53edc39b271fa5",
  name: "listRowsQuery",
  filename: "src/domains/datasets/datasets.functions.ts"
}, (opts) => listRowsQuery.__executeServer(opts));
const listRowsQuery = createServerFn({
  method: "GET"
}).middleware([errorHandler]).inputValidator(object({
  datasetId: string(),
  versionId: string().optional(),
  search: string().optional(),
  limit: number().int().min(1).max(500).default(50),
  offset: number().default(0)
})).handler(listRowsQuery_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const orgId = OrganizationId(organizationId);
  const result = await runPromise(listRows({
    organizationId: orgId,
    datasetId: DatasetId(data.datasetId),
    ...data.versionId ? {
      versionId: DatasetVersionId(data.versionId)
    } : {},
    ...data.search ? {
      search: data.search
    } : {},
    limit: data.limit,
    offset: data.offset
  }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId), withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId)));
  return {
    rows: result.rows.map(toRowRecord),
    total: result.total
  };
});
const createDatasetMutation_createServerFn_handler = createServerRpc({
  id: "3f2457886c4ba6570d2ce4752fd2f6df521434d79b64bc1739563cad59017f24",
  name: "createDatasetMutation",
  filename: "src/domains/datasets/datasets.functions.ts"
}, (opts) => createDatasetMutation.__executeServer(opts));
const createDatasetMutation = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  projectId: string(),
  name: string().min(1)
})).handler(createDatasetMutation_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const orgId = OrganizationId(organizationId);
  const dataset = await runPromise(createDataset({
    organizationId: orgId,
    projectId: ProjectId(data.projectId),
    name: data.name
  }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId), withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId)));
  return toDatasetRecord(dataset);
});
const saveDatasetCsv_createServerFn_handler = createServerRpc({
  id: "8786eb41b238a1254f11f0c8183b4e3bf7b0ebb5ef15abb504a2f7a7ee33e04a",
  name: "saveDatasetCsv",
  filename: "src/domains/datasets/datasets.functions.ts"
}, (opts) => saveDatasetCsv.__executeServer(opts));
const saveDatasetCsv = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator((input) => {
  if (!(input instanceof FormData)) throw new Error("Expected FormData");
  return input;
}).handler(saveDatasetCsv_createServerFn_handler, async ({
  data: formData
}) => {
  const {
    organizationId
  } = await requireSession();
  const orgId = OrganizationId(organizationId);
  const file = formData.get("file");
  const datasetId = formData.get("datasetId");
  const projectId = formData.get("projectId");
  const mappingRaw = formData.get("mapping");
  const optionsRaw = formData.get("options");
  if (!(file instanceof File)) throw new Error("No file provided");
  if (typeof datasetId !== "string" || !datasetId) throw new Error("No datasetId provided");
  if (typeof projectId !== "string" || !projectId) throw new Error("No projectId provided");
  if (typeof mappingRaw !== "string") throw new Error("No mapping provided");
  if (typeof optionsRaw !== "string") throw new Error("No options provided");
  const mapping = JSON.parse(mappingRaw);
  const options = JSON.parse(optionsRaw);
  const content = await file.text();
  const fileKey = await runPromise(putInDisk(getStorageDisk(), {
    namespace: "datasets",
    organizationId: orgId,
    projectId: ProjectId(projectId),
    content
  }));
  await runPromise(gen(function* () {
    const repo = yield* DatasetRepository;
    return yield* repo.updateFileKey({
      id: DatasetId(datasetId),
      fileKey
    });
  }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId)));
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true
  });
  const mappedRows = parsed.data.map((row) => applyMapping(row, mapping, options));
  if (mappedRows.length === 0) {
    return {
      version: 0,
      rowCount: 0
    };
  }
  const result = await runPromise(insertRows({
    organizationId: orgId,
    datasetId: DatasetId(datasetId),
    rows: mappedRows,
    source: "csv"
  }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId), withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId)));
  return {
    version: result.version,
    rowCount: mappedRows.length
  };
});
const updateRowMutation_createServerFn_handler = createServerRpc({
  id: "ed2845e5e84f6721e1e379ca1c4d90bc0b226b516127cf7ff40521940616d015",
  name: "updateRowMutation",
  filename: "src/domains/datasets/datasets.functions.ts"
}, (opts) => updateRowMutation.__executeServer(opts));
const updateRowMutation = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  datasetId: string(),
  rowId: string(),
  input: string(),
  output: string(),
  metadata: string()
})).handler(updateRowMutation_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const orgId = OrganizationId(organizationId);
  const result = await runPromise(updateRow({
    organizationId: orgId,
    datasetId: DatasetId(data.datasetId),
    rowId: DatasetRowId(data.rowId),
    input: data.input,
    output: data.output,
    metadata: data.metadata
  }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId), withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId)));
  return {
    versionId: result.versionId,
    version: result.version
  };
});
const deleteRowsMutation_createServerFn_handler = createServerRpc({
  id: "26fa2fea4798cbdddd6b12a345925d4dc52bb48d62093b94f846c94d8b13e7d0",
  name: "deleteRowsMutation",
  filename: "src/domains/datasets/datasets.functions.ts"
}, (opts) => deleteRowsMutation.__executeServer(opts));
const deleteRowsMutation = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  datasetId: string(),
  rowIds: array(string()).min(1)
})).handler(deleteRowsMutation_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const orgId = OrganizationId(organizationId);
  const result = await runPromise(deleteRows({
    organizationId: orgId,
    datasetId: DatasetId(data.datasetId),
    rowIds: data.rowIds.map((id) => DatasetRowId(id))
  }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId), withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId)));
  return {
    versionId: result.versionId,
    version: result.version
  };
});
export {
  createDatasetMutation_createServerFn_handler,
  deleteRowsMutation_createServerFn_handler,
  listDatasetsQuery_createServerFn_handler,
  listRowsQuery_createServerFn_handler,
  saveDatasetCsv_createServerFn_handler,
  updateRowMutation_createServerFn_handler
};
