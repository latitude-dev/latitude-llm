import { Conversation, DetailSection, Text } from "@repo/ui"
import { ArrowDownRightIcon, ArrowUpRightIcon, BrainIcon, WrenchIcon } from "lucide-react"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { JsonBlock } from "./helpers.tsx"

export function LlmSections({ span }: { readonly span: SpanDetailRecord }) {
  const system = span.systemInstructions as unknown as GenAISystem
  const input = span.inputMessages as unknown as GenAIMessage[]
  const output = span.outputMessages as unknown as GenAIMessage[]

  return (
    <>
      <DetailSection icon={<BrainIcon className="w-4 h-4" />} label="System Instructions">
        {system.length ? (
          <div className="flex flex-col border-dashed border-border border-2 rounded-lg p-4 bg-secondary">
            <Conversation systemInstructions={system} messages={[]} />
          </div>
        ) : (
          <Text.H6 color="foregroundMuted">No system instructions</Text.H6>
        )}
      </DetailSection>

      <DetailSection icon={<ArrowDownRightIcon className="w-4 h-4" />} label="Input">
        {input.length ? (
          <div className="flex flex-col border-dashed border-border border-2 rounded-lg p-4 bg-secondary">
            <Conversation messages={input} />
          </div>
        ) : (
          <Text.H6 color="foregroundMuted">No input messages</Text.H6>
        )}
      </DetailSection>

      <DetailSection icon={<ArrowUpRightIcon className="w-4 h-4" />} label="Output">
        {output.length ? (
          <div className="flex flex-col border-dashed border-border border-2 rounded-lg p-4 bg-secondary">
            <Conversation messages={output} />
          </div>
        ) : (
          <Text.H6 color="foregroundMuted">No output messages</Text.H6>
        )}
      </DetailSection>

      <DetailSection icon={<WrenchIcon className="w-4 h-4" />} label="Available Tools">
        {span.toolDefinitions.length ? (
          <JsonBlock value={span.toolDefinitions} />
        ) : (
          <Text.H6 color="foregroundMuted">No tool definitions</Text.H6>
        )}
      </DetailSection>
    </>
  )
}
