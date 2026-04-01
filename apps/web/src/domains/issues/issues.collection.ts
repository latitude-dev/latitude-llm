import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createIssue, listIssues } from "./issues.functions.ts"

type CreateIssueInput = Parameters<typeof createIssue>[0]["data"]

export function useListIssues({
  projectId,
  nameFilter,
  enabled = true,
}: {
  readonly projectId: string
  readonly nameFilter?: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["issues", projectId, nameFilter],
    queryFn: () => listIssues({ data: { projectId, nameFilter } }),
    enabled,
    staleTime: 30_000,
  })
}

export function useCreateIssue({ projectId }: { readonly projectId: string }) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateIssueInput) => createIssue({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["issues", projectId] })
    },
  })
}
