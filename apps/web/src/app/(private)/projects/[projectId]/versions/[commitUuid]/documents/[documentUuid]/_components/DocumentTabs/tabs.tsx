'use client'

import { TabSelector } from '$/components/TabSelector'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import useFeature from '$/stores/useFeature'
import { TabSelectorOption } from '@latitude-data/web-ui/molecules/TabSelector'
import { useSearchParams, useSelectedLayoutSegment } from 'next/navigation'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'

export type TabValue = DocumentRoutes | 'preview'

export const DocumentTabSelector = memo(
  ({
    selectedTab: controlledSelectedTab,
    onSelectTab,
    projectId,
    commitUuid,
    documentUuid,
    onPreviewToggle,
  }: {
    selectedTab?: TabValue
    onSelectTab?: (tab: TabValue) => void
    documentUuid: string
    projectId: string
    commitUuid: string
    onPreviewToggle?: (showPreview: boolean) => void
  }) => {
    const selectedSegment = useSelectedLayoutSegment() as DocumentRoutes | null
    const searchParams = useSearchParams()

    // --- Internal fallback state (uncontrolled mode) ---
    const [internalTab, setInternalTab] = useState<TabValue>(
      controlledSelectedTab ?? selectedSegment ?? DocumentRoutes.editor,
    )

    // --- Controlled-or-uncontrolled unified logic ---
    const selectedTab = controlledSelectedTab ?? internalTab
    const setSelectedTab = onSelectTab ?? setInternalTab

    // --- Sync internal state with route segment (uncontrolled mode only) ---
    useEffect(() => {
      // Only sync when in uncontrolled mode
      if (controlledSelectedTab !== undefined) return

      const showPreview = searchParams.get('showPreview') === 'true'

      // Handle preview state from URL
      if (showPreview && selectedSegment === DocumentRoutes.editor) {
        setInternalTab('preview')
        return
      }

      // Sync with route segment
      if (selectedSegment) {
        setInternalTab(selectedSegment)
      } else if (!showPreview) {
        // Default to editor if no segment and not in preview
        setInternalTab(DocumentRoutes.editor)
      }
    }, [selectedSegment, searchParams, controlledSelectedTab])

    const baseRoute = useMemo(() => {
      return ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid })
    }, [projectId, commitUuid, documentUuid])

    const { isEnabled: optimizationsEnabled } = useFeature('optimizations')

    // --- Tabs definition ---
    const data = useMemo(() => {
      const tabs = {
        [DocumentRoutes.editor]: {
          label: 'Editor',
          value: DocumentRoutes.editor,
          route: baseRoute.root,
        },
        preview: {
          label: 'Preview',
          value: 'preview' as const,
          route: undefined,
        },
        [DocumentRoutes.evaluations]: {
          label: 'Evaluations',
          value: DocumentRoutes.evaluations,
          route: baseRoute.evaluations.root,
        },
        [DocumentRoutes.experiments]: {
          label: 'Experiments',
          value: DocumentRoutes.experiments,
          route: baseRoute.experiments.root,
        },
        [DocumentRoutes.logs]: {
          label: 'Logs',
          value: DocumentRoutes.logs,
          route: baseRoute.logs.root,
        },
        [DocumentRoutes.traces]: {
          label: 'Traces',
          value: DocumentRoutes.traces,
          route: baseRoute.traces.root,
        },
        [DocumentRoutes.optimizations]: {
          label: 'Optimizations',
          value: DocumentRoutes.optimizations,
          route: baseRoute.optimizations.root(),
        },
      } satisfies Record<TabValue, TabSelectorOption<TabValue>>

      return {
        tabs,
        options: [
          [tabs[DocumentRoutes.editor], tabs.preview],
          tabs[DocumentRoutes.evaluations],
          tabs[DocumentRoutes.experiments],
          tabs[DocumentRoutes.traces],
          ...(optimizationsEnabled ? [tabs[DocumentRoutes.optimizations]] : []),
        ],
      }
    }, [baseRoute, optimizationsEnabled])

    const setPreviewState = useCallback(
      (showPreview: boolean) => {
        onPreviewToggle?.(showPreview)

        // If true, add "showPreview=true" to the URL
        // If false, remove "showPreview" from the URL params
        const url = new URL(window.location.href)

        // If URL is not baseRoute.root (is not currently in editor), there is no need to update the URL
        if (url.pathname !== baseRoute.root) return

        if (showPreview) {
          url.searchParams.set('showPreview', 'true')
        } else {
          url.searchParams.delete('showPreview')
        }
        const newUrl = `${url.pathname}?${url.searchParams.toString()}`
        window.history.replaceState({}, '', newUrl)
      },
      [onPreviewToggle, baseRoute.root],
    )

    // --- Click handler ---
    const onClickTab = useCallback(
      (value: TabValue) => {
        setSelectedTab(value)

        if (value === 'preview') setPreviewState(true)
        if (value === DocumentRoutes.editor) setPreviewState(false)
      },
      [setPreviewState, setSelectedTab],
    )

    return (
      <TabSelector<TabValue>
        options={data.options}
        selected={selectedTab ?? DocumentRoutes.editor}
        onSelect={onClickTab}
      />
    )
  },
)
