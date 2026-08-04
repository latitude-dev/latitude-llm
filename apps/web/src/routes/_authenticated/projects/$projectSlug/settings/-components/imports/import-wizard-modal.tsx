import {
  IMPORT_SOURCE_PAGE_SIZE,
  IMPORT_SOURCE_PROJECT_LIST_MAX,
  IMPORT_SOURCE_REGION_OPTIONS,
  IMPORT_SOURCES,
} from "@domain/imports"
import { Button, Icon, Input, Modal, Select, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react"
import { useRef, useState } from "react"
import {
  createImport,
  getImportLimits,
  type ImportLimitsRecord,
  type ImportRecord,
  listImportSourceProjects,
  previewImport,
  retryImport,
  testImportConnection,
} from "../../../../../../../domains/imports/imports.functions.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../../lib/form-server-action.ts"
import { importsQueryKey } from "./imports-page.tsx"

type WizardStep = "source" | "credentials" | "project" | "config" | "preview" | "confirm"

const NEW_IMPORT_STEPS: readonly WizardStep[] = ["source", "credentials", "project", "config", "preview", "confirm"]

/**
 * A retry reuses the original job's source, project and range, and resumes from the cursor
 * it stopped at, so the only thing left to collect is credentials — the failed job's were
 * scrubbed. Walking the user back through choices the backend then ignores would be a lie.
 */
const RETRY_STEPS: readonly WizardStep[] = ["credentials", "confirm"]

type ConnectionTest =
  | { readonly phase: "idle" }
  | { readonly phase: "testing" }
  | { readonly phase: "success" }
  | { readonly phase: "error"; readonly message: string }

type SourceProject = Awaited<ReturnType<typeof listImportSourceProjects>>["projects"][number]

type SourceProjectsState =
  | { readonly phase: "idle" }
  | { readonly phase: "loading" }
  | { readonly phase: "success"; readonly projects: readonly SourceProject[]; readonly truncated: boolean }
  | { readonly phase: "error"; readonly message: string }

const SOURCE_LABELS = {
  langfuse: "Langfuse",
  langsmith: "LangSmith",
  braintrust: "Braintrust",
} as const

/** Each source's own default, so switching source cannot carry a foreign region across. */
const DEFAULT_REGIONS = {
  langfuse: "eu",
  langsmith: "gcp-us",
  braintrust: "us",
} as const

type WizardValues = {
  readonly source: (typeof IMPORT_SOURCES)[number]
  readonly region: string
  readonly publicKey: string
  readonly secretKey: string
  readonly apiKey: string
  readonly workspaceId: string
}

/**
 * The region travels with the credentials because every adapter call needs it, and the
 * server turns it into an origin. The client never names a URL.
 */
const credentialsFor = (value: WizardValues) => {
  if (value.source === "langfuse") {
    return {
      kind: "langfuse" as const,
      region: value.region as (typeof IMPORT_SOURCE_REGION_OPTIONS.langfuse)[number]["id"],
      publicKey: value.publicKey,
      secretKey: value.secretKey,
    }
  }
  if (value.source === "langsmith") {
    return {
      kind: "langsmith" as const,
      region: value.region as (typeof IMPORT_SOURCE_REGION_OPTIONS.langsmith)[number]["id"],
      apiKey: value.apiKey,
      workspaceId: value.workspaceId || undefined,
    }
  }
  return {
    kind: "braintrust" as const,
    region: value.region as (typeof IMPORT_SOURCE_REGION_OPTIONS.braintrust)[number]["id"],
    apiKey: value.apiKey,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

const rangeForLookback = (lookbackDays: number) => {
  const to = new Date()
  const from = new Date(to.getTime() - lookbackDays * DAY_MS)
  return { from: from.toISOString(), to: to.toISOString() }
}

const numberFormatter = new Intl.NumberFormat("en-US")

/**
 * Enough of a trace id to tell two rows apart, which the leading characters are not always.
 *
 * LangSmith mints a run id by left-padding the OTEL span id into a UUID, so every id from an
 * OTLP-fed project starts with sixteen zeros and a head-truncated sample reads `00000000…` on every
 * row. The tail is random for all three sources, so it distinguishes wherever the head does.
 */
const shortTraceId = (traceId: string): string => (traceId.length <= 8 ? traceId : `…${traceId.slice(-8)}`)

/** `min={1}` only constrains typing, so the floor is reapplied to every value change. */
const clampMaxTraces = (raw: string, ceiling: number): number => {
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) return 1
  return Math.min(Math.max(parsed, 1), Math.max(ceiling, 1))
}

/**
 * What the org can ask for and what it will get. Both numbers are computed server-side
 * from the plan, so this panel is the ceiling the backend will actually enforce rather
 * than a restatement of the product-wide caps.
 */
function ImportExpectations({ limits }: { readonly limits: ImportLimitsRecord }) {
  const resets = new Date(limits.periodEnd).toLocaleDateString()

  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted p-3">
      <Text.H6M>What to expect</Text.H6M>
      <Text.H6M color="foregroundMuted">
        Imported traces run the same pipeline as live ones and are billed the same way, so this import draws on the same
        usage your live telemetry does.
      </Text.H6M>
      <Text.H6M color="foregroundMuted">
        Ask for as many traces as you like. If usage runs out before the import finishes it pauses where it got to, and
        you can resume it — usage resets on {resets}.
      </Text.H6M>
      <Text.H6M color="foregroundMuted">
        Traces are imported newest first, so if the import stops early you keep the most recent history.
      </Text.H6M>
      {limits.lookbackLimitedByRetention ? (
        <Text.H6M color="foregroundMuted">
          The range reaches back at most {limits.maxLookbackDays} days, matching this plan's span retention — older
          traces would be deleted after being billed.
        </Text.H6M>
      ) : null}
    </div>
  )
}

/** The original job's settings, shown read-only because a retry cannot change them. */
function RetrySummary({ job }: { readonly job: ImportRecord }) {
  const range = `${new Date(job.config.rangeFrom).toLocaleDateString()} – ${new Date(job.config.rangeTo).toLocaleDateString()}`

  return (
    <div className="flex flex-col gap-1">
      <Text.H6M color="foregroundMuted">
        Retrying the {SOURCE_LABELS[job.source]} import of {job.config.sourceProjectName} ({range}), up to{" "}
        {numberFormatter.format(job.config.maxTraces)} traces.
      </Text.H6M>
      <Text.H6M color="foregroundMuted">
        {job.stats.tracesImported > 0
          ? `It resumes where it stopped, keeping the ${numberFormatter.format(job.stats.tracesImported)} traces already imported.`
          : "It starts from the top of the range, since the original run imported nothing."}{" "}
        The configuration is reused as-is — start a new import to change it.
      </Text.H6M>
    </div>
  )
}

/**
 * The form's defaults come from the org's plan, so it only mounts once they are known —
 * seeding them afterwards would mean mirroring fetched data into form state.
 */
export function ImportWizardModal({
  projectId,
  retryJob,
  onClose,
}: {
  readonly projectId: string
  readonly retryJob?: ImportRecord
  readonly onClose: () => void
}) {
  const { data: limits, isPending, error } = useQuery({ queryKey: ["import-limits"], queryFn: () => getImportLimits() })

  if (limits) {
    return (
      <ImportWizardForm projectId={projectId} limits={limits} {...(retryJob ? { retryJob } : {})} onClose={onClose} />
    )
  }

  return (
    <Modal.Root open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content dismissible className="max-w-lg">
        <Modal.Header title="Import historical traces" />
        {isPending ? (
          <Text.H6M color="foregroundMuted" className="flex items-center gap-2">
            <Icon icon={Loader2} className="animate-spin" size="sm" />
            Checking what your plan allows…
          </Text.H6M>
        ) : (
          <Text.H6M color="destructive">{toUserMessage(error)}</Text.H6M>
        )}
      </Modal.Content>
    </Modal.Root>
  )
}

function ImportWizardForm({
  projectId,
  limits,
  retryJob,
  onClose,
}: {
  readonly projectId: string
  readonly limits: ImportLimitsRecord
  readonly retryJob?: ImportRecord
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const steps = retryJob ? RETRY_STEPS : NEW_IMPORT_STEPS
  const [step, setStep] = useState<WizardStep>(steps[0]!)
  const [connectionTest, setConnectionTest] = useState<ConnectionTest>({ phase: "idle" })
  const [sourceProjectsState, setSourceProjectsState] = useState<SourceProjectsState>({ phase: "idle" })
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewImport>> | null>(null)
  const connectionTestRequestId = useRef(0)
  const sourceProjectsRequestId = useRef(0)

  // Held rather than recomputed: `useForm` re-runs `formApi.update(opts)` after every render, and
  // that reverts an untouched form whenever `defaultValues` differs from the previous render's.
  // A range built from `new Date()` differs on any render that crosses a millisecond.
  const [defaultRange] = useState(() => rangeForLookback(limits.defaultLookbackDays))

  const form = useForm({
    defaultValues: {
      source: retryJob?.source ?? ("langfuse" as (typeof IMPORT_SOURCES)[number]),
      region: retryJob?.config.sourceRegion ?? DEFAULT_REGIONS.langfuse,
      publicKey: "",
      secretKey: "",
      apiKey: "",
      workspaceId: "",
      sourceProjectId: "",
      sourceProjectName: "",
      rangeFrom: defaultRange.from,
      rangeTo: defaultRange.to,
      maxTraces: limits.defaultMaxTraces,
      sessionMetadataKey: retryJob?.config.sessionMetadataKey ?? "thread_id",
    },
    onSubmit: createFormSubmitHandler(async (value) => {
      const credentials = credentialsFor(value)

      await (retryJob
        ? retryImport({
            data: {
              importJobId: retryJob.id,
              credentials,
            },
          })
        : createImport({
            data: {
              projectId,
              source: value.source,
              credentials,
              config: {
                sourceProjectId: value.sourceProjectId,
                sourceProjectName: value.sourceProjectName,
                rangeFrom: value.rangeFrom,
                rangeTo: value.rangeTo,
                maxTraces: value.maxTraces,
                sourcePageSize: IMPORT_SOURCE_PAGE_SIZE,
                sessionMetadataKey: value.source === "langsmith" ? value.sessionMetadataKey : undefined,
              },
            },
          }))

      await queryClient.invalidateQueries({ queryKey: importsQueryKey(projectId) })
      toast({
        title: retryJob ? "Import retry started" : "Import started",
        description: "Historical spans are being imported in the background.",
      })
      onClose()
    }),
  })

  const credentialsPayload = () => credentialsFor(form.state.values)

  const sourceProjectsMutation = useMutation({
    mutationFn: async ({ requestId }: { readonly requestId: number }) => {
      const source = form.state.values.source
      const credentials = credentialsPayload()
      const projects: SourceProject[] = []
      let cursor: string | undefined

      // Sources page their project list, and a project the user cannot see is one they
      // cannot import from, so the cursor is walked to exhaustion rather than to page one.
      do {
        const page = await listImportSourceProjects({
          data: { source, credentials, ...(cursor ? { cursor } : {}) },
        })
        projects.push(...page.projects)
        cursor = page.nextCursor ?? undefined
      } while (cursor && projects.length < IMPORT_SOURCE_PROJECT_LIST_MAX)

      return { requestId, projects, truncated: cursor !== undefined }
    },
    onMutate: () => {
      form.setFieldValue("sourceProjectId", "")
      form.setFieldValue("sourceProjectName", "")
      setSourceProjectsState({ phase: "loading" })
    },
    onSuccess: ({ requestId, projects, truncated }) => {
      if (requestId !== sourceProjectsRequestId.current) return
      setSourceProjectsState({ phase: "success", projects, truncated })
      const only = projects[0]
      if (only) {
        form.setFieldValue("sourceProjectId", only.id)
        form.setFieldValue("sourceProjectName", only.name)
      }
    },
    onError: (error, { requestId }) => {
      if (requestId !== sourceProjectsRequestId.current) return
      setSourceProjectsState({ phase: "error", message: toUserMessage(error) })
    },
  })

  const resetSourceProjects = () => {
    sourceProjectsRequestId.current += 1
    sourceProjectsMutation.reset()
    setSourceProjectsState({ phase: "idle" })
    form.setFieldValue("sourceProjectId", "")
    form.setFieldValue("sourceProjectName", "")
    setPreview(null)
  }

  const resetConnection = () => {
    connectionTestRequestId.current += 1
    setConnectionTest({ phase: "idle" })
    resetSourceProjects()
  }

  const loadSourceProjects = () => {
    const requestId = sourceProjectsRequestId.current + 1
    sourceProjectsRequestId.current = requestId
    setStep("project")
    sourceProjectsMutation.mutate({ requestId })
  }

  const testConnection = useMutation({
    mutationFn: async ({ requestId }: { readonly requestId: number }) => {
      await testImportConnection({
        data: { source: form.state.values.source, credentials: credentialsPayload() },
      })

      return { requestId }
    },
    onMutate: () => {
      resetSourceProjects()
      setConnectionTest({ phase: "testing" })
    },
    onSuccess: ({ requestId }) => {
      if (requestId !== connectionTestRequestId.current) return
      setConnectionTest({ phase: "success" })
    },
    onError: (error, { requestId }) => {
      if (requestId !== connectionTestRequestId.current) return
      setConnectionTest({ phase: "error", message: toUserMessage(error) })
    },
  })

  const runConnectionTest = () => {
    const requestId = connectionTestRequestId.current + 1
    connectionTestRequestId.current = requestId
    testConnection.mutate({ requestId })
  }

  const previewMutation = useMutation({
    mutationFn: () => {
      const value = form.state.values
      return previewImport({
        data: {
          source: value.source,
          credentials: credentialsPayload(),
          sourceProjectId: value.sourceProjectId,
          config: {
            rangeFrom: value.rangeFrom,
            rangeTo: value.rangeTo,
            maxTraces: value.maxTraces,
            sessionMetadataKey: value.source === "langsmith" ? value.sessionMetadataKey : undefined,
          },
        },
      })
    },
    onSuccess: (result) => {
      setPreview(result)
      setStep("preview")
    },
    onError: (error) => toast({ title: "Preview failed", description: toUserMessage(error), variant: "destructive" }),
  })

  return (
    <Modal.Root open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content dismissible className="max-w-lg">
        <Modal.Header title={retryJob ? "Retry historical trace import" : "Import historical traces"} />

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (step === "confirm") void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          {step === "source" ? (
            <form.Field name="source">
              {(field) => (
                <Select
                  name="source"
                  label="Source platform"
                  value={field.state.value}
                  onChange={(value) => {
                    const source = value as typeof field.state.value
                    field.handleChange(source)
                    form.setFieldValue("region", DEFAULT_REGIONS[source])
                    resetConnection()
                  }}
                  options={IMPORT_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
                />
              )}
            </form.Field>
          ) : null}

          {step === "credentials" ? (
            <div className="flex flex-col gap-3">
              {retryJob ? <RetrySummary job={retryJob} /> : null}
              <form.Field name="region">
                {(field) => (
                  <Select
                    name="region"
                    label="Region"
                    description={`Where your ${SOURCE_LABELS[form.state.values.source]} organization lives. Regions are separate deployments, so keys from one do not work against another.`}
                    value={field.state.value}
                    onChange={(value) => {
                      field.handleChange(String(value))
                      resetConnection()
                    }}
                    options={IMPORT_SOURCE_REGION_OPTIONS[form.state.values.source].map((region) => ({
                      value: region.id,
                      label: region.label,
                    }))}
                    disabled={retryJob !== undefined}
                  />
                )}
              </form.Field>
              {form.state.values.source === "langfuse" ? (
                <>
                  <form.Field name="publicKey">
                    {(field) => (
                      <Input
                        label="Public key"
                        value={field.state.value}
                        onChange={(e) => {
                          field.handleChange(e.target.value)
                          resetConnection()
                        }}
                        errors={fieldErrorsAsStrings(field.state.meta.errors)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="secretKey">
                    {(field) => (
                      <Input
                        label="Secret key"
                        type="password"
                        value={field.state.value}
                        onChange={(e) => {
                          field.handleChange(e.target.value)
                          resetConnection()
                        }}
                        errors={fieldErrorsAsStrings(field.state.meta.errors)}
                      />
                    )}
                  </form.Field>
                </>
              ) : (
                <form.Field name="apiKey">
                  {(field) => (
                    <Input
                      label="API key"
                      type="password"
                      value={field.state.value}
                      onChange={(e) => {
                        field.handleChange(e.target.value)
                        resetConnection()
                      }}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    />
                  )}
                </form.Field>
              )}
              {form.state.values.source === "langsmith" ? (
                <form.Field name="workspaceId">
                  {(field) => (
                    <Input
                      label="Workspace ID (optional)"
                      value={field.state.value}
                      onChange={(e) => {
                        field.handleChange(e.target.value)
                        resetConnection()
                      }}
                    />
                  )}
                </form.Field>
              ) : null}
              <div className="flex flex-row items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={runConnectionTest}
                  disabled={connectionTest.phase === "testing"}
                >
                  {connectionTest.phase === "testing" ? <Icon icon={Loader2} className="animate-spin" /> : null}
                  Test connection
                </Button>
                {connectionTest.phase === "success" ? <Icon icon={CircleCheck} className="text-success" /> : null}
                {connectionTest.phase === "error" ? (
                  <Text.H6M color="destructive" className="flex items-center gap-1">
                    <Icon icon={CircleAlert} size="sm" />
                    {connectionTest.message}
                  </Text.H6M>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === "project" ? (
            <form.Field name="sourceProjectId">
              {(field) => (
                <Select
                  name="sourceProjectId"
                  label="Source project"
                  value={field.state.value}
                  onChange={(value) => {
                    field.handleChange(String(value))
                    const project =
                      sourceProjectsState.phase === "success"
                        ? sourceProjectsState.projects.find((p) => p.id === value)
                        : undefined
                    if (project) form.setFieldValue("sourceProjectName", project.name)
                  }}
                  options={
                    sourceProjectsState.phase === "success"
                      ? sourceProjectsState.projects.map((p) => ({ value: p.id, label: p.name }))
                      : []
                  }
                  placeholder={sourceProjectsState.phase === "loading" ? "Loading projects…" : "Select a project"}
                  disabled={sourceProjectsState.phase === "loading"}
                  errors={sourceProjectsState.phase === "error" ? [sourceProjectsState.message] : undefined}
                  {...(sourceProjectsState.phase === "success" && sourceProjectsState.truncated
                    ? {
                        description: `Showing the first ${numberFormatter.format(sourceProjectsState.projects.length)} projects; this account has more than the list can hold.`,
                      }
                    : {})}
                  {...(sourceProjectsState.phase === "error"
                    ? { footerAction: { label: "Retry loading projects", onClick: loadSourceProjects } }
                    : {})}
                />
              )}
            </form.Field>
          ) : null}

          {step === "config" ? (
            <div className="flex flex-col gap-3">
              <ImportExpectations limits={limits} />
              <form.Field name="rangeFrom">
                {(field) => (
                  <Input
                    label="From"
                    type="datetime-local"
                    value={field.state.value.slice(0, 16)}
                    onChange={(e) => field.handleChange(new Date(e.target.value).toISOString())}
                  />
                )}
              </form.Field>
              <form.Field name="rangeTo">
                {(field) => (
                  <Input
                    label="To"
                    type="datetime-local"
                    value={field.state.value.slice(0, 16)}
                    onChange={(e) => field.handleChange(new Date(e.target.value).toISOString())}
                  />
                )}
              </form.Field>
              <form.Field name="maxTraces">
                {(field) => (
                  <Input
                    label="Max traces"
                    type="number"
                    min={1}
                    max={limits.maxTraces}
                    value={String(field.state.value)}
                    onChange={(e) => field.handleChange(clampMaxTraces(e.target.value, limits.maxTraces))}
                  />
                )}
              </form.Field>
              {form.state.values.source === "langsmith" ? (
                <form.Field name="sessionMetadataKey">
                  {(field) => (
                    <Input
                      label="Session metadata key"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </form.Field>
              ) : null}
            </div>
          ) : null}

          {step === "preview" && preview ? (
            <div className="flex flex-col gap-2">
              <Text.H6M>
                {preview.estimatedTraces === null
                  ? "Could not read how many traces this range holds."
                  : `${numberFormatter.format(preview.estimatedTraces)} ${preview.estimatedTraces === 1 ? "trace" : "traces"} in this range.`}
              </Text.H6M>
              {preview.warnings.map((w) => (
                <Text.H6M key={w} color="foregroundMuted">
                  {w}
                </Text.H6M>
              ))}
              {/* One span per trace, newest first, with the date so the range can be sanity-checked. */}
              {preview.sample.map((s) => (
                <Text.H6M key={`${s.traceId}-${s.spanId}`} color="foregroundMuted">
                  {s.startTime ? `${new Date(s.startTime).toLocaleString()} · ` : ""}
                  {s.name} · trace <span title={s.traceId}>{shortTraceId(s.traceId)}</span>
                </Text.H6M>
              ))}
            </div>
          ) : null}

          {step === "confirm" ? (
            <div className="flex flex-col gap-2">
              {retryJob ? (
                <RetrySummary job={retryJob} />
              ) : (
                <Text.H6M color="foregroundMuted">
                  Importing up to {numberFormatter.format(form.state.values.maxTraces)} traces from{" "}
                  {form.state.values.sourceProjectName}, newest first. This runs in the background and can be cancelled
                  from the imports list.
                </Text.H6M>
              )}
              <ImportExpectations limits={limits} />
            </div>
          ) : null}

          <Modal.Footer className="flex flex-row justify-between">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <div className="flex flex-row gap-2">
              {step !== steps[0] ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const idx = steps.indexOf(step)
                    if (idx > 0) setStep(steps[idx - 1]!)
                  }}
                >
                  Back
                </Button>
              ) : null}
              {step === "source" ? (
                <Button type="button" onClick={() => setStep("credentials")}>
                  Continue
                </Button>
              ) : null}
              {step === "credentials" ? (
                <Button
                  type="button"
                  onClick={() => (retryJob ? setStep("confirm") : loadSourceProjects())}
                  disabled={connectionTest.phase !== "success"}
                >
                  Continue
                </Button>
              ) : null}
              {step === "project" ? (
                // Subscribed rather than read off `form.state`: picking a project touches only
                // the form store, so a plain read leaves this button stuck on its first value.
                <form.Subscribe selector={(state) => state.values.sourceProjectId}>
                  {(sourceProjectId) => (
                    <Button type="button" onClick={() => setStep("config")} disabled={!sourceProjectId}>
                      Continue
                    </Button>
                  )}
                </form.Subscribe>
              ) : null}
              {step === "config" ? (
                <Button type="button" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                  Preview import
                </Button>
              ) : null}
              {step === "preview" ? (
                <Button type="button" onClick={() => setStep("confirm")}>
                  Continue
                </Button>
              ) : null}
              {step === "confirm" ? (
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button type="submit" disabled={isSubmitting}>
                      {retryJob ? "Retry import" : "Start import"}
                    </Button>
                  )}
                </form.Subscribe>
              ) : null}
            </div>
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  )
}
