import {
  Button,
  CloseTrigger,
  cn,
  Icon,
  Modal,
  Slider,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Tooltip,
  useToast,
} from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { Pencil } from "lucide-react"
import { useRef, useState } from "react"
import { updateFlaggerMutation, useProjectFlaggers } from "../../../../../domains/flaggers/flaggers.collection.ts"
import type { FlaggerRecord } from "../../../../../domains/flaggers/flaggers.functions.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { useRouteProject } from "../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/flaggers")({
  component: ProjectFlaggersSettingsPage,
})

function ProjectFlaggersSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { toast } = useToast()
  const routeProject = useRouteProject()
  const [editingFlagger, setEditingFlagger] = useState<FlaggerRecord | null>(null)

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const currentProject = project ?? routeProject
  const { data: flaggers = [], isLoading: isLoadingFlaggers } = useProjectFlaggers(currentProject.id)

  // Flagger annotations deep-link here with `?flagger=<slug>` to point at the
  // flagger that authored them; scroll it into view once and keep it highlighted.
  const [targetFlaggerSlug] = useParamState("flagger", "")
  const hasScrolledToTargetRef = useRef(false)
  const scrollTargetRef = (node: HTMLTableRowElement | null) => {
    if (node && !hasScrolledToTargetRef.current) {
      hasScrolledToTargetRef.current = true
      node.scrollIntoView({ block: "center", behavior: "smooth" })
    }
  }

  const handleFlaggerEnabledChange = async (flagger: FlaggerRecord, enabled: boolean) => {
    try {
      const transaction = updateFlaggerMutation({
        projectId: currentProject.id,
        id: flagger.id,
        slug: flagger.slug,
        enabled,
      })
      await transaction.isPersisted.promise
      toast({ description: "Flagger settings updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  const handleFlaggerSamplingUpdate = async (flagger: FlaggerRecord, sampling: number) => {
    try {
      const transaction = updateFlaggerMutation({
        projectId: currentProject.id,
        id: flagger.id,
        slug: flagger.slug,
        sampling,
      })
      await transaction.isPersisted.promise
      toast({ description: "Flagger settings updated" })
      setEditingFlagger(null)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <SettingsPage
      title="Flaggers"
      description="Flaggers automatically inspect new traces for known failure patterns and create issues when they detect regressions"
    >
      <div className="flex w-full flex-col gap-1">
        {isLoadingFlaggers ? null : flaggers.length === 0 ? (
          <Text.H5 color="foregroundMuted">No flaggers have been provisioned for this project yet</Text.H5>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flagger</TableHead>
                <TableHead className="w-10">Enabled</TableHead>
                <TableHead>Sampling</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flaggers.map((flagger) => {
                const isTarget = targetFlaggerSlug !== "" && flagger.slug === targetFlaggerSlug
                return (
                  <TableRow
                    key={flagger.id}
                    ref={isTarget ? scrollTargetRef : undefined}
                    verticalPadding
                    hoverable={false}
                    className={cn({ "ring-2 ring-primary ring-offset-2 ring-offset-background": isTarget })}
                  >
                    <TableCell className="max-w-[28rem]">
                      <div className="flex flex-col gap-1">
                        <Text.H5M>{flagger.name}</Text.H5M>
                        <Text.H6 color="foregroundMuted">{flagger.description}</Text.H6>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={flagger.enabled}
                        onCheckedChange={(checked) => void handleFlaggerEnabledChange(flagger, checked)}
                        aria-label={`${flagger.enabled ? "Disable" : "Enable"} ${flagger.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-row items-center gap-1">
                        <Text.H5>{flagger.sampling}%</Text.H5>
                        <Tooltip
                          asChild
                          trigger={
                            <Button variant="ghost" size="icon" onClick={() => setEditingFlagger(flagger)}>
                              <Icon icon={Pencil} size="sm" />
                            </Button>
                          }
                        >
                          Edit sampling rate
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {editingFlagger ? (
        <EditFlaggerModal
          flagger={editingFlagger}
          onClose={() => setEditingFlagger(null)}
          onSave={handleFlaggerSamplingUpdate}
        />
      ) : null}
    </SettingsPage>
  )
}

function EditFlaggerModal({
  flagger,
  onClose,
  onSave,
}: {
  readonly flagger: FlaggerRecord
  readonly onClose: () => void
  readonly onSave: (flagger: FlaggerRecord, sampling: number) => Promise<void>
}) {
  const [sampling, setSampling] = useState(flagger.sampling)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave(flagger, sampling)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      dismissible
      scrollable={false}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={`Edit ${flagger.name} sampling`}
      description="Configure what percentage of eligible traces this flagger samples."
      footer={
        <>
          <CloseTrigger />
          <Button onClick={() => void handleSave()} isLoading={isSaving}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6 pb-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-row items-baseline justify-between gap-4">
            <Text.H6 color="foregroundMuted">Sampling rate</Text.H6>
            <Text.H4M color="foreground">{sampling}%</Text.H4M>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[sampling]}
            onValueChange={(values) => setSampling(values[0] ?? 0)}
          />
          <Text.H6 color="foregroundMuted">
            {sampling === 0
              ? "0% pauses sampling for this flagger."
              : `Runs on ${sampling}% of eligible incoming traces.`}
          </Text.H6>
        </div>
      </div>
    </Modal>
  )
}
