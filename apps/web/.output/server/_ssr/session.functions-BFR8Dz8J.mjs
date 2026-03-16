import { c as createServerRpc } from "./createServerRpc-wV0Vk4NU.mjs";
import { d as getBetterAuth } from "./index-D2KejSDZ.mjs";
import { e as createServerFn, g as getRequestHeaders } from "./index.mjs";
import "../_libs/react.mjs";
import "../_libs/papaparse.mjs";
import "stream";
import "node:stream";
import "../_libs/zod.mjs";
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
import "../_libs/effect.mjs";
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
const getSession_createServerFn_handler = createServerRpc({
  id: "ef664655b86369beee631193df77733f95830a3e6d9c9efd1d36212c071f37fc",
  name: "getSession",
  filename: "src/domains/sessions/session.functions.ts"
}, (opts) => getSession.__executeServer(opts));
const getSession = createServerFn({
  method: "GET"
}).handler(getSession_createServerFn_handler, async () => {
  const headers = getRequestHeaders();
  const auth = getBetterAuth();
  const session = await auth.api.getSession({
    headers
  });
  return session;
});
const ensureSession_createServerFn_handler = createServerRpc({
  id: "de06e04a259be752102608f89cb943ef12dd5c103f310aa8691f82882e644c25",
  name: "ensureSession",
  filename: "src/domains/sessions/session.functions.ts"
}, (opts) => ensureSession.__executeServer(opts));
const ensureSession = createServerFn({
  method: "GET"
}).handler(ensureSession_createServerFn_handler, async () => {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
});
export {
  ensureSession_createServerFn_handler,
  getSession_createServerFn_handler
};
