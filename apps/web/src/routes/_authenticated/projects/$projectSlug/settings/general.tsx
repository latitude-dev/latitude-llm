import { toSlug } from "@domain/shared"
import {
  Button,
  DotIndicator,
  FormWrapper,
  Input,
  Label,
  Modal,
  Slider,
  Switch,
  Text,
  useMountEffect,
  useToast,
} from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, useBlocker, useRouter } from "@tanstack/react-router"
import { useRef, useState } from "react"
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

interface Draft {
  readonly name: string
  readonly samplingEnabled: boolean
  readonly samplingRate: number
}

function ProjectGeneralSettingsPage() {
  const { toast } = useToast()
  const routeProject = useRouteProject()

  const { data: liveProject } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.id, routeProject.id)).findOne(),
    [routeProject.id],
  )
  const currentProject = liveProject ?? routeProject

  const baseline: Draft = {
    name: currentProject.name,
    samplingEnabled: currentProject.settings.sampling?.enabled ?? false,
    samplingRate: Math.round((currentProject.settings.sampling?.rate ?? 1) * 100),
  }

  const [pending, setPending] = useState<Partial<Draft>>({})
  const [isApplying, setIsApplying] = useState(false)

  const view: Draft = { ...baseline, ...pending }

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setPending((prev) => {
      if (value === baseline[key]) {
        const { [key]: _drop, ...rest } = prev
        return rest
      }
      return { ...prev, [key]: value }
    })
  }

  const dirtyFields = (Object.keys(pending) as (keyof Draft)[]).filter((k) => pending[k] !== baseline[k])
  const dirtyCount = dirtyFields.length
  const hasDirty = dirtyCount > 0
  const nameIsDirty = dirtyFields.includes("name")
  const samplingIsDirty = dirtyFields.includes("samplingEnabled") || dirtyFields.includes("samplingRate")

  const nameError = view.name.trim() === "" ? ["Name is required"] : undefined
  const canApply = hasDirty && !nameError && !isApplying

  const discard = () => setPending({})

  const apply = async () => {
    if (!hasDirty || nameError || isApplying) return
    setIsApplying(true)
    try {
      const patch: Partial<ProjectRecord> = {}
      if (nameIsDirty) patch.name = view.name.trim()
      if (samplingIsDirty) {
        patch.settings = {
          ...currentProject.settings,
          sampling: {
            enabled: view.samplingEnabled,
            rate: view.samplingRate / 100,
          },
        }
      }
      const transaction = updateProjectMutation(currentProject.id, patch)
      await transaction.isPersisted.promise
      setPending({})
      toast({ description: "Project settings updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsApplying(false)
    }
  }

  // Latest-value refs so the mount-only keydown listener never needs to re-subscribe.
  const applyRef = useRef(apply)
  applyRef.current = apply
  const isApplyingRef = useRef(isApplying)
  isApplyingRef.current = isApplying
  const hasDirtyRef = useRef(hasDirty)
  hasDirtyRef.current = hasDirty

  useMountEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!hasDirtyRef.current) return
      const target = event.target as HTMLElement | null
      const inField =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable === true)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void applyRef.current()
      } else if (event.key === "Escape" && !inField && !isApplyingRef.current) {
        event.preventDefault()
        setPending({})
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  })

  useBlocker({
    shouldBlockFn: () => {
      if (!hasDirty) return false
      return !window.confirm("You have unsaved changes. Leave anyway?")
    },
    enableBeforeUnload: () => hasDirty,
    disabled: !hasDirty,
  })

  const dirtyActions = hasDirty ? (
    <div className="flex flex-row items-center gap-3">
      <Text.H5 color="foregroundMuted">
        {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
      </Text.H5>
      <Button variant="outline" onClick={discard} disabled={isApplying}>
        Discard
      </Button>
      <Button onClick={() => void apply()} isLoading={isApplying} disabled={!canApply}>
        Apply
      </Button>
    </div>
  ) : null

  return (
    <SettingsPage
      title="Project settings"
      description="Set up your project info"
      actions={dirtyActions}
      headerSticky={hasDirty}
    >
      <div className="flex w-full flex-col gap-3 @[800px]:w-1/2">
        <Input
          type="text"
          label={
            <span className="flex flex-row items-center gap-2">
              Name
              {nameIsDirty ? <DotIndicator variant="primary" aria-label="Unsaved changes" /> : null}
            </span>
          }
          value={view.name}
          onChange={(e) => setField("name", e.target.value)}
          errors={nameError}
          placeholder="Project name"
          aria-label="Project name"
        />
      </div>
      <TraceSamplingSection
        enabled={view.samplingEnabled}
        rate={view.samplingRate}
        isDirty={samplingIsDirty}
        onEnabledChange={(checked) => setField("samplingEnabled", checked)}
        onRateChange={(percent) => setField("samplingRate", percent)}
      />
      <DangerZoneSection
        projectId={currentProject.id}
        projectName={currentProject.name}
        currentSlug={currentProject.slug}
      />
    </SettingsPage>
  )
}

function TraceSamplingSection({
  enabled,
  rate,
  isDirty,
  onEnabledChange,
  onRateChange,
}: {
  enabled: boolean
  rate: number
  isDirty: boolean
  onEnabledChange: (checked: boolean) => void
  onRateChange: (percent: number) => void
}) {
  return (
    <div className="flex w-full flex-col @[800px]:w-1/2">
      <div className="flex w-full flex-col rounded-lg bg-muted/30">
        <div className="flex w-full flex-row items-start justify-between gap-4 p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="trace-sampling-enabled" className="flex flex-row items-center gap-2">
              Trace sampling
              {isDirty ? <DotIndicator variant="primary" aria-label="Unsaved changes" /> : null}
            </Label>
            <Text.H6 color="foregroundMuted">
              Process and store only a portion of the traces you send, instead of all of them. Useful for reducing
              costs. Only recommended if you have really high traffic, where a smaller sample is still enough to spot
              issues.
            </Text.H6>
          </div>
          <Switch id="trace-sampling-enabled" checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
        {enabled ? (
          <div className="flex w-full flex-col gap-2 border-border border-t p-4">
            <div className="flex w-full flex-row items-center justify-between gap-4">
              <Label htmlFor="trace-sampling-rate" className="shrink-0">
                Sampling rate
              </Label>
              <div className="flex flex-row items-center gap-4">
                <Slider
                  id="trace-sampling-rate"
                  className="w-40"
                  min={0}
                  max={100}
                  step={1}
                  value={[rate]}
                  onValueChange={(values) => onRateChange(values[0] ?? rate)}
                  aria-label="Sampling rate"
                />
                <Text.H5 weight="medium" className="w-12 text-right">
                  {rate}%
                </Text.H5>
              </div>
            </div>
            {rate === 0 ? (
              <Text.H6 color="destructive">
                At 0% no traces will be processed or stored. Nothing from this project will be ingested.
              </Text.H6>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DangerZoneSection({
  projectId,
  projectName,
  currentSlug,
}: {
  projectId: string
  projectName: string
  currentSlug: string
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  return (
    <div className="flex flex-col gap-6 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <Text.H4 weight="bold" color="destructive">
        Danger zone
      </Text.H4>

      <ChangeSlugForm projectId={projectId} currentSlug={currentSlug} />

      <div className="h-px bg-destructive/30" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Text.H5 weight="semibold">Delete project</Text.H5>
          <Text.H6 color="foregroundMuted">
            Permanently delete this project and all of its data. This action cannot be undone.
          </Text.H6>
        </div>
        <div className="self-start">
          <DeleteProjectConfirmModal
            open={deleteOpen}
            setOpen={setDeleteOpen}
            projectId={projectId}
            projectName={projectName}
          />
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete project
          </Button>
        </div>
      </div>
    </div>
  )
}

function ChangeSlugForm({ projectId, currentSlug }: { projectId: string; currentSlug: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")

  const isConfirmed = confirmText.trim().toLowerCase() === currentSlug

  const form = useForm({
    defaultValues: { slug: currentSlug },
    onSubmit: createFormSubmitHandler(
      async ({ slug }: { slug: string }) => {
        const normalized = toSlug(slug)
        await updateProjectMutation(projectId, { slug: normalized }).isPersisted.promise
        return normalized
      },
      {
        resetOnSuccess: false,
        onSuccess: async (normalized) => {
          setOpen(false)
          setConfirmText("")
          toast({ description: `Project slug changed to "${normalized}".` })
          window.history.pushState(null, "", `/projects/${normalized}/settings/general`)
          await router.invalidate()
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  const closeAndReset = () => {
    setOpen(false)
    setConfirmText("")
    form.reset()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Text.H5 weight="semibold">Project slug</Text.H5>
        <Text.H6 color="foregroundMuted">
          The slug is part of your telemetry destination. Changing it breaks ingestion until you point your
          instrumentation at the new slug.
        </Text.H6>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
        className="flex w-full flex-col gap-3 @[800px]:max-w-md"
      >
        <form.Field name="slug">
          {(field) => (
            <Input
              type="text"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
              placeholder={currentSlug}
              aria-label="Project slug"
            />
          )}
        </form.Field>
        <form.Subscribe selector={(s) => [s.values.slug, s.isSubmitting] as const}>
          {([slugValue, isSubmitting]) => {
            const normalized = toSlug(slugValue)
            const canOpen = normalized.length > 0 && normalized !== currentSlug
            return (
              <div className="self-start">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!canOpen || isSubmitting}
                  onClick={() => setOpen(true)}
                >
                  Change slug
                </Button>
              </div>
            )
          }}
        </form.Subscribe>
      </form>

      <Modal
        dismissible
        open={open}
        onOpenChange={(v) => {
          if (!v) closeAndReset()
          else setOpen(v)
        }}
        title="⚠️ Change project slug"
        description={`Changing the slug from "${currentSlug}" breaks ingestion until your app points at the new slug. Existing traces stay under the project; only newly ingested traces are affected.`}
        footer={
          <form.Subscribe selector={(s) => [s.values.slug, s.isSubmitting] as const}>
            {([slugValue, isSubmitting]) => {
              const normalized = toSlug(slugValue)
              const canApply = !isSubmitting && normalized.length > 0 && normalized !== currentSlug && isConfirmed
              return (
                <>
                  <Button type="button" variant="outline" onClick={closeAndReset} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="change-slug-form"
                    variant="destructive"
                    disabled={!canApply}
                    isLoading={isSubmitting}
                  >
                    Change slug
                  </Button>
                </>
              )
            }}
          </form.Subscribe>
        }
      >
        <form
          id="change-slug-form"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FormWrapper>
            <form.Field name="slug">
              {(field) => (
                <Input
                  type="text"
                  label="New slug"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  errors={fieldErrorsAsStrings(field.state.meta.errors)}
                  placeholder={currentSlug}
                  aria-label="New project slug"
                />
              )}
            </form.Field>
            <Input
              type="text"
              label={`Type the current slug "${currentSlug}" to confirm`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={currentSlug}
              aria-label="Confirm current slug"
            />
          </FormWrapper>
        </form>
      </Modal>
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
