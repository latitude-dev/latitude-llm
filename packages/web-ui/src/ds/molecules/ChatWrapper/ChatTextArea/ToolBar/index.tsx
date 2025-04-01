import { Button } from '../../../../atoms/Button'

export function ToolBar({
  onSubmit,
  clearChat,
  disabled = false,
  submitLabel = 'Send Message',
  disableReset = false,
}: {
  onSubmit?: () => void
  clearChat?: () => void
  disabled?: boolean
  submitLabel?: string
  disableReset?: boolean
}) {
  return (
    <div className='flex flex-row gap-2 items-center'>
      <Button
        fancy
        variant='outline'
        disabled={disableReset}
        onClick={clearChat}
      >
        Reset Chat
      </Button>
      <Button fancy disabled={disabled} onClick={onSubmit}>
        {submitLabel}
      </Button>
    </div>
  )
}
