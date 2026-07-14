import { Button, CloseTrigger, Input, Modal, Select, Text, Textarea, useToast } from "@repo/ui"
import { useState } from "react"
import { useProjectUsers } from "../../../../../../domains/end-users/end-users.collection.ts"
import {
  allSessionsMonitorTarget,
  allToolsMonitorTarget,
  allUsersMonitorTarget,
  monitorTargetName,
  savedSearchMonitorTarget,
  toolMonitorTarget,
  userMonitorTarget,
} from "../../../../../../domains/monitors/monitor-target.ts"
import { useCreateMonitor } from "../../../../../../domains/monitors/monitors.collection.ts"
import { useSavedSearchesList } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"
import { useProjectTools } from "../../../../../../domains/tools/tools.collection.ts"
import { handleMutationError } from "../../../../../../lib/data/handle-mutation-error.ts"
import { extractFieldErrors } from "../../../../../../lib/errors.ts"
import { AlertCardForm } from "./alert-card-form.tsx"
import {
  type AlertDraft,
  type AlertFieldErrors,
  alertFieldErrorsFrom,
  draftToAlertDraft,
  draftToTarget,
  emptyAlertDraft,
  hasAlertFieldErrors,
  targetAlertDraft,
} from "./alert-form-helpers.ts"

type MonitorSource = "savedSearch" | "tools" | "users" | "sessions"

const DAY_MS = 24 * 60 * 60 * 1000
const TARGET_LOOKBACK_DAYS = 30
const TARGET_TREND_BUCKET_SECONDS = 24 * 60 * 60

const SOURCE_OPTIONS: { label: string; value: MonitorSource }[] = [
  { label: "Saved search", value: "savedSearch" },
  { label: "Tools", value: "tools" },
  { label: "Users", value: "users" },
  { label: "Sessions", value: "sessions" },
]

const userLabel = (user: { readonly userId: string; readonly userEmail?: string | null }) =>
  user.userEmail ?? user.userId

const initialSourceFor = (initialAlert?: AlertDraft): MonitorSource => {
  const kind = initialAlert?.target?.kind
  if (kind === "tool") return "tools"
  if (kind === "session") return "sessions"
  if (kind === "user") return "users"
  return "savedSearch"
}

/**
 * Create a monitor end-to-end: name + description + its alert. The UI
 * treats a monitor as having exactly one alert (the data model still allows
 * more, but nothing promotes it). Mounted only while open (fresh state per
 * open). On success it closes and, when `onCreated` is given, hands the new
 * slug back (e.g. so the monitors page can open its details panel); callers
 * that stay put omit it.
 */
export function MonitorCreateModal({
  projectId,
  projectSlug,
  initialAlert,
  onClose,
  onCreated,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly initialAlert?: AlertDraft
  readonly onClose: () => void
  readonly onCreated?: (slug: string) => void
}) {
  const { toast } = useToast()
  const create = useCreateMonitor(projectId)
  const initialSavedSearchId = initialAlert?.sourceId ?? initialAlert?.target?.savedSearchId ?? ""
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [alert, setAlert] = useState<AlertDraft>(
    initialAlert?.target
      ? initialAlert
      : initialSavedSearchId
        ? targetAlertDraft(savedSearchMonitorTarget(initialSavedSearchId))
        : (initialAlert ?? emptyAlertDraft()),
  )
  const [source, setSource] = useState<MonitorSource>(() => initialSourceFor(initialAlert))
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState(initialSavedSearchId)
  const [selectedToolName, setSelectedToolName] = useState("")
  const [selectedUserId, setSelectedUserId] = useState("")
  const [sourceError, setSourceError] = useState<string | undefined>(undefined)
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const [alertErrors, setAlertErrors] = useState<AlertFieldErrors>({})
  const [targetRange] = useState(() => {
    const toMs = Date.now()
    return {
      fromIso: new Date(toMs - TARGET_LOOKBACK_DAYS * DAY_MS).toISOString(),
      toIso: new Date(toMs).toISOString(),
    }
  })
  const { data: toolsData, isLoading: toolsLoading } = useProjectTools({
    projectId,
    range: targetRange,
    trendBucketSeconds: TARGET_TREND_BUCKET_SECONDS,
  })
  const { data: savedSearches, isLoading: savedSearchesLoading } = useSavedSearchesList(projectId)
  const { data: users, isLoading: usersLoading } = useProjectUsers({
    projectId,
    limit: 50,
  })

  const sourceLocked = Boolean(initialAlert?.target)
  const targetName = alert.target ? monitorTargetName(alert.target) : null
  const modalTargetName =
    alert.target?.stream === "sessions" &&
    (Object.keys(alert.target.filterSet ?? {}).length > 0 || alert.target.query || alert.target.savedSearchId)
      ? "matching sessions"
      : targetName
  const modalDescription = modalTargetName
    ? `This monitor watches ${modalTargetName} and opens an incident when its condition is met.`
    : "Monitors watch your saved searches and open incidents when their conditions are met."

  const onAlertChange = (next: AlertDraft) => {
    setAlert(next)
    if (next.sourceId) setSelectedSavedSearchId(next.sourceId)
    setAlertErrors({})
  }

  const onSourceChange = (next: MonitorSource) => {
    setSource(next)
    setSourceError(undefined)
    setAlertErrors({})
    if (next === "savedSearch") {
      setAlert(
        selectedSavedSearchId ? targetAlertDraft(savedSearchMonitorTarget(selectedSavedSearchId)) : emptyAlertDraft(),
      )
    }
    if (next === "tools") setAlert(targetAlertDraft(allToolsMonitorTarget()))
    if (next === "users") setAlert(targetAlertDraft(allUsersMonitorTarget()))
    if (next === "sessions") setAlert(targetAlertDraft(allSessionsMonitorTarget()))
  }

  const onSavedSearchChange = (savedSearchId: string) => {
    setSelectedSavedSearchId(savedSearchId)
    setSourceError(undefined)
    setAlert(targetAlertDraft(savedSearchMonitorTarget(savedSearchId)))
  }

  const onToolChange = (toolName: string | undefined) => {
    const nextToolName = toolName ?? ""
    setSelectedToolName(nextToolName)
    setSourceError(undefined)
    setAlert(targetAlertDraft(nextToolName ? toolMonitorTarget(nextToolName) : allToolsMonitorTarget()))
  }

  const onUserChange = (userId: string | undefined) => {
    const nextUserId = userId ?? ""
    setSelectedUserId(nextUserId)
    setSourceError(undefined)
    setAlert(targetAlertDraft(nextUserId ? userMonitorTarget(nextUserId) : allUsersMonitorTarget()))
  }

  const onSubmit = async () => {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setNameError("Name is required")
      return
    }
    if (source === "savedSearch" && selectedSavedSearchId.length === 0) {
      setSourceError("Select a saved search")
      return
    }
    if (alert.target === null && alert.sourceId === null) {
      setAlertErrors({ source: ["Select a saved search"] })
      return
    }
    const target = draftToTarget(alert)
    try {
      const monitor = await create.mutateAsync({
        name: trimmedName,
        ...(description.trim() ? { description: description.trim() } : {}),
        rule: draftToAlertDraft(alert),
        ...(target ? { target } : {}),
      })
      toast({ description: "Monitor created." })
      onClose()
      onCreated?.(monitor.slug)
    } catch (error) {
      const fieldErrors = extractFieldErrors(error)
      const nameErr = fieldErrors?.name?.[0]
      const errors = alertFieldErrorsFrom(fieldErrors, null)
      if (nameErr || hasAlertFieldErrors(errors)) {
        if (nameErr) setNameError(nameErr)
        setAlertErrors(errors)
        return
      }
      handleMutationError(error)
    }
  }

  return (
    <Modal
      open
      dismissible
      size="large"
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="New monitor"
      description={modalDescription}
      footer={
        <>
          <CloseTrigger />
          <Button disabled={create.isPending} isLoading={create.isPending} onClick={() => void onSubmit()}>
            {create.isPending ? "Creating" : "Create monitor"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          required
          autoFocus
          label="Name"
          placeholder="Tool error spikes"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (nameError) setNameError(undefined)
          }}
          {...(nameError ? { errors: [nameError] } : {})}
        />
        <Textarea
          label="Description"
          placeholder="What is this monitor for?"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minRows={2}
        />
        {!sourceLocked ? (
          <div className="flex flex-col gap-1.5">
            <Text.H5M>Source</Text.H5M>
            <Select<MonitorSource>
              name="monitor-source"
              width="full"
              contentWidth="trigger"
              options={SOURCE_OPTIONS}
              value={source}
              onChange={onSourceChange}
            />
          </div>
        ) : null}
        {!sourceLocked && source === "savedSearch" ? (
          <div className="flex flex-col gap-1.5">
            <Text.H5M>Saved search</Text.H5M>
            <Select<string>
              name="monitor-saved-search"
              width="full"
              contentWidth="trigger"
              options={savedSearches.map((search) => ({
                label: search.name,
                value: search.id,
              }))}
              value={selectedSavedSearchId}
              placeholder="Select a saved search"
              onChange={onSavedSearchChange}
              searchable
              searchPlaceholder="Search saved searches…"
              searchableEmptyMessage="No saved searches found"
              loading={savedSearchesLoading}
            />
            {sourceError ? <Text.H6 color="destructive">{sourceError}</Text.H6> : null}
          </div>
        ) : null}
        {!sourceLocked && source === "tools" ? (
          <div className="flex flex-col gap-1.5">
            <Text.H5M>Tool</Text.H5M>
            <Select<string>
              name="monitor-tool"
              width="full"
              contentWidth="trigger"
              options={(toolsData?.tools ?? []).map((tool) => ({
                label: tool.name,
                value: tool.name,
              }))}
              value={selectedToolName || undefined}
              placeholder="All tools"
              onChange={onToolChange}
              loading={toolsLoading}
              removable
              searchable
              searchPlaceholder="Search tools…"
              searchableEmptyMessage="No tools found"
            />
          </div>
        ) : null}
        {!sourceLocked && source === "users" ? (
          <div className="flex flex-col gap-1.5">
            <Text.H5M>User</Text.H5M>
            <Select<string>
              name="monitor-user"
              width="full"
              contentWidth="trigger"
              options={users.map((user) => ({
                label: userLabel(user),
                value: user.userId,
              }))}
              value={selectedUserId || undefined}
              placeholder="All users"
              onChange={onUserChange}
              loading={usersLoading}
              removable
              searchable
              searchPlaceholder="Search users…"
              searchableEmptyMessage="No users found"
            />
          </div>
        ) : null}
        {source === "savedSearch" && selectedSavedSearchId.length === 0 ? null : (
          <AlertCardForm
            value={alert}
            onChange={onAlertChange}
            projectId={projectId}
            projectSlug={projectSlug}
            errors={alertErrors}
          />
        )}
      </div>
    </Modal>
  )
}
