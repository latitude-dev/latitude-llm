/* import useCurrentWorkspace from '$/stores/currentWorkspace' */

/**
 * Stupid feature flag until we have a real one
 */
export function useFeatureFlag() {
  /* const { data, isLoading } = useCurrentWorkspace() */

  // If your workspace in develop is not 1, you are not a developer
  return {
    /* data: data ? data.id === 1 : undefined, */
    /* isLoading, */

    // For now, always return false
    // I don't want to enable dataset V2 for anyone.
    data: false,
    isLoading: false,
  }
}
