import { Alert, Button, GithubIcon, Icon, Modal, Text, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Plus, Settings, Trash2 } from "lucide-react"
import { useState } from "react"
import {
  disconnectGithubIntegration,
  type GithubIntegrationRecord,
  getActiveGithubIntegration,
  isGithubIntegrationConfigured,
} from "../../../../../../domains/github/github.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { IntegrationCard } from "./integration-card.tsx"

export const GITHUB_INTEGRATION_QUERY_KEY = ["github-integration"] as const
export const GITHUB_REPOS_QUERY_KEY = ["github-integration", "repos"] as const
const GITHUB_CONFIGURED_QUERY_KEY = ["github-integration", "configured"] as const

export function GithubIntegrationSection({ projectSlug }: { projectSlug: string }) {
  const { data: configured } = useQuery({
    queryKey: GITHUB_CONFIGURED_QUERY_KEY,
    queryFn: () => isGithubIntegrationConfigured(),
  })

  const { data, isLoading } = useQuery({
    queryKey: GITHUB_INTEGRATION_QUERY_KEY,
    queryFn: () => getActiveGithubIntegration(),
    enabled: configured === true,
  })

  const [disconnectOpen, setDisconnectOpen] = useState(false)

  if (configured !== true) return null
  if (isLoading) return null

  return (
    <>
      {data ? (
        <ConnectedGithubCard
          integration={data}
          projectSlug={projectSlug}
          onDisconnect={() => setDisconnectOpen(true)}
        />
      ) : (
        <DisconnectedGithubCard />
      )}
      {data ? <DisconnectGithubModal open={disconnectOpen} onClose={() => setDisconnectOpen(false)} /> : null}
    </>
  )
}

function DisconnectedGithubCard() {
  return (
    <IntegrationCard
      icon={GithubIcon}
      title="GitHub"
      subtitle="Auto-resolve signals when a related PR or commit is merged."
      actions={
        // `/integrations/github/install` is a server-handler-only route that
        // 302s to GitHub — needs a full-page GET, not client-side routing.
        <Button asChild>
          <a href="/integrations/github/install">
            <Icon icon={Plus} size="sm" />
            Connect
          </a>
        </Button>
      }
    />
  )
}

function ConnectedGithubCard({
  integration,
  projectSlug,
  onDisconnect,
}: {
  integration: GithubIntegrationRecord
  projectSlug: string
  onDisconnect: () => void
}) {
  return (
    <div className="rounded-lg border border-border">
      {integration.suspendedAt && (
        <div className="border-b border-border p-4">
          <Alert
            variant="warning"
            showIcon
            title="GitHub installation suspended"
            description="The GitHub App is suspended for this account. Unsuspend it on GitHub to resume processing."
          />
        </div>
      )}

      <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
        <div className="flex min-w-0 flex-row items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon icon={GithubIcon} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text.H5 weight="semibold">{integration.accountLogin}</Text.H5>
            <Text.H6 color="foregroundMuted">
              {integration.repositorySelection === "all" ? "All repositories" : "Selected repositories"} · Connected{" "}
              {relativeTime(new Date(integration.installedAt))}
            </Text.H6>
          </div>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/projects/$projectSlug/settings/integrations/github" params={{ projectSlug }}>
              <Icon icon={Settings} size="sm" />
              Manage
            </Link>
          </Button>
          <Button variant="destructive" onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      </div>
    </div>
  )
}

function DisconnectGithubModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      open={open}
      onOpenChange={(value) => {
        if (!value && !disconnecting) onClose()
      }}
      title="Disconnect GitHub"
      description="Latitude will stop processing PR and commit events. Past PRs and commits are kept for history. To fully remove access, also uninstall the app on GitHub."
      dismissible
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
            <Trash2 className="h-4 w-4" />
            {disconnecting ? "Disconnecting…" : "Disconnect GitHub"}
          </Button>
        </div>
      }
    />
  )
}
