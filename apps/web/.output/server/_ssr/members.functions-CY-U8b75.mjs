import { c as createServerRpc } from "./createServerRpc-wV0Vk4NU.mjs";
import { a as getPostgresClient, K as removeMemberUseCase, O as OrganizationRepository, c as OrganizationRepositoryLive, j as UserRepository, k as AuthIntentRepository, n as normalizeEmail, L as createInviteIntentData, m as createAuthIntent, U as UserRepositoryLive, A as AuthIntentRepositoryLive, M as MembershipRepository, b as MembershipRepositoryLive } from "./index-D2KejSDZ.mjs";
import { w as withPostgres } from "./with-postgres-EljO6Rpw.mjs";
import { r as requireSession } from "./auth-DDVzs-hN.mjs";
import { e as errorHandler, a as ensureSession } from "./middlewares-BgvwNBR1.mjs";
import { e as createServerFn } from "./index.mjs";
import { o as object, s as string } from "../_libs/zod.mjs";
import { r as runPromise, g as gen, m as mergeAll, c as catchTag, s as succeed } from "../_libs/effect.mjs";
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
const createInviteIntentUseCase = (input) => gen(function* () {
  const users = yield* UserRepository;
  const intents = yield* AuthIntentRepository;
  const email = normalizeEmail(input.email);
  const inviteData = createInviteIntentData({
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    inviterName: input.inviterName
  });
  const existingUser = yield* users.findByEmail(email).pipe(catchTag("NotFoundError", () => succeed(null)));
  const intent = createAuthIntent({
    type: "invite",
    email,
    data: inviteData,
    existingAccountAtRequest: existingUser !== null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1e3)
  });
  yield* intents.save(intent);
  return intent;
});
const listMembers_createServerFn_handler = createServerRpc({
  id: "42831df04e5311fa652910c2af55be21ffc637db53181303241a8fff26651d73",
  name: "listMembers",
  filename: "src/domains/members/members.functions.ts"
}, (opts) => listMembers.__executeServer(opts));
const listMembers = createServerFn({
  method: "GET"
}).middleware([errorHandler]).handler(listMembers_createServerFn_handler, async () => {
  const {
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  const [members, pendingInvites] = await runPromise(gen(function* () {
    const membershipRepo = yield* MembershipRepository;
    const intentRepo = yield* AuthIntentRepository;
    const members2 = yield* membershipRepo.findMembersWithUser(organizationId);
    const pendingInvites2 = yield* intentRepo.findPendingInvitesByOrganizationId(organizationId);
    return [members2, pendingInvites2];
  }).pipe(withPostgres(mergeAll(MembershipRepositoryLive, AuthIntentRepositoryLive), client, organizationId)));
  const activeMembers = members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: m.role,
    status: "active",
    confirmedAt: m.createdAt ? m.createdAt.toISOString() : null,
    createdAt: m.createdAt ? m.createdAt.toISOString() : (/* @__PURE__ */ new Date()).toISOString()
  }));
  const activeMemberEmails = new Set(activeMembers.map((m) => m.email.toLowerCase()));
  const invitedMembers = pendingInvites.filter((invite) => !activeMemberEmails.has(invite.email.toLowerCase())).map((invite) => ({
    id: invite.id,
    userId: null,
    name: null,
    email: invite.email,
    role: "member",
    status: "invited",
    confirmedAt: null,
    createdAt: invite.createdAt.toISOString()
  }));
  return [...activeMembers, ...invitedMembers];
});
const inviteMember_createServerFn_handler = createServerRpc({
  id: "a7670072bda92e63ba64a1dce3f9fb1ba785d258e1a002f7bd8aca6cd839f03e",
  name: "inviteMember",
  filename: "src/domains/members/members.functions.ts"
}, (opts) => inviteMember.__executeServer(opts));
const inviteMember = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  email: string().email()
})).handler(inviteMember_createServerFn_handler, async ({
  data
}) => {
  const session = await ensureSession();
  const {
    organizationId
  } = await requireSession();
  const inviterName = session.user.name ?? "Someone";
  const client = getPostgresClient();
  const org = await runPromise(gen(function* () {
    const repo = yield* OrganizationRepository;
    return yield* repo.findById(organizationId);
  }).pipe(withPostgres(OrganizationRepositoryLive, client, organizationId)));
  const organizationName = org.name;
  const intent = await runPromise(createInviteIntentUseCase({
    email: data.email,
    organizationId,
    organizationName,
    inviterName
  }).pipe(withPostgres(mergeAll(AuthIntentRepositoryLive, UserRepositoryLive), client, organizationId)));
  return {
    intentId: intent.id
  };
});
const removeMember_createServerFn_handler = createServerRpc({
  id: "51b48db34bcbd58da98db47954818e84e9e500ce3b962054353ee9ff895799b2",
  name: "removeMember",
  filename: "src/domains/members/members.functions.ts"
}, (opts) => removeMember.__executeServer(opts));
const removeMember = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  membershipId: string()
})).handler(removeMember_createServerFn_handler, async ({
  data
}) => {
  const {
    userId,
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  await runPromise(removeMemberUseCase({
    membershipId: data.membershipId,
    requestingUserId: userId
  }).pipe(withPostgres(MembershipRepositoryLive, client, organizationId)));
});
export {
  inviteMember_createServerFn_handler,
  listMembers_createServerFn_handler,
  removeMember_createServerFn_handler
};
