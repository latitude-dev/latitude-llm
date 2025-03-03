export interface K8sTemplate {
  id: string
  name: string
  kind: string
  content: string
}

// Embedded templates
export const TEMPLATES: Record<string, K8sTemplate> = {
  'deployment/latitude-mcp': {
    id: 'deployment/latitude-mcp',
    name: 'latitude-mcp',
    kind: 'Deployment',
    content: `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{NAME}}
  namespace: {{NAMESPACE}}
  labels:
    app: {{NAME}}
spec:
  replicas: {{REPLICAS}}
  selector:
    matchLabels:
      app: {{NAME}}
  template:
    metadata:
      labels:
        app: {{NAME}}
    spec:
      containers:
        - name: {{NAME}}
          image: {{& IMAGE}}
          ports:
            - containerPort: 8000
          resources:
            limits:
              cpu: "{{CPU_LIMIT}}"
              memory: "{{MEMORY_LIMIT}}"
            requests:
              cpu: "{{CPU_REQUEST}}"
              memory: "{{MEMORY_REQUEST}}"
          {{#COMMAND}}
          command: [{{{COMMAND}}}]
          {{/COMMAND}}
          {{#ARGS}}
          args: {{{ARGS}}}
          {{/ARGS}}
          {{#HAS_ENV_VARS}}
          envFrom:
            - secretRef:
                name: {{NAME}}-secrets-{{SECRET_HASH}}
          {{/HAS_ENV_VARS}}
`,
  },
  'service/latitude-mcp': {
    id: 'service/latitude-mcp',
    name: 'latitude-mcp',
    kind: 'Service',
    content: `
apiVersion: v1
kind: Service
metadata:
  name: {{NAME}}
  namespace: {{NAMESPACE}}
  labels:
    app: {{NAME}}
spec:
  ports:
    - port: 80
      targetPort: 8000
      protocol: TCP
  selector:
    app: {{NAME}}
`,
  },
  'ingress/latitude-app': {
    id: 'ingress/latitude-app',
    name: 'latitude-app',
    kind: 'Ingress',
    content: `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{NAME}}-ingress
  namespace: {{NAMESPACE}}
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: {{SCHEME}}
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/group.name: latitude-mcps-{{NODE_ENV}}
    alb.ingress.kubernetes.io/healthcheck-path: /health
spec:
  ingressClassName: alb
  rules:
    - host: {{NAME}}.{{LATITUDE_MCP_HOST}}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{NAME}}
                port:
                  number: 80
  {{#TLS_ENABLED}}
  tls:
    - hosts:
        - {{NAME}}.{{LATITUDE_MCP_HOST}}
      secretName: {{TLS_SECRET_NAME}}
  {{/TLS_ENABLED}}
`,
  },
  'secret/app-secrets': {
    id: 'secret/app-secrets',
    name: 'app-secrets',
    kind: 'Secret',
    content: `
apiVersion: v1
kind: Secret
metadata:
  name: {{NAME}}-secrets-{{SECRET_HASH}}
  namespace: {{NAMESPACE}}
type: Opaque
data:
  {{#SECRET_DATA}}
  {{{SECRET_DATA}}}
  {{/SECRET_DATA}}
`,
  },
}
