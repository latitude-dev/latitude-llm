import { useCallback, useMemo, EventHandler, MouseEvent } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { SerializedNode } from '../index'
import { triggerToggleDevEditor } from '../../../plugins/ReferencesPlugin'
import { useBlocksEditorContext } from '../../../Provider'

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
  missingValues,
  path,
}: {
  missingValues: boolean
  path: string
}) {
  const linkText = useMemo(
    () => (
      <div className='flex flex-rowitems-center gap-x-1'>
        <Icon
          name='file'
          color={missingValues ? 'destructive' : 'foregroundMuted'}
          className='relative flex-none align-baseline top-[3px]'
        />
        <Text.H5M
          ellipsis
          noWrap
          color={missingValues ? 'destructive' : 'primary'}
        >
          {path}
        </Text.H5M>
      </div>
    ),
    [missingValues, path],
  )

  if (!missingValues) return linkText

  return (
    <Tooltip variant='destructive' align='end' trigger={linkText}>
      Missing values. Click to configure
    </Tooltip>
  )
}

function ReferenceLinkReal({
  path,
  attributes: initialAttributes,
}: {
  path: string
  attributes: SerializedNode['attributes']
}) {
  const { Link, prompts } = useBlocksEditorContext()
  const url = prompts[path]?.url
  const values = Object.values(initialAttributes)
  const missingValues = values.length > 0
  const onClickLink: EventHandler<MouseEvent<HTMLAnchorElement>> = useCallback(
    (event) => {
      if (missingValues) {
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
    [missingValues, url, path],
  )

  return (
    <Link
      onClick={onClickLink}
      href={url!} // We hope for the best
      className='gap-x-1 inline-flex items-baseline min-w-0 max-w-[400px]'
    >
      <LinkInfo missingValues={missingValues} path={path} />
    </Link>
  )
}

export function ReferenceLink({
  path,
  attributes,
  isLoading = false,
}: {
  path: string
  attributes?: SerializedNode['attributes']
  isLoading?: boolean
}) {
  if (isLoading || !attributes) return <LoadingLink />

  return <ReferenceLinkReal path={path} attributes={attributes} />
}
