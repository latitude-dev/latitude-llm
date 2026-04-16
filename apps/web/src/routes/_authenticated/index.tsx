import { Container, TableBlankSlate, TableSkeleton, Text } from "@repo/ui"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useLayoutEffect, useState } from "react"
import { useProjectsCollection } from "../../domains/projects/projects.collection.ts"
import { pickProjectSlugForHome } from "../../lib/last-project-storage.ts"
import { CreateProjectModal } from "./-components/create-project-modal.tsx"
import { useAuthenticatedOrganizationId } from "./-route-data.ts"

export const Route = createFileRoute("/_authenticated/")({
  // Intentionally no `beforeLoad` that hits Postgres: a failed `listProjects()` would
  // hard-error the whole `/` navigation. The collection + `useLayoutEffect` below
  // perform the same redirects once data is available (and React Query can surface errors).
  component: AuthenticatedHomePage,
})

function AuthenticatedHomePage() {
  const organizationId = useAuthenticatedOrganizationId()
  const { data, isLoading } = useProjectsCollection()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const projects = data ?? []

  // TODO(frontend-use-effect-policy): imperative navigate after projects collection resolves
  useLayoutEffect(() => {
    if (isLoading) return
    if (projects.length === 1) {
      void router.navigate({
        to: "/projects/$projectSlug",
        params: { projectSlug: projects[0].slug },
        replace: true,
      })
      return
    }
    if (projects.length < 2) return
    const slug = pickProjectSlugForHome(organizationId, projects)
    if (slug) {
      void router.navigate({ to: "/projects/$projectSlug", params: { projectSlug: slug }, replace: true })
    }
  }, [isLoading, projects, organizationId, router])

  if (isLoading || projects.length >= 2 || projects.length === 1) {
    return (
      <Container className="pt-14">
        <TableSkeleton cols={3} rows={4} variant="listing" />
      </Container>
    )
  }

  if (projects.length === 0) {
    return (
      <Container className="flex flex-col gap-8 pt-14">
        <CreateProjectModal open={createOpen} onOpenChange={setCreateOpen} />
        <Text.H4 weight="bold">Projects</Text.H4>
        <TableBlankSlate
          description="There are no projects yet. Create one to start adding your prompts."
          link={
            <TableBlankSlate.Button onClick={() => setCreateOpen(true)}>
              Create your first project
            </TableBlankSlate.Button>
          }
        />
      </Container>
    )
  }

  return null
}
