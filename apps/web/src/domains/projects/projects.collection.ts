import { generateId, OrganizationId, ProjectId, type RedactionSetting } from "@domain/shared"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { Context, QueryBuilder, SchemaFromSource } from "@tanstack/react-db"
import { useLiveQuery } from "@tanstack/react-db"
import { createAppCollection } from "../../lib/data/create-app-collection.ts"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { getShowcaseProjectRecord } from "../showcase/showcase.functions.ts"
import type { ProjectRecord } from "./projects.functions.ts"
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  updateProjectRedaction,
} from "./projects.functions.ts"
import { mergeShowcaseProject } from "./showcase-project.ts"

const queryClient = getQueryClient()

// The org-scoped project list (RLS-pure) plus the cross-org Showcase row, merged
// client-side. The Showcase lives in a different org, so `listProjects` never
// returns it; the merge is the single injection point and appears only when the
// org's `wantsShowcase` is true and a showcase has been built (else the fetch
// returns null). This one merge feeds both the switcher entry and the by-slug
// current-project lookups that read the collection.
const projectsCollection = createAppCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["projects"],
    queryFn: async () => {
      // The showcase fetch is best-effort: a transient failure (5xx/network)
      // must not break the switcher + by-slug lookups when `listProjects`
      // succeeded. `allSettled` keeps both results independent; a genuine
      // `listProjects` failure still rejects the query, while a failed showcase
      // fetch degrades to null. The server fn already returns null when there's
      // no showcase or the org opted out.
      const [projectsResult, showcaseResult] = await Promise.allSettled([listProjects(), getShowcaseProjectRecord()])
      if (projectsResult.status === "rejected") throw projectsResult.reason
      const showcase = showcaseResult.status === "fulfilled" ? showcaseResult.value : null
      return mergeShowcaseProject(projectsResult.value, showcase)
    },
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
            if (!old) return undefined
            const hasId = old.some((p) => p.id === result.id)
            if (!hasId) return [...old, result]
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
              slug: mutation.modified.slug,
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

// Refetches instead of mutating optimistically: the server may reject on role, and a
// rolled-back "redaction is on" is the worst thing a compliance control could flash.
export async function updateProjectRedactionMutation(projectId: string, redaction: RedactionSetting | null) {
  await updateProjectRedaction({ data: { projectId, redaction } })
  await queryClient.invalidateQueries({ queryKey: ["projects"] })
}

export function createProjectMutation(name: string) {
  const now = new Date().toISOString()
  const projectId = generateId<"ProjectId">()

  const transaction = projectsCollection.insert({
    id: projectId,
    organizationId: OrganizationId(""),
    name,
    slug: "",
    settings: {
      keepMonitoring: undefined,
      notifications: undefined,
      escalation: undefined,
      onboardingType: undefined,
      onboardingCompleted: undefined,
      isSample: undefined,
      sampling: undefined,
      redaction: undefined,
    },
    firstTraceAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    isShowcase: false,
  })

  return { projectId, transaction }
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
