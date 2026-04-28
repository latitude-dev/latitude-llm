import {
  DetailSection,
  InfiniteTable,
  type InfiniteTableColumn,
  Input,
  Label,
  Switch,
  Text,
  Tooltip,
  useToast,
} from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { FolderIcon, ScanSearchIcon, ShieldAlertIcon } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import {
  updateFlaggerMutation,
  useProjectFlaggers,
} from "../../../../domains/annotation-queues/annotation-queues.collection.ts"
import type { FlaggerRecord } from "../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { updateProjectMutation, useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../lib/errors.ts"
import { useRouteProject } from "./-route-data.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings")({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { toast } = useToast()
  const routeProject = useRouteProject()
  const [isSavingKeepMonitoring, setIsSavingKeepMonitoring] = useState(false)
  const [savingFlaggerSlug, setSavingFlaggerSlug] = useState<string | null>(null)
  const renameDebounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const currentProject = project ?? routeProject
  const { data: flaggers = [], isLoading: isLoadingFlaggers } = useProjectFlaggers(currentProject.id)

  const flaggerColumns: InfiniteTableColumn<FlaggerRecord>[] = [
    {
      key: "flagger",
      header: "Title",
      width: 260,
      minWidth: 220,
      render: (flagger) => (
        <Text.H5 className="min-w-0" weight="medium" noWrap ellipsis>
          {flagger.name}
        </Text.H5>
      ),
    },
    {
      key: "description",
      header: "Description",
      width: 520,
      minWidth: 320,
      render: (flagger) => (
        <Tooltip
          asChild
          trigger={
            <span className="block min-w-0 truncate">
              <Text.H6 color="foregroundMuted" noWrap ellipsis>
                {flagger.description}
              </Text.H6>
            </span>
          }
        >
          <div className="flex max-w-md flex-col gap-2">
            <Text.H5 weight="medium">{flagger.description}</Text.H5>
            <Text.H6 color="foregroundMuted">{flagger.instructions}</Text.H6>
          </div>
        </Tooltip>
      ),
    },
    {
      key: "enabled",
      header: "Enabled",
      width: 92,
      minWidth: 84,
      align: "end",
      render: (flagger) => (
        <Switch
          checked={flagger.enabled}
          loading={savingFlaggerSlug === flagger.slug}
          disabled={savingFlaggerSlug !== null && savingFlaggerSlug !== flagger.slug}
          onCheckedChange={(checked) => void handleFlaggerEnabledChange(flagger, checked)}
          aria-label={`Toggle ${flagger.name}`}
        />
      ),
    },
  ]

  const handleProjectRename = useCallback(
    (name: string) => {
      if (renameDebounceRef.current) clearTimeout(renameDebounceRef.current)

      renameDebounceRef.current = setTimeout(() => {
        const trimmedName = name.trim()
        if (!trimmedName || trimmedName === currentProject.name) return

        const transaction = updateProjectMutation(currentProject.id, { name: trimmedName })
        void transaction.isPersisted.promise
          .then(() => {
            toast({ description: "Project name updated" })
          })
          .catch((error) => {
            toast({ variant: "destructive", description: toUserMessage(error) })
          })
      }, 600)
    },
    [currentProject.id, currentProject.name, toast],
  )

  const handleKeepMonitoringChange = async (checked: boolean) => {
    if (isSavingKeepMonitoring) return

    setIsSavingKeepMonitoring(true)
    try {
      const transaction = updateProjectMutation(currentProject.id, {
        settings: { ...currentProject.settings, keepMonitoring: checked },
      })
      await transaction.isPersisted.promise
      toast({ description: "Monitoring preference updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSavingKeepMonitoring(false)
    }
  }

  const handleFlaggerEnabledChange = async (flagger: FlaggerRecord, checked: boolean) => {
    if (savingFlaggerSlug) return

    setSavingFlaggerSlug(flagger.slug)
    try {
      const transaction = updateFlaggerMutation({
        projectId: currentProject.id,
        id: flagger.id,
        slug: flagger.slug,
        enabled: checked,
      })
      await transaction.isPersisted.promise
      toast({ description: checked ? "Flagger enabled" : "Flagger disabled" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setSavingFlaggerSlug(null)
    }
  }

  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem>
              <Text.H4 weight="bold">Settings</Text.H4>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <Layout.List className="pt-2 gap-6">
          <DetailSection
            icon={<FolderIcon className="w-4 h-4" />}
            label="Project"
            contentClassName="max-h-none overflow-visible pl-1 pr-2 pt-2"
          >
            <Input
              key={currentProject.id}
              required
              type="text"
              label="Name"
              defaultValue={currentProject.name}
              onChange={(event) => handleProjectRename(event.target.value)}
              placeholder="Project name"
              aria-label="Project name"
            />
          </DetailSection>
          <DetailSection
            icon={<ShieldAlertIcon className="w-4 h-4" />}
            label="Issues"
            contentClassName="max-h-none overflow-visible px-2 pt-2"
          >
            <div className="flex w-full flex-row items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="keep-monitoring">Monitor resolved issues</Label>
                <Text.H6 color="foregroundMuted">
                  When enabled, evaluations monitoring active issues stay active after the issues are resolved to detect
                  further regressions
                </Text.H6>
              </div>
              <Switch
                id="keep-monitoring"
                checked={currentProject.settings.keepMonitoring ?? true}
                loading={isSavingKeepMonitoring}
                onCheckedChange={(checked) => void handleKeepMonitoringChange(checked)}
              />
            </div>
          </DetailSection>
          <DetailSection
            icon={<ScanSearchIcon className="w-4 h-4" />}
            label="Flaggers"
            contentClassName="max-h-none overflow-visible px-2 pt-2"
          >
            <div className="flex w-full flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label>Flaggers</Label>
                <Text.H6 color="foregroundMuted">
                  Flaggers automatically inspect new traces for known failure patterns and create issues when they
                  detect regressions. Enable only the checks that matter for this project.
                </Text.H6>
              </div>
              <InfiniteTable
                data={flaggers}
                isLoading={isLoadingFlaggers}
                columns={flaggerColumns}
                getRowKey={(flagger) => flagger.id}
                blankSlate="No flaggers have been provisioned for this project yet"
                scrollAreaLayout="intrinsic"
              />
            </div>
          </DetailSection>
        </Layout.List>
      </Layout.Content>
    </Layout>
  )
}
