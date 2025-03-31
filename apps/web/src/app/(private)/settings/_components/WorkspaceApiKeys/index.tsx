'use client'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useApiKeys from '$/stores/apiKeys'

export default function WorkspaceApiKeys() {
  const { data: apiKeys, isLoading, destroy } = useApiKeys()
  const { toast } = useToast()
  return (
    <TableWithHeader
      title='API Keys'
      table={
        isLoading ? (
          <TableSkeleton cols={3} rows={3} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>API Key</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((apiKey) => (
                  <TableRow key={apiKey.id} verticalPadding hoverable={false}>
                    <TableCell>
                      <Text.H5>{apiKey.name || 'Latitude API Key'}</Text.H5>
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        asChild
                        trigger={
                          <Button
                            variant='ghost'
                            onClick={() => {
                              navigator.clipboard.writeText(apiKey.token)
                              toast({
                                title: 'Copied to clipboard',
                              })
                            }}
                          >
                            <div className='flex flex-row items-center gap-2'>
                              <Text.H5 color='foregroundMuted'>
                                {apiKey.token}
                              </Text.H5>
                              <Icon name='clipboard' color='foregroundMuted' />
                            </div>
                          </Button>
                        }
                      >
                        Click to copy
                      </Tooltip>
                    </TableCell>
                    <TableCell align='right'>
                      <Tooltip
                        asChild
                        trigger={
                          <div className='px-2'>
                            <Button
                              disabled={apiKeys.length === 1}
                              variant='ghost'
                              onClick={() => destroy({ id: apiKey.id })}
                            >
                              <Icon name='trash' />
                            </Button>
                          </div>
                        }
                      >
                        {apiKeys.length === 1
                          ? "You can't delete the last API key"
                          : 'Delete API key'}
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )
      }
    />
  )
}
