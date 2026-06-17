import { createFileRoute } from "@tanstack/react-router"
import { MonitorsBreadcrumb, MonitorsListPage } from "./-components/monitors-list-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/monitors/issues")({
  staticData: {
    breadcrumb: MonitorsBreadcrumb,
  },
  component: MonitorsSignalsPage,
})

function MonitorsSignalsPage() {
  return <MonitorsListPage system={true} />
}
