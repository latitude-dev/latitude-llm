import { Text } from '@latitude-data/web-ui/atoms/Text'

import { CopyButton } from './CopyButton'

export const MessagesList = ({ items }: { items: string[] }) => (
  <ul className='list-none space-y-2 max-w-1/3'>
    {items.map((item, index) => (
      <li key={index} className='flex flex-shrink items-center gap-2'>
        <CopyButton text={item} />
        <Text.H6M>{item}</Text.H6M>
      </li>
    ))}
  </ul>
)
