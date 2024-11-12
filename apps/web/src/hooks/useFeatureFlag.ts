import useCurrentWorkspace from '$/stores/currentWorkspace'

/**
 * Stupid feature flag until we have a real one
 */
export function useFeatureFlag() {
  const { data } = useCurrentWorkspace()

  // If your workspace in develop is not 1, you are not a developer
  return data.id === 1
}
