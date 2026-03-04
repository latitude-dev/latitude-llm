import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { useMemo } from "react"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { createProject, deleteProject, listProjects, updateProject } from "./projects.functions.ts"
import type { ProjectRecord } from "./projects.types.ts"

const queryClient = getQueryClient()

const createProjectsCollection = (organizationId: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["projects", organizationId],
      queryFn: () => listProjects({ data: {} }),
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

export const useProjectsCollection = (organizationId: string) => {
  const collection = useMemo(() => createProjectsCollection(organizationId), [organizationId])
  return useLiveQuery((query) => query.from({ project: collection }))
}
