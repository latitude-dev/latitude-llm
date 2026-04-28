import { useQuery } from "@tanstack/react-query"
import { type FlaggerRecord, listFlaggersByProject, updateFlagger } from "./annotation-queues.functions.ts"

const flaggersQueryKey = (projectId: string) => ["flaggers", projectId] as const

export function useProjectFlaggers(projectId: string) {
  return useQuery({
    queryKey: flaggersQueryKey(projectId),
    queryFn: () => listFlaggersByProject({ data: { projectId } }),
    enabled: projectId.length > 0,
  })
}

export async function updateFlaggerMutation(input: {
  readonly projectId: string
  readonly slug: string
  readonly enabled: boolean
}): Promise<FlaggerRecord | null> {
  return updateFlagger({ data: input })
}
