import {
  IMPORT_SOURCE_PAGE_SIZE,
  IMPORT_SOURCE_PROJECT_LIST_MAX,
  IMPORT_SOURCE_REGION_OPTIONS,
  IMPORT_SOURCES,
} from "@domain/imports"
import {
  Button,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  Input,
  Modal,
  ProviderIcon,
  Select,
  Slider,
  Text,
  useToast,
} from "@repo/ui"
import { formatDuration, relativeTime } from "@repo/utils"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, CircleAlert, CircleCheck, Loader2 } from "lucide-react"
import type { ReactNode } from "react"
import { useRef, useState } from "react"
import {
  createImport,
  getImportLimits,
  type ImportLimitsRecord,
  type ImportRecord,
  importsQueryKey,
  listImportSourceProjects,
  previewImport,
  retryImport,
  testImportConnection,
} from "../../domains/imports/imports.functions.ts"
import { toUserMessage } from "../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../lib/form-server-action.ts"
import { SelectorChip } from "../selector-chip.tsx"
import { TimeFilterDropdown, type TimeFilterPreset } from "../time-filter-dropdown.tsx"

type WizardStep = "platform" | "import"

type ImportSource = (typeof IMPORT_SOURCES)[number]

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

type PreviewRow = Awaited<ReturnType<typeof previewImport>>["sample"][number]

const SOURCE_LABELS = {
  langfuse: "Langfuse",
  langsmith: "LangSmith",
  braintrust: "Braintrust",
} as const

/** The first option is the default everywhere, and regions are listed EU first. */
const defaultRegionFor = (source: ImportSource): string => IMPORT_SOURCE_REGION_OPTIONS[source][0]!.id

function CredentialDocsLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  )
}

type CredentialValues = {
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
const credentialsFor = (source: ImportSource, value: CredentialValues) => {
  if (source === "langfuse") {
    return {
      kind: "langfuse" as const,
      region: value.region as (typeof IMPORT_SOURCE_REGION_OPTIONS.langfuse)[number]["id"],
      publicKey: value.publicKey,
      secretKey: value.secretKey,
    }
  }
  if (source === "langsmith") {
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
const DAY_S = 24 * 60 * 60

/**
 * Import ranges have a whole-day floor (the backend rejects anything shorter), so the sub-day
 * presets the trace filters lead with would only produce rejected imports.
 */
const IMPORT_TIME_PRESETS: readonly TimeFilterPreset[] = [
  { id: "last-day", label: "Last day", seconds: DAY_S },
  { id: "last-week", label: "Last week", seconds: 7 * DAY_S },
  { id: "last-2-weeks", label: "Last 2 weeks", seconds: 14 * DAY_S },
  { id: "last-month", label: "Last month", seconds: 30 * DAY_S },
  { id: "last-3-months", label: "Last 3 months", seconds: 90 * DAY_S },
  { id: "last-6-months", label: "Last 6 months", seconds: 180 * DAY_S },
  { id: "last-year", label: "Last year", seconds: 365 * DAY_S },
]

const rangeForLookback = (lookbackDays: number) => {
  const to = new Date()
  const from = new Date(to.getTime() - lookbackDays * DAY_MS)
  return { from: from.toISOString(), to: to.toISOString() }
}

const numberFormatter = new Intl.NumberFormat("en-US")

// Every cell is `noWrap` and the flexible ones `ellipsis`: the cell `td` only truncates
// content that truncates itself, so a plain Text span would wrap the row instead.
const PREVIEW_COLUMNS: InfiniteTableColumn<PreviewRow>[] = [
  {
    key: "startTime",
    header: "Time",
    width: 120,
    maxWidth: 120,
    render: (row) => (
      <Text.H6 color="foregroundMuted" noWrap>
        {row.startTime ? relativeTime(row.startTime) : "—"}
      </Text.H6>
    ),
  },
  {
    key: "name",
    header: "Name",
    render: (row) => (
      <Text.H6 noWrap ellipsis>
        {row.name}
      </Text.H6>
    ),
  },
  {
    key: "models",
    header: "Models",
    render: (row) => (
      <Text.H6 color="foregroundMuted" noWrap ellipsis>
        {row.models.length > 0 ? row.models.join(", ") : "—"}
      </Text.H6>
    ),
  },
  {
    key: "durationNs",
    header: "Duration",
    width: 90,
    minWidth: 80,
    maxWidth: 90,
    align: "end",
    render: (row) => (
      <Text.H6 color="foregroundMuted" noWrap align="right" display="block">
        {row.durationNs > 0 ? formatDuration(row.durationNs) : "-"}
      </Text.H6>
    ),
  },
]

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
 * Where the wizard is mounted, which only the footer needs to know: `Modal.Footer` is a full-bleed
 * bar that assumes the rounded bottom of a dialog, so an inline host gets a plain divider instead.
 */
type ImportWizardChrome = "modal" | "inline"

interface ImportWizardProps {
  readonly projectId: string
  readonly retryJob?: ImportRecord
  readonly chrome?: ImportWizardChrome
  /** Renders a leading footer action; the modal host passes its close handler. */
  readonly onCancel?: () => void
  /** Runs after the import is created and the list refreshed, for host-side follow-up. */
  readonly onStarted?: () => void
}

function WizardBody({ chrome, children }: { readonly chrome: ImportWizardChrome; readonly children: ReactNode }) {
  if (chrome === "modal") {
    return <Modal.Body className="flex flex-col gap-4">{children}</Modal.Body>
  }

  return <div className="flex flex-col gap-4">{children}</div>
}

function WizardFooter({ chrome, children }: { readonly chrome: ImportWizardChrome; readonly children: ReactNode }) {
  if (chrome === "modal") {
    return <Modal.Footer className="flex flex-row justify-between">{children}</Modal.Footer>
  }

  return <div className="flex flex-row justify-between border-border border-t pt-4">{children}</div>
}

/**
 * The import wizard's steps and logic, mounted both as the settings modal's body and as the
 * "Import" panel of the traces setup instructions. Renders no dialog chrome of its own so each
 * host frames it.
 *
 * The form's defaults come from the org's plan, so it only mounts once they are known —
 * seeding them afterwards would mean mirroring fetched data into form state.
 */
export function ImportWizard({ projectId, retryJob, chrome = "inline", onCancel, onStarted }: ImportWizardProps) {
  const { data: limits, isPending, error } = useQuery({ queryKey: ["import-limits"], queryFn: () => getImportLimits() })

  if (limits) {
    return (
      <ImportWizardForm
        projectId={projectId}
        limits={limits}
        chrome={chrome}
        {...(retryJob ? { retryJob } : {})}
        {...(onCancel ? { onCancel } : {})}
        {...(onStarted ? { onStarted } : {})}
      />
    )
  }

  if (isPending) {
    return (
      <Text.H6M color="foregroundMuted" className="flex items-center gap-2">
        <Icon icon={Loader2} className="animate-spin" size="sm" />
        Checking what your plan allows…
      </Text.H6M>
    )
  }

  return <Text.H6M color="destructive">{toUserMessage(error)}</Text.H6M>
}

function ImportWizardForm({
  projectId,
  limits,
  chrome,
  retryJob,
  onCancel,
  onStarted,
}: {
  readonly projectId: string
  readonly limits: ImportLimitsRecord
  readonly chrome: ImportWizardChrome
  readonly retryJob?: ImportRecord
  readonly onCancel?: () => void
  readonly onStarted?: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<WizardStep>("platform")
  const [source, setSource] = useState<ImportSource>(retryJob?.source ?? IMPORT_SOURCES[0]!)
  const [connectionTest, setConnectionTest] = useState<ConnectionTest>({ phase: "idle" })
  const [sourceProjectsState, setSourceProjectsState] = useState<SourceProjectsState>({ phase: "idle" })
  const [selectedProject, setSelectedProject] = useState<SourceProject | null>(null)
  // Held rather than recomputed: a range built from `new Date()` differs on every render.
  const [defaultRange] = useState(() => rangeForLookback(limits.defaultLookbackDays))
  const [range, setRange] = useState(defaultRange)
  /** `null` follows the range's total; a number is the user having dragged the slider. */
  const [tracesToImport, setTracesToImport] = useState<number | null>(null)
  const [sessionMetadataKey, setSessionMetadataKey] = useState(retryJob?.config.sessionMetadataKey ?? "thread_id")
  const connectionTestRequestId = useRef(0)
  const sourceProjectsRequestId = useRef(0)

  const timePresets = IMPORT_TIME_PRESETS.filter((preset) => preset.seconds <= limits.maxLookbackDays * DAY_S)

  const form = useForm({
    defaultValues: {
      region: retryJob?.config.sourceRegion ?? defaultRegionFor(retryJob?.source ?? IMPORT_SOURCES[0]!),
      publicKey: "",
      secretKey: "",
      apiKey: "",
      workspaceId: "",
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const credentials = credentialsFor(source, value)

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
                source,
                credentials,
                config: {
                  sourceProjectId: selectedProject?.id ?? "",
                  sourceProjectName: selectedProject?.name ?? "",
                  rangeFrom: range.from,
                  rangeTo: range.to,
                  maxTraces: sliderValue,
                  sourcePageSize: IMPORT_SOURCE_PAGE_SIZE,
                  sessionMetadataKey: source === "langsmith" ? sessionMetadataKey : undefined,
                },
              },
            }))
      },
      {
        // Kept out of the action so that a failure to refresh the list cannot be reported as a
        // failure to start the import, which by then has already been created.
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: importsQueryKey(projectId) })
          toast({
            title: retryJob ? "Import retried" : "Import started",
            description: "We're importing your traces in the background.",
          })
          // The form values are reset for us; an inline host stays mounted, so the walked-to step
          // and everything derived from the tested credentials have to come back with them.
          setStep("platform")
          setSource(retryJob?.source ?? IMPORT_SOURCES[0]!)
          setConnectionTest({ phase: "idle" })
          setSourceProjectsState({ phase: "idle" })
          setSelectedProject(null)
          setRange(defaultRange)
          setTracesToImport(null)
          onStarted?.()
        },
        // Without this the submit failure is swallowed: only field-level Zod errors render on their
        // own, so anything else left the wizard sitting on the last step saying nothing at all.
        onError: (error) =>
          toast({
            title: retryJob ? "Could not retry the import" : "Could not start the import",
            description: toUserMessage(error),
            variant: "destructive",
          }),
      },
    ),
  })

  const credentialsPayload = () => credentialsFor(source, form.state.values)

  const sourceProjectsMutation = useMutation({
    mutationFn: async ({ requestId }: { readonly requestId: number }) => {
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
      setSelectedProject(null)
      setSourceProjectsState({ phase: "loading" })
    },
    onSuccess: ({ requestId, projects, truncated }) => {
      if (requestId !== sourceProjectsRequestId.current) return
      setSourceProjectsState({ phase: "success", projects, truncated })
      setSelectedProject(projects[0] ?? null)
      setTracesToImport(null)
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
    setSelectedProject(null)
    setTracesToImport(null)
  }

  const resetConnection = () => {
    connectionTestRequestId.current += 1
    setConnectionTest({ phase: "idle" })
    resetSourceProjects()
  }

  const loadSourceProjects = () => {
    const requestId = sourceProjectsRequestId.current + 1
    sourceProjectsRequestId.current = requestId
    sourceProjectsMutation.mutate({ requestId })
  }

  const testConnection = useMutation({
    mutationFn: async ({ requestId }: { readonly requestId: number }) => {
      await testImportConnection({
        data: { source, credentials: credentialsPayload() },
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

  // Keyed on everything that changes what the source would answer, except the session metadata
  // key: including it would fire a request per keystroke for a field that barely affects counts.
  const previewQuery = useQuery({
    queryKey: ["import-wizard-preview", source, selectedProject?.id, range.from, range.to],
    enabled: step === "import" && selectedProject !== null,
    staleTime: 60_000,
    queryFn: () =>
      previewImport({
        data: {
          source,
          credentials: credentialsPayload(),
          sourceProjectId: selectedProject!.id,
          config: {
            rangeFrom: range.from,
            rangeTo: range.to,
            maxTraces: limits.maxTraces,
            sessionMetadataKey: source === "langsmith" ? sessionMetadataKey : undefined,
          },
        },
      }),
  })

  const previewLoading = previewQuery.isPending || previewQuery.isFetching
  const estimatedTraces = previewQuery.data?.estimatedTraces ?? null
  const capped = estimatedTraces !== null && estimatedTraces > limits.maxTraces
  const sliderMax = Math.max(1, Math.min(estimatedTraces ?? limits.maxTraces, limits.maxTraces))
  const sliderValue = Math.max(1, Math.min(tracesToImport ?? sliderMax, sliderMax))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (step === "import" || retryJob) void form.handleSubmit()
      }}
      className={chrome === "modal" ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-4"}
    >
      <WizardBody chrome={chrome}>
        {step === "platform" ? (
          <div className="flex flex-col gap-3">
            {retryJob ? (
              <RetrySummary job={retryJob} />
            ) : (
              <div className="flex flex-col gap-3">
                <Text.H5M>Platform</Text.H5M>
                <div className="flex flex-row flex-wrap gap-1">
                  {IMPORT_SOURCES.map((option) => (
                    <SelectorChip
                      key={option}
                      selected={source === option}
                      onSelect={() => {
                        setSource(option)
                        form.setFieldValue("region", defaultRegionFor(option))
                        resetConnection()
                      }}
                      icon={<ProviderIcon provider={option} size="xs" />}
                      label={SOURCE_LABELS[option]}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <form.Field name="region">
                {(field) => (
                  <Select
                    name="region"
                    label="Region"
                    description={`Where your ${SOURCE_LABELS[source]} organization lives.`}
                    value={field.state.value}
                    onChange={(value) => {
                      field.handleChange(String(value))
                      resetConnection()
                    }}
                    options={IMPORT_SOURCE_REGION_OPTIONS[source].map((region) => ({
                      value: region.id,
                      label: region.label,
                    }))}
                    disabled={retryJob !== undefined}
                  />
                )}
              </form.Field>
              {source === "langfuse" ? (
                <>
                  <form.Field name="publicKey">
                    {(field) => (
                      <Input
                        label="Public key"
                        placeholder="pk-lf-xxxxxxxx"
                        description={
                          <>
                            One half of your project's API key pair, get it from{" "}
                            <CredentialDocsLink href="https://langfuse.com/faq/all/where-are-langfuse-api-keys">
                              Project Settings → API Keys
                            </CredentialDocsLink>
                            .
                          </>
                        }
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
                  <form.Field name="secretKey">
                    {(field) => (
                      <Input
                        label="Secret key"
                        placeholder="sk-lf-xxxxxxxx"
                        description={
                          <>
                            The other half of the key pair, shown once{" "}
                            <CredentialDocsLink href="https://langfuse.com/faq/all/where-are-langfuse-api-keys">
                              when the pair is created
                            </CredentialDocsLink>
                            .
                          </>
                        }
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
                      placeholder={source === "langsmith" ? "lsv2_pt_xxxxxxxx" : "sk-xxxxxxxx"}
                      description={
                        source === "langsmith" ? (
                          <>
                            A personal or service key, get it from{" "}
                            <CredentialDocsLink href="https://docs.smith.langchain.com/administration/how_to_guides/organization_management/create_account_api_key">
                              Settings → API Keys
                            </CredentialDocsLink>
                            .
                          </>
                        ) : (
                          <>
                            An organization API key, get it from{" "}
                            <CredentialDocsLink href="https://www.braintrust.dev/app/settings?subroute=api-keys">
                              Settings → API Keys
                            </CredentialDocsLink>
                            .
                          </>
                        )
                      }
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
              {source === "langsmith" ? (
                <form.Field name="workspaceId">
                  {(field) => (
                    <Input
                      label="Workspace ID"
                      placeholder="xxxxxxxx-aaaa-bbbb-cccc"
                      description={
                        <>
                          Only needed when the key is scoped to several workspaces, get it from{" "}
                          <CredentialDocsLink href="https://docs.smith.langchain.com/administration/concepts#workspaces">
                            Settings → Workspaces
                          </CredentialDocsLink>
                          .
                        </>
                      }
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
                  {connectionTest.phase === "testing" ? (
                    <Icon icon={Loader2} className="animate-spin" />
                  ) : (
                    <Icon icon={Check} size="sm" />
                  )}
                  Test connection
                </Button>
                {connectionTest.phase === "success" ? (
                  <Icon icon={CircleCheck} className="shrink-0 text-success" />
                ) : null}
                {connectionTest.phase === "error" ? (
                  <div className="flex min-w-0 flex-1 flex-row items-center gap-1.5">
                    <Icon icon={CircleAlert} size="sm" color="destructive" className="shrink-0" />
                    <Text.H6M color="destructive">{connectionTest.message}</Text.H6M>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {step === "import" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <Text.H5M>Preview</Text.H5M>
              <div className="flex flex-row items-center justify-between gap-2">
                <div className="w-64 shrink-0">
                  <Select
                    name="sourceProject"
                    searchable
                    searchableEmptyMessage="No projects match."
                    value={selectedProject?.id ?? ""}
                    loading={sourceProjectsState.phase === "loading"}
                    onChange={(value) => {
                      const project =
                        sourceProjectsState.phase === "success"
                          ? sourceProjectsState.projects.find((p) => p.id === value)
                          : undefined
                      setSelectedProject(project ?? null)
                      setTracesToImport(null)
                    }}
                    options={
                      sourceProjectsState.phase === "success"
                        ? sourceProjectsState.projects.map((p) => ({ value: p.id, label: p.name }))
                        : []
                    }
                    placeholder={sourceProjectsState.phase === "loading" ? "Loading projects…" : "Select a project"}
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
                </div>
                {/* The picker trigger is a `min-h-8` Button; pinned to the Select's `h-9` so the row lines up. */}
                <div className="shrink-0 [&>button]:h-9">
                  <TimeFilterDropdown
                    startTimeFrom={range.from}
                    startTimeTo={range.to}
                    presets={timePresets}
                    placeholder="Pick a range"
                    onChange={(from, to) => {
                      // An import needs a bounded range, so clearing falls back to the plan default
                      // rather than to "all time"; a preset carries no end, which means "up to now".
                      if (!from) {
                        setRange(rangeForLookback(limits.defaultLookbackDays))
                      } else {
                        setRange({ from, to: to ?? new Date().toISOString() })
                      }
                      setTracesToImport(null)
                    }}
                  />
                </div>
              </div>

              <InfiniteTable
                data={previewLoading ? [] : (previewQuery.data?.sample ?? [])}
                isLoading={previewLoading}
                columns={PREVIEW_COLUMNS}
                getRowKey={(row) => row.traceId}
                scrollAreaLayout="intrinsic"
                className="max-h-96"
                blankSlate="No traces found for this project and range."
              />
            </div>
            {previewQuery.isError ? <Text.H6M color="destructive">{toUserMessage(previewQuery.error)}</Text.H6M> : null}
            {(previewQuery.data?.warnings ?? []).map((warning) => (
              <Text.H6M key={warning} color="foregroundMuted">
                {warning}
              </Text.H6M>
            ))}

            <div className="flex flex-col gap-2">
              <div className="flex flex-row items-center justify-between gap-2">
                <Text.H5M>Hoy many traces to import</Text.H5M>
                <Text.H6M color="foregroundMuted">
                  {numberFormatter.format(sliderValue)}
                  {estimatedTraces !== null ? ` of ${numberFormatter.format(estimatedTraces)}` : ""}
                </Text.H6M>
              </div>
              <Slider
                min={1}
                max={sliderMax}
                step={1}
                value={[sliderValue]}
                onValueChange={([value]) => setTracesToImport(value ?? sliderMax)}
                disabled={previewLoading || selectedProject === null}
              />
              <Text.H6 color="foregroundMuted">
                Imported traces will incur the same credit usage as ingested traces.
              </Text.H6>
              {capped ? (
                <Text.H6M color="warningMutedForeground">
                  This range holds {numberFormatter.format(estimatedTraces)} traces, more than the{" "}
                  {numberFormatter.format(limits.maxTraces)} an import can carry, so it is capped at{" "}
                  {numberFormatter.format(limits.maxTraces)}. Traces import newest first, so the most recent ones are
                  kept.
                </Text.H6M>
              ) : null}
              {!previewLoading && previewQuery.data && estimatedTraces === null ? (
                <Text.H6M color="foregroundMuted">
                  Could not read how many traces this range holds; the import still stops at{" "}
                  {numberFormatter.format(sliderValue)}.
                </Text.H6M>
              ) : null}
            </div>

            {source === "langsmith" ? (
              <Input
                label="Session metadata key"
                description="LangSmith does not have native session grouping, you can define a custom key to group on."
                value={sessionMetadataKey}
                onChange={(e) => setSessionMetadataKey(e.target.value)}
              />
            ) : null}
          </div>
        ) : null}
      </WizardBody>

      <WizardFooter chrome={chrome}>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-row gap-2">
          {step === "import" ? (
            <Button type="button" variant="outline" onClick={() => setStep("platform")}>
              Back
            </Button>
          ) : null}
          {step === "platform" && !retryJob ? (
            <Button
              type="button"
              onClick={() => {
                setStep("import")
                loadSourceProjects()
              }}
              disabled={connectionTest.phase !== "success"}
            >
              Preview import
            </Button>
          ) : null}
          {retryJob ? (
            // Subscribed rather than read off `form.state`, which is not reactive during a submit.
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={connectionTest.phase !== "success" || isSubmitting}>
                  {isSubmitting ? <Icon icon={Loader2} className="animate-spin" /> : null}
                  Retry import
                </Button>
              )}
            </form.Subscribe>
          ) : null}
          {step === "import" ? (
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={
                    selectedProject === null ||
                    sourceProjectsState.phase === "loading" ||
                    previewLoading ||
                    isSubmitting
                  }
                >
                  {isSubmitting ? <Icon icon={Loader2} className="animate-spin" /> : null}
                  Start import
                </Button>
              )}
            </form.Subscribe>
          ) : null}
        </div>
      </WizardFooter>
    </form>
  )
}
