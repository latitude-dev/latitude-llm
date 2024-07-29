import { User } from '@latitude-data/core'
import { useToast } from '@latitude-data/web-ui'
import { getUsersActions } from '$/actions/users/fetch'
import useSWR, { SWRConfiguration } from 'swr'

export default function useUsers(opts?: SWRConfiguration) {
  const { toast } = useToast()

  const fetcher = async () => {
    const [data, error] = await getUsersActions()
    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })

      return []
    }

    return data
  }

  const { data = [], ...rest } = useSWR<Omit<User, 'encryptedPassword'>[]>(
    'api/users',
    fetcher,
    opts,
  )

  return { data, ...rest }
}
