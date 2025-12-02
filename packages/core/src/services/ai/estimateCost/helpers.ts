import type { ModelCost } from './index'

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high'
export type ReasoningSummary = 'auto' | 'detailed'

export type ReasoningCapabilities = {
  reasoningEffort?: ReasoningEffort[]
  reasoningSummary?: ReasoningSummary[]
}

type ModelSpec = {
  cost?: ModelCost | ModelCost[]
  hidden?: boolean
  reasoning?: ReasoningCapabilities
}
type ModelSpecValue<N extends string> = ModelSpec & { name: N }

function orderCost(cost: ModelCost | ModelCost[]): ModelCost | ModelCost[] {
  if (!Array.isArray(cost)) return cost

  return cost.sort(
    (a, b) => (a.tokensRangeStart ?? 0) - (b.tokensRangeStart ?? 0),
  )
}

export const NON_IMPLEMENTED_COST = {
  cost: { input: 0, output: 0 },
  costImplemented: false,
}

export const createModelSpec = <T extends Record<string, ModelSpec>>({
  defaultModel,
  models,
  modelName,
}: {
  defaultModel: keyof T
  models: T
  modelName?: (model: string) => keyof T | undefined
}) => {
  const modelSpec = Object.fromEntries(
    Object.entries(models).map(([key, value]) => {
      return [
        key,
        {
          ...value,
          name: key as T & string,
          ...(value.cost ? { cost: orderCost(value.cost) } : {}),
        },
      ]
    }),
  ) as unknown as { [K in keyof T]: ModelSpecValue<K & string> }

  const modelKeys = Object.keys(modelSpec) as (keyof T)[]
  const uiModelListKeys = modelKeys.filter((m) => !modelSpec[m]!.hidden)
  const modelList = modelKeys.reduce(
    (acc, model) => {
      acc[model] = model
      return acc
    },
    {} as Record<keyof T, keyof T>,
  )

  // This is final list used in the UI
  // Hidden models are for example snapshots
  // that we have the price but we don't want to show them in the UI.
  const uiList = uiModelListKeys.reduce(
    (acc, model) => {
      acc[model] = model
      return acc
    },
    {} as Record<keyof T, keyof T>,
  )

  const getModelName = (model: string) => {
    if (model in modelList) {
      return model as keyof T
    }

    const modelFallback = modelName?.(model)

    if (modelFallback) return modelFallback

    // FIXME: This is problematic because
    // if we didn't find the exact model or the fallback model
    // it means we don't have in our list the right model
    // and the cost will be wrongly calculated.
    return defaultModel!
  }

  const getCost = (model: string) => {
    const cost = modelSpec[getModelName(model)].cost

    if (!cost) return NON_IMPLEMENTED_COST

    return { cost, costImplemented: true }
  }

  const getReasoningCapabilities = (
    model: string,
  ): ReasoningCapabilities | undefined => {
    const modelKey = getModelName(model)
    return modelSpec[modelKey]?.reasoning
  }

  return { modelSpec, modelList, uiList, getCost, getReasoningCapabilities }
}

export type ModelSpecReturn = ReturnType<typeof createModelSpec>
