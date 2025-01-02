import { Button } from '../../../../atoms'

export function ToolBar({
  onSubmit,
  clearChat,
  disabled = false,
  submitLabel = 'Send Message',
}: {
  onSubmit?: () => void
  clearChat?: () => void
  disabled?: boolean
  submitLabel?: string
}) {
  return (
    <div className='flex flex-row gap-2 items-center'>
      <Button fancy variant='outline' onClick={clearChat}>
        Reset Chat
      </Button>
      <Button fancy disabled={disabled} onClick={onSubmit}>
        {submitLabel}
      </Button>
    </div>
  )
}
