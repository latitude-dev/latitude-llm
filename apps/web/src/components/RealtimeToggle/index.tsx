import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCallback } from 'react'

export function RealtimeToggle({
  enabled,
  setEnabled,
}: {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}) {
  const { toast } = useToast()

  const toggleRealtime = useCallback(() => {
    if (enabled) toast({ title: 'Real time updates paused' })
    else toast({ title: 'Real time updates resumed' })
    setEnabled(!enabled)
  }, [enabled, setEnabled, toast])

  return (
    <Tooltip
      asChild
      trigger={
        <Button
          fancy
          variant={enabled ? 'default' : 'outline'}
          className='h-7'
          onClick={toggleRealtime}
          iconProps={{ name: enabled ? 'pause' : 'play' }}
        />
      }
      align='end'
      side='top'
    >
      {enabled ? 'Pause real time updates' : 'Resume real time updates'}
    </Tooltip>
  )
}
