import { Icons } from '$ui/ds/atoms/Icons'

import {
  AlertDescription,
  AlertProps,
  Alert as AlertRoot,
  AlertTitle,
} from './Primitives'

type Props = {
  variant?: AlertProps['variant']
  title?: string
  description?: string
}
export function Alert({ title, description, variant = 'default' }: Props) {
  return (
    <AlertRoot variant={variant}>
      <Icons.alert className='w-4 h-4' />
      {title && <AlertTitle>{title}</AlertTitle>}
      {description && <AlertDescription>{description}</AlertDescription>}
    </AlertRoot>
  )
}
