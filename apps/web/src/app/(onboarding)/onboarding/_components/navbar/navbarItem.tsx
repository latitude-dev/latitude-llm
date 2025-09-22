import { Text } from '@latitude-data/web-ui/atoms/Text'

export type NavbarTab =
  | 'setupIntegrations'
  | 'configureTriggers'
  | 'triggerAgent'
  | 'runAgent'

export function NavBarItem({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick: () => void
}) {
  // TODO - continue with the navbar, add the new radio buttons...
  return (
    <div className='flex flex-row gap-2'>
      <div className='flex flex-col' onClick={onClick}>
        <Text.H5M>{title}</Text.H5M>
        <Text.H5>{description}</Text.H5>
      </div>
    </div>
  )
}
