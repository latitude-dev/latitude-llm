import { getQueryClient } from "../../lib/data/query-client.tsx"
import { createDatasetFunction } from "./datasets.functions.ts"

const queryClient = getQueryClient()

/**
 * Dataset creation does not use an optimistic collection write here; an empty `onMutate` with
 * `createOptimisticAction` would prevent TanStack DB from ever running `mutationFn`.
 */
export async function createDatasetMutation(params: { id: string; projectId: string; name: string }) {
  const dataset = await createDatasetFunction({
    data: { id: params.id, projectId: params.projectId, name: params.name },
  })
  await queryClient.invalidateQueries({ queryKey: ["datasets", params.projectId] })
  return dataset
}
