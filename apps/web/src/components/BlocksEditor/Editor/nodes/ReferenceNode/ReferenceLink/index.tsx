import { resolveRelativePath } from '@latitude-data/constants'
import {
  DropdownMenu,
  MenuOption,
} from '@latitude-data/web-ui/atoms/DropdownMenu'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import { EventHandler, MouseEvent, useCallback, useMemo } from 'react'
import { triggerReferencePathUpdate } from '../../../plugins/ReferenceEditPlugin'
import { triggerToggleDevEditor } from '../../../plugins/ReferencesPlugin'
import { useBlocksEditorContext } from '../../../Provider'
import { ReferenceLink as SerializedReferenceLink } from '../../../state/promptlToLexical/types'

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
      <div className='min-w-0 flex-grow flex flex-row tems-center gap-x-1'>
        <Icon
          name='file'
          color={hasErrors ? 'destructive' : 'foregroundMuted'}
          className='relative flex-none align-baseline top-[3px]'
        />
        <Text.H5M
          ellipsis
          noWrap
          color={hasErrors ? 'destructive' : 'foreground'}
        >
          {path}
        </Text.H5M>
      </div>
    ),
    [hasErrors, path],
  )

  if (!hasErrors) return linkText

  return (
    <Tooltip variant='destructive' align='start' asChild trigger={linkText}>
      {errors && errors.length > 0
        ? errors[0]?.message
        : 'Missing values. Click to configure'}
    </Tooltip>
  )
}

function ReferenceLinkReal({
  nodeKey,
  path: relativePath,
  attributes: initialAttributes,
  errors,
  readOnly,
}: {
  nodeKey: string
  path: string
  errors?: SerializedReferenceLink['errors']
  attributes: SerializedReferenceLink['attributes']
  readOnly?: boolean
}) {
  const { Link, currentDocument, prompts } = useBlocksEditorContext()

  const promptOptions = useMemo<MenuOption[]>(
    () =>
      Object.values(prompts).map((prompt) => ({
        checked: `/${prompt.path}` === relativePath,
        label: prompt.path,
        ellipsis: true,
        onClick: () => {
          triggerReferencePathUpdate(nodeKey, prompt)
        },
      })),
    [prompts, relativePath, nodeKey],
  )
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
    <div
      className={cn(
        'bg-background flex-grow inline-flex flex-row items-center max-w-60 overflow-hidden',
        'border border-border rounded-lg px-1 py-px',
        'gap-x-1',
      )}
    >
      <Link
        onClick={onClickLink}
        href={url!} // We hope for the best
        className='inline-flex items-baseline min-w-0 flex-grow'
      >
        <LinkInfo hasErrors={hasErrors} errors={errors} path={path} />
      </Link>
      <DropdownMenu
        title='Reference prompt'
        align='end'
        width='extraWide'
        sideOffset={8}
        alignOffset={-4}
        triggerButtonProps={{
          size: 'icon',
          variant: 'ghost',
          iconProps: { name: 'chevronDown' },
          className: 'min-h-4 flex items-center',
        }}
        options={promptOptions}
        readOnly={readOnly}
      />
    </div>
  )
}

export function ReferenceLink({
  nodeKey,
  path,
  attributes,
  errors,
  isLoading = false,
  readOnly,
}: {
  nodeKey: string
  path: string
  attributes?: SerializedReferenceLink['attributes']
  errors?: SerializedReferenceLink['errors']
  isLoading?: boolean
  readOnly?: boolean
}) {
  if (isLoading || !attributes) return <LoadingLink />

  return (
    <ReferenceLinkReal
      nodeKey={nodeKey}
      errors={errors}
      path={path}
      attributes={attributes}
      readOnly={readOnly}
    />
  )
}
