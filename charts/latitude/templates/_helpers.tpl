{{/*
Expand the name of the chart.
*/}}
{{- define "latitude.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "latitude.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "latitude.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "latitude.labels" -}}
helm.sh/chart: {{ include "latitude.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: latitude
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end }}

{{/*
Component-specific labels
*/}}
{{- define "latitude.componentLabels" -}}
{{ include "latitude.labels" . }}
app.kubernetes.io/name: {{ .componentName }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Component-specific selector labels
*/}}
{{- define "latitude.selectorLabels" -}}
app.kubernetes.io/name: {{ .componentName }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Resolve image for a component.
Usage: {{ include "latitude.image" (dict "component" .Values.web "global" .Values.global) }}
*/}}
{{- define "latitude.image" -}}
{{- $registry := .global.image.registry -}}
{{- $repository := default .global.image.repository .component.image.repository -}}
{{- $tag := default (default .global.image.tag .chart.AppVersion) .component.image.tag -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry $repository $tag -}}
{{- else -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end -}}
{{- end }}

{{/*
Name of the secret to use.
Returns the existing secret name if set, otherwise the generated secret name.
*/}}
{{- define "latitude.secretName" -}}
{{- if .Values.existingSecret -}}
{{- .Values.existingSecret -}}
{{- else -}}
{{- include "latitude.fullname" . -}}
{{- end -}}
{{- end }}

{{/*
Name of the configmap.
*/}}
{{- define "latitude.configmapName" -}}
{{- include "latitude.fullname" . -}}-config
{{- end }}

{{/*
Service account name.
*/}}
{{- define "latitude.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "latitude.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
