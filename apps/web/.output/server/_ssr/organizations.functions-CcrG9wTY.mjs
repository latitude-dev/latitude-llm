import { c as createServerRpc } from "./createServerRpc-wV0Vk4NU.mjs";
import { g as getAdminPostgresClient, a as getPostgresClient, M as MembershipRepository, b as MembershipRepositoryLive, O as OrganizationRepository, c as OrganizationRepositoryLive } from "./index-D2KejSDZ.mjs";
import { w as withPostgres } from "./with-postgres-EljO6Rpw.mjs";
import { r as requireSession } from "./auth-DDVzs-hN.mjs";
import { e as errorHandler } from "./middlewares-BgvwNBR1.mjs";
import { e as createServerFn } from "./index.mjs";
import { r as runPromise, g as gen } from "../_libs/effect.mjs";
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
const countUserOrganizations_createServerFn_handler = createServerRpc({
  id: "3a4299d758cb983f711e8f2b16fb3b1da7d833493f2d9b60affcc55202cccf76",
  name: "countUserOrganizations",
  filename: "src/domains/organizations/organizations.functions.ts"
}, (opts) => countUserOrganizations.__executeServer(opts));
const countUserOrganizations = createServerFn({
  method: "GET"
}).middleware([errorHandler]).handler(countUserOrganizations_createServerFn_handler, async () => {
  const {
    userId
  } = await requireSession();
  const adminClient = getAdminPostgresClient();
  const members = await runPromise(gen(function* () {
    const repo = yield* MembershipRepository;
    return yield* repo.findByUserId(userId);
  }).pipe(withPostgres(MembershipRepositoryLive, adminClient)));
  return members.length;
});
const getOrganization_createServerFn_handler = createServerRpc({
  id: "66c5517423d04db7ed5d3b0dff0c722edc108e4c5c5fc244ab432370f89172a9",
  name: "getOrganization",
  filename: "src/domains/organizations/organizations.functions.ts"
}, (opts) => getOrganization.__executeServer(opts));
const getOrganization = createServerFn({
  method: "GET"
}).middleware([errorHandler]).handler(getOrganization_createServerFn_handler, async () => {
  const {
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  const org = await runPromise(gen(function* () {
    const repo = yield* OrganizationRepository;
    return yield* repo.findById(organizationId);
  }).pipe(withPostgres(OrganizationRepositoryLive, client, organizationId)));
  return {
    id: org.id,
    name: org.name
  };
});
export {
  countUserOrganizations_createServerFn_handler,
  getOrganization_createServerFn_handler
};
