import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Select, type SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { useCallback } from 'react'
import { triggerMessageDelete, triggerMessageRoleUpdate } from '../../../plugins/MessageEditPlugin'
import { MESSAGE_BLOCK, type MessageBlockType } from '../../../state/promptlToLexical/types'

const ROLE_OPTIONS = MESSAGE_BLOCK.map<SelectOption<MessageBlockType>>((role) => ({
  value: role,
  label: role.charAt(0).toUpperCase() + role.slice(1),
}))

export function MessageHeader({
  nodeKey,
  role,
  readOnly,
}: {
  nodeKey: string
  role: MessageBlockType
  readOnly?: boolean
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
        disabled={readOnly}
      />
      {!readOnly && (
        <Button
          size='icon'
          variant='nope'
          className='opacity-50 hover:opacity-100'
          iconProps={{
            name: 'close',
            color: 'foregroundMuted',
          }}
          onClick={() => triggerMessageDelete(nodeKey)}
          disabled={readOnly}
        />
      )}
    </div>
  )
}
