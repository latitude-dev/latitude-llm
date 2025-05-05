'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { useProviderApiKeyUsage } from '$/stores/providerApiKeys/usage'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import Link from 'next/link'
import { use, useCallback, useMemo } from 'react'

export default function DestroyProviderApiKey({
  params,
}: {
  params: Promise<{ providerApiKeyId: string }>
}) {
  const { providerApiKeyId } = use(params)
  const navigate = useNavigate()

  const {
    data: apiKeys,
    isLoading: isLoadingApiKey,
    destroy,
    isDestroying,
  } = useProviderApiKeys()
  const apiKey = useMemo(
    () => apiKeys.find((p) => p.id === Number(providerApiKeyId)),
    [apiKeys, providerApiKeyId],
  )
  const { data: usage, isLoading: isLoadingUsage } = useProviderApiKeyUsage({
    provider: { id: Number(providerApiKeyId) },
  })

  const onDestroy = useCallback(async () => {
    if (!apiKey) return
    const [_, errors] = await destroy({ id: apiKey.id })
    if (errors) return
    navigate.push(ROUTES.settings.root)
  }, [apiKey, destroy, navigate])

  const isLoading = isLoadingApiKey || isLoadingUsage

  return (
    <ConfirmModal
      open
      dismissible
      title={`Remove ${apiKey?.name || ''} provider`}
      description='Any prompts or evaluations using this provider will be affected. Review live projects carefully before removing.'
      type='destructive'
      onOpenChange={(open) => !open && navigate.push(ROUTES.settings.root)}
      onConfirm={onDestroy}
      onCancel={() => navigate.push(ROUTES.settings.root)}
      confirm={{
        label: isDestroying ? 'Removing...' : `Remove ${apiKey?.name || ''}`,
        description: `Are you sure you want to remove ${apiKey?.name || ''} from this workspace? This action cannot be undone.`,
        disabled: isDestroying || isLoading || !apiKey,
        isConfirming: isDestroying,
      }}
    >
      <div className='flex flex-col gap-y-4'>
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className='h-10 w-full rounded-md' />
            ))
          : usage.map((item, index) => {
              const baseUrl = ROUTES.projects
                .detail({ id: item.projectId })
                .commits.detail({ uuid: item.commitUuid })
                .documents.detail({ uuid: item.documentUuid })
              const url = item.evaluationUuid
                ? baseUrl.evaluationsV2.detail({
                    uuid: item.evaluationUuid,
                  }).root
                : baseUrl.root

              const basePath = `${item.projectName} / ${item.documentPath.split('/').pop()}`
              const path = item.evaluationUuid
                ? `${basePath} / ${item.evaluationName}`
                : basePath

              const icon = item.evaluationUuid ? 'listCheck' : 'file'

              return (
                <Link key={index} href={url} className='h-10 w-full'>
                  <Button
                    fullWidth
                    variant='secondary'
                    containerClassName='h-full'
                    disabled={isDestroying}
                  >
                    <div className='flex justify-start items-center gap-x-3 w-full'>
                      <Icon
                        name={icon}
                        widthClass='w-4'
                        heightClass='h-4'
                        className='flex-shrink-0'
                      />
                      <span className='truncate'>{path}</span>
                      <Icon
                        name='arrowRight'
                        widthClass='w-4'
                        heightClass='h-4'
                        className='flex-shrink-0'
                      />
                    </div>
                  </Button>
                </Link>
              )
            })}
      </div>
    </ConfirmModal>
  )
}
