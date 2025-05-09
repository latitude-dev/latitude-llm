export type OnboardingDocumentParameterKeys =
  | 'product_name'
  | 'features'
  | 'target_audience'
  | 'tone'
  | 'word_count'

export type OnboardingParameters = Record<OnboardingDocumentParameterKeys, string | number>
