import { useNavigate } from "@tanstack/react-router"
import { serializeFilters } from "../../-components/trace-page-state.ts"

/** Navigates to the project's Sessions tab, pre-filtered to exactly this model. */
export function useGoToModelSessions(projectSlug: string) {
  const navigate = useNavigate()
  return (model: string) =>
    void navigate({
      to: "/projects/$projectSlug/sessions",
      params: { projectSlug },
      search: { tab: "sessions", filters: serializeFilters({ models: [{ op: "in", value: [model] }] }) },
    })
}
