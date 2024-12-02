import { LineSeparator, ReactStateDispatch } from '@latitude-data/web-ui'

export function ExpandMessages({
  isExpanded,
  isLoading = false,
  onToggleShowPromptMessages,
}: {
  isExpanded: boolean
  onToggleShowPromptMessages: ReactStateDispatch<boolean>
  isLoading?: boolean
}) {
  return (
    <div className='py-3 w-full'>
      <LineSeparator
        disabled={isLoading}
        onClick={() => onToggleShowPromptMessages((prev) => !prev)}
        icon={{
          spin: isLoading,
          color: 'foregroundMuted',
          name: isLoading
            ? 'loader'
            : isExpanded
              ? 'chevronsDownUp'
              : 'chevronsUpDown',
        }}
        text={
          isLoading ? 'Loading...' : isExpanded ? 'Hide prompt' : 'Show prompt'
        }
      />
    </div>
  )
}
