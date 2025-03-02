import { useToast } from '@latitude-data/web-ui'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { McpServer } from '@latitude-data/core/browser'
import { createMcpServerAction } from '$/actions/mcpServers/create'
import { destroyMcpServerAction } from '$/actions/mcpServers/destroy'
import { updateMcpServerStatusAction } from '$/actions/mcpServers/updateMcpServerStatus'

const EMPTY_ARRAY: McpServer[] = []

export default function useMcpServers(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const fetcher = useFetcher(ROUTES.api.mcpApplications.root, {
    serializer: (rows) => rows.map(deserialize),
  })
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<McpServer[]>('api/mcpApplications', fetcher, opts)

  const { execute: create, isPending: isCreating } = useLatitudeAction(
    createMcpServerAction,
    {
      onSuccess: async ({ data: mcpApplication }) => {
        toast({
          title: 'Success',
          description: `${mcpApplication.name} created successfully`,
        })

        mutate([...data, mcpApplication])
      },
    },
  )

  const { execute: destroy } = useLatitudeAction(destroyMcpServerAction, {
    onSuccess: async ({ data: mcpApplication }) => {
      toast({
        title: 'Success',
        description: `${mcpApplication.name} removed successfully`,
      })
      mutate(data.filter((item) => item.id !== mcpApplication.id))
    },
  })

  const { execute: pollStatus } = useLatitudeAction(
    updateMcpServerStatusAction,
    {
      onSuccess: async ({ data: mcpApplication }) => {
        // Update the application in the list if the status has changed
        mutate(
          data.map((item) =>
            item.id === mcpApplication.id
              ? { ...item, status: mcpApplication.status }
              : item,
          ),
          false,
        )
      },
    },
  )

  return {
    data,
    create,
    destroy,
    pollStatus,
    isCreating,
    mutate,
    ...rest,
  }
}

function deserialize(item: McpServer) {
  return {
    ...item,
    lastattemptAt: item.lastAttemptAt ? new Date(item.lastAttemptAt) : null,
    deployedAt: item.deployedAt ? new Date(item.deployedAt) : null,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}
