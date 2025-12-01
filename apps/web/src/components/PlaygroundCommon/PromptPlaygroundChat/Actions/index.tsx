import DebugToggle from '$/components/DebugToggle'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'

export type ActionsState = {
  debugMode?: boolean
  setDebugMode?: (expand: boolean) => void
}

export default function Actions(state: ActionsState) {
  return (
    <ClientOnly className='flex flex-row gap-2 items-center'>
      <DebugToggle enabled={state.debugMode} setEnabled={state.setDebugMode} />
    </ClientOnly>
  )
}
