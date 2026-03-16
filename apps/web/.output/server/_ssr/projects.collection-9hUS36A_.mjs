import { q as queryCollectionOptions } from "../_libs/tanstack__query-db-collection.mjs";
import { a as createCollection } from "../_libs/tanstack__db.mjs";
import { u as useLiveQuery } from "../_libs/tanstack__react-db.mjs";
import { t as getQueryClient } from "./router-DWBQ1rk2.mjs";
import { e as errorHandler, c as createSsrRpc } from "./middlewares-BgvwNBR1.mjs";
import { e as createServerFn } from "./index.mjs";
import { o as object, s as string } from "../_libs/zod.mjs";
const EMOJI_REGEX = new RegExp("^(\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F|\\p{Emoji_Modifier_Base}\\p{Emoji_Modifier}?|\\p{Emoji_Component}(?:\\u200D\\p{Emoji_Presentation})*)\\s*", "u");
function extractLeadingEmoji(text) {
  const match = text.match(EMOJI_REGEX);
  if (!match) return [null, text];
  return [match[1] ?? null, text.slice(match[0].length)];
}
const listProjects = createServerFn({
  method: "GET"
}).middleware([errorHandler]).handler(createSsrRpc("d839cf6b44011b86d53952d902565cd05e2e134bbf7fff001f382725af12d342"));
const createProject = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  name: string(),
  description: string().optional()
})).handler(createSsrRpc("267eb557e175e1fca35c0498595a98db814b93d44fd4a5cdc4ce471f7caa732a"));
const updateProject = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  id: string(),
  name: string().optional(),
  description: string().nullable().optional()
})).handler(createSsrRpc("f247ac4308ad9b0ddde08fa21752072976af76931670e4b8f0e85505be08a06a"));
const deleteProject = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  id: string()
})).handler(createSsrRpc("cfa0f09309ede008789896731632f8379060a7ce235d3eb49c1d7c6dd5365e5a"));
const queryClient = getQueryClient();
const projectsCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["projects"],
    queryFn: () => listProjects(),
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(
          (mutation) => createProject({
            data: {
              name: mutation.modified.name,
              ...mutation.modified.description !== null ? { description: mutation.modified.description } : {}
            }
          })
        )
      );
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(
          (mutation) => updateProject({
            data: {
              id: mutation.key,
              name: mutation.modified.name,
              description: mutation.modified.description
            }
          })
        )
      );
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(
          (mutation) => deleteProject({
            data: {
              id: mutation.key
            }
          })
        )
      );
    }
  })
);
const useProjectsCollection = (queryFn, deps) => {
  return useLiveQuery((q) => {
    const projects = q.from({ project: projectsCollection });
    if (queryFn) return queryFn(projects);
    return projects;
  }, deps);
};
export {
  updateProject as a,
  createProject as c,
  deleteProject as d,
  extractLeadingEmoji as e,
  useProjectsCollection as u
};
