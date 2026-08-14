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
import { useState } from "react"
import { useGithubDeliveries } from "../../../../../../domains/github/github.collection.ts"
import {
  disconnectGithubIntegration,
  GITHUB_INTEGRATION_QUERY_KEY,
  GITHUB_ORG_DEFAULTS_QUERY_KEY,
  GITHUB_REPOS_QUERY_KEY,
  type GithubDeliveryRecord,
  type GithubOrgDefaultsRecord,
  getActiveGithubIntegration,
  getGithubOrgDefaults,
  listGithubInstallationRepositories,
  updateGithubOrgDefaults,
} from "../../../../../../domains/github/github.functions.ts"
import { integrationEntry } from "../../../../../../domains/integrations/integration-catalog.ts"
import { useIsOrganizationOwner } from "../../../../../../domains/members/members.collection.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { useAuthenticatedUser } from "../../../../-route-data.ts"
import { GithubMonitorSettingsForm } from "./github-monitor-settings-form.tsx"
import { IntegrationNotConnected } from "./integration-detail-header.tsx"
import { IntegrationDocsFooter } from "./integration-docs.tsx"
import { otherAffectedProjects } from "./org-default-confirm.tsx"
import { OrgDefaultConfirmModal, useOrgDefaultConfirm } from "./org-default-confirm-modal.tsx"
import { SettingsCard } from "./settings-card.tsx"

/** The organization's GitHub App install and the repository/monitoring defaults projects inherit. */
export function GithubOrgSettings({
  projectSlug,
  projectCount,
}: {
  readonly projectSlug: string
  readonly projectCount: number
}) {
  const { data: integration, isLoading } = useQuery({
    queryKey: GITHUB_INTEGRATION_QUERY_KEY,
    queryFn: () => getActiveGithubIntegration(),
  })

  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (!integration) return <IntegrationNotConnected entry={integrationEntry("github")} projectSlug={projectSlug} />

  return (
    <div className="flex flex-col gap-10">
      <div className="flex w-full flex-col gap-6">
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

        <OrgDefaultsSections projectCount={projectCount} />
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
      <SettingsCard
        title="Connection"
        description="Shared by every project in your organization."
        actions={
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Disconnect
          </Button>
        }
        footer={<IntegrationDocsFooter integration="github" />}
      >
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
      </SettingsCard>

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

/** Mirrors the project page's Repository + Monitoring split; one row backs both, so each save resends the other half. */
function OrgDefaultsSections({ projectCount }: { readonly projectCount: number }) {
  const user = useAuthenticatedUser()
  const isOwner = useIsOrganizationOwner(user.id)
  const { data, isLoading } = useQuery({
    queryKey: GITHUB_ORG_DEFAULTS_QUERY_KEY,
    queryFn: () => getGithubOrgDefaults(),
  })

  if (isLoading || !data) return <Skeleton className="h-32 w-full" />

  return (
    <>
      <OrgRepositorySection defaults={data} projectCount={projectCount} canEdit={isOwner} />
      <OrgMonitoringSection defaults={data} projectCount={projectCount} canEdit={isOwner} />
    </>
  )
}

const ownerNotice = (canEdit: boolean) =>
  canEdit ? null : <Text.H6 color="foregroundMuted">Only organization owners can change this default.</Text.H6>

const inEffectFor = (projectCount: number, overrideCount: number): string =>
  overrideCount > 0
    ? `In effect for ${projectCount - overrideCount} of ${projectCount} projects · ${overrideCount} override it`
    : `In effect for all ${projectCount} projects`

function useOrgDefaultsSave() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return async (description: string) => {
    await queryClient.invalidateQueries({ queryKey: GITHUB_ORG_DEFAULTS_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: ["github-integration", "project-config"] })
    toast({ description })
  }
}

function OrgRepositorySection({
  defaults,
  projectCount,
  canEdit,
}: {
  readonly defaults: GithubOrgDefaultsRecord
  readonly projectCount: number
  readonly canEdit: boolean
}) {
  const { toast } = useToast()
  const onSaved = useOrgDefaultsSave()
  const { data: repos, isLoading: reposLoading } = useQuery({
    queryKey: GITHUB_REPOS_QUERY_KEY,
    queryFn: () => listGithubInstallationRepositories(),
  })
  const [repoId, setRepoId] = useState<number | null>(defaults.defaultRepo?.repoId ?? null)
  const [branch, setBranch] = useState(defaults.defaultRepo?.branch ?? "")

  const overrideCount = defaults.repoOverrideCount
  const confirm = useOrgDefaultConfirm(otherAffectedProjects({ projectCount, overrideCount }))
  const isDirty =
    repoId !== (defaults.defaultRepo?.repoId ?? null) || branch.trim() !== (defaults.defaultRepo?.branch ?? "")

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

  const save = () =>
    confirm.request(async () => {
      try {
        await updateGithubOrgDefaults({
          data: {
            ...defaults.settings,
            defaultRepoId: repoId,
            defaultBranch: repoId === null ? null : branch.trim(),
          },
        })
        await onSaved("Organization repository updated")
      } catch (error) {
        toast({ variant: "destructive", description: toUserMessage(error) })
      }
    })

  return (
    <SettingsCard
      title="Watching"
      description="Which repository and branch projects use unless they bind their own."
      notice={ownerNotice(canEdit)}
      footer={<Text.H6 color="foregroundMuted">{inEffectFor(projectCount, overrideCount)}</Text.H6>}
    >
      <div className="flex flex-col gap-4">
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
              disabled={!canEdit || reposLoading}
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
              disabled={!canEdit || repoId === null}
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            />
          </div>
        </div>
        {canEdit && isDirty ? (
          <div className="flex flex-row">
            <Button onClick={() => void save()} disabled={confirm.isApplying}>
              Save default
            </Button>
          </div>
        ) : null}
      </div>

      {confirm.isOpen ? (
        <OrgDefaultConfirmModal
          projectCount={projectCount}
          overrideCount={overrideCount}
          isApplying={confirm.isApplying}
          onConfirm={confirm.confirm}
          onCancel={confirm.cancel}
        />
      ) : null}
    </SettingsCard>
  )
}

function OrgMonitoringSection({
  defaults,
  projectCount,
  canEdit,
}: {
  readonly defaults: GithubOrgDefaultsRecord
  readonly projectCount: number
  readonly canEdit: boolean
}) {
  const onSaved = useOrgDefaultsSave()
  const overrideCount = defaults.overrideCount
  const confirm = useOrgDefaultConfirm(otherAffectedProjects({ projectCount, overrideCount }))

  return (
    <SettingsCard
      title="Monitoring"
      description="What Latitude watches for, and which words link or resolve a signal."
      notice={ownerNotice(canEdit)}
      footer={<Text.H6 color="foregroundMuted">{inEffectFor(projectCount, overrideCount)}</Text.H6>}
    >
      <GithubMonitorSettingsForm
        key={`${defaults.integrationId}:${JSON.stringify(defaults.settings)}`}
        initial={defaults.settings}
        readOnly={!canEdit}
        submitLabel="Save default"
        onSubmit={(settings) =>
          confirm.request(async () => {
            await updateGithubOrgDefaults({
              data: {
                ...settings,
                defaultRepoId: defaults.defaultRepo?.repoId ?? null,
                defaultBranch: defaults.defaultRepo?.branch ?? null,
              },
            })
            await onSaved("Organization monitoring updated")
          })
        }
      />

      {confirm.isOpen ? (
        <OrgDefaultConfirmModal
          projectCount={projectCount}
          overrideCount={overrideCount}
          isApplying={confirm.isApplying}
          onConfirm={confirm.confirm}
          onCancel={confirm.cancel}
        />
      ) : null}
    </SettingsCard>
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
