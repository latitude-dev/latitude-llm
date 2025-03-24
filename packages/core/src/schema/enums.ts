import { latitudeSchema } from './db-schema'

// Define the possible states for a K8s application
export const k8sAppStatusEnum = latitudeSchema.enum('k8s_app_status', [
  'pending',
  'deploying',
  'deployed',
  'failed',
  'deleting',
  'deleted',
])
