'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { ICON_BY_LLM_PROVIDER } from '$/lib/providerIcons'
import { ICON_BY_LATITUDE_TOOL } from '$/lib/toolIcons'
import useDocumentRecursiveTools from '$/stores/documentRecursiveTools'
import {
  NOT_SIMULATABLE_LATITUDE_TOOLS,
  ToolManifest,
} from '@latitude-data/constants'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import {
  ToolSource,
  ToolSourceData,
} from '@latitude-data/constants/toolSources'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import {
  BackgroundColor,
  colors,
  TextColor,
} from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { capitalize } from 'lodash-es'
import Image from 'next/image'
import { ReactNode, useCallback, useMemo } from 'react'

const getToolIcon = (
  toolName: string,
  manifest: ToolManifest,
): ReactNode | IconName => {
  const sourceData = manifest.sourceData as ToolSourceData
  if (sourceData.source === ToolSource.ProviderTool)
    return ICON_BY_LLM_PROVIDER[sourceData.provider]
  if (sourceData.source === ToolSource.Latitude)
    return ICON_BY_LATITUDE_TOOL[sourceData.latitudeTool]
  if (sourceData.source === ToolSource.Integration) {
    if (sourceData.imageUrl) {
      return (
        <Image
          src={sourceData.imageUrl}
          alt={sourceData.toolLabel ?? toolName}
          unoptimized
          width={16}
          height={16}
        />
      )
    }
  }
  return 'wrench'
}

const getToolLabel = (toolName: string, manifest: ToolManifest): string => {
  const sourceData = manifest.sourceData as ToolSourceData
  if (sourceData.source === ToolSource.Integration && sourceData.toolLabel)
    return sourceData.toolLabel
  if (sourceData.source === ToolSource.Latitude)
    return capitalize(sourceData.latitudeTool)
  return toolName
}

const getForcedSimulationValue = (
  manifest: ToolManifest,
): boolean | undefined => {
  const sd = manifest.sourceData as ToolSourceData
  if (sd.source === ToolSource.Client) return true
  if (sd.source === ToolSource.Latitude) {
    const latitudeTool = (sd as ToolSourceData<ToolSource.Latitude>)
      .latitudeTool
    if (NOT_SIMULATABLE_LATITUDE_TOOLS.includes(latitudeTool)) return false
  }
  return undefined
}

function AdvancedItem({
  icon,
  label,
  description,
  fgColor,
  bgColor,
  forcedValue,
  checked,
  onCheckedChange,
}: {
  icon: IconName | ReactNode
  label: string
  description?: string
  fgColor: TextColor
  bgColor: BackgroundColor
  forcedValue: boolean | undefined
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <div className='flex flex-row items-center gap-2'>
      {forcedValue !== undefined ? (
        <Tooltip
          asChild
          trigger={
            <div>
              <SwitchToggle checked={forcedValue} disabled={true} />
            </div>
          }
        >
          {forcedValue
            ? 'This tool must be simulated to be executed.'
            : 'This tool cannot be simulated.'}
        </Tooltip>
      ) : (
        <SwitchToggle checked={checked} onCheckedChange={onCheckedChange} />
      )}
      <div
        className={cn(
          'flex w-8 h-8 items-center justify-center rounded-md',
          colors.backgrounds[bgColor],
        )}
      >
        {typeof icon === 'string' ? (
          <Icon name={icon as IconName} color={fgColor} />
        ) : (
          icon
        )}
      </div>
      <Text.H6>{label}</Text.H6>
      {description && (
        <Tooltip trigger={<Icon name='info' color='foregroundMuted' />}>
          {description}
        </Tooltip>
      )}
    </div>
  )
}

function AdvancedItemSkeleton() {
  return (
    <div className='flex flex-row items-center gap-2'>
      <Skeleton className='w-8 h-8' />
      <Skeleton height='h4' className='w-40' />
    </div>
  )
}

function ToolManifestItem({
  toolName,
  toolManifest,
  checked,
  onCheckedChange,
}: {
  toolName: string
  toolManifest: ToolManifest
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  const icon = useMemo(
    () => getToolIcon(toolName, toolManifest),
    [toolName, toolManifest],
  )
  const label = useMemo(
    () => getToolLabel(toolName, toolManifest),
    [toolName, toolManifest],
  )
  const forcedValue = useMemo(
    () => getForcedSimulationValue(toolManifest),
    [toolManifest],
  )

  return (
    <AdvancedItem
      icon={icon}
      label={label}
      fgColor={
        toolManifest.sourceData.source === ToolSource.Latitude
          ? 'accentForeground'
          : 'foregroundMuted'
      }
      bgColor={
        toolManifest.sourceData.source === ToolSource.Latitude
          ? 'accent'
          : 'muted'
      }
      description={toolManifest.definition.description}
      forcedValue={forcedValue}
      checked={forcedValue !== undefined ? forcedValue : checked}
      onCheckedChange={forcedValue !== undefined ? undefined : onCheckedChange}
    />
  )
}

export function ToolSimulationSettings({
  value = {},
  onChange,
  disabled,
}: {
  value?: SimulationSettings
  onChange: (settings: SimulationSettings) => void
  disabled?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: toolManifestDict, isLoading } = useDocumentRecursiveTools(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
    },
    {
      revalidateOnMount: true,
    },
  )

  const handleSimulateToolChange = useCallback(
    (checked: boolean) => {
      onChange({
        ...value,
        simulateToolResponses: checked,
        simulatedTools: [],
      })
    },
    [value, onChange],
  )

  const handleSimulatedToolItemChange = useCallback(
    (toolName: string, checked: boolean) => {
      const simulatedTools = value.simulatedTools ?? []

      const newSimulatedTools = checked
        ? [...simulatedTools, toolName]
        : (simulatedTools.length
            ? simulatedTools
            : Object.keys(toolManifestDict ?? {})
          ).filter((t) => t !== toolName)

      onChange({
        ...value,
        simulateToolResponses: true,
        simulatedTools: newSimulatedTools,
      })
    },
    [value, onChange, toolManifestDict],
  )

  const handleSimulationInstructionsChange = useCallback(
    (instructions: string) => {
      onChange({
        ...value,
        toolSimulationInstructions: instructions.length
          ? instructions
          : undefined,
      })
    },
    [value, onChange],
  )

  if (!isLoading && Object.keys(toolManifestDict ?? {}).length === 0) {
    return (
      <Text.H6 color='foregroundMuted'>
        There are no tools to simulate in this prompt.
      </Text.H6>
    )
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-row items-center justify-between gap-2'>
        <div className='flex flex-row items-center gap-2'>
          <div className='flex w-10 h-10 items-center justify-center bg-warning-muted rounded-md'>
            <Icon name='brush' color='warningMutedForeground' size='medium' />
          </div>
          <div className='flex flex-col'>
            <Text.H4>Simulate tools</Text.H4>
            <Text.H6 color='foregroundMuted'>
              Instead of executing the real tool, a response will be generated
              based on context
            </Text.H6>
          </div>
        </div>
        <SwitchToggle
          checked={value.simulateToolResponses ?? false}
          onCheckedChange={handleSimulateToolChange}
          disabled={disabled}
        />
      </div>

      {value.simulateToolResponses && (
        <CollapsibleBox
          title='Tool simulation settings'
          icon='brush'
          scrollable={false}
          expandedContent={
            <div className='w-full h-full flex flex-col gap-4'>
              <TextArea
                label='Simulation instructions'
                description='Additional instructions to guide the simulation of the tools'
                placeholder='No instructions'
                minRows={2}
                maxRows={4}
                autoGrow
                value={value.toolSimulationInstructions ?? ''}
                onChange={(e) =>
                  handleSimulationInstructionsChange(e.target.value)
                }
                className='w-full'
                disabled={disabled}
              />
              <div className='w-full flex flex-col gap-2'>
                <Text.H5M>Simulated tools</Text.H5M>
                {isLoading && (
                  <>
                    <AdvancedItemSkeleton />
                    <AdvancedItemSkeleton />
                    <AdvancedItemSkeleton />
                  </>
                )}
                {!!toolManifestDict &&
                  Object.entries(toolManifestDict).map(
                    ([toolName, toolManifest]) => (
                      <ToolManifestItem
                        key={toolName}
                        toolName={toolName}
                        toolManifest={toolManifest}
                        checked={
                          (value.simulateToolResponses ?? false) &&
                          (!value.simulatedTools?.length ||
                            value.simulatedTools?.includes(toolName))
                        }
                        onCheckedChange={(checked) =>
                          handleSimulatedToolItemChange(toolName, checked)
                        }
                      />
                    ),
                  )}
              </div>
            </div>
          }
        />
      )}
    </div>
  )
}
