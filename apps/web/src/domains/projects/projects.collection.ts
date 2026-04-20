import { generateId, OrganizationId, ProjectId } from "@domain/shared"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { Context, QueryBuilder, SchemaFromSource } from "@tanstack/react-db"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { useQueries } from "@tanstack/react-query"
import { useMemo } from "react"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type { ProjectRecord, ProjectStats } from "./projects.functions.ts"
import { createProject, deleteProject, getProjectStats, listProjects, updateProject } from "./projects.functions.ts"

const queryClient = getQueryClient()

const projectsCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["projects"],
    queryFn: () => listProjects(),
    getKey: (item: ProjectRecord) => item.id,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const result = await createProject({
            data: {
              id: mutation.modified.id,
              name: mutation.modified.name,
            },
          })
          queryClient.setQueryData<ProjectRecord[]>(["projects"], (old) => {
            if (!old) {
              return [result]
            }
            const hasId = old.some((p) => p.id === result.id)
            if (!hasId) {
              return [...old, result]
            }
            return old.map((p) => (p.id === result.id ? result : p))
          })
        }),
      )
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          updateProject({
            data: {
              id: mutation.key,
              name: mutation.modified.name,
              settings: mutation.modified.settings,
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
  const now = new Date().toISOString()
  const projectId = generateId<"ProjectId">()

  const transaction = projectsCollection.insert({
    id: projectId,
    organizationId: OrganizationId(""),
    name,
    slug: "",
    settings: { keepMonitoring: undefined },
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  })

  return { projectId, transaction }
}

export function renameProjectMutation(id: string, name: string) {
  return projectsCollection.update(ProjectId(id), (draft) => {
    draft.name = name
  })
}

export function updateProjectMutation(id: string, patch: Partial<ProjectRecord>) {
  return projectsCollection.update(ProjectId(id), (draft) => {
    Object.assign(draft, patch)
  })
}

export function deleteProjectMutation(id: string) {
  return projectsCollection.delete(ProjectId(id))
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

export function useProjectsStats(projectIds: readonly string[]) {
  const queries = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: ["project-stats", projectId],
      queryFn: () => getProjectStats({ data: { projectId } }),
      staleTime: 60_000,
    })),
  })

  const statsByProjectId = useMemo(() => {
    const map = new Map<string, ProjectStats>()
    projectIds.forEach((projectId, index) => {
      const query = queries[index]
      if (query.data) {
        map.set(projectId, query.data)
      }
    })
    return map
  }, [projectIds, queries])

  const isLoading = queries.some((q) => q.isLoading)

  return { statsByProjectId, isLoading }
}
