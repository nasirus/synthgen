{{/*
Expand the name of the chart.
*/}}
{{- define "synthgen.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "synthgen.fullname" -}}
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
{{- define "synthgen.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "synthgen.labels" -}}
helm.sh/chart: {{ include "synthgen.chart" . }}
{{ include "synthgen.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "synthgen.selectorLabels" -}}
app.kubernetes.io/name: {{ include "synthgen.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Determine the appropriate storage class to use
*/}}
{{- define "synthgen.storageClass" -}}
{{- if .Values.global.storageClass }}
  {{- .Values.global.storageClass }}
{{- else }}
  {{- $standardExists := (lookup "storage.k8s.io/v1" "StorageClass" "" "standard") }}
  {{- $hostpathExists := (lookup "storage.k8s.io/v1" "StorageClass" "" "hostpath") }}
  {{- if $standardExists }}
    {{- "standard" }}
  {{- else if $hostpathExists }}
    {{- "hostpath" }}
  {{- else }}
    {{- "standard" }}
  {{- end }}
{{- end }}
{{- end }} 