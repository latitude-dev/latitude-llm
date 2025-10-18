import { InvalidateFirstPageCache } from './_components/InvalidateFirstPageCache'
import { InvalidateAppCache } from './_components/InvalidateAppCache'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export default function AdminIntegrationsCache() {
  return (
    <div className='container flex flex-col gap-y-8'>
      <section className='flex flex-col gap-y-4'>
        <Text.H1>Integrations Cache Management</Text.H1>
        <Text.H4 color='foregroundMuted'>
          Manage cached Pipedream integration data. Clear the first page cache
          or invalidate specific app caches by searching for them.
        </Text.H4>
      </section>

      <section className='flex flex-col gap-y-4'>
        <InvalidateFirstPageCache />
      </section>

      <section className='flex flex-col gap-y-4'>
        <InvalidateAppCache />
      </section>
    </div>
  )
}
