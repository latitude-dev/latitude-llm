import { e as createServerFn, T as TSS_SERVER_FUNCTION, f as getServerFnById } from "./index.mjs";
import { i as runSync, l as logError, j as logWarning, k as logInfo } from "../_libs/effect.mjs";
var createMiddleware = (options, __opts) => {
  const resolvedOptions = {
    type: "request",
    ...__opts || options
  };
  return {
    options: resolvedOptions,
    middleware: (middleware) => {
      return createMiddleware({}, Object.assign(resolvedOptions, { middleware }));
    },
    inputValidator: (inputValidator) => {
      return createMiddleware({}, Object.assign(resolvedOptions, { inputValidator }));
    },
    client: (client) => {
      return createMiddleware({}, Object.assign(resolvedOptions, { client }));
    },
    server: (server) => {
      return createMiddleware({}, Object.assign(resolvedOptions, { server }));
    }
  };
};
var createSsrRpc = (functionId, importer) => {
  const url = "/_serverFn/" + functionId;
  const serverFnMeta = { id: functionId };
  const fn = async (...args) => {
    return (await getServerFnById(functionId))(...args);
  };
  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
const getSession = createServerFn({
  method: "GET"
}).handler(createSsrRpc("ef664655b86369beee631193df77733f95830a3e6d9c9efd1d36212c071f37fc"));
const ensureSession = createServerFn({
  method: "GET"
}).handler(createSsrRpc("de06e04a259be752102608f89cb943ef12dd5c103f310aa8691f82882e644c25"));
const createLogger = (scope) => {
  return {
    info: (...args) => runSync(logInfo(`[${scope}]`, ...args)),
    warn: (...args) => runSync(logWarning(`[${scope}]`, ...args)),
    error: (...args) => runSync(logError(`[${scope}]`, ...args))
  };
};
const logger = createLogger("server-fn");
const errorHandler = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (e) {
    const isDomainError = typeof e === "object" && e !== null && "httpMessage" in e;
    const tag = typeof e === "object" && e !== null && "_tag" in e ? e._tag : void 0;
    const message = isDomainError ? e.httpMessage : e instanceof Error ? e.message : "Unknown error occurred";
    const payload = JSON.stringify({ _tag: tag, message });
    const error = new Error(payload);
    if (e instanceof Error && e.stack) error.stack = e.stack;
    logger.error({ _tag: tag, message });
    throw error;
  }
});
function parseServerError(err) {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      return { _tag: parsed._tag, message: parsed.message };
    }
  } catch {
  }
  return { _tag: void 0, message: raw };
}
export {
  ensureSession as a,
  createSsrRpc as c,
  errorHandler as e,
  getSession as g,
  parseServerError as p
};
