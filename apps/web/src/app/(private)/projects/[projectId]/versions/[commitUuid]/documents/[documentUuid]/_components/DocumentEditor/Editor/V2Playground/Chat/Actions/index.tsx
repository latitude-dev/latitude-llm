import ReadingToggle from '$/components/ReadingToggle'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'

export type ActionsState = {
  expandParameters?: boolean
  setExpandParameters?: (expand: boolean) => void
}

export default function Actions(state: ActionsState) {
  return (
    <ClientOnly className='flex flex-row gap-2 items-center'>
      <ReadingToggle
        enabled={state.expandParameters}
        setEnabled={state.setExpandParameters}
      />
    </ClientOnly>
  )
}
