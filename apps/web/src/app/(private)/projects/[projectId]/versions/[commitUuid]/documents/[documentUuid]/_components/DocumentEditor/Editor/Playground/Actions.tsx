import { SwitchToogle, Text } from '@latitude-data/web-ui'

export type ActionsState = {
  expandParameters: boolean
  setExpandParameters: (expand: boolean) => void
}

export default function Actions(state: ActionsState) {
  return (
    <div className='flex flex-row gap-2 items-center'>
      <Text.H6M>Expand parameters</Text.H6M>
      <SwitchToogle
        checked={state.expandParameters}
        onCheckedChange={state.setExpandParameters}
      />
    </div>
  )
}
