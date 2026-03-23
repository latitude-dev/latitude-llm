import { createOptimisticAction } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { createDatasetMutation } from "./datasets.functions.ts"

const queryClient = getQueryClient()

export const createDatasetIntentMutation = createOptimisticAction<{
  id: string
  projectId: string
  name: string
}>({
  onMutate: () => {},
  mutationFn: async ({ id, projectId, name }) => {
    const dataset = await createDatasetMutation({
      data: { id, projectId, name },
    })
    await queryClient.invalidateQueries({ queryKey: ["datasets", projectId] })
    return dataset
  },
})
