import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { Context, QueryBuilder, SchemaFromSource } from "@tanstack/react-db"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { type FlaggerRecord, listFlaggersByProject, updateFlagger } from "./flaggers.functions.ts"

const queryClient = getQueryClient()
const flaggersQueryKey = (projectId: string) => ["flaggers", projectId] as const

const makeProjectFlaggersCollection = (projectId: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: flaggersQueryKey(projectId),
      queryFn: async () => [...(await listFlaggersByProject({ data: { projectId } }))],
      getKey: (item: FlaggerRecord) => item.id,
      onUpdate: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((mutation) =>
            updateFlagger({
              data: {
                projectId: mutation.modified.projectId,
                slug: mutation.modified.slug,
                enabled: mutation.modified.enabled,
              },
            }),
          ),
        )
      },
    }),
  )

type ProjectFlaggersCollection = ReturnType<typeof makeProjectFlaggersCollection>
const projectFlaggersCollectionsCache: Record<string, ProjectFlaggersCollection> = {}

const getProjectFlaggersCollection = (projectId: string): ProjectFlaggersCollection => {
  if (!projectFlaggersCollectionsCache[projectId]) {
    projectFlaggersCollectionsCache[projectId] = makeProjectFlaggersCollection(projectId)
  }
  return projectFlaggersCollectionsCache[projectId]
}

type FlaggersSource = { flagger: ProjectFlaggersCollection }
type FlaggersContext = {
  baseSchema: SchemaFromSource<FlaggersSource>
  schema: SchemaFromSource<FlaggersSource>
  fromSourceName: "flagger"
  hasJoins: false
}

export function useProjectFlaggers<TContext extends Context = FlaggersContext>(
  projectId: string,
  queryFn?: (flaggers: QueryBuilder<FlaggersContext>) => QueryBuilder<TContext>,
) {
  const collection = getProjectFlaggersCollection(projectId)
  return useLiveQuery<TContext>(
    (query) => {
      const flaggers = query.from({ flagger: collection })
      if (queryFn) return queryFn(flaggers)
      return flaggers as unknown as QueryBuilder<TContext>
    },
    [projectId],
  )
}

export function updateFlaggerMutation(input: {
  readonly projectId: string
  readonly id: string
  readonly slug: string
  readonly enabled: boolean
}) {
  const collection = getProjectFlaggersCollection(input.projectId)
  return collection.update(input.id, (draft) => {
    draft.enabled = input.enabled
  })
}
