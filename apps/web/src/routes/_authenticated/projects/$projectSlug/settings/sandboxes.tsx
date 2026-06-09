import { PLAN_CONFIGS, type PlanSlug } from "@domain/billing"
import {
  Badge,
  Button,
  Icon,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  useToast,
} from "@repo/ui"
import { createFileRoute, getRouteApi } from "@tanstack/react-router"
import { Archive, Boxes, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useState } from "react"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import {
  useSandboxesForParentOrg,
  useSandboxLifecycleMutations,
} from "../../../../../domains/sandbox/sandbox.collection.ts"
import type { SandboxListItemDto } from "../../../../../domains/sandbox/sandbox-list.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { CreateSandboxModal } from "../../../-components/create-sandbox-modal.tsx"
import { SettingsPage } from "./-components/settings-page.tsx"

const authenticatedRoute = getRouteApi("/_authenticated")

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/sandboxes")({
  component: SandboxesSettingsPage,
})

function resolveCap(planSlug: string | null): number {
  if (planSlug && planSlug in PLAN_CONFIGS) return PLAN_CONFIGS[planSlug as PlanSlug].sandboxActiveCap
  return PLAN_CONFIGS.free.sandboxActiveCap
}

function SandboxesSettingsPage() {
  const sandboxEnabled = useHasFeatureFlag("sandbox")
  const { data: sandboxes, isLoading } = useSandboxesForParentOrg({ enabled: sandboxEnabled })
  const planSlug = authenticatedRoute.useLoaderData({ select: (d) => d.organizationPlan })
  const cap = resolveCap(planSlug)
  const [createOpen, setCreateOpen] = useState(false)

  const list = sandboxes ?? []
  const activeCount = list.filter((s) => s.status === "active").length

  // Gate the page itself (not just the settings nav item) so a direct URL or
  // stale link respects the `sandbox` flag, mirroring the integrations page.
  if (!sandboxEnabled) {
    return (
      <SettingsPage title="Sandboxes" description="Isolated spaces for your development traces.">
        <Text.H6 color="foregroundMuted">Sandboxes aren't enabled for this organization.</Text.H6>
      </SettingsPage>
    )
  }

  return (
    <SettingsPage
      title="Sandboxes"
      description="Isolated spaces for your development traces — separate data, no billing, no alerts."
      actions={
        <Button onClick={() => setCreateOpen(true)}>
          <Icon icon={Plus} size="sm" />
          New sandbox
        </Button>
      }
    >
      <Text.H6 color="foregroundMuted">
        You're using {activeCount} of {cap} active sandboxes on your current subscription. Archived sandboxes don't
        count toward the limit — upgrade your plan to run more at once.
      </Text.H6>

      {isLoading ? (
        <Text.H6 color="foregroundMuted">Loading sandboxes…</Text.H6>
      ) : list.length === 0 ? (
        <Text.H6 color="foregroundMuted">No sandboxes yet. Create one to start sending development traces.</Text.H6>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((sandbox) => (
              <SandboxRow key={sandbox.organizationId} sandbox={sandbox} />
            ))}
          </TableBody>
        </Table>
      )}

      <CreateSandboxModal open={createOpen} onOpenChange={setCreateOpen} />
    </SettingsPage>
  )
}

function SandboxRow({ sandbox }: { sandbox: SandboxListItemDto }) {
  const { toast } = useToast()
  const { archive, reactivate, remove } = useSandboxLifecycleMutations()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isActive = sandbox.status === "active"
  const busy = archive.isPending || reactivate.isPending || remove.isPending

  const run = async (action: () => Promise<unknown>, errorTitle: string) => {
    try {
      await action()
    } catch (error) {
      toast({ variant: "destructive", title: errorTitle, description: toUserMessage(error) })
    }
  }

  return (
    <TableRow verticalPadding hoverable={false}>
      <TableCell>
        <div className="flex items-center gap-2">
          <Icon icon={Boxes} size="sm" color="foregroundMuted" />
          <Text.H5M ellipsis>{sandbox.name}</Text.H5M>
          {isActive ? null : <Badge variant="muted">Archived</Badge>}
        </div>
      </TableCell>
      <TableCell>
        <Text.H6 color="foregroundMuted">{sandbox.slug}</Text.H6>
      </TableCell>
      <TableCell align="right">
        <div className="flex items-center justify-end gap-2">
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => archive.mutateAsync(sandbox.organizationId), "Could not archive sandbox")}
            >
              <Icon icon={Archive} size="sm" />
              Archive
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(() => reactivate.mutateAsync(sandbox.organizationId), "Could not reactivate sandbox")
              }
            >
              <Icon icon={RotateCcw} size="sm" />
              Reactivate
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete sandbox"
          >
            <Icon icon={Trash2} size="sm" color="destructive" />
          </Button>
        </div>

        <Modal
          dismissible
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete sandbox"
          description={`Permanently delete "${sandbox.name}" and all of its sandbox data. This cannot be undone.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() =>
                  void run(async () => {
                    await remove.mutateAsync(sandbox.organizationId)
                    setConfirmDelete(false)
                  }, "Could not delete sandbox")
                }
              >
                {remove.isPending ? "Deleting…" : "Delete sandbox"}
              </Button>
            </>
          }
        >
          <Text.H6 color="foregroundMuted">
            Deleting frees a slot permanently. To keep it for later without using a slot, archive it instead.
          </Text.H6>
        </Modal>
      </TableCell>
    </TableRow>
  )
}
