{{- define "latitude.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "latitude.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "latitude.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "latitude.labels" -}}
helm.sh/chart: {{ include "latitude.chart" . }}
{{ include "latitude.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "latitude.selectorLabels" -}}
app.kubernetes.io/name: {{ include "latitude.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "latitude.image" -}}
{{- printf "%s/%s/%s:%s" .root.Values.image.registry .root.Values.image.repository .service (.root.Values.image.tag | default .root.Chart.AppVersion) -}}
{{- end -}}

{{- define "latitude.secretName" -}}
{{- .Values.secrets.existingSecret | default (printf "%s-secrets" (include "latitude.fullname" .)) -}}
{{- end -}}

{{- define "latitude.envFrom" -}}
- configMapRef:
    name: {{ include "latitude.fullname" . }}-env
- secretRef:
    name: {{ include "latitude.secretName" . }}
{{- end -}}

{{/* Ingress hosts derive from the public URLs; strip any explicit port. */}}
{{- define "latitude.urlHost" -}}
{{- (urlParse .).host | toString | splitList ":" | first -}}
{{- end -}}

{{/* Postgres host:user:password for the bundled Temporal stores. */}}
{{- define "latitude.temporalDbHost" -}}
{{- .Values.temporal.database.host | default (printf "%s-postgres" (include "latitude.fullname" .)) -}}
{{- end -}}

{{- define "latitude.temporalDbUser" -}}
{{- $user := .Values.temporal.database.username | default .Values.postgres.auth.username -}}
{{- if not $user }}{{ fail "Set temporal.database.username (and .password/.host) when postgres.enabled=false" }}{{ end -}}
{{- $user -}}
{{- end -}}

{{- define "latitude.temporalDbPassword" -}}
{{- $password := .Values.temporal.database.password | default .Values.postgres.auth.password -}}
{{- if not $password }}{{ fail "Set temporal.database.password (and .username/.host) when postgres.enabled=false" }}{{ end -}}
{{- $password -}}
{{- end -}}

{{/*
Shared scheduling and image-pull pod fields.
*/}}
{{- define "latitude.podSettings" -}}
{{- with .Values.image.pullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end -}}

{{/*
Deployment for one application service. Context: dict with
  root: $, name: service name, port: container port, probePath: health path
*/}}
{{- define "latitude.appDeployment" -}}
{{- $root := .root -}}
{{- $name := .name -}}
{{- $svc := index $root.Values $name -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "latitude.fullname" $root }}-{{ $name }}
  labels:
    {{- include "latitude.labels" $root | nindent 4 }}
    app.kubernetes.io/component: {{ $name }}
spec:
  replicas: {{ $svc.replicas }}
  selector:
    matchLabels:
      {{- include "latitude.selectorLabels" $root | nindent 6 }}
      app.kubernetes.io/component: {{ $name }}
  template:
    metadata:
      labels:
        {{- include "latitude.selectorLabels" $root | nindent 8 }}
        app.kubernetes.io/component: {{ $name }}
      annotations:
        checksum/config: {{ include (print $root.Template.BasePath "/configmap.yaml") $root | sha256sum }}
        {{- if not $root.Values.secrets.existingSecret }}
        checksum/secret: {{ include (print $root.Template.BasePath "/secret.yaml") $root | sha256sum }}
        {{- end }}
        {{- with $root.Values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
    spec:
      {{- include "latitude.podSettings" $root | nindent 6 }}
      containers:
        - name: {{ $name }}
          image: {{ include "latitude.image" (dict "root" $root "service" $name) }}
          imagePullPolicy: {{ $root.Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .port }}
          envFrom:
            {{- include "latitude.envFrom" $root | nindent 12 }}
          {{- $extra := concat ($root.Values.config.extraEnv | default list) ($svc.extraEnv | default list) }}
          {{- with $extra }}
          env:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          readinessProbe:
            httpGet:
              path: {{ .probePath }}
              port: http
            initialDelaySeconds: 10
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: {{ .probePath }}
              port: http
            initialDelaySeconds: 40
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 10
          {{- with $svc.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
{{- end -}}

{{/*
ClusterIP Service for one application service. Context: dict with
  root: $, name: service name, port: service port
*/}}
{{- define "latitude.appService" -}}
{{- $root := .root -}}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "latitude.fullname" $root }}-{{ .name }}
  labels:
    {{- include "latitude.labels" $root | nindent 4 }}
    app.kubernetes.io/component: {{ .name }}
spec:
  type: ClusterIP
  selector:
    {{- include "latitude.selectorLabels" $root | nindent 4 }}
    app.kubernetes.io/component: {{ .name }}
  ports:
    - name: http
      port: {{ .port }}
      targetPort: http
{{- end -}}
