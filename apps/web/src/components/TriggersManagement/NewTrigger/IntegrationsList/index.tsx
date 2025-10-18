import {
  SearchableList,
  Option as SearchableOption,
  OptionItem as SearchableOptionItem,
  OptionGroup as SearchableOptionGroup,
  type OnSelectValue,
} from '@latitude-data/web-ui/molecules/SearchableList'
import usePipedreamApps from '$/stores/pipedreamApps'
import { useCallback, useMemo, useState } from 'react'
import useIntegrations from '$/stores/integrations'
import { useDebouncedCallback } from 'use-debounce'
import { DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { SelectedIntegration } from '../../types'
import { buildIntegrationOption, type GroupedIntegration } from './utils'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/schema/models/types/Integration'

export const ICONS_BY_TRIGGER: Partial<Record<DocumentTriggerType, IconName>> =
  {
    [DocumentTriggerType.Scheduled]: 'clock',
    [DocumentTriggerType.Email]: 'mail',
  }

function groupPipedreamIntegrations(
  integrations: IntegrationDto[],
): GroupedIntegration[] {
  const pipedreamApps = integrations.filter(
    (app): app is PipedreamIntegration =>
      app.type === IntegrationType.Pipedream,
  )

  const appMap = new Map<string, GroupedIntegration>()

  for (const app of pipedreamApps) {
    const appName = app.configuration.appName
    const existing = appMap.get(appName)

    if (existing) {
      existing.accountCount += 1
      existing.allIntegrations.push(app)
    } else {
      appMap.set(appName, {
        integration: app,
        accountCount: 1,
        allIntegrations: [app],
      })
    }
  }

  return Array.from(appMap.values())
}

export function IntegrationsList({
  onSelectIntegration,
}: {
  onSelectIntegration: ReactStateDispatch<SelectedIntegration | null>
}) {
  const [immediateQuery, setImmediateQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const debouncedSetSearchQuery = useDebouncedCallback(setSearchQuery, 500)
  const onSearchChange = useCallback(
    (value: string) => {
      setImmediateQuery(value)
      debouncedSetSearchQuery(value)
    },
    [debouncedSetSearchQuery],
  )
  const [selectedValue, setSelectedValue] = useState<string | undefined>()

  const {
    data: connectedIntegrations,
    isLoading: isLoadingConnectedIntegrations,
  } = useIntegrations({
    withTriggers: true,
  })

  const {
    data: pipedreamApps = [],
    isLoading: isLoadingPipedreamApps,
    loadMore,
    isLoadingMore,
    isReachingEnd,
    totalCount,
  } = usePipedreamApps({ query: searchQuery })

  const groupedIntegrations = useMemo(
    () => groupPipedreamIntegrations(connectedIntegrations),
    [connectedIntegrations],
  )

  const isLoading =
    connectedIntegrations.length === 0 && isLoadingConnectedIntegrations

  const optionGroups = useMemo<SearchableOption<DocumentTriggerType>[]>(() => {
    const items: SearchableOptionItem<DocumentTriggerType>[] = [
      {
        type: 'item',
        value: 'latitude_email',
        title: 'Email',
        description: 'Run a prompt on new emails',
        metadata: { type: DocumentTriggerType.Email },
        imageIcon: {
          type: 'icon',
          name: ICONS_BY_TRIGGER[DocumentTriggerType.Email]!,
        },
      },
      {
        type: 'item',
        value: 'latitude_schedule',
        title: 'Scheduled',
        description: 'Run a prompt on a schedule',
        metadata: { type: DocumentTriggerType.Scheduled },
        imageIcon: {
          type: 'icon',
          name: ICONS_BY_TRIGGER[DocumentTriggerType.Scheduled]!,
        },
      },
    ]

    if (groupedIntegrations.length) {
      items.push(...groupedIntegrations.map(buildIntegrationOption))
    }
    const filteredItems = items.filter((item) =>
      item.title.toLowerCase().includes(immediateQuery.toLowerCase()),
    )

    const baseGroup: SearchableOptionGroup<DocumentTriggerType> = {
      type: 'group',
      label: 'Available triggers',
      items: filteredItems,
      loading: isLoadingConnectedIntegrations,
    }

    const groups: SearchableOption<DocumentTriggerType>[] = [baseGroup]

    const availableApps: SearchableOptionItem<DocumentTriggerType>[] =
      pipedreamApps
        .filter(
          (app) =>
            !groupedIntegrations.some(
              (grouped) =>
                grouped.integration.configuration.appName === app.nameSlug,
            ),
        )
        .map(
          (app) =>
            ({
              type: 'item',
              value: app.nameSlug,
              keywords: [app.name, app.nameSlug],
              metadata: { type: DocumentTriggerType.Integration },
              title: app.name,
              description: '',
              imageIcon: {
                type: 'image',
                src: app.imgSrc,
                alt: app.name,
              },
            }) satisfies SearchableOptionItem<DocumentTriggerType>,
        )

    groups.push({
      type: 'group',
      label: 'Add more integrations',
      loading: isLoadingPipedreamApps,
      items: availableApps,
    })

    return groups
  }, [
    groupedIntegrations,
    pipedreamApps,
    isLoadingPipedreamApps,
    immediateQuery,
    isLoadingConnectedIntegrations,
  ])

  const infiniteScroll = useMemo(
    () => ({
      onReachBottom: loadMore,
      isLoadingMore,
      isReachingEnd,
      totalCount,
    }),
    [loadMore, isLoadingMore, isReachingEnd, totalCount],
  )

  const onSelectValue: OnSelectValue<DocumentTriggerType> = useCallback(
    (slug, metadata) => {
      if (!slug || !metadata) return
      setSelectedValue(slug)
      onSelectIntegration({ slug, type: metadata.type })
    },
    [onSelectIntegration],
  )

  return (
    <SearchableList<DocumentTriggerType>
      multiGroup
      items={optionGroups}
      onSearchChange={onSearchChange}
      selectedValue={selectedValue}
      onSelectValue={onSelectValue}
      infiniteScroll={infiniteScroll}
      loading={isLoading}
      placeholder='Search integrations...'
      emptyMessage='No integrations found'
    />
  )
}
