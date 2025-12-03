import { useMemo } from 'react'
import { envClient } from '$/envClient'
import { Providers } from '@latitude-data/constants'
import {
  listModelsForProvider,
  type ModelsDevModel,
} from '@latitude-data/core/services/ai/providers/models/index'

export type {
  ModelsDevModel,
  ModelModality,
  ModelModalities,
} from '@latitude-data/core/services/ai/providers/models/index'

export type ModelOption = Partial<ModelsDevModel> & {
  label: string
  value: string
  custom?: boolean
}

export function getModelOptionsForProvider({
  provider,
  name,
}: {
  provider?: Providers | string
  name?: string
}): ModelOption[] {
  if (!provider) return []
  if (!Object.values<string>(Providers).includes(provider)) return []

  const models = listModelsForProvider({
    provider: provider as Providers,
    name: name,
    defaultProviderName: envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
  })

  return models
    .map((model) => ({
      ...model,
      label: model.id,
      value: model.id,
    }))
    .sort((a, b) => {
      // Sort by release date (newest first), then by label
      if (a.releaseDate && b.releaseDate) return b.releaseDate.localeCompare(a.releaseDate) // prettier-ignore
      if (a.releaseDate && !b.releaseDate) return -1
      if (!a.releaseDate && b.releaseDate) return 1
      return a.label.localeCompare(b.label)
    })
}

export default function useModelOptions({
  provider,
  name,
}: {
  provider?: Providers | string
  name?: string
}): ModelOption[] {
  return useMemo(() => {
    if (!provider || !Object.values<string>(Providers).includes(provider)) {
      return []
    }
    return getModelOptionsForProvider({
      provider,
      name,
    })
  }, [provider, name])
}
