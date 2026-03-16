import { c as createServerRpc } from "./createServerRpc-wV0Vk4NU.mjs";
import { a as getPostgresClient, i as generateApiKeyUseCase, H as ApiKeyId, p as ApiKeyRepositoryLive, I as ApiKeyRepository, J as ApiKeyNotFoundError } from "./index-D2KejSDZ.mjs";
import { w as withPostgres } from "./with-postgres-EljO6Rpw.mjs";
import { r as requireSession } from "./auth-DDVzs-hN.mjs";
import { e as errorHandler } from "./middlewares-BgvwNBR1.mjs";
import { e as createServerFn } from "./index.mjs";
import { o as object, s as string } from "../_libs/zod.mjs";
import { r as runPromise, g as gen, c as catchTag, d as fail } from "../_libs/effect.mjs";
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
const updateApiKeyUseCase = (input) => gen(function* () {
  const repo = yield* ApiKeyRepository;
  const apiKey = yield* repo.findById(input.id).pipe(catchTag("NotFoundError", () => fail(new ApiKeyNotFoundError({ id: input.id }))));
  const updated = { ...apiKey, name: input.name, updatedAt: /* @__PURE__ */ new Date() };
  yield* repo.save(updated);
  return updated;
});
const toRecord = (apiKey) => ({
  id: apiKey.id,
  organizationId: apiKey.organizationId,
  name: apiKey.name,
  token: apiKey.token,
  lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
  createdAt: apiKey.createdAt.toISOString(),
  updatedAt: apiKey.updatedAt.toISOString()
});
const listApiKeys_createServerFn_handler = createServerRpc({
  id: "2e1b4735ef716426df50dc62b0d9c1b625f6ef78334657f9d45dfe3a2977de0c",
  name: "listApiKeys",
  filename: "src/domains/api-keys/api-keys.functions.ts"
}, (opts) => listApiKeys.__executeServer(opts));
const listApiKeys = createServerFn({
  method: "GET"
}).middleware([errorHandler]).handler(listApiKeys_createServerFn_handler, async () => {
  const {
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  const apiKeys = await runPromise(gen(function* () {
    const repo = yield* ApiKeyRepository;
    return yield* repo.findAll();
  }).pipe(withPostgres(ApiKeyRepositoryLive, client, organizationId)));
  return apiKeys.map(toRecord);
});
const createApiKey_createServerFn_handler = createServerRpc({
  id: "7221641cbfad588c19e3338bdfe8a4c61bc64b311d7611fb709444d45e5085db",
  name: "createApiKey",
  filename: "src/domains/api-keys/api-keys.functions.ts"
}, (opts) => createApiKey.__executeServer(opts));
const createApiKey = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  name: string().min(1).max(256)
})).handler(createApiKey_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  const apiKey = await runPromise(generateApiKeyUseCase({
    name: data.name
  }).pipe(withPostgres(ApiKeyRepositoryLive, client, organizationId)));
  return toRecord(apiKey);
});
const updateApiKey_createServerFn_handler = createServerRpc({
  id: "cec34d02d95198ada3ced59284a79a79270cec8fec546c22736dd2b9c4f5a9ab",
  name: "updateApiKey",
  filename: "src/domains/api-keys/api-keys.functions.ts"
}, (opts) => updateApiKey.__executeServer(opts));
const updateApiKey = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  id: string(),
  name: string().min(1).max(256)
})).handler(updateApiKey_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  const apiKey = await runPromise(updateApiKeyUseCase({
    id: ApiKeyId(data.id),
    name: data.name
  }).pipe(withPostgres(ApiKeyRepositoryLive, client, organizationId)));
  return toRecord(apiKey);
});
const deleteApiKey_createServerFn_handler = createServerRpc({
  id: "230ad095ab98d151103d002bac87db923fc5032f516eb1da3aa293bb305d4b06",
  name: "deleteApiKey",
  filename: "src/domains/api-keys/api-keys.functions.ts"
}, (opts) => deleteApiKey.__executeServer(opts));
const deleteApiKey = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  id: string()
})).handler(deleteApiKey_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  await runPromise(gen(function* () {
    const repo = yield* ApiKeyRepository;
    yield* repo.delete(ApiKeyId(data.id));
  }).pipe(withPostgres(ApiKeyRepositoryLive, client, organizationId)));
});
export {
  createApiKey_createServerFn_handler,
  deleteApiKey_createServerFn_handler,
  listApiKeys_createServerFn_handler,
  updateApiKey_createServerFn_handler
};
