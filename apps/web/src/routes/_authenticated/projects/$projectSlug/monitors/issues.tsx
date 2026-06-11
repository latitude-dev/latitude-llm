import { createFileRoute } from "@tanstack/react-router"
import { MonitorsBreadcrumb, MonitorsListPage } from "./-components/monitors-list-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/monitors/issues")({
  staticData: {
    breadcrumb: MonitorsBreadcrumb,
  },
  component: MonitorsIssuesPage,
})

function MonitorsIssuesPage() {
  return <MonitorsListPage system={true} />
}
