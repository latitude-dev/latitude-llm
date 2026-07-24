import { Button, Input, Select, Skeleton, Text, useToast } from "@repo/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  type GithubProjectConfigRecord,
  getActiveGithubIntegration,
  getGithubProjectConfig,
  listGithubInstallationRepositories,
  resetGithubProjectOverride,
  upsertGithubProjectConfig,
} from "../../../../../../domains/github/github.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { GITHUB_INTEGRATION_QUERY_KEY, GITHUB_REPOS_QUERY_KEY } from "./github-integration-section.tsx"
import { GithubMonitorSettingsForm } from "./github-monitor-settings-form.tsx"

const githubProjectConfigQueryKey = (projectId: string) => ["github-integration", "project-config", projectId] as const

/**
 * Per-project GitHub override, rendered on the project's signals settings page
 * next to the agent-dispatch overrides (the cursor precedent). A project either
 * inherits the org default or sets its own single repo/branch + behavior.
 * Hidden unless the org has GitHub connected.
 */
export function GithubProjectSyncSettings({ projectId }: { readonly projectId: string }) {
  const queryClient = useQueryClient()
  const { data: integration, isLoading: integrationLoading } = useQuery({
    queryKey: GITHUB_INTEGRATION_QUERY_KEY,
    queryFn: () => getActiveGithubIntegration(),
  })
  const configKey = githubProjectConfigQueryKey(projectId)
  const {
    data: config,
    isLoading: configLoading,
    dataUpdatedAt,
  } = useQuery({
    queryKey: configKey,
    queryFn: () => getGithubProjectConfig({ data: { projectId } }),
    enabled: integration != null,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: configKey })

  if (integrationLoading) return <Skeleton className="h-32 w-full" />
  if (!integration) return null
  if (configLoading || !config) return <Skeleton className="h-32 w-full" />

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Text.H5 display="block" weight="semibold">
          GitHub
        </Text.H5>
        <Text.H6 display="block" color="foregroundMuted">
          Point this project at the repository and branch its signals live in, or let it inherit the organization
          default.
        </Text.H6>
      </div>
      <GithubProjectOverride key={dataUpdatedAt} projectId={projectId} config={config} onChanged={invalidate} />
    </div>
  )
}

function GithubProjectOverride({
  projectId,
  config,
  onChanged,
}: {
  projectId: string
  config: GithubProjectConfigRecord
  onChanged: () => void
}) {
  const { toast } = useToast()
  const { data: repos, isLoading: reposLoading } = useQuery({
    queryKey: GITHUB_REPOS_QUERY_KEY,
    queryFn: () => listGithubInstallationRepositories(),
  })
  const [editing, setEditing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [repoId, setRepoId] = useState<number | null>(config.repoId)
  const [branch, setBranch] = useState(config.branch ?? "")

  const showForm = config.hasOverride || editing

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

  const reset = async () => {
    setResetting(true)
    try {
      await resetGithubProjectOverride({ data: { projectId } })
      toast({ description: "Reset to organization defaults" })
      onChanged()
    } catch (error) {
      setResetting(false)
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-muted/30 p-4">
      {showForm ? (
        <GithubMonitorSettingsForm
          initial={config.settings}
          submitLabel={config.hasOverride ? "Save override" : "Save for this project"}
          submitDisabled={repoId === null || branch.trim().length === 0}
          onSubmit={async (settings) => {
            if (repoId === null) return
            await upsertGithubProjectConfig({
              data: { projectId, repoId, branch: branch.trim(), overrides: settings },
            })
            setEditing(false)
            onChanged()
          }}
          extraFields={
            <div className="flex flex-row flex-wrap items-end gap-2">
              <div className="min-w-[16rem] flex-1">
                <Select
                  name="project-repository"
                  label={<span className="font-semibold">Repository</span>}
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
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                />
              </div>
            </div>
          }
          extraActions={
            config.hasOverride ? (
              <Button variant="outline" onClick={() => void reset()} isLoading={resetting}>
                Reset to organization defaults
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <Text.H6 color="foregroundMuted">
            {config.repoFullName
              ? `Watches ${config.repoFullName} (${config.branch}) with the organization's rules.`
              : "No organization default repository is set yet — configure one for this project, or set an org default."}
          </Text.H6>
          <div>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Override for this project
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
