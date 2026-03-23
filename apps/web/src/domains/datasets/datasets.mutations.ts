import { createOptimisticAction } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import {
  addTracesToDatasetMutation,
  createDatasetFromTracesMutation,
  createDatasetMutation,
  deleteRowsMutation,
  renameDatasetMutation,
  saveDatasetCsv,
  updateRowMutation,
} from "./datasets.functions.ts"

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

export const renameDatasetIntentMutation = createOptimisticAction<{
  datasetId: string
  name: string
  projectId: string
}>({
  onMutate: () => {},
  mutationFn: async ({ datasetId, name, projectId }) => {
    const dataset = await renameDatasetMutation({
      data: { datasetId, name },
    })
    await queryClient.invalidateQueries({ queryKey: ["datasets", projectId] })
    return dataset
  },
})

export const createDatasetFromTracesIntentMutation = createOptimisticAction<{
  datasetId: string
  projectId: string
  name: string
  traceIds: string[]
}>({
  onMutate: () => {},
  mutationFn: async ({ datasetId, projectId, name, traceIds }) => {
    const result = await createDatasetFromTracesMutation({
      data: { datasetId, projectId, name, traceIds },
    })
    await queryClient.invalidateQueries({ queryKey: ["datasets", projectId] })
    return result
  },
})

export const addTracesToDatasetIntentMutation = createOptimisticAction<{
  projectId: string
  datasetId: string
  traceIds: string[]
}>({
  onMutate: () => {},
  mutationFn: async ({ projectId, datasetId, traceIds }) => {
    const result = await addTracesToDatasetMutation({
      data: { projectId, datasetId, traceIds },
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["datasets", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["datasetRows", datasetId] }),
    ])
    return result
  },
})

export const saveDatasetCsvIntentMutation = createOptimisticAction<{
  projectId: string
  datasetId: string
  formData: FormData
}>({
  onMutate: () => {},
  mutationFn: async ({ projectId, datasetId, formData }) => {
    const result = await saveDatasetCsv({ data: formData })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["datasets", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["datasetRows", datasetId] }),
    ])
    return result
  },
})

export const updateRowIntentMutation = createOptimisticAction<{
  projectId: string
  datasetId: string
  rowId: string
  input: string
  output: string
  metadata: string
}>({
  onMutate: () => {},
  mutationFn: async ({ projectId, datasetId, rowId, input, output, metadata }) => {
    const result = await updateRowMutation({
      data: { datasetId, rowId, input, output, metadata },
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["datasets", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["datasetRows", datasetId] }),
    ])
    return result
  },
})

export const deleteRowsIntentMutation = createOptimisticAction<{
  projectId: string
  datasetId: string
  rowIds: string[]
}>({
  onMutate: () => {},
  mutationFn: async ({ projectId, datasetId, rowIds }) => {
    const result = await deleteRowsMutation({
      data: { datasetId, rowIds },
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["datasets", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["datasetRows", datasetId] }),
    ])
    return result
  },
})
