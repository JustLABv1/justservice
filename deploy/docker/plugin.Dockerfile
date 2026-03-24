# Generic Dockerfile for any Go plugin in plugins/
# Usage: docker build --build-arg PLUGIN_DIR=hello-world .
ARG PLUGIN_DIR=hello-world

FROM golang:1.26-alpine AS builder

ARG PLUGIN_DIR
WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /plugin ./${PLUGIN_DIR}

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /plugin ./plugin
CMD ["./plugin"]
