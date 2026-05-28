import { Button, cn, Slider, Switch, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, useBlocker } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { updateFlaggerMutation, useProjectFlaggers } from "../../../../../domains/flaggers/flaggers.collection.ts"
import type { FlaggerRecord } from "../../../../../domains/flaggers/flaggers.functions.ts"
import {
  FLAGGER_GROUPS,
  FLAGGER_USE_CASE_PRESETS,
  type FlaggerPresetSlug,
} from "../../../../../domains/flaggers/presets.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { useRouteProject } from "../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/flaggers")({
  component: ProjectFlaggersSettingsPage,
})

interface PendingFlagger {
  readonly enabled: boolean
  readonly sampling: number
}

function ProjectFlaggersSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { toast } = useToast()
  const routeProject = useRouteProject()
  const [pending, setPending] = useState<Record<string, PendingFlagger>>({})
  const [isApplying, setIsApplying] = useState(false)

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const currentProject = project ?? routeProject
  const { data: flaggers = [], isLoading: isLoadingFlaggers } = useProjectFlaggers(currentProject.id)

  const flaggersById = useMemo(() => {
    const map = new Map<string, FlaggerRecord>()
    for (const flagger of flaggers) map.set(flagger.id, flagger)
    return map
  }, [flaggers])

  const resolved = useMemo(
    () =>
      flaggers.map((flagger) => {
        const overlay = pending[flagger.id]
        const viewEnabled = overlay?.enabled ?? flagger.enabled
        const viewSampling = overlay?.sampling ?? flagger.sampling
        const isDirty =
          overlay !== undefined && (overlay.enabled !== flagger.enabled || overlay.sampling !== flagger.sampling)
        return { ...flagger, viewEnabled, viewSampling, isDirty }
      }),
    [flaggers, pending],
  )

  const dirtyCount = resolved.reduce((acc, row) => (row.isDirty ? acc + 1 : acc), 0)
  const hasDirty = dirtyCount > 0

  const enabledSlugsResolved = useMemo(
    () => new Set(resolved.filter((row) => row.viewEnabled).map((row) => row.slug)),
    [resolved],
  )
  const activePresetId =
    FLAGGER_USE_CASE_PRESETS.find(
      (preset) =>
        preset.enabledSlugs.length === enabledSlugsResolved.size &&
        preset.enabledSlugs.every((slug) => enabledSlugsResolved.has(slug)),
    )?.id ?? null

  const setRowChange = (id: string, change: Partial<PendingFlagger>) => {
    setPending((prev) => {
      const server = flaggersById.get(id)
      if (!server) return prev
      const baseline = prev[id] ?? { enabled: server.enabled, sampling: server.sampling }
      const next: PendingFlagger = { ...baseline, ...change }
      if (next.enabled === server.enabled && next.sampling === server.sampling) {
        const { [id]: _drop, ...rest } = prev
        return rest
      }
      return { ...prev, [id]: next }
    })
  }

  const applyPreset = (presetEnabledSlugs: ReadonlyArray<FlaggerPresetSlug>) => {
    const enabledSet = new Set<string>(presetEnabledSlugs)
    setPending((prev) => {
      const next: Record<string, PendingFlagger> = {}
      for (const flagger of flaggers) {
        const desiredEnabled = enabledSet.has(flagger.slug)
        const desiredSampling = prev[flagger.id]?.sampling ?? flagger.sampling
        if (desiredEnabled !== flagger.enabled || desiredSampling !== flagger.sampling) {
          next[flagger.id] = { enabled: desiredEnabled, sampling: desiredSampling }
        }
      }
      return next
    })
  }

  const discard = () => setPending({})

  const apply = async () => {
    if (!hasDirty || isApplying) return
    setIsApplying(true)
    try {
      const entries = Object.entries(pending)
      const transactions = entries
        .map(([id, overlay]) => {
          const flagger = flaggersById.get(id)
          if (!flagger) return null
          return updateFlaggerMutation({
            projectId: currentProject.id,
            id,
            slug: flagger.slug,
            enabled: overlay.enabled,
            sampling: overlay.sampling,
          })
        })
        .filter((t): t is NonNullable<typeof t> => t !== null)

      await Promise.all(transactions.map((t) => t.isPersisted.promise))
      setPending({})
      toast({
        description: `Updated ${entries.length} flagger${entries.length === 1 ? "" : "s"}`,
      })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsApplying(false)
    }
  }

  const applyRef = useRef(apply)
  applyRef.current = apply
  const isApplyingRef = useRef(isApplying)
  isApplyingRef.current = isApplying

  useEffect(() => {
    if (!hasDirty) return
    const handler = (event: KeyboardEvent) => {
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
  }, [hasDirty])

  useBlocker({
    shouldBlockFn: () => {
      if (!hasDirty) return false
      return !window.confirm("You have unsaved flagger changes. Leave anyway?")
    },
    enableBeforeUnload: () => hasDirty,
    disabled: !hasDirty,
  })

  const [targetFlaggerSlug] = useParamState("flagger", "")
  const hasScrolledToTargetRef = useRef(false)
  const scrollTargetRef = (node: HTMLDivElement | null) => {
    if (node && !hasScrolledToTargetRef.current) {
      hasScrolledToTargetRef.current = true
      node.scrollIntoView({ block: "center", behavior: "smooth" })
    }
  }

  const dirtyActions = hasDirty ? (
    <div className="flex flex-row items-center gap-3">
      <Text.H5 color="foregroundMuted">
        {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
      </Text.H5>
      <Button variant="outline" onClick={discard} disabled={isApplying}>
        Discard
      </Button>
      <Button onClick={() => void apply()} isLoading={isApplying}>
        Apply
      </Button>
    </div>
  ) : null

  return (
    <SettingsPage
      title="Flaggers"
      description="Flaggers automatically inspect new traces for known failure patterns and create issues when they detect regressions"
      actions={dirtyActions}
      headerSticky={hasDirty}
    >
      <div className="flex w-full max-w-2xl flex-col gap-8">
        {isLoadingFlaggers ? null : flaggers.length === 0 ? (
          <Text.H5 color="foregroundMuted">No flaggers have been provisioned for this project yet</Text.H5>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Text.H6 color="foregroundMuted">Apply a use-case preset</Text.H6>
              <div className="flex flex-row flex-wrap gap-2">
                {FLAGGER_USE_CASE_PRESETS.map((preset) => {
                  const isActive = activePresetId === preset.id
                  return (
                    <Button
                      key={preset.id}
                      variant={isActive ? "default-soft" : "outline"}
                      size="sm"
                      aria-pressed={isActive}
                      onClick={() => applyPreset(preset.enabledSlugs)}
                      title={preset.description}
                    >
                      {preset.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-8">
              {FLAGGER_GROUPS.map((group) => {
                const groupRows = group.slugs
                  .map((slug) => resolved.find((row) => row.slug === slug))
                  .filter((row): row is NonNullable<typeof row> => row !== undefined)
                if (groupRows.length === 0) return null
                return (
                  <div key={group.id} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <Text.H4M>{group.label}</Text.H4M>
                      <Text.H5 color="foregroundMuted">{group.description}</Text.H5>
                    </div>
                    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                      {groupRows.map((row) => {
                        const isTarget = targetFlaggerSlug !== "" && row.slug === targetFlaggerSlug
                        const isDeterministic = row.mode === "deterministic"
                        return (
                          <div
                            key={row.id}
                            ref={isTarget ? scrollTargetRef : undefined}
                            className={cn("flex flex-col gap-3 border-l-2 border-transparent px-4 py-4", {
                              "border-primary bg-primary-muted/20": isTarget,
                            })}
                          >
                            <div className="flex flex-row items-start justify-between gap-4">
                              <div className="flex min-w-0 flex-col gap-1">
                                <div className="flex flex-row items-center gap-2">
                                  <Text.H5M>{row.name}</Text.H5M>
                                  {row.isDirty ? (
                                    <span
                                      role="img"
                                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                                      aria-label="Unsaved changes"
                                      title="Unsaved changes"
                                    />
                                  ) : null}
                                </div>
                                <Text.H6 color="foregroundMuted">{row.description}</Text.H6>
                              </div>
                              <div className="shrink-0">
                                <Switch
                                  checked={row.viewEnabled}
                                  onCheckedChange={(checked) => setRowChange(row.id, { enabled: checked })}
                                  aria-label={`${row.viewEnabled ? "Disable" : "Enable"} ${row.name}`}
                                />
                              </div>
                            </div>
                            {isDeterministic ? (
                              <Text.H6 color="foregroundMuted">Free · Runs on 100% of eligible traces</Text.H6>
                            ) : (
                              <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2">
                                <div className="flex flex-row items-center gap-3">
                                  <div className="w-48">
                                    <Slider
                                      min={0}
                                      max={100}
                                      step={1}
                                      value={[row.viewSampling]}
                                      onValueChange={(values) => setRowChange(row.id, { sampling: values[0] ?? 0 })}
                                      disabled={!row.viewEnabled}
                                      aria-label={`Sampling rate for ${row.name}`}
                                    />
                                  </div>
                                  <Text.H5 className="w-10 tabular-nums">{row.viewSampling}%</Text.H5>
                                </div>
                                <Text.H6 color="foregroundMuted">
                                  30 credits per scan · runs on {row.viewSampling}% of eligible traces
                                </Text.H6>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </SettingsPage>
  )
}
