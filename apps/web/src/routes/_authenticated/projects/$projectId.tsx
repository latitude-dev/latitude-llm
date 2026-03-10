import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectLayout,
})

function ProjectLayout() {
  return <Outlet />
}
