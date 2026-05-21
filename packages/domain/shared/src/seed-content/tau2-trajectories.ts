/**
 * Seed trajectories adapted from Sierra τ³-bench / tau2-bench published results.
 *
 * Source repository: https://github.com/sierra-research/tau2-bench
 * Source files under `data/tau2/results/final/`:
 * - gpt-4.1-2025-04-14_retail_default_gpt-4.1-2025-04-14_4trials.json
 * - gpt-4.1-2025-04-14_telecom_default_gpt-4.1-2025-04-14_4trials.json
 * - gpt-4.1-2025-04-14_airline_default_gpt-4.1-2025-04-14_4trials.json
 * - o4-mini-2025-04-16_retail_default_gpt-4.1-2025-04-14_4trials.json
 *
 * License: MIT (Copyright (c) 2025 Sierra Research)
 *
 * The generated JSON stores transformed published benchmark simulations so the
 * default seed project contains realistic AI customer-support agent traces with
 * user turns, assistant turns, tool calls, tool results, costs/outcomes, and
 * task metadata. Do not hand-edit the generated JSON; regenerate it from the
 * upstream result files when refreshing the snapshot.
 */

import generatedTau2Trajectories from "./tau2-trajectories.generated.json" with { type: "json" }

export type Tau2SeedTrajectoryMessage =
  | { readonly role: "user" | "assistant"; readonly content?: string; readonly toolCalls?: readonly Tau2SeedToolCall[] }
  | {
      readonly role: "tool"
      readonly id: string
      readonly name: string
      readonly content: string
      readonly error: boolean
    }

export type Tau2SeedToolCall = {
  readonly id: string
  readonly name: string
  readonly arguments: Record<string, unknown>
}

export type Tau2SeedTrajectory = {
  readonly id: string
  readonly domain: "airline" | "retail" | "telecom"
  readonly taskId: string
  readonly outcome: "success" | "failure"
  readonly reward: number
  readonly terminationReason: string
  readonly reasonForCall: string
  readonly expectedActions: readonly string[]
  readonly sourceFile: string
  readonly trial: number | null
  readonly messages: readonly Tau2SeedTrajectoryMessage[]
}

export type Tau2SeedIssueFamily = {
  readonly key:
    | "retail-return-eligibility"
    | "retail-authentication"
    | "retail-cancelled-order"
    | "telecom-troubleshooting"
    | "telecom-credit-policy"
    | "airline-reservation-changes"
    | "premature-transfer"
    | "tool-result-grounding"
  readonly title: string
  readonly description: string
}

export const TAU2_SEED_ISSUE_FAMILIES = [
  {
    key: "retail-return-eligibility",
    title: "Retail return eligibility",
    description: "Retail return/refund/exchange workflows that fail to verify item, order, policy, or refund state.",
  },
  {
    key: "retail-authentication",
    title: "Retail account authentication",
    description: "Retail account-specific actions before the customer is verified by email or name plus ZIP code.",
  },
  {
    key: "retail-cancelled-order",
    title: "Retail cancelled-order recovery",
    description: "Cancelled-order requests where the assistant overpromises reinstatement, delivery, or escalation.",
  },
  {
    key: "telecom-troubleshooting",
    title: "Telecom connectivity troubleshooting",
    description: "Connectivity flows that stop before the device/network state satisfies the customer's goal.",
  },
  {
    key: "telecom-credit-policy",
    title: "Telecom credits and billing relief",
    description: "Telecom credit, fee-waiver, and adjustment requests promised before policy eligibility is verified.",
  },
  {
    key: "airline-reservation-changes",
    title: "Airline reservation changes",
    description:
      "Airline booking, cancellation, baggage, passenger, or refund changes not grounded in reservation policy.",
  },
  {
    key: "premature-transfer",
    title: "Premature human transfer",
    description: "Requests handed to a human even though the available support workflow still has tool-backed steps.",
  },
  {
    key: "tool-result-grounding",
    title: "Tool-result grounding",
    description: "Assistant responses that treat missing, failed, or stale tool output as confirmed backend state.",
  },
] as const satisfies readonly Tau2SeedIssueFamily[]

export const TAU2_SEED_TRAJECTORIES = generatedTau2Trajectories as readonly Tau2SeedTrajectory[]

const textForTrajectory = (trajectory: Tau2SeedTrajectory): string =>
  [
    trajectory.domain,
    trajectory.reasonForCall,
    trajectory.expectedActions.join(" "),
    trajectory.messages
      .map((message) => {
        if (message.role === "tool") return `${message.name} ${message.content}`
        return `${message.content ?? ""} ${(message.toolCalls ?? []).map((call) => call.name).join(" ")}`
      })
      .join(" "),
  ]
    .join(" ")
    .toLowerCase()

export function classifyTau2SeedTrajectory(trajectory: Tau2SeedTrajectory): Tau2SeedIssueFamily["key"] | null {
  if (trajectory.outcome === "success" || trajectory.reward >= 1) return null

  const text = textForTrajectory(trajectory)

  if (trajectory.messages.some((message) => message.role === "tool" && message.error)) return "tool-result-grounding"
  if (text.includes("transfer_to_human_agents") || text.includes("###transfer###")) return "premature-transfer"

  if (trajectory.domain === "telecom") {
    if (/credit|fee|waiver|bill|billing|adjustment|refund/.test(text)) return "telecom-credit-policy"
    return "telecom-troubleshooting"
  }

  if (trajectory.domain === "airline") return "airline-reservation-changes"

  if (trajectory.domain === "retail") {
    if (/cancel|cancelled|canceled|reinstate|undo/.test(text)) return "retail-cancelled-order"
    if (/find_user|verify|identity|email|zip|account/.test(text) && !/return|refund|exchange/.test(text)) {
      return "retail-authentication"
    }
    return "retail-return-eligibility"
  }

  return "tool-result-grounding"
}
