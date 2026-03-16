import { c as createServerRpc } from "./createServerRpc-wV0Vk4NU.mjs";
import { a as getPostgresClient, B as createProjectUseCase, C as updateProjectUseCase, P as ProjectId, E as ProjectRepositoryLive, F as ProjectRepository, G as UserId } from "./index-D2KejSDZ.mjs";
import { w as withPostgres } from "./with-postgres-EljO6Rpw.mjs";
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
const toRecord = (project) => ({
  id: project.id,
  organizationId: project.organizationId,
  name: project.name,
  slug: project.slug,
  description: project.description,
  deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString()
});
const listProjects_createServerFn_handler = createServerRpc({
  id: "d839cf6b44011b86d53952d902565cd05e2e134bbf7fff001f382725af12d342",
  name: "listProjects",
  filename: "src/domains/projects/projects.functions.ts"
}, (opts) => listProjects.__executeServer(opts));
const listProjects = createServerFn({
  method: "GET"
}).middleware([errorHandler]).handler(listProjects_createServerFn_handler, async () => {
  const {
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  const projects = await runPromise(gen(function* () {
    const repo = yield* ProjectRepository;
    return yield* repo.findAll();
  }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)));
  return projects.map(toRecord);
});
const createProject_createServerFn_handler = createServerRpc({
  id: "267eb557e175e1fca35c0498595a98db814b93d44fd4a5cdc4ce471f7caa732a",
  name: "createProject",
  filename: "src/domains/projects/projects.functions.ts"
}, (opts) => createProject.__executeServer(opts));
const createProject = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  name: string(),
  description: string().optional()
})).handler(createProject_createServerFn_handler, async ({
  data
}) => {
  const {
    userId,
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  const project = await runPromise(createProjectUseCase({
    name: data.name,
    ...data.description !== void 0 ? {
      description: data.description
    } : {},
    createdById: UserId(userId)
  }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)));
  return toRecord(project);
});
const updateProject_createServerFn_handler = createServerRpc({
  id: "f247ac4308ad9b0ddde08fa21752072976af76931670e4b8f0e85505be08a06a",
  name: "updateProject",
  filename: "src/domains/projects/projects.functions.ts"
}, (opts) => updateProject.__executeServer(opts));
const updateProject = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  id: string(),
  name: string().optional(),
  description: string().nullable().optional()
})).handler(updateProject_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  const updatedProject = await runPromise(updateProjectUseCase({
    id: ProjectId(data.id),
    ...data.name !== void 0 ? {
      name: data.name
    } : {},
    ...data.description !== void 0 ? {
      description: data.description
    } : {}
  }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)));
  return toRecord(updatedProject);
});
const deleteProject_createServerFn_handler = createServerRpc({
  id: "cfa0f09309ede008789896731632f8379060a7ce235d3eb49c1d7c6dd5365e5a",
  name: "deleteProject",
  filename: "src/domains/projects/projects.functions.ts"
}, (opts) => deleteProject.__executeServer(opts));
const deleteProject = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  id: string()
})).handler(deleteProject_createServerFn_handler, async ({
  data
}) => {
  const {
    organizationId
  } = await requireSession();
  const client = getPostgresClient();
  await runPromise(gen(function* () {
    const repo = yield* ProjectRepository;
    return yield* repo.softDelete(ProjectId(data.id));
  }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)));
});
export {
  createProject_createServerFn_handler,
  deleteProject_createServerFn_handler,
  listProjects_createServerFn_handler,
  updateProject_createServerFn_handler
};
