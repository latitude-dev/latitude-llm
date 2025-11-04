'use client'

import { useCallback } from 'react'
import { BlockRootNode } from '$/components/BlocksEditor'
import { EMPTY_ROOT_BLOCK } from '$/components/BlocksEditor/Editor/state/promptlToLexical'
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'

type PromptEngineeringOnboardingState = {
  initialValue: BlockRootNode
  documentParameters: string[]
  latestDatasetName: string
}

const defaultPromptEngineeringOnboardingState: PromptEngineeringOnboardingState =
  {
    initialValue: EMPTY_ROOT_BLOCK,
    documentParameters: [],
    // The default dataset name for the onboarding
    latestDatasetName: 'Dataset Onboarding',
  }

/**
 * Store for managing prompt engineering onboarding state.
 * Provides access to onboarding step navigation and persisted values (initialValue, documentParameters).
 */
export function usePromptEngineeringOnboarding() {
  const { value: state, setValue: setState } =
    useLocalStorage<PromptEngineeringOnboardingState>({
      key: AppLocalStorage.promptEngineeringOnboardingState,
      defaultValue: defaultPromptEngineeringOnboardingState,
    })

  const setInitialValue = useCallback(
    (newValue: BlockRootNode) => {
      setState((prev) => ({
        ...prev,
        initialValue: newValue,
      }))
    },
    [setState],
  )

  const setDocumentParameters = useCallback(
    (newValue: string[]) => {
      setState((prev) => ({
        ...prev,
        documentParameters: newValue,
      }))
    },
    [setState],
  )

  const setLatestDatasetName = useCallback(
    (newValue: string) => {
      setState((prev) => ({
        ...prev,
        latestDatasetName: newValue,
      }))
    },
    [setState],
  )

  return {
    initialValue: state.initialValue,
    setInitialValue,
    documentParameters: state.documentParameters,
    setDocumentParameters,
    latestDatasetName: state.latestDatasetName,
    setLatestDatasetName,
  }
}
