import {
  SearchableList,
  Option as SearchableOption,
  OptionItem as SearchableOptionItem,
  type OnSelectValue,
} from '@latitude-data/web-ui/molecules/SearchableList'
import usePipedreamApps from '$/stores/pipedreamApps'
import { useCallback, useMemo, useState } from 'react'
import useConnectedIntegrationsByPipedreamApp from '$/stores/integrationsConnectedByPipedreamApp'
import { useDebouncedCallback } from 'use-debounce'
import { IntegrationType } from '@latitude-data/constants'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { SelectedIntegration } from '../../client'
import { buildIntegrationOption } from './utils'

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

  const optionGroups = useMemo<SearchableOption<IntegrationType>[]>(() => {
    if (isLoadingPipedreamApps && isLoadingConnectedIntegrations) return []

    const connectedSlugs = connectedApps.reduce(
      (acc, integration) => {
        const appName = integration.configuration.appName

        acc[appName] = appName
        return acc
      },
      {} as Record<string, string>,
    )

    const availableApps: SearchableOptionItem<IntegrationType>[] = pipedreamApps
      .filter((app) => !connectedSlugs[app.name_slug])
      .map(
        (app) =>
          ({
            type: 'item',
            value: app.name_slug,
            keywords: [app.name, app.name_slug],
            metadata: { type: IntegrationType.Pipedream },
            title: app.name,
            description: `${app.triggerCount} triggers`,
            imageIcon: {
              type: 'image',
              src: app.img_src,
              alt: app.name,
            },
          }) satisfies SearchableOptionItem<IntegrationType>,
      )

    const groups: SearchableOption<IntegrationType>[] = []

    if (connectedApps.length) {
      groups.push({
        type: 'group',
        label: 'Available triggers',
        items: connectedApps.map(buildIntegrationOption),
      })
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

  const onSelectValue: OnSelectValue<IntegrationType> = useCallback(
    (slug, metadata) => {
      if (!slug || !metadata) return

      setSelectedValue(slug)
      onSelectIntegration({ slug, type: metadata.type })
    },
    [onSelectIntegration, setSelectedValue],
  )

  return (
    <SearchableList<IntegrationType>
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
