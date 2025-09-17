import {
  SearchableList,
  Option as SearchableOption,
  OptionItem as SearchableOptionItem,
  OptionGroup as SearchableOptionGroup,
  type OnSelectValue,
} from '@latitude-data/web-ui/molecules/SearchableList'
import usePipedreamApps from '$/stores/pipedreamApps'
import { useCallback, useMemo, useState } from 'react'
import useConnectedIntegrationsByPipedreamApp from '$/stores/integrationsConnectedByPipedreamApp'
import { useDebouncedCallback } from 'use-debounce'
import { DocumentTriggerType } from '@latitude-data/constants'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { SelectedIntegration, TriggerIntegrationType } from '../../client'
import { buildIntegrationOption } from './utils'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'

export const ICONS_BY_TRIGGER: Partial<
  Record<TriggerIntegrationType, IconName>
> = {
  Chat: 'chat',
  [DocumentTriggerType.Scheduled]: 'clock',
  [DocumentTriggerType.Email]: 'mail',
}
export function IntegrationsList({
  onSelectIntegration,
}: {
  onSelectIntegration: ReactStateDispatch<SelectedIntegration | null>
}) {
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedValue, setSelectedValue] = useState<string | undefined>()
  const debouncedSetSearchQuery = useDebouncedCallback(setSearchQuery, 500)

  const { data: connectedApps, isLoading: isLoadingConnectedIntegrations } =
    useConnectedIntegrationsByPipedreamApp({
      withTriggers: true,
    })
  const {
    data: pipedreamApps,
    isLoading: isLoadingPipedreamApps,
    loadMore,
    isLoadingMore,
    isReachingEnd,
    totalCount,
  } = usePipedreamApps({ query: searchQuery, withTriggers: true })

  const isLoading = isLoadingPipedreamApps || isLoadingConnectedIntegrations

  const optionGroups = useMemo<
    SearchableOption<TriggerIntegrationType>[]
  >(() => {
    if (isLoadingPipedreamApps && isLoadingConnectedIntegrations) return []

    const connectedSlugs = connectedApps.reduce(
      (acc, integration) => {
        const appName = integration.configuration.appName

        acc[appName] = appName
        return acc
      },
      {} as Record<string, string>,
    )

    const availableApps: SearchableOptionItem<TriggerIntegrationType>[] =
      pipedreamApps
        .filter((app) => !connectedSlugs[app.nameSlug])
        .map(
          (app) =>
            ({
              type: 'item',
              value: app.nameSlug,
              keywords: [app.name, app.nameSlug],
              metadata: { type: DocumentTriggerType.Integration },
              title: app.name,
              description: `${app.triggers.length} triggers`,
              imageIcon: {
                type: 'image',
                src: app.imgSrc,
                alt: app.name,
              },
            }) satisfies SearchableOptionItem<TriggerIntegrationType>,
        )

    const groups: SearchableOption<TriggerIntegrationType>[] = [
      {
        type: 'group',
        label: 'Available triggers',
        items: [
          {
            type: 'item',
            value: 'latitude_chat',
            title: 'Chat',
            description: 'Chat with a prompt',
            metadata: { type: 'Chat' },
            imageIcon: { type: 'icon', name: ICONS_BY_TRIGGER.Chat! },
          },
          {
            type: 'item',
            value: 'latitude_email',
            title: 'Email',
            description: 'Run a prompt on new emails',
            metadata: { type: DocumentTriggerType.Email },
            imageIcon: {
              type: 'icon',
              name: ICONS_BY_TRIGGER.email!,
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
              name: ICONS_BY_TRIGGER.scheduled!,
            },
          },
        ],
      },
    ]

    if (connectedApps.length) {
      const latitudeIntegrations =
        groups[0]! as SearchableOptionGroup<TriggerIntegrationType>
      latitudeIntegrations.items = [
        ...latitudeIntegrations.items,
        ...connectedApps.map(buildIntegrationOption),
      ]
    }

    groups.push({
      type: 'group',
      label: 'Add more integrations',
      loading: isLoadingPipedreamApps,
      items: availableApps,
    })

    return groups
  }, [
    pipedreamApps,
    connectedApps,
    isLoadingPipedreamApps,
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

  const onSelectValue: OnSelectValue<TriggerIntegrationType> = useCallback(
    (slug, metadata) => {
      if (!slug || !metadata) return

      setSelectedValue(slug)
      onSelectIntegration({ slug, type: metadata.type })
    },
    [onSelectIntegration, setSelectedValue],
  )

  return (
    <SearchableList<TriggerIntegrationType>
      multiGroup
      items={optionGroups}
      onSearchChange={debouncedSetSearchQuery}
      selectedValue={selectedValue}
      onSelectValue={onSelectValue}
      infiniteScroll={infiniteScroll}
      loading={isLoading}
      placeholder='Search integrations...'
      emptyMessage='No integrations found'
    />
  )
}
