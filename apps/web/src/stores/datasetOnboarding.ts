'use client'

import { BlockRootNode } from '$/components/BlocksEditor'
import { emptyRootBlock } from '$/components/BlocksEditor/Editor/state/promptlToLexical'
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'

/**
 * Store for managing dataset onboarding state.
 * Provides access to onboarding step navigation and persisted values (initialValue, documentParameters).
 */
export function useDatasetOnboarding() {
  const { value: initialValue, setValue: setInitialValue } =
    useLocalStorage<BlockRootNode>({
      key: AppLocalStorage.datasetOnboardingInitialValue,
      defaultValue: emptyRootBlock,
    })
  const { value: documentParameters, setValue: setDocumentParameters } =
    useLocalStorage<string[]>({
      key: AppLocalStorage.datasetOnboardingParameters,
      defaultValue: [],
    })
  const { value: latestDatasetName, setValue: setLatestDatasetName } =
    useLocalStorage<string>({
      key: AppLocalStorage.datasetOnboardingLatestDatasetName,
      defaultValue: 'Dataset Onboarding',
    })

  return {
    initialValue,
    setInitialValue,
    documentParameters,
    setDocumentParameters,
    latestDatasetName,
    setLatestDatasetName,
  }
}
