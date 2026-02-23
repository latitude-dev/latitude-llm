'use client'

import { createDocumentVersionAction } from '$/actions/documents/create'
import { destroyDocumentAction } from '$/actions/documents/destroyDocumentAction'
import { destroyFolderAction } from '$/actions/documents/destroyFolderAction'
import { renameDocumentPathsAction } from '$/actions/documents/renamePathsAction'
import { uploadDocumentAction } from '$/actions/documents/upload'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { HEAD_COMMIT, MAX_SIZE, MAX_UPLOAD_SIZE_IN_MB } from '@latitude-data/core/constants'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { useSWRConfig } from 'swr'

/**
 * Document CRUD actions without subscribing to the documents SWR cache.
 */
export function useDocumentVersionActions(
  {
    commitUuid = HEAD_COMMIT,
    projectId,
  }: { commitUuid?: string; projectId?: number } = { commitUuid: HEAD_COMMIT },
  opts: {
    onSuccessCreate?: (document: DocumentVersion) => void
  } = {},
) {
  const { toast } = useToast()
  const { onSuccessCreate } = opts
  const router = useRouter()
  const { mutate: globalMutate } = useSWRConfig()
  const cacheKey = useMemo(
    () => (projectId ? (['documentVersions', projectId, commitUuid] as const) : undefined),
    [projectId, commitUuid],
  )

  const { execute: executeCreateDocument, isPending: isCreating } = useLatitudeAction(
    createDocumentVersionAction,
    {
      onSuccess: ({ data: document }) => {
        onSuccessCreate?.(document)
      },
    },
  )
  const { execute: executeUploadDocument, isPending: isUploading } = useLatitudeAction(
    uploadDocumentAction,
    {
      onSuccess: ({ data: document }) => {
        onSuccessCreate?.(document)
      },
    },
  )
  const { execute: executeRenamePaths, isPending: isRenaming } = useLatitudeAction(
    renameDocumentPathsAction,
  )
  const { execute: executeDestroyDocument, isPending: isDestroyingFile } =
    useLatitudeAction(destroyDocumentAction)
  const { execute: executeDestroyFolder, isPending: isDestroyingFolder } =
    useLatitudeAction(destroyFolderAction)

  const createFile = useCallback(
    async ({
      path,
      agent,
      content,
    }: {
      path: string
      agent?: boolean
      content?: string
    }) => {
      if (!projectId) return undefined

      const [document, error] = await executeCreateDocument({
        projectId,
        commitUuid,
        path,
        agent,
        content,
      })

      if (error) {
        toast({
          title: 'Error creating document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
        return undefined
      }

      if (!document) return undefined

      if (cacheKey) {
        globalMutate(
          cacheKey,
          (prev: DocumentVersion[] | undefined) => [...(prev || []), document],
          { revalidate: false },
        )
      }

      router.push(
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid })
          .documents.detail({ uuid: document.documentUuid }).root,
      )

      return document
    },
    [executeCreateDocument, commitUuid, projectId, toast, router, cacheKey, globalMutate],
  )

  const uploadFile = useCallback(
    async ({ path, file }: { path: string; file: File }) => {
      if (!projectId) return

      if (file.size > MAX_UPLOAD_SIZE_IN_MB) {
        toast({
          title: 'Error uploading document',
          description: `Your file must be less than ${MAX_SIZE}MB in size. You can split it into smaller files and upload them separately.`,
          variant: 'destructive',
        })
        return
      }

      const [document, error] = await executeUploadDocument({
        path,
        projectId,
        commitUuid,
        file,
      })

      if (error) {
        toast({
          title: 'Error uploading document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
        return
      }

      if (!document) return

      if (cacheKey) {
        globalMutate(
          cacheKey,
          (prev: DocumentVersion[] | undefined) => [...(prev || []), document],
          { revalidate: false },
        )
      }

      router.push(
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid })
          .documents.detail({ uuid: document.documentUuid }).root,
      )
    },
    [executeUploadDocument, commitUuid, projectId, toast, router, cacheKey, globalMutate],
  )

  const renamePaths = useCallback(
    async ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      if (!projectId) return

      const [updatedDocuments, error] = await executeRenamePaths({
        oldPath,
        newPath,
        projectId,
        commitUuid,
      })

      if (updatedDocuments && cacheKey) {
        globalMutate(
          cacheKey,
          (prev: DocumentVersion[] | undefined) =>
            (prev || []).map((doc) => {
              const updated = updatedDocuments.find(
                (updatedDoc) => updatedDoc.documentUuid === doc.documentUuid,
              )
              return updated || doc
            }),
          { revalidate: false },
        )
      }

      if (!error) return

      toast({
        title: 'Error renaming paths',
        description: error.formErrors?.[0] || error.message,
        variant: 'destructive',
      })
    },
    [executeRenamePaths, commitUuid, projectId, toast, cacheKey, globalMutate],
  )

  const destroyFile = useCallback(
    async (documentUuid: string) => {
      if (!projectId) return

      const [_, error] = await executeDestroyDocument({
        documentUuid,
        projectId,
        commitUuid,
      })

      if (error) {
        toast({
          title: 'Error deleting document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Success',
        description: 'Document deleted',
      })
      if (cacheKey) {
        globalMutate(
          cacheKey,
          (prev: DocumentVersion[] | undefined) =>
            (prev || []).filter((doc) => doc.documentUuid !== documentUuid),
          { revalidate: false },
        )
      }
      router.push(
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid }).documents.root,
      )
    },
    [executeDestroyDocument, commitUuid, projectId, router, toast, cacheKey, globalMutate],
  )

  const destroyFolder = useCallback(
    async (path: string) => {
      if (!projectId) return

      const [_, error] = await executeDestroyFolder({
        projectId,
        commitUuid,
        path,
      })

      if (error) {
        toast({
          title: 'Error deleting folder',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Success',
        description: 'Folder deleted',
      })
      if (cacheKey) {
        await globalMutate(cacheKey)
      }
      router.push(
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid }).documents.root,
      )
    },
    [executeDestroyFolder, commitUuid, projectId, router, toast, cacheKey, globalMutate],
  )

  return useMemo(
    () => ({
      createFile,
      uploadFile,
      renamePaths,
      destroyFile,
      destroyFolder,
      isLoading:
        isCreating ||
        isUploading ||
        isRenaming ||
        isDestroyingFile ||
        isDestroyingFolder,
      isDestroying: isDestroyingFile || isDestroyingFolder,
    }),
    [
      createFile,
      uploadFile,
      renamePaths,
      destroyFile,
      destroyFolder,
      isCreating,
      isUploading,
      isRenaming,
      isDestroyingFile,
      isDestroyingFolder,
    ],
  )
}
