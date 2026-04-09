import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type { IssueRecord } from "./issues.functions.ts"
import { listIssues } from "./issues.functions.ts"

const queryClient = getQueryClient()

const makeIssuesCollection = (projectId: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["issues", projectId],
      queryFn: async () => [...(await listIssues({ data: { projectId, limit: 100, offset: 0 } }))],
      getKey: (item: IssueRecord) => item.id,
    }),
  )

type IssuesCollection = ReturnType<typeof makeIssuesCollection>
const issuesCollectionsCache: Record<string, IssuesCollection> = {}

const getIssuesCollection = (projectId: string): IssuesCollection => {
  if (!issuesCollectionsCache[projectId]) {
    issuesCollectionsCache[projectId] = makeIssuesCollection(projectId)
  }
  return issuesCollectionsCache[projectId]
}

export const useIssuesCollection = (projectId: string) => {
  const collection = getIssuesCollection(projectId)
  return useLiveQuery((q) => q.from({ issue: collection }))
}
