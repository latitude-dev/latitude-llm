import { Providers } from '@latitude-data/core/browser'
import useProviderApiKeys from '$/stores/providerApiKeys'
import useUsers from '$/stores/users'
import { Button, Icons, Text } from '$ui/ds/atoms'
import { defaultGenerateNodeUuid } from '$ui/sections/Document/Sidebar/Files/useTree'

export default function ProviderApiKeys() {
  const { data: users } = useUsers()
  const { data: providerApiKeys, create, destroy } = useProviderApiKeys()

  const findUser = (id: string) => users.find((u) => u.id === id)
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-row justify-between'>
        <Text.H4B>LLM API Keys</Text.H4B>
        <Button
          variant='outline'
          onClick={() =>
            create({
              provider: Providers.OpenAI,
              token: defaultGenerateNodeUuid(),
              name: defaultGenerateNodeUuid(),
            })
          }
        >
          Add new API Key
        </Button>
      </div>
      <div className='flex flex-col gap-2'>
        <table>
          <tbody>
            {providerApiKeys.map((apiKey) => (
              <tr key={apiKey.id}>
                <td>
                  <Text.H4>{apiKey.name}</Text.H4>
                </td>
                <td>
                  <Text.H4>{apiKey.provider}</Text.H4>
                </td>
                <td>
                  <Text.H4>{apiKey.token}</Text.H4>
                </td>
                <td>
                  <Text.H4>{apiKey.createdAt.toDateString()}</Text.H4>
                </td>
                <td>
                  <Text.H4>
                    {apiKey.lastUsedAt?.toISOString() || 'never'}
                  </Text.H4>
                </td>
                <td>
                  <Text.H4>{findUser(apiKey.authorId)?.name}</Text.H4>
                </td>
                <td>
                  <Button
                    size='small'
                    variant='destructive'
                    onClick={() => destroy(apiKey.id)}
                  >
                    <Icons.trash />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
