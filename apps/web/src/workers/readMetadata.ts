import { readMetadata } from '@latitude-data/compiler'

type Props = Parameters<typeof readMetadata>[0]
self.onmessage = async function (event: { data: Props }) {
  const props = event.data
  const metadata = await readMetadata(props)
  self.postMessage(metadata)
}
