import type { GithubMonitorSettings } from "@domain/github"
import {
  Alert,
  Button,
  GithubIcon,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  Input,
  Modal,
  Select,
  Skeleton,
  Status,
  type StatusProps,
  Text,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { useGithubDeliveries } from "../../../../../../domains/github/github.collection.ts"
import {
  disconnectGithubIntegration,
  GITHUB_INTEGRATION_QUERY_KEY,
  GITHUB_ORG_DEFAULTS_QUERY_KEY,
  GITHUB_REPOS_QUERY_KEY,
  type GithubDefaultRepoRecord,
  type GithubDeliveryRecord,
  type GithubProjectConfigRecord,
  getActiveGithubIntegration,
  getGithubOrgDefaults,
  getGithubProjectConfig,
  listGithubInstallationRepositories,
  resetGithubProjectOverride,
  updateGithubOrgDefaults,
  upsertGithubProjectConfig,
} from "../../../../../../domains/github/github.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { GithubMonitorSettingsForm } from "./github-monitor-settings-form.tsx"
import { OrgDefaultBlastRadius, otherAffectedProjects, useOrgDefaultConfirm } from "./org-default-confirm.tsx"
import { ScopedSetting, type SettingScope } from "./scoped-setting.tsx"

const githubProjectConfigQueryKey = (projectId: string) => ["github-integration", "project-config", projectId] as const

export function GithubIntegrationManage({
  projectId,
  projectSlug,
  projectCount,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly projectCount: number
}) {
  const { data: integration, isLoading } = useQuery({
    queryKey: GITHUB_INTEGRATION_QUERY_KEY,
    queryFn: () => getActiveGithubIntegration(),
  })

  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (!integration) {
    return (
      <Alert
        variant="default"
        showIcon
        title="GitHub is not connected"
        description="Connect GitHub from the integrations page to configure it."
        cta={
          <Button asChild variant="outline">
            <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
              Back to integrations
            </Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex w-full flex-col gap-6 @[900px]:w-2/3">
        {integration.suspendedAt ? (
          <Alert
            variant="warning"
            showIcon
            title="GitHub installation suspended"
            description="The GitHub App is suspended for this account. Unsuspend it on GitHub to resume processing."
          />
        ) : null}

        <ConnectionSection
          accountLogin={integration.accountLogin}
          avatarUrl={integration.accountAvatarUrl}
          repositorySelection={integration.repositorySelection}
          installedAt={integration.installedAt}
        />

        <ProjectGithubSections projectId={projectId} projectCount={projectCount} />
      </div>
      <GithubRecentDeliveriesSection />
    </div>
  )
}

function ConnectionSection({
  accountLogin,
  avatarUrl,
  repositorySelection,
  installedAt,
}: {
  readonly accountLogin: string
  readonly avatarUrl: string | null
  readonly repositorySelection: string
  readonly installedAt: string
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <ScopedSetting
        idPrefix="github-connection"
        title="Connection"
        description="Shared by every project in your organization."
        scope={{ kind: "fixed", value: "organization" }}
      >
        <div className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-row items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon icon={GithubIcon} />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <Text.H5 weight="semibold">{accountLogin}</Text.H5>
              <Text.H6 color="foregroundMuted">
                {repositorySelection === "all" ? "All repositories" : "Selected repositories"} · Connected{" "}
                {relativeTime(new Date(installedAt))}
              </Text.H6>
            </div>
          </div>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Disconnect
          </Button>
        </div>
      </ScopedSetting>

      {confirmOpen ? <DisconnectGithubModal onClose={() => setConfirmOpen(false)} /> : null}
    </>
  )
}

function DisconnectGithubModal({ onClose }: { readonly onClose: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [disconnecting, setDisconnecting] = useState(false)

  const mutation = useMutation({ mutationFn: () => disconnectGithubIntegration() })

  const handleConfirm = async () => {
    setDisconnecting(true)
    try {
      await mutation.mutateAsync()
      await queryClient.invalidateQueries({ queryKey: GITHUB_INTEGRATION_QUERY_KEY })
      toast({ description: "GitHub disconnected" })
      onClose()
    } catch (error) {
      setDisconnecting(false)
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <Modal
      open
      dismissible
      onOpenChange={(value) => {
        if (!value && !disconnecting) onClose()
      }}
      title="Disconnect GitHub"
      description="Latitude will stop processing PR and commit events for every project in the organization. Past PRs and commits are kept for history. To fully remove access, also uninstall the app on GitHub."
      footer={
        <div className="flex flex-row items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={disconnecting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={disconnecting}
            isLoading={disconnecting}
          >
            {disconnecting ? "Disconnecting…" : "Disconnect GitHub"}
          </Button>
        </div>
      }
    />
  )
}

function ProjectGithubSections({
  projectId,
  projectCount,
}: {
  readonly projectId: string
  readonly projectCount: number
}) {
  const queryClient = useQueryClient()
  const configKey = githubProjectConfigQueryKey(projectId)
  const { data: config, isLoading } = useQuery({
    queryKey: configKey,
    queryFn: () => getGithubProjectConfig({ data: { projectId } }),
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: configKey })

  if (isLoading || !config) return <Skeleton className="h-32 w-full" />

  return (
    <>
      <RepositorySection projectId={projectId} config={config} onChanged={invalidate} />
      <MonitoringSection projectId={projectId} config={config} projectCount={projectCount} onChanged={invalidate} />
    </>
  )
}

/** The repo binding is always this project's — never inherited — so its chip is static. */
function RepositorySection({
  projectId,
  config,
  onChanged,
}: {
  readonly projectId: string
  readonly config: GithubProjectConfigRecord
  readonly onChanged: () => void
}) {
  const { toast } = useToast()
  const { data: repos, isLoading: reposLoading } = useQuery({
    queryKey: GITHUB_REPOS_QUERY_KEY,
    queryFn: () => listGithubInstallationRepositories(),
  })
  const [repoId, setRepoId] = useState<number | null>(config.repoId)
  const [branch, setBranch] = useState(config.branch ?? "")
  const [isSaving, setIsSaving] = useState(false)

  const onSelectRepo = (value: string | undefined) => {
    if (value === undefined) {
      setRepoId(null)
      setBranch("")
      return
    }
    const id = Number(value)
    setRepoId(id)
    setBranch(repos?.find((repo) => repo.id === id)?.defaultBranch ?? "")
  }

  const save = async () => {
    if (repoId === null) return
    setIsSaving(true)
    try {
      await upsertGithubProjectConfig({ data: { projectId, repoId, branch: branch.trim() } })
      onChanged()
      toast({ description: "Repository saved for this project" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  const clear = async () => {
    setIsSaving(true)
    try {
      await resetGithubProjectOverride({ data: { projectId } })
      onChanged()
      toast({ description: "This project now follows the organization repository" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ScopedSetting
      idPrefix="github-repository"
      title="Repository"
      description="Which repository and branch this project's signals live in."
      scope={{ kind: "fixed", value: "project" }}
      footer={
        config.hasOverride ? (
          <div className="flex flex-row flex-wrap items-center justify-between gap-4">
            <Text.H6 color="foregroundMuted">
              Clearing the binding also drops this project's monitoring override.
            </Text.H6>
            <Button variant="outline" onClick={() => void clear()} disabled={isSaving}>
              Follow organization repository
            </Button>
          </div>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-row flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1">
            <Select
              name="project-repository"
              label="Repository"
              placeholder={reposLoading ? "Loading repositories" : "Select a repository"}
              searchable
              removable
              contentWidth="trigger"
              loading={reposLoading}
              disabled={reposLoading}
              options={(repos ?? []).map((repo) => ({ label: repo.fullName, value: String(repo.id) }))}
              value={repoId === null ? undefined : String(repoId)}
              onChange={(value) => onSelectRepo(value == null ? undefined : String(value))}
            />
          </div>
          <div className="w-44">
            <Input
              label="Branch"
              placeholder="main"
              className="h-9"
              disabled={repoId === null}
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-row">
          <Button
            onClick={() => void save()}
            isLoading={isSaving}
            disabled={repoId === null || branch.trim().length === 0 || isSaving}
          >
            Save repository
          </Button>
        </div>
      </div>
    </ScopedSetting>
  )
}

function MonitoringSection({
  projectId,
  config,
  projectCount,
  onChanged,
}: {
  readonly projectId: string
  readonly config: GithubProjectConfigRecord
  readonly projectCount: number
  readonly onChanged: () => void
}) {
  const { toast } = useToast()
  const [editingDefault, setEditingDefault] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [stagedScope, setStagedScope] = useState<SettingScope | null>(null)

  const storedScope: SettingScope = config.hasBehaviorOverride ? "project" : "organization"
  const scope = stagedScope ?? storedScope
  // Dropping the override is the only destructive direction, so it waits for an explicit apply.
  const pendingRemoval = storedScope === "project" && scope === "organization"

  // `config.settings` is already merged, so the inherited preview needs the default on its own.
  const { data: orgDefaults } = useQuery({
    queryKey: GITHUB_ORG_DEFAULTS_QUERY_KEY,
    queryFn: () => getGithubOrgDefaults(),
  })
  const shown = scope === "organization" ? (orgDefaults?.settings ?? config.settings) : config.settings

  const applyRemoval = async () => {
    if (config.repoId === null) {
      toast({ variant: "destructive", description: "Pick a repository for this project first." })
      return
    }
    setIsSwitching(true)
    try {
      // `resetGithubProjectOverride` would delete the whole row, repo binding included.
      // Nulling the four behavior columns keeps the binding and restores inheritance.
      await upsertGithubProjectConfig({
        data: { projectId, repoId: config.repoId, branch: config.branch ?? "", overrides: null },
      })
      setStagedScope(null)
      onChanged()
      toast({ description: "This project now follows the organization" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <>
      <ScopedSetting
        idPrefix="github-monitoring"
        title="Monitoring"
        description="What Latitude watches for, and which words link or resolve a signal."
        scope={{
          kind: "selectable",
          value: scope,
          onChange: (next) => setStagedScope(next === storedScope ? null : next),
        }}
        pendingChange={
          pendingRemoval
            ? {
                description:
                  "This project will follow the organization default, and its own monitoring settings are discarded. The repository binding is kept.",
                applyLabel: "Follow organization",
                isApplying: isSwitching,
                onApply: () => void applyRemoval(),
                onDiscard: () => setStagedScope(null),
              }
            : undefined
        }
        notice={
          storedScope === "organization" && scope === "project" ? (
            <Text.H6 color="foregroundMuted">
              This project has no monitoring settings of its own yet. Saving copies these values into one, and replaces
              the whole block, so later changes to the organization default won’t reach this project.
            </Text.H6>
          ) : null
        }
        footer={
          <div className="flex flex-row flex-wrap items-center justify-between gap-4">
            <Text.H6 color="foregroundMuted">
              {config.overrideCount > 0
                ? `Organization default in effect for ${projectCount - config.overrideCount} of ${projectCount} projects · ${config.overrideCount} override it`
                : `Organization default in effect for all ${projectCount} projects`}
            </Text.H6>
            <Button variant="outline" onClick={() => setEditingDefault(true)} disabled={isSwitching}>
              Edit organization default
            </Button>
          </div>
        }
      >
        <GithubMonitorSettingsForm
          key={`${scope}:${config.repoId ?? "none"}`}
          initial={shown}
          readOnly={scope === "organization"}
          submitLabel="Save for this project"
          submitDisabled={config.repoId === null}
          onSubmit={async (settings) => {
            if (config.repoId === null) return
            await upsertGithubProjectConfig({
              data: { projectId, repoId: config.repoId, branch: config.branch ?? "", overrides: settings },
            })
            setStagedScope(null)
            onChanged()
          }}
        />
      </ScopedSetting>

      {editingDefault ? (
        <OrganizationGithubModal
          projectCount={projectCount}
          overrideCount={config.overrideCount}
          currentProjectInherits={storedScope === "organization"}
          onClose={() => setEditingDefault(false)}
        />
      ) : null}
    </>
  )
}

/** Editing the organization default from a project page, so an org-wide write interrupts. */
export function OrganizationGithubModal({
  projectCount,
  overrideCount,
  currentProjectInherits = false,
  onClose,
}: {
  readonly projectCount: number
  readonly overrideCount: number
  readonly currentProjectInherits?: boolean
  readonly onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: GITHUB_ORG_DEFAULTS_QUERY_KEY,
    queryFn: () => getGithubOrgDefaults(),
  })

  const otherAffected = otherAffectedProjects({ projectCount, overrideCount, currentProjectInherits })
  const confirm = useOrgDefaultConfirm(otherAffected)

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="GitHub organization default"
      description="The repository and monitoring behavior every project inherits unless it sets its own."
    >
      <div className="flex flex-col gap-6">
        <OrgDefaultBlastRadius
          projectCount={projectCount}
          overrideCount={overrideCount}
          otherAffected={otherAffected}
          awaitingConfirm={confirm.awaitingConfirm}
        />

        {isLoading || !data ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <GithubOrgDefaultsForm
            key={dataUpdatedAt}
            initialSettings={data.settings}
            initialRepo={data.defaultRepo}
            submitLabel={confirm.submitLabel}
            beforeSubmit={confirm.gate}
            onSaved={async () => {
              await queryClient.invalidateQueries({ queryKey: GITHUB_ORG_DEFAULTS_QUERY_KEY })
              await queryClient.invalidateQueries({ queryKey: ["github-integration", "project-config"] })
              onClose()
            }}
          />
        )}
      </div>
    </Modal>
  )
}

function GithubOrgDefaultsForm({
  initialSettings,
  initialRepo,
  submitLabel,
  beforeSubmit,
  onSaved,
}: {
  readonly initialSettings: GithubMonitorSettings
  readonly initialRepo: GithubDefaultRepoRecord | null
  readonly submitLabel: string
  readonly beforeSubmit: () => boolean
  readonly onSaved: () => void
}) {
  const { data: repos, isLoading: reposLoading } = useQuery({
    queryKey: GITHUB_REPOS_QUERY_KEY,
    queryFn: () => listGithubInstallationRepositories(),
  })
  const [repoId, setRepoId] = useState<number | null>(initialRepo?.repoId ?? null)
  const [branch, setBranch] = useState(initialRepo?.branch ?? "")

  const onSelectRepo = (value: string | undefined) => {
    if (value === undefined) {
      setRepoId(null)
      setBranch("")
      return
    }
    const id = Number(value)
    setRepoId(id)
    setBranch(repos?.find((repo) => repo.id === id)?.defaultBranch ?? "")
  }

  return (
    <GithubMonitorSettingsForm
      initial={initialSettings}
      submitLabel={submitLabel}
      beforeSubmit={beforeSubmit}
      onSubmit={async (settings) => {
        await updateGithubOrgDefaults({
          data: { ...settings, defaultRepoId: repoId, defaultBranch: repoId === null ? null : branch.trim() },
        })
        onSaved()
      }}
      extraFields={
        <div className="flex flex-row flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1">
            <Select
              name="default-repository"
              label="Repository"
              placeholder={reposLoading ? "Loading repositories" : "No default (configure per project)"}
              searchable
              removable
              contentWidth="trigger"
              loading={reposLoading}
              disabled={reposLoading}
              options={(repos ?? []).map((repo) => ({ label: repo.fullName, value: String(repo.id) }))}
              value={repoId === null ? undefined : String(repoId)}
              onChange={(value) => onSelectRepo(value == null ? undefined : String(value))}
            />
          </div>
          <div className="w-44">
            <Input
              label="Branch"
              placeholder="main"
              className="h-9"
              disabled={repoId === null}
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            />
          </div>
        </div>
      }
    />
  )
}

function deliveryStatusVariant(status: string | null): StatusProps["variant"] {
  if (status === "processed") return "success"
  if (status === "failed") return "destructive"
  if (status === "skipped") return "warning"
  return "neutral"
}

const deliveryEventLabel = (delivery: GithubDeliveryRecord): string =>
  delivery.action ? `${delivery.event} · ${delivery.action}` : delivery.event

function deliveryDetail(delivery: GithubDeliveryRecord): string {
  if (delivery.skipReason) return delivery.skipReason
  if (delivery.errorCategory) {
    return delivery.errorDetail ? `${delivery.errorCategory}: ${delivery.errorDetail}` : delivery.errorCategory
  }
  if (delivery.truncated) return "commits truncated"
  if (delivery.prNumber !== null) return `#${delivery.prNumber}`
  return "—"
}

function GithubRecentDeliveriesSection() {
  const { deliveries, isLoading, infiniteScroll } = useGithubDeliveries()
  const { data: repos } = useQuery({
    queryKey: GITHUB_REPOS_QUERY_KEY,
    queryFn: () => listGithubInstallationRepositories(),
  })
  const repoNameById = new Map((repos ?? []).map((repo) => [repo.id, repo.fullName]))

  const columns: InfiniteTableColumn<GithubDeliveryRecord>[] = [
    { key: "event", header: "Event", width: 160, minWidth: 130, render: (delivery) => deliveryEventLabel(delivery) },
    {
      key: "repository",
      header: "Repository",
      width: 200,
      minWidth: 140,
      render: (delivery) =>
        delivery.repoId === null ? "—" : (repoNameById.get(delivery.repoId) ?? `#${delivery.repoId}`),
    },
    {
      key: "status",
      header: "Status",
      width: 110,
      minWidth: 90,
      render: (delivery) => (
        <Status
          variant={deliveryStatusVariant(delivery.status)}
          label={delivery.status ?? "pending"}
          className="uppercase"
        />
      ),
    },
    {
      key: "detail",
      header: "Detail",
      width: 160,
      minWidth: 120,
      render: (delivery) => (
        <span className="block min-w-0 truncate text-muted-foreground" title={deliveryDetail(delivery)}>
          {deliveryDetail(delivery)}
        </span>
      ),
    },
    {
      key: "receivedAt",
      header: "Received",
      width: 96,
      minWidth: 90,
      align: "end",
      render: (delivery) => relativeTime(new Date(delivery.receivedAt)),
    },
  ]

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Text.H5 display="block" weight="semibold">
          Recent deliveries
        </Text.H5>
        <Text.H6 display="block" color="foregroundMuted">
          Audit log of webhook deliveries sent by GitHub we are subscribed to.
        </Text.H6>
      </div>
      <InfiniteTable
        data={deliveries}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(delivery) => delivery.id}
        infiniteScroll={infiniteScroll}
        blankSlate="No deliveries yet. GitHub webhook deliveries will appear here."
        scrollAreaLayout="intrinsic"
        className="max-h-[min(32rem,60vh)]"
      />
    </section>
  )
}
