import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function FailedAction({ error }: { error: Error }) {
  return (
    <>
      <div className='w-full h-full flex items-center justify-center gap-2'>
        <Text.H4B align='center' color='destructive'>
          Oh no... the action failed!
        </Text.H4B>
      </div>
      <Text.H5 align='center' color='foregroundMuted'>
        {error.message}
      </Text.H5>
    </>
  )
}

export function LoadingAction() {
  return (
    <>
      <div className='w-full h-full flex items-center justify-center gap-2'>
        <Icon
          name='loader'
          color='foreground'
          className='flex-shrink-0 -mt-px animate-spin'
        />
        <Text.H4B align='center' color='foreground'>
          Executing action
        </Text.H4B>
      </div>
      <Text.H5 align='center' color='foregroundMuted'>
        You should be redirected shortly
      </Text.H5>
    </>
  )
}
