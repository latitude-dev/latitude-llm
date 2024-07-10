import { Icons, Text } from '$ui/ds/atoms'

export default function FocusHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className='flex flex-col items-center justify-center gap-y-6'>
      <Icons.logo className='h-8 w-8' />
      <div className='flex flex-col items-center justify-center gap-y-2'>
        <Text.H3 color='foreground'>{title}</Text.H3>
        <Text.H5 centered color='foregroundMuted'>
          {description}
        </Text.H5>
      </div>
    </div>
  )
}
