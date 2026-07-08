import { Badge, Card, CardContent, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ArrowLeftRight, RefreshCw, Repeat } from "lucide-react"
import { type ReactNode, useCallback } from "react"
import {
  type AdminShowcaseStateDto,
  adminCreateShowcase,
  adminGetShowcase,
  adminReclaimShowcase,
  adminRegenerateShowcase,
  adminSwapShowcase,
} from "../../../domains/admin/showcase.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { ActionRow, ActionsSection } from "../-components/actions-section/section.tsx"
import { ShowcaseActionButton } from "./-components/showcase-action-button.tsx"

const SHOWCASE_QUERY_KEY = ["backoffice", "showcase"] as const

export const Route = createFileRoute("/backoffice/showcase/")({
  component: BackofficeShowcasePage,
})

function BackofficeShowcasePage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: SHOWCASE_QUERY_KEY,
    queryFn: () => adminGetShowcase(),
  })

  // The page is React-Query-driven (no route loader), so mutations refresh the
  // card by invalidating this query — not `router.invalidate()`.
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: SHOWCASE_QUERY_KEY }), [queryClient])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-4 border-b border-border px-6 py-4">
        <div className="flex flex-1 flex-col gap-1">
          <Text.H4 weight="semibold">Showcase</Text.H4>
          <Text.H6 color="foregroundMuted">
            The single shared, read-only demo project. Create it once, then regenerate / swap the blue-green build.
          </Text.H6>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {isLoading ? (
            <Text.H6 color="foregroundMuted">Loading showcase…</Text.H6>
          ) : isError ? (
            // A thrown query is a real failure (DB / connectivity). "No showcase"
            // is the resolver returning null, NOT an error — keep them distinct so
            // a transient failure doesn't lure staff into re-creating the showcase.
            <Card>
              <CardContent className="flex flex-col gap-1 p-6">
                <Text.H5 weight="semibold">Could not load showcase</Text.H5>
                <Text.H6 color="foregroundMuted">{toUserMessage(error)}</Text.H6>
              </CardContent>
            </Card>
          ) : data ? (
            <ExistingShowcase showcase={data} onSuccess={refresh} />
          ) : (
            <NoShowcase onSuccess={refresh} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── No showcase yet ─────────────────────────────────────────────────────────

function NoShowcase({ onSuccess }: { readonly onSuccess: () => void | Promise<void> }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 p-6">
        <div className="flex flex-col gap-1">
          <Text.H5 weight="semibold">No showcase exists</Text.H5>
          <Text.H6 color="foregroundMuted">
            Create the showcase to bootstrap its dedicated organization and the singleton pointer row. No project is
            built yet — trigger the first regeneration afterwards.
          </Text.H6>
        </div>
        <ShowcaseActionButton
          label="Create showcase"
          variant="default"
          description="Bootstrap the shared demo showcase."
          confirmBody="Creates the dedicated 'Showcase' organization and inserts the singleton pointer row (no project yet). Fails loudly if a showcase already exists — there is exactly one, ever."
          errorTitle="Could not create showcase"
          onSuccess={onSuccess}
          run={async () => {
            const created = await adminCreateShowcase()
            return `Showcase created on org ${created.organizationId}. Regenerate to build the first project.`
          }}
        />
      </CardContent>
    </Card>
  )
}

// ─── Existing showcase ───────────────────────────────────────────────────────

function nextStateBadge(nextState: AdminShowcaseStateDto["nextState"]) {
  if (nextState === null) return <Badge variant="outlineMuted">idle</Badge>
  if (nextState === "ready") return <Badge variant="success">ready</Badge>
  return <Badge variant="warningMuted">building</Badge>
}

function PointerField({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H5 weight="medium">{value}</Text.H5>
    </div>
  )
}

function ExistingShowcase({
  showcase,
  onSuccess,
}: {
  readonly showcase: AdminShowcaseStateDto
  readonly onSuccess: () => void | Promise<void>
}) {
  const canSwap = showcase.nextState === "ready"

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2">
            <Text.H5 weight="semibold">Pointer state</Text.H5>
            {nextStateBadge(showcase.nextState)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <PointerField
              label="Organization"
              value={<span className="font-mono text-xs">{showcase.organizationId}</span>}
            />
            <PointerField
              label="Current project"
              value={
                showcase.currentProjectId ? (
                  <span className="font-mono text-xs">{showcase.currentProjectId}</span>
                ) : (
                  <span className="text-muted-foreground">— none built yet</span>
                )
              }
            />
            <PointerField
              label="Next project"
              value={
                showcase.nextProjectId ? (
                  <span className="font-mono text-xs">{showcase.nextProjectId}</span>
                ) : (
                  <span className="text-muted-foreground">— no build in flight</span>
                )
              }
            />
            <PointerField label="Last updated" value={relativeTime(new Date(showcase.updatedAt))} />
          </div>
        </CardContent>
      </Card>

      <ActionsSection
        title="Showcase actions"
        description="Manual triggers for the blue-green regeneration the daily cron also drives."
      >
        <ActionRow
          icon={RefreshCw}
          title="Regenerate"
          description="Build a fresh next project, gate it, and auto-swap on ready — the same job the daily cron fires."
          action={
            <ShowcaseActionButton
              label="Regenerate"
              description="Start a fresh blue-green regeneration."
              confirmBody="Publishes the showcase regeneration job: provisions a fresh 'next' project, seeds it, gates it, and auto-swaps the pointer once ready. Resumes an in-flight build instead of starting a duplicate."
              errorTitle="Could not start regeneration"
              onSuccess={onSuccess}
              run={async () => {
                await adminRegenerateShowcase()
                return "Regeneration queued."
              }}
            />
          }
        />
        <ActionRow
          icon={ArrowLeftRight}
          title="Swap now"
          description={
            canSwap
              ? "Promote the ready 'next' build to current now, without waiting for the scheduled swap."
              : "Enabled once a build reaches the 'ready' state."
          }
          action={
            <ShowcaseActionButton
              label="Swap now"
              disabled={!canSwap}
              description="Promote the ready build to current."
              confirmBody="Runs the transactional pointer flip (current ← next) and invalidates the resolver cache. Only succeeds when the next build is ready — a not-ready swap fails cleanly."
              errorTitle="Could not swap"
              onSuccess={onSuccess}
              run={async () => {
                const swapped = await adminSwapShowcase()
                return `Swapped. Current project is now ${swapped.currentProjectId ?? "unknown"}.`
              }}
            />
          }
        />
        <ActionRow
          icon={Repeat}
          title="Reclaim stale build"
          description="Self-heal a build wedged in 'building' from a crashed run, then use Regenerate to build afresh."
          action={
            <ShowcaseActionButton
              label="Reclaim"
              description="Self-heal a wedged build."
              confirmBody="Publishes the cleanup job: reclaims a 'building' pointer whose regeneration run has died (resetting it to idle) and retires orphaned showcase projects. Once it lands the pointer is idle — click Regenerate to build a fresh project. Idempotent; a healthy in-flight build is left untouched."
              errorTitle="Could not reclaim"
              onSuccess={onSuccess}
              run={async () => {
                await adminReclaimShowcase()
                return "Cleanup queued."
              }}
            />
          }
        />
      </ActionsSection>
    </>
  )
}
