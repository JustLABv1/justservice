package main

import (
	"context"
	"fmt"
	"log"

	"github.com/justlab/justservice/plugins/sdk"
)

type helloTask struct{}

func (helloTask) Definition() sdk.TaskDefinition {
	return sdk.TaskDefinition{
		Name:        "Hello World",
		Slug:        "hello-world",
		Description: "Returns a personalised greeting. Great as a smoke-test.",
		Category:    "demos",
		IsSync:      true,
		InputSchema: map[string]any{
			"type":     "object",
			"required": []string{"name"},
			"properties": map[string]any{
				"name": map[string]any{
					"type":        "string",
					"title":       "Name",
					"description": "The name to include in the greeting",
				},
			},
		},
	}
}

func (helloTask) Execute(_ context.Context, ec sdk.ExecuteContext) (any, error) {
	name, _ := ec.Input["name"].(string)
	if name == "" {
		name = "World"
	}
	return map[string]any{
		"message":      fmt.Sprintf("Hello, %s!", name),
		"triggered_by": ec.Username,
		"execution_id": ec.ExecutionID,
	}, nil
}

func main() {
	p := &sdk.Plugin{
		Name:        "hello-world",
		Description: "Demo plugin with a simple greeting task",
		Version:     "1.0.0",
		GRPCAddr:    sdk.EnvOrDefault("GRPC_ADDR", "0.0.0.0:9001"),
		AdvertiseAddr: sdk.EnvOrDefault(
			"ADVERTISE_ADDR",
			sdk.EnvOrDefault("GRPC_ADDR", "0.0.0.0:9001"),
		),
		BackendAddr: sdk.EnvOrDefault("BACKEND_GRPC_ADDR", "localhost:9090"),
	}
	p.Register(helloTask{})
	if err := p.Run(); err != nil {
		log.Fatal(err)
	}
}
