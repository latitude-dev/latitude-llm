import { c as createServerRpc } from "./createServerRpc-wV0Vk4NU.mjs";
import { g as getAdminPostgresClient, e as completeAuthIntentUseCase, f as createLoginIntentUseCase, h as getRedisClient, a as getPostgresClient, i as generateApiKeyUseCase, A as AuthIntentRepositoryLive, U as UserRepositoryLive, j as UserRepository, k as AuthIntentRepository, n as normalizeEmail, l as createSignupIntentData, m as createAuthIntent, o as OrganizationId, p as ApiKeyRepositoryLive, c as OrganizationRepositoryLive, b as MembershipRepositoryLive } from "./index-D2KejSDZ.mjs";
import { w as withPostgres } from "./with-postgres-EljO6Rpw.mjs";
import { e as errorHandler, a as ensureSession } from "./middlewares-BgvwNBR1.mjs";
import { c as completeAuthIntentInputSchema, a as createLoginIntentInputSchema, b as createSignupIntentInputSchema, g as getAuthIntentInfoInputSchema } from "./auth.types-BkojwMno.mjs";
import { e as createServerFn } from "./index.mjs";
import { r as runPromise, m as mergeAll, g as gen, c as catchTag, s as succeed } from "../_libs/effect.mjs";
import { o as object, s as string } from "../_libs/zod.mjs";
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
const createSignupIntentUseCase = (input) => gen(function* () {
  const users = yield* UserRepository;
  const intents = yield* AuthIntentRepository;
  const email = normalizeEmail(input.email);
  const signupData = createSignupIntentData({
    name: input.name,
    organizationName: input.organizationName
  });
  const existingUser = yield* users.findByEmail(email).pipe(catchTag("NotFoundError", () => succeed(null)));
  const intent = createAuthIntent({
    type: "signup",
    email,
    data: signupData,
    existingAccountAtRequest: existingUser !== null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1e3)
  });
  yield* intents.save(intent);
  return intent;
});
const CLI_SESSION_KEY_PREFIX = "cli:session";
const getCliSessionKey = (token) => `${CLI_SESSION_KEY_PREFIX}:${token}`;
const createLoginIntent_createServerFn_handler = createServerRpc({
  id: "5506a53b7817322a6e8fef6b712a55a3d7c2eb28baa5343436ab03bc51cb41db",
  name: "createLoginIntent",
  filename: "src/domains/auth/auth.functions.ts"
}, (opts) => createLoginIntent.__executeServer(opts));
const createLoginIntent = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(createLoginIntentInputSchema).handler(createLoginIntent_createServerFn_handler, async ({
  data
}) => {
  const adminClient = getAdminPostgresClient();
  const intent = await runPromise(createLoginIntentUseCase({
    email: data.email
  }).pipe(withPostgres(mergeAll(UserRepositoryLive, AuthIntentRepositoryLive), adminClient)));
  return {
    intentId: intent.id
  };
});
const createSignupIntent_createServerFn_handler = createServerRpc({
  id: "ff8c666025c47ab10914f26d9b97fe5c3384c75fc291e6396ea48ecd08b8ca62",
  name: "createSignupIntent",
  filename: "src/domains/auth/auth.functions.ts"
}, (opts) => createSignupIntent.__executeServer(opts));
const createSignupIntent = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(createSignupIntentInputSchema).handler(createSignupIntent_createServerFn_handler, async ({
  data
}) => {
  const adminClient = getAdminPostgresClient();
  const intent = await runPromise(createSignupIntentUseCase({
    name: data.name,
    email: data.email,
    organizationName: data.organizationName
  }).pipe(withPostgres(mergeAll(UserRepositoryLive, AuthIntentRepositoryLive), adminClient)));
  return {
    intentId: intent.id,
    existingAccountAtRequest: intent.existingAccountAtRequest
  };
});
const getAuthIntentInfo_createServerFn_handler = createServerRpc({
  id: "b8dd6d04677e4daa7f44940c4957f2e3103d09bec15458a7ec28a0af65d4e775",
  name: "getAuthIntentInfo",
  filename: "src/domains/auth/auth.functions.ts"
}, (opts) => getAuthIntentInfo.__executeServer(opts));
const getAuthIntentInfo = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(getAuthIntentInfoInputSchema).handler(getAuthIntentInfo_createServerFn_handler, async ({
  data
}) => {
  const session = await ensureSession();
  const adminClient = getAdminPostgresClient();
  const intent = await runPromise(gen(function* () {
    const repo = yield* AuthIntentRepository;
    return yield* repo.findById(data.intentId).pipe(catchTag("NotFoundError", () => succeed(null)));
  }).pipe(withPostgres(AuthIntentRepositoryLive, adminClient)));
  if (!intent) {
    return {
      type: "login",
      needsName: false,
      organizationName: null
    };
  }
  const userHasName = !!session.user.name && session.user.name.trim().length > 0;
  const needsName = intent.type === "invite" && !intent.existingAccountAtRequest && !userHasName;
  return {
    type: intent.type,
    needsName,
    organizationName: intent.data?.invite?.organizationName ?? null
  };
});
const completeAuthIntent_createServerFn_handler = createServerRpc({
  id: "26a5ca2f2bb514f33f98665d848c7522b29c1d712c6958a1399cb865f08aaadb",
  name: "completeAuthIntent",
  filename: "src/domains/auth/auth.functions.ts"
}, (opts) => completeAuthIntent.__executeServer(opts));
const completeAuthIntent = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(completeAuthIntentInputSchema).handler(completeAuthIntent_createServerFn_handler, async ({
  data
}) => {
  const session = await ensureSession();
  const adminClient = getAdminPostgresClient();
  const userId = session.user.id;
  const email = session.user.email;
  const name = data.name ?? session.user.name ?? null;
  return await runPromise(completeAuthIntentUseCase({
    intentId: data.intentId,
    session: {
      userId,
      email,
      name
    }
  }).pipe(withPostgres(mergeAll(AuthIntentRepositoryLive, MembershipRepositoryLive, UserRepositoryLive, OrganizationRepositoryLive), adminClient)));
});
const exchangeCliSession_createServerFn_handler = createServerRpc({
  id: "271af12fb71876676771a222c21a3dcd6f96caf30f721c37f8a4d51d2374d9f7",
  name: "exchangeCliSession",
  filename: "src/domains/auth/auth.functions.ts"
}, (opts) => exchangeCliSession.__executeServer(opts));
const exchangeCliSession = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  sessionToken: string()
})).handler(exchangeCliSession_createServerFn_handler, async ({
  data
}) => {
  const session = await ensureSession();
  const redis = getRedisClient();
  const cliSessionKey = getCliSessionKey(data.sessionToken);
  const raw = await redis.get(cliSessionKey);
  if (!raw) {
    throw new Error("CLI session not found or expired");
  }
  const cliSession = JSON.parse(raw);
  if (cliSession.status !== "pending") {
    throw new Error("CLI session already consumed");
  }
  const sessionData = session.session;
  const activeOrganizationId = sessionData.activeOrganizationId;
  if (!activeOrganizationId) {
    throw new Error("No active organization. Please complete your account setup first.");
  }
  const client = getPostgresClient();
  const createdAt = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const apiKey = await runPromise(generateApiKeyUseCase({
    name: `CLI (${createdAt})`
  }).pipe(withPostgres(ApiKeyRepositoryLive, client, OrganizationId(activeOrganizationId))));
  await redis.setex(
    cliSessionKey,
    600,
    // 10 minutes to poll
    JSON.stringify({
      status: "authenticated",
      token: apiKey.token,
      organizationId: activeOrganizationId
    })
  );
});
export {
  completeAuthIntent_createServerFn_handler,
  createLoginIntent_createServerFn_handler,
  createSignupIntent_createServerFn_handler,
  exchangeCliSession_createServerFn_handler,
  getAuthIntentInfo_createServerFn_handler
};
