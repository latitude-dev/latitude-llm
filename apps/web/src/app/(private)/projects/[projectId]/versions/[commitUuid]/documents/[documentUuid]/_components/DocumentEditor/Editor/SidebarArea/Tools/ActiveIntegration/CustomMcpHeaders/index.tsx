import { IntegrationType } from "@latitude-data/constants";
import { ActiveIntegration } from "../../../toolsHelpers/types";
import { Tooltip } from "@latitude-data/web-ui/atoms/Tooltip";
import { Button } from "@latitude-data/web-ui/atoms/Button";
import { useCustomMcpHeaders } from "$/stores/customMcpHeaders";
import { Modal } from "@latitude-data/web-ui/atoms/Modal";
import { useCallback, useState } from "react";
import { Input } from "@latitude-data/web-ui/atoms/Input";
import { cn } from "@latitude-data/web-ui/utils";

function CustomMcpHeadersModal({ integrationName, open, onOpenChange }: { integrationName: string, open: boolean, onOpenChange: (open: boolean) => void }) {
  const { data: initialHeaders, update: updateHeaders, remove: removeHeaders } = useCustomMcpHeaders(integrationName)

  const [headers, setHeaders] = useState<[string, string][]>([...Object.entries(initialHeaders ?? {}), ['', '']])
  const [errors, setErrors] = useState<Record<number, string>>({})

  const validateHeaders = useCallback((headersToValidate: [string, string][]) => {
    const newErrors: Record<number, string> = {}
    
    headersToValidate.forEach(([key, value], idx) => {
      if (!key.trim() && value.trim()) {
        newErrors[idx] = 'Header key is required when value is provided'
      }
    })
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [])

  const handleUpdateHeaderKey = useCallback((idx: number, key: string) => {
    setHeaders((prev) => {
      const newHeaders = [...prev]
      newHeaders[idx][0] = key

      // Add a new empty row if we are editing the last row
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
  }, [setHeaders])

  const handleUpdateHeaderValue = useCallback((idx: number, value: string) => {
    setHeaders((prev) => {
      const newHeaders = [...prev]
      newHeaders[idx][1] = value

      // Add a new empty row if we are editing the last row
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
  }, [setHeaders])

  const handleRemoveHeader = useCallback((idx: number) => {
    setHeaders((prev) => {
      const newHeaders = [...prev]
      newHeaders.splice(idx, 1)

      // Add a new empty row if there is no rows left
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
  }, [setHeaders])

  const handleSave = useCallback(() => {
    const filteredHeaders = headers.filter(([key, value]) => key.trim() || value.trim())
    
    if (!validateHeaders(filteredHeaders)) {
      return
    }
    
    const headersToSave = filteredHeaders.filter(([key, value]) => key.trim() && value.trim())

    if (headersToSave.length === 0) {
      removeHeaders()
    } else {
      updateHeaders(Object.fromEntries(headersToSave))
    }

    onOpenChange(false)
  }, [headers, updateHeaders, validateHeaders, onOpenChange, removeHeaders])

  const handleRemoveAll = useCallback(() => {
    removeHeaders()
    onOpenChange(false)
  }, [removeHeaders, onOpenChange])

  return (
    <Modal
      title='Custom headers'
      description='Add custom headers to the MCP requests'
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      footer={
        <div className="flex items-center gap-2">
          <Button variant='destructive' fancy onClick={handleRemoveAll}>Remove all</Button>
          <Button variant='default' fancy onClick={handleSave}>Save</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {headers.map(([key, value], idx) => (
          <div key={idx} className="flex flex-col gap-1">
            <div className={cn("flex items-center gap-2", { 'opacity-75': idx === headers.length - 1 })}>
              <Input
                value={key}
                onChange={(e) => handleUpdateHeaderKey(idx, e.target.value)}
                errors={errors[idx] ? [errors[idx]] : undefined}
                placeholder="Key"
                errorStyle="tooltip"
              />
              <Input
                value={value}
                onChange={(e) => handleUpdateHeaderValue(idx, e.target.value)}
                placeholder="Value"
              />
              <Button
                variant='ghost'
                className='p-0'
                onClick={() => handleRemoveHeader(idx)}
                iconProps={{ name: 'trash' }}
              />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function CustomMcpHeadersButton({ integration }: { integration: ActiveIntegration }) {
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
        size='small'
        iconProps={{ name: 'key' }} 
        onClick={() => setOpen(true)}
      />
    }
    >
      Custom headers
    </Tooltip>
    <CustomMcpHeadersModal
      integrationName={integration.name}
      open={open}
      onOpenChange={setOpen}
    />
    </>
  )
}