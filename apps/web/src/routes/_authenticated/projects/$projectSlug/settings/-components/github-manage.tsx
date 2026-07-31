import type { GithubMonitorSettings } from "@domain/github"
import {
  Alert,
  Button,
  GithubIcon,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  Input,
  Select,
  Skeleton,
  Status,
  type StatusProps,
  Text,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { useGithubDeliveries } from "../../../../../../domains/github/github.collection.ts"
import {
  GITHUB_INTEGRATION_QUERY_KEY,
  GITHUB_REPOS_QUERY_KEY,
  type GithubDefaultRepoRecord,
  type GithubDeliveryRecord,
  getActiveGithubIntegration,
  getGithubOrgDefaults,
  listGithubInstallationRepositories,
  updateGithubOrgDefaults,
} from "../../../../../../domains/github/github.functions.ts"
import { GithubMonitorSettingsForm } from "./github-monitor-settings-form.tsx"

const GITHUB_ORG_DEFAULTS_QUERY_KEY = ["github-integration", "org-defaults"] as const

export function GithubIntegrationManage({ projectSlug }: { projectSlug: string }) {
  const { data: integration, isLoading } = useQuery({
    queryKey: GITHUB_INTEGRATION_QUERY_KEY,
    queryFn: () => getActiveGithubIntegration(),
  })

  if (isLoading) return <Skeleton className="h-6 w-64" />
  if (!integration) {
    return (
      <Alert
        variant="default"
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
      <div className="flex max-w-3xl flex-col gap-10">
        <ConnectionSummary
          accountLogin={integration.accountLogin}
          avatarUrl={integration.accountAvatarUrl}
          repositorySelection={integration.repositorySelection}
          suspended={integration.suspendedAt !== null}
          installedAt={integration.installedAt}
        />
        <GithubOrgDefaultsSection projectSlug={projectSlug} />
      </div>
      <GithubRecentDeliveriesSection />
    </div>
  )
}

function ConnectionSummary({
  accountLogin,
  avatarUrl,
  repositorySelection,
  suspended,
  installedAt,
}: {
  accountLogin: string
  avatarUrl: string | null
  repositorySelection: string
  suspended: boolean
  installedAt: string
}) {
  return (
    <section className="flex flex-col gap-3">
      {suspended ? (
        <Alert
          variant="warning"
          showIcon
          title="GitHub installation suspended"
          description="The GitHub App is suspended for this account. Unsuspend it on GitHub to resume processing."
        />
      ) : null}
      <div className="flex flex-row flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4">
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
      </div>
    </section>
  )
}

function GithubOrgDefaultsSection({ projectSlug }: { projectSlug: string }) {
  const queryClient = useQueryClient()
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: GITHUB_ORG_DEFAULTS_QUERY_KEY,
    queryFn: () => getGithubOrgDefaults(),
  })

  if (isLoading || !data) return null

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Text.H5 display="block" weight="semibold">
          Default settings
        </Text.H5>
        <Text.H6 display="block" color="foregroundMuted">
          These defaults apply to every project in your organization.{" "}
          <Link
            to="/projects/$projectSlug/settings/signals"
            params={{ projectSlug }}
            className="font-semibold text-foreground hover:underline"
          >
            Configure for this project only →
          </Link>
        </Text.H6>
      </div>
      <GithubOrgDefaultsForm
        key={dataUpdatedAt}
        initialSettings={data.settings}
        initialRepo={data.defaultRepo}
        onSaved={() => queryClient.invalidateQueries({ queryKey: GITHUB_ORG_DEFAULTS_QUERY_KEY })}
      />
    </section>
  )
}

function GithubOrgDefaultsForm({
  initialSettings,
  initialRepo,
  onSaved,
}: {
  initialSettings: GithubMonitorSettings
  initialRepo: GithubDefaultRepoRecord | null
  onSaved: () => void
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
      submitLabel="Save settings"
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
