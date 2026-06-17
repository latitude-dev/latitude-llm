import type {
  DestinationKind,
  destinationConfigSchema,
  destinationCredentialsSchema,
  destinationSourceConfigSchema,
} from "@domain/destinations"
import type { FormAsyncValidateOrFn, FormValidateOrFn, ReactFormExtendedApi } from "@tanstack/react-form"
import type { ReactNode } from "react"
import type { z } from "zod"
import type { DestinationRecord } from "../../../../../../../domains/destinations/destinations.functions.ts"

/**
 * Schema *input* shapes (pre-`.default()`), matching what the create/update/test
 * server fns accept — so a builder may omit fields the schema defaults
 * server-side (e.g. PostHog's `intervalMs` / `maxSpansPerRun`).
 */
export type DestinationConfigInput = z.input<typeof destinationConfigSchema>
export type DestinationCredentialsInput = z.input<typeof destinationCredentialsSchema>
/** Per-source config a builder emits; `maxRecordsPerRun` etc. default server-side. */
export type DestinationSourceConfigInput = z.input<typeof destinationSourceConfigSchema>

/** Shell-owned fields merged onto every kind's own form values. */
export type DestinationFormValues<TKind> = { name: string } & TKind

type SyncValidators<T> = FormValidateOrFn<T> | undefined
type AsyncValidators<T> = FormAsyncValidateOrFn<T> | undefined

/**
 * The `useForm` instance the shell creates, as seen by a kind module's
 * {@link DestinationFormModule.Fields}. Validator slots stay open and
 * `TSubmitMeta` is `unknown` — mirroring what `useForm` infers for the shell's
 * form so a module's typed `Fields` accepts it directly (no validators are
 * wired; validation is server-side).
 */
export type DestinationFormApi<TKind> = ReactFormExtendedApi<
  DestinationFormValues<TKind>,
  SyncValidators<DestinationFormValues<TKind>>,
  SyncValidators<DestinationFormValues<TKind>>,
  AsyncValidators<DestinationFormValues<TKind>>,
  SyncValidators<DestinationFormValues<TKind>>,
  AsyncValidators<DestinationFormValues<TKind>>,
  SyncValidators<DestinationFormValues<TKind>>,
  AsyncValidators<DestinationFormValues<TKind>>,
  SyncValidators<DestinationFormValues<TKind>>,
  AsyncValidators<DestinationFormValues<TKind>>,
  AsyncValidators<DestinationFormValues<TKind>>,
  unknown
>

export interface DestinationFieldsProps<TKind> {
  readonly form: DestinationFormApi<TKind>
  readonly isEdit: boolean
  /** Project the destination belongs to — used by the per-source delivery preview. */
  readonly projectId: string
  /** The destination being edited (undefined on create) — e.g. for showing the masked stored secret. */
  readonly destination: DestinationRecord | undefined
}

/**
 * Everything the generic {@link DestinationFormModal} needs to drive one
 * destination kind: how to seed the form, render its config/credentials
 * fields, project form values onto the server payload, and word its
 * connection-test feedback. The shell owns the Modal chrome, name field, kind
 * picker, mutations, and test orchestration; a module owns only what is
 * specific to its kind. Field names must mirror the server payload paths
 * (`config.*`, `credentials.*`) so server validation errors map back inline.
 */
export interface DestinationFormModule<TKind> {
  readonly kind: DestinationKind
  readonly label: string
  readonly defaultValues: (destination: DestinationRecord | undefined) => TKind
  readonly buildConfig: (values: DestinationFormValues<TKind>) => DestinationConfigInput
  /** Per-source config rows the form persists alongside the destination (atomic on save). */
  readonly buildSourceConfigs: (values: DestinationFormValues<TKind>) => DestinationSourceConfigInput[]
  readonly buildCredentials: (values: DestinationFormValues<TKind>) => DestinationCredentialsInput
  /** Whether the user supplied a secret this time — false on edit means leave the stored secret untouched. */
  readonly credentialsProvided: (values: DestinationFormValues<TKind>) => boolean
  readonly Fields: (props: DestinationFieldsProps<TKind>) => ReactNode
}
