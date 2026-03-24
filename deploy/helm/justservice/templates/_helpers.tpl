{{/*
Expand the name of the chart.
*/}}
{{- define "justservice.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "justservice.fullname" -}}
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

{{/* Chart label */}}
{{- define "justservice.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Common labels */}}
{{- define "justservice.labels" -}}
helm.sh/chart: {{ include "justservice.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{/* Selector labels — component-scoped */}}
{{- define "justservice.selectorLabels" -}}
app.kubernetes.io/name: {{ include "justservice.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/* PostgreSQL service name */}}
{{- define "justservice.postgresHost" -}}
{{- printf "%s-postgresql" (include "justservice.fullname" .) }}
{{- end }}

{{/* Fully qualified image reference honoring global.imageRegistry when set */}}
{{- define "justservice.image" -}}
{{- $registry := .image.registry -}}
{{- $tag := .image.tag | default .root.Chart.AppVersion -}}
{{- if .root.Values.global.imageRegistry -}}
{{- $registry = .root.Values.global.imageRegistry -}}
{{- end -}}
{{- printf "%s/%s:%s" $registry .image.repository $tag -}}
{{- end }}

{{/* Plugin resource name */}}
{{- define "justservice.pluginFullname" -}}
{{- printf "%s-plugin-%s" (include "justservice.fullname" .root) .name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{/* API gRPC endpoint for plugin registration/callbacks */}}
{{- define "justservice.apiGrpcAddress" -}}
{{- printf "%s-api:%v" (include "justservice.fullname" .) .Values.api.service.grpcPort -}}
{{- end }}

{{/* Database DSN — built from bundled postgres when postgresql.enabled = true */}}
{{- define "justservice.databaseDsn" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "postgres://%s:%s@%s:5432/%s?sslmode=disable"
    .Values.postgresql.username
    .Values.postgresql.password
    (include "justservice.postgresHost" .)
    .Values.postgresql.database }}
{{- else }}
{{- .Values.database.dsn }}
{{- end }}
{{- end }}
