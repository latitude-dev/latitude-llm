import { Button, cn, Icon, Text } from "@repo/ui"
import type { LucideIcon } from "lucide-react"
import { Check, SquareDashedBottomCode } from "lucide-react"
import { ONBOARDING_CLAUDE_CODE_LOGO_SRC } from "../assets.ts"

export type StackChoice = "coding-agent-machine" | "production-agent"

const STACK_CHOICE_OPTIONS: ReadonlyArray<{
  readonly id: StackChoice
  readonly title: string
  readonly description: string
  readonly leading:
    | { readonly type: "logo"; readonly src: string }
    | { readonly type: "icon"; readonly Icon: LucideIcon }
}> = [
  {
    id: "coding-agent-machine",
    title: "Coding agent",
    description: "Monitor your Claude Code or OpenClaw agent",
    leading: { type: "logo", src: ONBOARDING_CLAUDE_CODE_LOGO_SRC },
  },
  {
    id: "production-agent",
    title: "Production app or agent",
    description: "Track and debug LLM-powered features running in your own application",
    leading: { type: "icon", Icon: SquareDashedBottomCode },
  },
]

export function Left({
  stackChoice,
  setStackChoice,
  isSubmitting,
  onBack,
  onContinue,
}: {
  readonly stackChoice: StackChoice | null
  readonly setStackChoice: (choice: StackChoice) => void
  readonly isSubmitting: boolean
  readonly onBack: () => void
  readonly onContinue: () => void
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col">
      <div className="flex w-full flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="h-8 w-8">
            <img src="/favicon.svg" alt="Latitude" className="h-8 w-8" />
          </div>
          <div className="flex flex-col gap-2">
            <Text.H2 weight="medium">What do you want to monitor?</Text.H2>
            <Text.H4 color="foregroundMuted">Choose the type of AI system you want to observe with Latitude.</Text.H4>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {STACK_CHOICE_OPTIONS.map((option) => {
            const selected = stackChoice === option.id
            return (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "flex w-full flex-row items-start justify-between gap-4 rounded-lg border p-4 text-left cursor-pointer transition-colors hover:bg-accent/10",
                  selected ? "border-primary bg-accent/20" : "border-border",
                )}
                onClick={() => setStackChoice(option.id)}
              >
                <div className="flex min-w-0 flex-1 flex-row items-start gap-4">
                  <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-lg border border-border bg-card p-2">
                    {option.leading.type === "logo" ? (
                      <img
                        src={option.leading.src}
                        alt=""
                        decoding="async"
                        className="max-h-12 w-full max-w-full object-contain"
                        aria-hidden
                      />
                    ) : (
                      <option.leading.Icon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                    <Text.H4 weight="medium">{option.title}</Text.H4>
                    <Text.H5 color="foregroundMuted">{option.description}</Text.H5>
                  </div>
                </div>
                <div className="pt-1">
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                  >
                    {selected ? <Icon icon={Check} size="xs" /> : null}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
        <div className="flex flex-row flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button disabled={stackChoice === null || isSubmitting} onClick={onContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}
