const lifecycleDisplayOrder = ["regressed", "escalating", "new", "ongoing", "resolved", "ignored"] as const
const lifecycleDisplayOrderSet = new Set<string>(lifecycleDisplayOrder)

export function getLifecycleStatesForDisplay(states: readonly string[]): readonly string[] {
  const stateSet = new Set(states)

  return [
    ...lifecycleDisplayOrder.filter((state) => stateSet.has(state)),
    ...states.filter((state) => !lifecycleDisplayOrderSet.has(state)),
  ]
}

// Mirrors the backend's `getPrimaryStatePriority` so the table can display the
// same single state used for sorting by status.
export function getPrimaryLifecycleState(states: readonly string[]): string | undefined {
  return getLifecycleStatesForDisplay(states)[0]
}

export function formatLifecycleLabel(state: string): string {
  switch (state) {
    case "new":
      return "New"
    case "escalating":
      return "Escalating"
    case "ongoing":
      return "Ongoing"
    case "resolved":
      return "Resolved"
    case "regressed":
      return "Regressed"
    case "ignored":
      return "Ignored"
    default:
      return state
  }
}
