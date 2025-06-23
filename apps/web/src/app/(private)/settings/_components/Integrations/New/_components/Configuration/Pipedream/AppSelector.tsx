import { listPipedreamIntegrationsAction } from '$/actions/integrations/pipedream/list'
import { PaginatedSelect } from '@latitude-data/web-ui/molecules/PaginatedSelect'
import { App } from '@pipedream/sdk/browser'
import Image from 'next/image'
import { useCallback } from 'react'
import { useServerAction } from 'zsa-react'

export function AppSelector({
  value,
  onChange,
  isLoading,
}: {
  value: App | undefined
  onChange: (value: App | undefined) => void
  isLoading?: boolean
}) {
  const { execute: executeListPipedreamApps } = useServerAction(
    listPipedreamIntegrationsAction,
  )

  const fetchOptions = useCallback(
    async ({
      query,
      cursor,
    }: {
      query: string
      cursor: string | undefined
    }) => {
      const [data, error] = await executeListPipedreamApps({ query, cursor })

      if (error) {
        return {
          items: [],
          totalCount: 0,
          cursor: '',
        }
      }

      return {
        items: data.apps,
        totalCount: data.totalCount,
        cursor: data.cursor,
      }
    },
    [executeListPipedreamApps],
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
