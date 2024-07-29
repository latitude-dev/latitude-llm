import { ProviderApiKey, User } from '@latitude-data/core'
import { Providers } from '@latitude-data/core/browser'
import { Button, Icons, Text } from '$ui/ds/atoms'
import { defaultGenerateNodeUuid } from '$ui/sections/Document/Sidebar/Files/useTree'

export default function ProviderApiKeys({
  apiKeys,
  users,
  createApiKey,
  destroyApiKey,
}: {
  apiKeys: ProviderApiKey[]
  users: User[]
  createApiKey: (payload: {
    provider: Providers
    token: string
    name: string
  }) => Promise<ProviderApiKey | undefined>
  destroyApiKey: (id: number) => Promise<ProviderApiKey | undefined>
}) {
  const findUser = (id: string) => users.find((u) => u.id === id)
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-row justify-between'>
        <Text.H4B>LLM API Keys</Text.H4B>
        <Button
          variant='outline'
          onClick={() =>
            createApiKey({
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
            {apiKeys.map((apiKey) => (
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
                    onClick={() => destroyApiKey(apiKey.id)}
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
