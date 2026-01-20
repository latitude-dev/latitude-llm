import { IntegrationType } from '@latitude-data/constants'
import { ActiveIntegration } from '../../../toolsHelpers/types'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCustomMcpHeaders } from '$/stores/customMcpHeaders'
import { useIntegrationHeaderPresets } from '$/stores/integrationHeaderPresets'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { cn } from '@latitude-data/web-ui/utils'

const CUSTOM_PRESET_VALUE = '__custom__'

type ModalProps = {
  integrationId: number
  integrationName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CustomMcpHeadersModal({
  integrationId,
  integrationName,
  open,
  onOpenChange,
}: ModalProps) {
  const {
    data: initialHeaders,
    update: updateHeaders,
    remove: removeHeaders,
  } = useCustomMcpHeaders(integrationName)
  const {
    data: presets,
    create: createPreset,
    destroy: destroyPreset,
    isCreating,
    isDestroying,
  } = useIntegrationHeaderPresets(integrationId)

  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    CUSTOM_PRESET_VALUE,
  )
  const [headers, setHeaders] = useState<[string, string][]>([
    ...Object.entries(initialHeaders ?? {}),
    ['', ''],
  ])
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [showSavePreset, setShowSavePreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetNameError, setPresetNameError] = useState<string | undefined>()

  const isCustomMode = selectedPresetId === CUSTOM_PRESET_VALUE
  const selectedPreset = useMemo(
    () => presets.find((p) => p.id.toString() === selectedPresetId),
    [presets, selectedPresetId],
  )

  const presetOptions = useMemo(() => {
    const options = [{ label: 'Custom', value: CUSTOM_PRESET_VALUE }]
    presets.forEach((preset) => {
      options.push({ label: preset.name, value: preset.id.toString() })
    })
    return options
  }, [presets])

  useEffect(() => {
    if (selectedPreset) {
      setHeaders([...Object.entries(selectedPreset.headers), ['', '']])
      setErrors({})
    }
  }, [selectedPreset])

  const handlePresetChange = useCallback(
    (value: string) => {
      setSelectedPresetId(value)
      setShowSavePreset(false)
      setPresetName('')
      setPresetNameError(undefined)

      if (value === CUSTOM_PRESET_VALUE) {
        setHeaders([...Object.entries(initialHeaders ?? {}), ['', '']])
        setErrors({})
      }
    },
    [initialHeaders],
  )

  const validateHeaders = useCallback(
    (headersToValidate: [string, string][]) => {
      const newErrors: Record<number, string> = {}

      headersToValidate.forEach(([key, value], idx) => {
        if (!key.trim() && value.trim()) {
          newErrors[idx] = 'Header key is required when value is provided'
        }
      })

      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    },
    [],
  )

  const handleUpdateHeaderKey = useCallback((idx: number, key: string) => {
    setHeaders((prev) => {
      const newHeaders = [...prev]
      newHeaders[idx]![0] = key

      if (idx === newHeaders.length - 1) {
        newHeaders.push(['', ''])
      }

      return newHeaders
    })
    setErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[idx]
      return newErrors
    })
  }, [])

  const handleUpdateHeaderValue = useCallback((idx: number, value: string) => {
    setHeaders((prev) => {
      const newHeaders = [...prev]
      newHeaders[idx]![1] = value

      if (idx === newHeaders.length - 1) {
        newHeaders.push(['', ''])
      }

      return newHeaders
    })
    setErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[idx]
      return newErrors
    })
  }, [])

  const handleRemoveHeader = useCallback((idx: number) => {
    setHeaders((prev) => {
      const newHeaders = [...prev]
      newHeaders.splice(idx, 1)

      if (newHeaders.length === 0) {
        newHeaders.push(['', ''])
      }

      return newHeaders
    })
    setErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[idx]
      return newErrors
    })
  }, [])

  const getValidHeaders = useCallback(() => {
    const filteredHeaders = headers.filter(
      ([key, value]) => key.trim() || value.trim(),
    )

    if (!validateHeaders(filteredHeaders)) {
      return null
    }

    return filteredHeaders.filter(([key, value]) => key.trim() && value.trim())
  }, [headers, validateHeaders])

  const handleSave = useCallback(() => {
    const headersToSave = getValidHeaders()
    if (headersToSave === null) return

    if (headersToSave.length === 0) {
      removeHeaders()
    } else {
      updateHeaders(Object.fromEntries(headersToSave))
    }

    onOpenChange(false)
  }, [getValidHeaders, updateHeaders, onOpenChange, removeHeaders])

  const handleUnset = useCallback(() => {
    removeHeaders()
    setHeaders([['', '']])
    setSelectedPresetId(CUSTOM_PRESET_VALUE)
    onOpenChange(false)
  }, [removeHeaders, onOpenChange])

  const handleSavePreset = useCallback(async () => {
    if (!presetName.trim()) {
      setPresetNameError('Preset name is required')
      return
    }

    const headersToSave = getValidHeaders()
    if (headersToSave === null) return

    if (headersToSave.length === 0) {
      setPresetNameError('At least one header is required')
      return
    }

    const [createdPreset] = await createPreset({
      integrationId,
      name: presetName.trim(),
      headers: Object.fromEntries(headersToSave),
    })

    if (createdPreset) {
      setSelectedPresetId(createdPreset.id.toString())
    }

    setShowSavePreset(false)
    setPresetName('')
    setPresetNameError(undefined)
  }, [presetName, getValidHeaders, createPreset, integrationId])

  const handleRemovePreset = useCallback(async () => {
    if (!selectedPreset) return

    await destroyPreset({ presetId: selectedPreset.id })
    setSelectedPresetId(CUSTOM_PRESET_VALUE)
    setHeaders([...Object.entries(initialHeaders ?? {}), ['', '']])
  }, [selectedPreset, destroyPreset, initialHeaders])

  return (
    <Modal
      title="Custom headers"
      description="Add custom headers to the MCP requests"
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="destructive" fancy onClick={handleUnset}>
            Unset
          </Button>
          <Button variant="default" fancy onClick={handleSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <Select
          name="preset"
          options={presetOptions}
          value={selectedPresetId}
          onChange={handlePresetChange}
        />

        {headers.map(([key, value], idx) => (
          <div key={idx} className="flex flex-col gap-1">
            <div
              className={cn('flex items-center gap-2', {
                'opacity-75': idx === headers.length - 1,
              })}
            >
              <Input
                value={key}
                onChange={(e) => handleUpdateHeaderKey(idx, e.target.value)}
                errors={errors[idx] ? [errors[idx]] : undefined}
                placeholder="Key"
                errorStyle="tooltip"
                disabled={!isCustomMode}
              />
              <Input
                value={value}
                onChange={(e) => handleUpdateHeaderValue(idx, e.target.value)}
                placeholder="Value"
                disabled={!isCustomMode}
              />
              {isCustomMode && (
                <Button
                  variant="ghost"
                  className="p-0"
                  onClick={() => handleRemoveHeader(idx)}
                  iconProps={{ name: 'trash' }}
                />
              )}
            </div>
          </div>
        ))}

        {isCustomMode && !showSavePreset && (
          <Button
            variant="outline"
            onClick={() => setShowSavePreset(true)}
          >
            Save as preset
          </Button>
        )}

        {isCustomMode && showSavePreset && (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={presetName}
                onChange={(e) => {
                  setPresetName(e.target.value)
                  setPresetNameError(undefined)
                }}
                placeholder="Preset name"
                errors={presetNameError ? [presetNameError] : undefined}
              />
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setShowSavePreset(false)
                setPresetName('')
                setPresetNameError(undefined)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              fancy
              onClick={handleSavePreset}
              disabled={isCreating}
            >
              {isCreating ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}

        {!isCustomMode && selectedPreset && (
          <Button
            variant="destructive"
            onClick={handleRemovePreset}
            disabled={isDestroying}
          >
            {isDestroying ? 'Removing...' : 'Remove preset'}
          </Button>
        )}
      </div>
    </Modal>
  )
}

export function CustomMcpHeadersButton({
  integration,
}: {
  integration: ActiveIntegration
}) {
  const { data: headers } = useCustomMcpHeaders(integration.name)
  const hasHeaders = !!headers && Object.keys(headers).length > 0
  const [open, setOpen] = useState(false)

  if (integration.type !== IntegrationType.ExternalMCP) return null

  return (
    <>
      <Tooltip
        trigger={
          <Button
            variant={hasHeaders ? 'primaryMuted' : 'ghost'}
            size="small"
            iconProps={{ name: 'key' }}
            onClick={() => setOpen(true)}
          />
        }
      >
        Custom headers
      </Tooltip>
      <CustomMcpHeadersModal
        integrationId={integration.id}
        integrationName={integration.name}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
