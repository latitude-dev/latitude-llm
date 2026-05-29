import { Button, FormWrapper, Input, Label, Modal, Slider, Switch, Text, useToast, useValueWithDefault } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import {
  deleteProjectMutation,
  updateProjectMutation,
  useProjectsCollection,
} from "../../../../../domains/projects/projects.collection.ts"
import type { ProjectRecord } from "../../../../../domains/projects/projects.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../lib/form-server-action.ts"
import { useRouteProject } from "../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/general")({
  component: ProjectGeneralSettingsPage,
})

function ProjectGeneralSettingsPage() {
  const { toast } = useToast()
  const routeProject = useRouteProject()

  const { data: liveProject } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.id, routeProject.id)).findOne(),
    [routeProject.id],
  )
  const currentProject = liveProject ?? routeProject

  const form = useForm({
    defaultValues: { name: currentProject.name },
    onSubmit: createFormSubmitHandler(
      async ({ name }) => {
        const trimmed = name.trim()
        const transaction = updateProjectMutation(currentProject.id, { name: trimmed })
        await transaction.isPersisted.promise
      },
      {
        resetOnSuccess: false,
        onSuccess: () => {
          toast({ description: "Project name updated" })
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <SettingsPage title="Project settings" description="Set up your project info">
      <form
        className="flex w-full flex-col gap-3 @[800px]:w-1/2"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Input
              key={currentProject.id}
              type="text"
              name={field.name}
              label="Name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
              placeholder="Project name"
              aria-label="Project name"
            />
          )}
        </form.Field>
        <div className="self-start">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" isLoading={isSubmitting}>
                Save
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
      <TraceSamplingSection projectId={currentProject.id} settings={currentProject.settings} />
      <DeleteProjectSection projectId={currentProject.id} projectName={currentProject.name} />
    </SettingsPage>
  )
}

function TraceSamplingSection({ projectId, settings }: { projectId: string; settings: ProjectRecord["settings"] }) {
  const { toast } = useToast()
  const sampling = settings.sampling
  const enabled = sampling?.enabled ?? false
  const rate = sampling?.rate ?? 1
  const [isSavingEnabled, setIsSavingEnabled] = useState(false)
  const [draftPercent, setDraftPercent] = useValueWithDefault(Math.round(rate * 100))

  const persist = async (next: { enabled?: boolean; rate?: number }) => {
    const transaction = updateProjectMutation(projectId, {
      settings: {
        ...settings,
        sampling: {
          ...(sampling ?? {}),
          ...next,
        },
      },
    })
    await transaction.isPersisted.promise
  }

  const handleToggle = async (checked: boolean) => {
    if (isSavingEnabled) return
    setIsSavingEnabled(true)
    try {
      await persist({ enabled: checked })
      toast({ description: checked ? "Trace sampling enabled" : "Trace sampling disabled" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSavingEnabled(false)
    }
  }

  const handleRateCommit = async (percent: number) => {
    try {
      await persist({ rate: percent / 100 })
      toast({ description: "Sampling rate updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 @[800px]:w-1/2">
      <div className="flex w-full flex-row items-start justify-between gap-4 rounded-lg bg-muted/30 p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="trace-sampling-enabled">Trace sampling</Label>
          <Text.H6 color="foregroundMuted">
            Store only a fraction of incoming traces. Sampling decisions are deterministic on session ID, so all spans
            sharing a session are kept or dropped together. You're only billed for stored traces.
          </Text.H6>
        </div>
        <Switch
          id="trace-sampling-enabled"
          checked={enabled}
          loading={isSavingEnabled}
          onCheckedChange={(checked) => void handleToggle(checked)}
        />
      </div>
      {enabled ? (
        <div className="flex w-full flex-col gap-3 rounded-lg bg-muted/30 p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="trace-sampling-rate">Sampling rate</Label>
            <Text.H6 color="foregroundMuted">
              Percentage of traces to store. 100% stores everything; 10% stores roughly 1 in 10.
            </Text.H6>
          </div>
          <div className="flex w-full flex-row items-center gap-4">
            <Slider
              id="trace-sampling-rate"
              min={1}
              max={100}
              step={1}
              value={[draftPercent]}
              onValueChange={(values) => {
                const next = values[0] ?? draftPercent
                setDraftPercent(next)
              }}
              onValueCommit={(values) => {
                const next = values[0] ?? draftPercent
                void handleRateCommit(next)
              }}
              aria-label="Sampling rate"
            />
            <Text.H5 weight="medium" className="w-12 text-right">
              {draftPercent}%
            </Text.H5>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DeleteProjectSection({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <Text.H4 weight="bold" color="destructive">
        Delete Project
      </Text.H4>
      <Text.H5 color="destructive">
        Permanently delete this project and all of its data. This action cannot be undone.
      </Text.H5>
      <div>
        <DeleteProjectConfirmModal open={open} setOpen={setOpen} projectId={projectId} projectName={projectName} />
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete Project
        </Button>
      </div>
    </div>
  )
}

function DeleteProjectConfirmModal({
  open,
  setOpen,
  projectId,
  projectName,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  projectId: string
  projectName: string
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [confirmText, setConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  const expectedText = "delete my project"
  const isConfirmed = confirmText.toLowerCase() === expectedText

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteProjectMutation(projectId).isPersisted.promise
      toast({ description: `Project "${projectName}" has been deleted.` })
      // The parent `_authenticated` loader runs with `staleTime: Infinity`,
      // so a plain `navigate({ to: "/" })` reuses its cached projects list
      // and skips the "no projects → onboarding" branch. Invalidate first so
      // the loader re-runs against the post-delete state, then navigate; the
      // index loader (or the parent's onboarding redirect) takes it from
      // there.
      await router.invalidate()
      await router.navigate({ to: "/" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      setIsDeleting(false)
    }
  }

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={(v) => {
        if (!v) setConfirmText("")
        setOpen(v)
      }}
      title="Delete Project"
      description={`This action is permanent and cannot be undone. The project "${projectName}" and all of its data will be deleted.`}
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!isConfirmed || isDeleting} onClick={() => void handleDelete()}>
            {isDeleting ? "Deleting..." : "Delete Project"}
          </Button>
        </>
      }
    >
      <FormWrapper>
        <Input
          type="text"
          label={`Type "${expectedText}" to confirm`}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={expectedText}
        />
      </FormWrapper>
    </Modal>
  )
}
