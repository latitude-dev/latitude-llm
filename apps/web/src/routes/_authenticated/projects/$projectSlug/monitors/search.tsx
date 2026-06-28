import { createFileRoute } from "@tanstack/react-router"
import { MonitorsBreadcrumb, MonitorsListPage } from "./-components/monitors-list-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/monitors/search")({
  staticData: {
    breadcrumb: MonitorsBreadcrumb,
  },
  component: MonitorsSearchPage,
})

function MonitorsSearchPage() {
  return <MonitorsListPage />
}
