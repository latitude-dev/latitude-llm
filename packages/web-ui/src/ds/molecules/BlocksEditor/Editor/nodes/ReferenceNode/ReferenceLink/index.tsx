import { useCallback, useMemo, EventHandler, MouseEvent } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { triggerToggleDevEditor } from '../../../plugins/ReferencesPlugin'
import { useBlocksEditorContext } from '../../../Provider'
import { ReferenceLink as SerializedReferenceLink } from '../../../state/promptlToLexical/types'
import { resolveRelativePath } from '@latitude-data/constants'

function LoadingLink() {
  return (
    <span className='gap-x-1 inline-flex items-baseline min-w-0 max-w-[400px]'>
      <Icon
        name='loader'
        color='foregroundMuted'
        className='relative flex-none align-baseline top-[3px] animate-spin'
      />
      <Text.H5M ellipsis noWrap color='foregroundMuted'>
        Loading ...
      </Text.H5M>
    </span>
  )
}

function LinkInfo({
  hasErrors,
  errors,
  path,
}: {
  hasErrors: boolean
  errors?: SerializedReferenceLink['errors']
  path: string
}) {
  const linkText = useMemo(
    () => (
      <div className='flex flex-rowitems-center gap-x-1'>
        <Icon
          name='file'
          color={hasErrors ? 'destructive' : 'foregroundMuted'}
          className='relative flex-none align-baseline top-[3px]'
        />
        <Text.H5M ellipsis noWrap color={hasErrors ? 'destructive' : 'primary'}>
          {path}
        </Text.H5M>
      </div>
    ),
    [hasErrors, path],
  )

  if (!hasErrors) return linkText

  return (
    <Tooltip variant='destructive' align='end' trigger={linkText}>
      {errors && errors.length > 0
        ? errors[0]?.message
        : 'Missing values. Click to configure'}
    </Tooltip>
  )
}

function ReferenceLinkReal({
  path: relativePath,
  attributes: initialAttributes,
  errors,
}: {
  path: string
  errors?: SerializedReferenceLink['errors']
  attributes: SerializedReferenceLink['attributes']
}) {
  const { Link, currentDocument, prompts } = useBlocksEditorContext()
  const path = resolveRelativePath(relativePath, currentDocument.path)
  const url = prompts[path]?.url
  const attributeKeys = Object.keys(initialAttributes).filter(
    (k) =>
      k !== 'path' &&
      (initialAttributes[k] === undefined || initialAttributes[k] === null),
  )
  const missingValues = attributeKeys.length > 0
  const hasErrors = useMemo(() => {
    return (errors && errors.length > 0) || missingValues
  }, [errors, missingValues])
  const onClickLink: EventHandler<MouseEvent<HTMLAnchorElement>> = useCallback(
    (event) => {
      if (hasErrors) {
        event.preventDefault()
        event.stopPropagation()
        triggerToggleDevEditor()
        return
      }

      if (!url) {
        event.preventDefault()
        event.stopPropagation()
        alert(`No URL found for prompt at path: ${path}`)
        return
      }
    },
    [hasErrors, url, path],
  )

  return (
    <Link
      onClick={onClickLink}
      href={url!} // We hope for the best
      className='gap-x-1 inline-flex items-baseline min-w-0 max-w-[400px]'
    >
      <LinkInfo hasErrors={hasErrors} errors={errors} path={path} />
    </Link>
  )
}

export function ReferenceLink({
  path,
  attributes,
  errors,
  isLoading = false,
}: {
  path: string
  attributes?: SerializedReferenceLink['attributes']
  errors?: SerializedReferenceLink['errors']
  isLoading?: boolean
}) {
  if (isLoading || !attributes) return <LoadingLink />

  return (
    <ReferenceLinkReal errors={errors} path={path} attributes={attributes} />
  )
}
