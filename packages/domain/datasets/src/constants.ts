/**
 * Maximum row count for which dataset download is done synchronously (CSV returned in the request).
 * Above this threshold, export is enqueued and the user receives an email with a download link.
 */
export const DATASET_DOWNLOAD_DIRECT_THRESHOLD = 5_000

/**
 * Maximum number of traces that can be added to a dataset in a single operation.
 */
export const MAX_TRACES_PER_DATASET_IMPORT = 1_000
