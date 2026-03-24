package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/justlab/justservice/plugins/sdk"
)

type webhookTask struct{}

func (webhookTask) Definition() sdk.TaskDefinition {
	return sdk.TaskDefinition{
		Name:        "Send Webhook",
		Slug:        "send-webhook",
		Description: "Sends an HTTP POST request to a URL and returns the response.",
		Category:    "integrations",
		IsSync:      false,
		InputSchema: map[string]any{
			"type":     "object",
			"required": []string{"url"},
			"properties": map[string]any{
				"url": map[string]any{
					"type":        "string",
					"title":       "Webhook URL",
					"description": "The URL to POST to",
				},
				"payload": map[string]any{
					"type":        "string",
					"title":       "JSON Payload",
					"description": "Optional JSON body (defaults to {})",
				},
				"timeout_seconds": map[string]any{
					"type":        "integer",
					"title":       "Timeout (seconds)",
					"description": "Request timeout in seconds (default 30)",
				},
			},
		},
	}
}

func (webhookTask) Execute(ctx context.Context, ec sdk.ExecuteContext) (any, error) {
	return sendWebhook(ctx, ec)
}

func (webhookTask) ExecuteAsync(ctx context.Context, ec sdk.ExecuteContext, progress chan<- sdk.AsyncProgress) {
	progress <- sdk.AsyncProgress{Pct: 10, Message: "Preparing request..."}
	result, err := sendWebhook(ctx, ec)
	if err != nil {
		progress <- sdk.AsyncProgress{Err: err.Error()}
		return
	}
	progress <- sdk.AsyncProgress{Pct: 100, Output: result}
}

func sendWebhook(ctx context.Context, ec sdk.ExecuteContext) (any, error) {
	url, _ := ec.Input["url"].(string)
	if url == "" {
		return nil, fmt.Errorf("url is required")
	}
	payload, _ := ec.Input["payload"].(string)
	if payload == "" {
		payload = "{}"
	}
	timeoutSec := 30
	if v, ok := ec.Input["timeout_seconds"].(float64); ok && v > 0 {
		timeoutSec = int(v)
	}
	client := &http.Client{Timeout: time.Duration(timeoutSec) * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader([]byte(payload)))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "JustService-Webhook/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var bodyJSON any
	if err := json.Unmarshal(body, &bodyJSON); err != nil {
		bodyJSON = string(body)
	}
	return map[string]any{
		"status_code": resp.StatusCode,
		"body":        bodyJSON,
	}, nil
}

func main() {
	p := &sdk.Plugin{
		Name:        "webhook",
		Description: "Plugin for dispatching outbound HTTP webhook requests",
		Version:     "1.0.0",
		GRPCAddr:    sdk.EnvOrDefault("GRPC_ADDR", "0.0.0.0:9002"),
		BackendAddr: sdk.EnvOrDefault("BACKEND_GRPC_ADDR", "localhost:9090"),
	}
	p.Register(webhookTask{})
	if err := p.Run(); err != nil {
		log.Fatal(err)
	}
}
