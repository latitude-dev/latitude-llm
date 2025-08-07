import {
  SearchableList,
  Option as SearchableOption,
  OptionItem as SearchableOptionItem,
} from '@latitude-data/web-ui/molecules/SearchableList'
import usePipedreamApps from '$/stores/pipedreamApps'
import { useMemo, useState } from 'react'
import useConnectedIntegrationsByPipedreamApp from '$/stores/integrationsConnectedByPipedreamApp'
import { useDebouncedCallback } from 'use-debounce'
import { buildIntegrationOption } from './utils'

export function IntegrationsList() {
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

  const optionGroups = useMemo<SearchableOption[]>(() => {
    if (isLoadingPipedreamApps && isLoadingConnectedIntegrations) return []

    const connectedSlugs = connectedApps.reduce(
      (acc, integration) => {
        const appName = integration.configuration.appName

        acc[appName] = appName
        return acc
      },
      {} as Record<string, string>,
    )

    const availableApps: SearchableOptionItem[] = pipedreamApps
      .filter((app) => !connectedSlugs[app.name_slug])
      .map(
        (app) =>
          ({
            type: 'item',
            value: app.name_slug,
            keywords: [app.name, app.name_slug],
            title: app.name,
            description: `${app.triggerCount} triggers`,
            imageIcon: {
              type: 'image',
              src: app.img_src,
              alt: app.name,
            },
          }) satisfies SearchableOptionItem,
      )

    const groups: SearchableOption[] = []

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

  return (
    <SearchableList
      items={optionGroups}
      onSearchChange={debouncedSetSearchQuery}
      selectedValue={selectedValue}
      onSelectValue={setSelectedValue}
      infiniteScroll={infiniteScroll}
      loading={isLoading}
      placeholder='Search integrations...'
      emptyMessage='No integrations found'
    />
  )
}
