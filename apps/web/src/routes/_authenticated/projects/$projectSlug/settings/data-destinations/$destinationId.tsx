import { Button, Icon, Text, Tooltip } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { listDestinations } from "../../../../../../domains/destinations/destinations.functions.ts"
import { useRouteProject } from "../../-route-data.ts"
import { DestinationCard } from "../-components/destination-card.tsx"
import { DestinationRunsTable } from "../-components/destination-runs-table.tsx"
import { destinationsQueryKey } from "../-components/destinations-section.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/data-destinations/$destinationId")(
  {
    staticData: { fillHeight: true },
    component: DestinationDetailPage,
  },
)

function BackLink({ projectSlug }: { readonly projectSlug: string }) {
  return (
    <Tooltip
      asChild
      side="bottom"
      trigger={
        <Button asChild variant="ghost" size="sm" className="w-fit" aria-label="Back to data destinations">
          <Link to="/projects/$projectSlug/settings/data-destinations" params={{ projectSlug }}>
            <Icon icon={ArrowLeftIcon} size="sm" />
            Back
          </Link>
        </Button>
      }
    >
      Back to data destinations
    </Tooltip>
  )
}

function DestinationDetailPage() {
  const { projectSlug, destinationId } = Route.useParams()
  const project = useRouteProject()

  const { data: destinations, isLoading } = useQuery({
    queryKey: destinationsQueryKey(project.id),
    queryFn: () => listDestinations({ data: { projectId: project.id } }),
  })

  const destination = destinations?.find((candidate) => candidate.id === destinationId)

  if (!isLoading && !destination) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink projectSlug={projectSlug} />
        <Text.H6 color="foregroundMuted">This destination no longer exists.</Text.H6>
      </div>
    )
  }

  if (!destination) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink projectSlug={projectSlug} />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 min-h-0">
      <BackLink projectSlug={projectSlug} />
      <DestinationCard
        projectId={project.id}
        projectSlug={projectSlug}
        destination={destination}
        linkToDetail={false}
      />
      <DestinationRunsTable destinationId={destination.id} />
    </div>
  )
}
