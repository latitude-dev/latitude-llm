import { PaginatedSelect } from '@latitude-data/web-ui/molecules/PaginatedSelect'
import { App } from '@pipedream/sdk/browser'
import { ROUTES } from '$/services/routes'
import Image from 'next/image'
import { useCallback } from 'react'

export function AppSelector({
  value,
  onChange,
  isLoading,
}: {
  value: App | undefined
  onChange: (value: App | undefined) => void
  isLoading?: boolean
}) {
  const fetchOptions = useCallback(
    async ({
      query,
      cursor,
    }: {
      query: string
      cursor: string | undefined
    }) => {
      const params = new URLSearchParams()
      params.append('withTools', 'true')
      if (query) params.append('query', query)
      if (cursor) params.append('cursor', cursor)

      const response = await fetch(
        `${ROUTES.api.integrations.pipedream.apps}?${params}`,
      )
      if (!response.ok) {
        return {
          items: [],
          totalCount: 0,
          cursor: '',
        }
      }

      const data = await response.json()
      return {
        items: data.apps,
        totalCount: data.totalCount,
        cursor: data.cursor,
      }
    },
    [],
  )

  return (
    <PaginatedSelect
      loading={isLoading}
      required
      name='app'
      value={value}
      onChange={onChange}
      fetch={fetchOptions}
      serialize={(app: App) => ({
        value: app.name_slug,
        label: app.name,
        description: app.description,
        icon: (
          <Image
            src={app.img_src}
            alt={app.name}
            width={16}
            height={16}
            unoptimized
          />
        ),
      })}
      debounce={200}
      label='App'
    />
  )
}
