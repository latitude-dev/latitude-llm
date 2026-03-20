import { generateId } from "@domain/shared"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { Context, QueryBuilder, SchemaFromSource } from "@tanstack/react-db"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type { ProjectRecord } from "./projects.functions.ts"
import { createProject, deleteProject, listProjects, updateProject } from "./projects.functions.ts"

const queryClient = getQueryClient()

const projectsCollection = createCollection(
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
              id: mutation.modified.id,
              name: mutation.modified.name,
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

export function createProjectMutation(name: string) {
  return projectsCollection.insert({
    id: generateId(),
    organizationId: "",
    name,
    slug: "",
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

export function renameProjectMutation(id: string, name: string) {
  return projectsCollection.update(id, (draft) => {
    draft.name = name
  })
}

export function deleteProjectMutation(id: string) {
  return projectsCollection.delete(id)
}

type ProjectsSource = { project: typeof projectsCollection }
type ProjectsContext = {
  baseSchema: SchemaFromSource<ProjectsSource>
  schema: SchemaFromSource<ProjectsSource>
  fromSourceName: "project"
  hasJoins: false
}

export const useProjectsCollection = <TContext extends Context = ProjectsContext>(
  queryFn?: (projects: QueryBuilder<ProjectsContext>) => QueryBuilder<TContext>,
  deps?: Array<unknown>,
) => {
  return useLiveQuery<TContext>((q) => {
    const projects = q.from({ project: projectsCollection })
    if (queryFn) return queryFn(projects)
    return projects as unknown as QueryBuilder<TContext>
  }, deps)
}
