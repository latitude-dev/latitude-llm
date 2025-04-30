import {
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationMetricSpecification,
  EvaluationResultMetadata,
  EvaluationResultV2,
  EvaluationSettings,
  EvaluationSpecification,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/constants'
import {
  Commit,
  Dataset,
  DatasetRow,
  DocumentLog,
  ProviderLogDto,
} from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TabSelectorOption } from '@latitude-data/web-ui/molecules/TabSelector'
import { TextColor } from '@latitude-data/web-ui/tokens'
import React from 'react'
import HumanEvaluationSpecification from './human'
import LlmEvaluationSpecification from './llm'
import RuleEvaluationSpecification from './rule'

export type ConfigurationFormProps<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  mode: 'create' | 'update'
  configuration: EvaluationConfiguration<T, M> // Note: remove and just use settings
  setConfiguration: (configuration: EvaluationConfiguration<T, M>) => void // Note: remove and just use setSettings
  settings: EvaluationSettings<T, M>
  setSettings: (settings: EvaluationSettings<T, M>) => void
  errors?: Record<string, string[]>
  disabled?: boolean
}

export type ResultBadgeProps<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  result: EvaluationResultV2<T, M>
}

export type ResultRowHeadersProps<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
}

export type ResultRowCellsProps<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  result: EvaluationResultV2<T, M>
  commit: Commit
  color: TextColor
}

export type ResultPanelProps<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  result: EvaluationResultV2<T, M>
  commit: Commit
  dataset?: Dataset
  evaluatedDatasetRow?: DatasetRow
  evaluatedProviderLog: ProviderLogDto
  evaluatedDocumentLog: DocumentLog
  panelRef: React.RefObject<HTMLDivElement>
  tableRef: React.RefObject<HTMLTableElement>
  selectedTab: string
}

export type AnnotationFormProps<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  resultScore?: number
  setResultScore: (resultScore: number) => void
  resultMetadata?: Partial<EvaluationResultMetadata<T, M>>
  setResultMetadata: (
    resultMetadata: Partial<EvaluationResultMetadata<T, M>>,
  ) => void
  providerLog: ProviderLogDto
  documentLog: DocumentLog
  commit: Commit
  disabled?: boolean
}

export type ChartConfigurationArgs<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
}

export type ChartConfigurationResult = {
  min: number
  max: number
  thresholds: {
    lower?: number
    upper?: number
  }
  scale: (point: number) => number
  format: (point: number, short?: boolean) => string
}

export type EvaluationMetricFrontendSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = EvaluationMetricSpecification<T, M> & {
  icon: IconName
  ConfigurationForm: (props: ConfigurationFormProps<T, M>) => React.ReactNode
  ResultBadge: (props: ResultBadgeProps<T, M>) => React.ReactNode
  ResultRowHeaders?: (props: ResultRowHeadersProps<T, M>) => React.ReactNode
  ResultRowCells?: (props: ResultRowCellsProps<T, M>) => React.ReactNode
  resultPanelTabs?: TabSelectorOption<string>[]
  ResultPanelMetadata?: (props: ResultPanelProps<T, M>) => React.ReactNode
  ResultPanelContent?: (props: ResultPanelProps<T, M>) => React.ReactNode
  AnnotationForm?: (props: AnnotationFormProps<T, M>) => React.ReactNode
  chartConfiguration: (
    args: ChartConfigurationArgs<T, M>,
  ) => ChartConfigurationResult
}

export type EvaluationFrontendSpecification<
  T extends EvaluationType = EvaluationType,
> = Omit<EvaluationSpecification<T>, 'metrics'> & {
  icon: IconName
  ConfigurationForm: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    props: ConfigurationFormProps<T, M> & { metric: M },
  ) => React.ReactNode
  ResultBadge: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    props: ResultBadgeProps<T, M> & { metric: M },
  ) => React.ReactNode
  ResultRowHeaders: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    props: ResultRowHeadersProps<T, M> & { metric: M },
  ) => React.ReactNode
  ResultRowCells: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    props: ResultRowCellsProps<T, M> & { metric: M },
  ) => React.ReactNode
  resultPanelTabs: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(args: {
    metric: M
  }) => TabSelectorOption<string>[]
  ResultPanelMetadata: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    props: ResultPanelProps<T, M> & { metric: M },
  ) => React.ReactNode
  ResultPanelContent: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    props: ResultPanelProps<T, M> & { metric: M },
  ) => React.ReactNode
  AnnotationForm?: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    props: AnnotationFormProps<T, M> & { metric: M },
  ) => React.ReactNode
  chartConfiguration: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    args: ChartConfigurationArgs<T, M> & { metric: M },
  ) => ChartConfigurationResult
  metrics: {
    [M in EvaluationMetric<T>]: EvaluationMetricFrontendSpecification<T, M>
  }
}

export const EVALUATION_SPECIFICATIONS: {
  [T in EvaluationType]: EvaluationFrontendSpecification<T>
} = {
  [EvaluationType.Rule]: RuleEvaluationSpecification,
  [EvaluationType.Llm]: LlmEvaluationSpecification,
  [EvaluationType.Human]: HumanEvaluationSpecification,
}

export function getEvaluationTypeSpecification<
  T extends EvaluationType = EvaluationType,
>(evaluation: EvaluationV2<T>) {
  return EVALUATION_SPECIFICATIONS[evaluation.type]
}

export function getEvaluationMetricSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(evaluation: EvaluationV2<T, M>) {
  return EVALUATION_SPECIFICATIONS[evaluation.type].metrics[evaluation.metric]
}
