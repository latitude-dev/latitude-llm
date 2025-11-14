'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import {
  TabSelector,
  TabSelectorOption,
} from '@latitude-data/web-ui/molecules/TabSelector'
import { useSelectedLayoutSegment, useSearchParams } from 'next/navigation'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import useFeature from '$/stores/useFeature'

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
    const router = useNavigate()
    const selectedSegment = useSelectedLayoutSegment() as DocumentRoutes | null
    const searchParams = useSearchParams()
    const { isEnabled: isTracesEnabled } = useFeature('traces')

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

    // --- Tabs definition ---
    const data = useMemo(() => {
      const baseRoute = ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid })

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
      } satisfies Record<TabValue, TabSelectorOption<TabValue>>

      return {
        tabs,
        options: [
          [tabs[DocumentRoutes.editor], tabs.preview],
          tabs[DocumentRoutes.evaluations],
          tabs[DocumentRoutes.experiments],
          ...(isTracesEnabled
            ? [tabs[DocumentRoutes.traces]]
            : [tabs[DocumentRoutes.logs]]),
        ],
      }
    }, [projectId, commitUuid, documentUuid, isTracesEnabled])

    // --- Click handler ---
    const onClickTab = useCallback(
      (value: TabValue) => {
        if (value === selectedTab) return

        const tab = data.tabs[value]
        const route = tab.route
        const goingBackToEditor = value === DocumentRoutes.editor

        if (value === 'preview') {
          // Switch to preview mode (either via navigation or toggle)
          if (selectedTab !== DocumentRoutes.editor) {
            const editorRoute = data.tabs[DocumentRoutes.editor].route
            router.push(`${editorRoute}?showPreview=true`)
          } else {
            onPreviewToggle?.(true)
          }
          setSelectedTab(value)
          return
        }

        if (goingBackToEditor && selectedTab === 'preview') {
          // Going back from preview to editor
          onPreviewToggle?.(false)
          setSelectedTab(value)
          return
        }

        // Other tabs (evaluations, experiments, logs)
        setSelectedTab(value)
        if (route) router.push(route)
      },
      [data, router, onPreviewToggle, selectedTab, setSelectedTab],
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
