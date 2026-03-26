# Generic Dockerfile for any Go plugin in plugins/
# Usage: docker build -f deploy/docker/plugin.Dockerfile --build-arg PLUGIN_DIR=garage .
ARG PLUGIN_DIR=garage

FROM golang:1.26-alpine AS builder

ARG PLUGIN_DIR
WORKDIR /build/plugins

COPY plugins/go.mod plugins/go.sum ./
COPY apps/api ../apps/api
RUN go mod download

COPY plugins ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /plugin ./${PLUGIN_DIR}

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /plugin ./plugin
CMD ["./plugin"]
