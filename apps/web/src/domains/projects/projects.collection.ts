import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { createProject, deleteProject, listProjects, updateProject } from "./projects.functions.ts"
import type { ProjectRecord } from "./projects.functions.ts"

const queryClient = getQueryClient()

export const projectsCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["projects"],
    queryFn: () => listProjects(),
    getKey: (item: ProjectRecord) => item.id,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          createProject({
            data: {
              name: mutation.modified.name,
              ...(mutation.modified.description !== null ? { description: mutation.modified.description } : {}),
            },
          }),
        ),
      )
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          updateProject({
            data: {
              id: mutation.key,
              name: mutation.modified.name,
              description: mutation.modified.description,
            },
          }),
        ),
      )
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          deleteProject({
            data: {
              id: mutation.key,
            },
          }),
        ),
      )
    },
  }),
)

export const useProjectsCollection = () => {
  return useLiveQuery((query) => query.from({ project: projectsCollection }))
}
