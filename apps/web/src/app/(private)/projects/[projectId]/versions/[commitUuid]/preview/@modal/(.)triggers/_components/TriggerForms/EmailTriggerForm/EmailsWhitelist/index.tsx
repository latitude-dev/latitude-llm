import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Icon, type IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import type { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'

function Whitelist({
  items,
  icon,
  onRemove,
}: {
  items: string[]
  icon: IconName
  onRemove: (item: string) => void
}) {
  if (!items.length) return null

  return items.map((item, idx) => (
    <div className='flex w-full items-center gap-2 pl-4' key={idx}>
      <Icon name={icon} color='foregroundMuted' />
      <div className='flex w-full items-center'>
        <Text.H6 key={item} color='foregroundMuted'>
          {item}
        </Text.H6>
      </div>
      <Button variant='ghost' onClick={() => onRemove(item)} iconProps={{ name: 'close' }} />
    </div>
  ))
}

export function EmailsWhitelist({
  emailInput,
  setEmailInput,
  onAddEmail,
  disabled,
  emailWhitelist,
  setEmailWhitelist,
  domainWhitelist,
  setDomainWhitelist,
}: {
  emailInput: string
  disabled: boolean
  setEmailInput: ReactStateDispatch<string>
  onAddEmail: () => void
  emailWhitelist: string[]
  setEmailWhitelist: ReactStateDispatch<string[]>
  domainWhitelist: string[]
  setDomainWhitelist: ReactStateDispatch<string[]>
}) {
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex gap-2'>
        <Input
          name='email'
          placeholder='Email or domain'
          value={emailInput}
          disabled={disabled}
          onChange={(e) => setEmailInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAddEmail()}
        />
        <Button
          variant='outline'
          onClick={onAddEmail}
          disabled={emailInput.trim().length === 0 || disabled}
        >
          Add
        </Button>
      </div>
      <Whitelist
        items={emailWhitelist}
        icon='circleUser'
        onRemove={(item) => setEmailWhitelist((prev) => prev.filter((e) => e !== item))}
      />
      <Whitelist
        items={domainWhitelist}
        icon='atSign'
        onRemove={(item) => setDomainWhitelist((prev) => prev.filter((e) => e !== item))}
      />
      {!emailWhitelist.length && !domainWhitelist.length && (
        <Text.H6 color='foregroundMuted'>No emails or domains added to the whitelist</Text.H6>
      )}
    </div>
  )
}
