import { Button, Icon } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { ExternalLinkIcon, Plus, Share2Icon } from "lucide-react"
import { useState } from "react"
import { BlankSlate } from "../../../../../../components/blank-slate.tsx"
import { listDestinations } from "../../../../../../domains/destinations/destinations.functions.ts"
import { DestinationCard } from "./destination-card.tsx"
import { DestinationFormModal } from "./destination-form-modal.tsx"

export const destinationsQueryKey = (projectId: string) => ["destinations", projectId] as const

/**
 * Project settings → data destinations: outbound sync of project telemetry into
 * customer-owned systems. Lists configured destinations as cards (each owns its
 * own edit/delete/pause lifecycle) and drives the create flow. Gated by the
 * `destinations` feature flag at the call site.
 */
export function DestinationsSection({
  projectId,
  projectSlug,
}: {
  readonly projectId: string
  readonly projectSlug: string
}) {
  const [creating, setCreating] = useState(false)

  const { data: destinations = [], isLoading } = useQuery({
    queryKey: destinationsQueryKey(projectId),
    queryFn: () => listDestinations({ data: { projectId } }),
  })

  return (
    <div className="flex flex-1 flex-col gap-4">
      {isLoading ? null : destinations.length === 0 ? (
        <BlankSlate
          icon={Share2Icon}
          title="No destinations yet"
          description="Connect a destination to stream new spans, traces, and sessions into a customer-owned system."
          actions={[
            { label: "Add destination", icon: Plus, onClick: () => setCreating(true) },
            {
              label: "Read the docs",
              icon: ExternalLinkIcon,
              href: "https://docs.latitude.so/more/data-destinations/overview",
            },
          ]}
        />
      ) : (
        <>
          <div className="flex flex-row justify-end">
            <Button onClick={() => setCreating(true)}>
              <Icon icon={Plus} size="sm" />
              Add destination
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {destinations.map((destination) => (
              <DestinationCard
                key={destination.id}
                projectId={projectId}
                projectSlug={projectSlug}
                destination={destination}
              />
            ))}
          </div>
        </>
      )}

      {creating ? <DestinationFormModal projectId={projectId} onClose={() => setCreating(false)} /> : null}
    </div>
  )
}
