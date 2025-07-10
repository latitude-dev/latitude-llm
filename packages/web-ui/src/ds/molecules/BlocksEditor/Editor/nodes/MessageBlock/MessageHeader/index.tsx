import { useCallback } from 'react'
import { Select, SelectOption } from '../../../../../../atoms/Select'
import { Button } from '../../../../../../atoms/Button'
import {
  MESSAGE_BLOCK,
  MessageBlockType,
} from '../../../state/promptlToLexical/types'
import {
  triggerMessageDelete,
  triggerMessageRoleUpdate,
} from '../../../plugins/MessageEditPlugin'

const ROLE_OPTIONS = MESSAGE_BLOCK.map<SelectOption<MessageBlockType>>(
  (role) => ({
    value: role,
    label: role.charAt(0).toUpperCase() + role.slice(1),
  }),
)

export function MessageHeader({
  nodeKey,
  role,
}: {
  nodeKey: string
  role: MessageBlockType
}) {
  const onChange = useCallback(
    (newRole: MessageBlockType) => {
      triggerMessageRoleUpdate(nodeKey, newRole)
    },
    [nodeKey],
  )
  return (
    <div className='w-full flex flex-row items-center justify-between gap-x-2'>
      <Select<MessageBlockType>
        width='auto'
        name='role'
        size='small'
        options={ROLE_OPTIONS}
        value={role}
        onChange={onChange}
      />
      <Button
        size='icon'
        variant='nope'
        className='opacity-50 hover:opacity-100'
        iconProps={{
          name: 'close',
          color: 'foregroundMuted',
        }}
        onClick={() => triggerMessageDelete(nodeKey)}
      />
    </div>
  )
}
