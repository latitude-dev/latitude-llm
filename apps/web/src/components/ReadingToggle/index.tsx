import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { IconToggle } from '@latitude-data/web-ui/molecules/IconToggle'

export default function ReadingToggle({
  enabled,
  setEnabled,
}: {
  enabled?: boolean
  setEnabled?: (enabled: boolean) => void
}) {
  return (
    <Tooltip
      asChild
      align='center'
      side='left'
      trigger={
        <div className='flex flex-row justify-center items-center'>
          <IconToggle
            enabled={enabled ?? false}
            setEnabled={setEnabled ?? (() => {})}
            enabledIcon='baseline'
            disabledIcon='braces'
          />
        </div>
      }
    >
      {enabled ? 'Switch to debug mode' : 'Switch to reading mode'}
    </Tooltip>
  )
}
