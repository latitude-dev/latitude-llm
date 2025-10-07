'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import {
  TabSelector,
  TabSelectorOption,
} from '@latitude-data/web-ui/molecules/TabSelector'
import { useSelectedLayoutSegment } from 'next/navigation'
import { memo, useCallback, useMemo, useState } from 'react'

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

    // --- Internal fallback state (uncontrolled mode) ---
    const [internalTab, setInternalTab] = useState<TabValue>(
      controlledSelectedTab ?? selectedSegment ?? DocumentRoutes.editor,
    )

    // --- Controlled-or-uncontrolled unified logic ---
    const selectedTab = controlledSelectedTab ?? internalTab
    const setSelectedTab = onSelectTab ?? setInternalTab

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
      } satisfies Record<TabValue, TabSelectorOption<TabValue>>

      return {
        tabs,
        options: [
          [tabs[DocumentRoutes.editor], tabs.preview],
          tabs[DocumentRoutes.evaluations],
          tabs[DocumentRoutes.experiments],
          tabs[DocumentRoutes.logs],
        ],
      }
    }, [projectId, commitUuid, documentUuid])

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
