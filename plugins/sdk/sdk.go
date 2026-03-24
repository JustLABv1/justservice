// Package sdk provides helpers for building JustService plugins.
// A plugin must:
//  1. Implement one or more Handler (or AsyncHandler) types.
//  2. Create a Plugin, register the handlers, and call Plugin.Run().
//
// The SDK will:
//   - Start a gRPC server implementing TaskExecutorService.
//   - Register the plugin with the backend via PluginService.Register.
//   - Run a heartbeat loop to stay healthy.
package sdk

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	pluginv1 "github.com/justlab/justservice/api/proto/plugin/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// TaskDefinition describes a task offered by this plugin.
type TaskDefinition struct {
	Name                string
	Slug                string
	Description         string
	Category            string
	IsSync              bool
	InputSchema         any // will be JSON-marshalled
	RequiredPermissions []string
}

// ExecuteContext is passed to every Execute call.
type ExecuteContext struct {
	ExecutionID string
	TaskSlug    string
	Input       map[string]any
	UserID      string
	Username    string
	Email       string
	Roles       []string
}

// AsyncProgress is sent on the progress channel during async execution.
// Set Output when done, Err when failed; leave both empty for intermediate updates.
type AsyncProgress struct {
	Pct     int32
	Message string
	Output  any    // final output – signals completion
	Err     string // error message – signals failure
}

// Handler is the base interface every plugin task must implement.
type Handler interface {
	Definition() TaskDefinition
	Execute(ctx context.Context, ec ExecuteContext) (output any, err error)
}

// AsyncHandler extends Handler with native streaming support.
// The channel is closed automatically when ExecuteAsync returns.
type AsyncHandler interface {
	Handler
	ExecuteAsync(ctx context.Context, ec ExecuteContext, progress chan<- AsyncProgress)
}

// Plugin is the top-level entry point for a plugin binary.
type Plugin struct {
	Name        string // short name, e.g. "hello-world"
	Description string
	Version     string
	// GRPCAddr is the address this plugin's gRPC server listens on (e.g. "0.0.0.0:9001").
	GRPCAddr string
	// AdvertiseAddr is the address registered with the backend for callbacks.
	// When empty, GRPCAddr is used.
	AdvertiseAddr string
	// BackendAddr is the backend's plugin-registration gRPC address (e.g. "localhost:9090").
	BackendAddr string
	handlers    []Handler
}

// Register adds a task handler to the plugin.
func (p *Plugin) Register(h Handler) {
	p.handlers = append(p.handlers, h)
}

// Run starts everything, blocks until context cancellation or OS signal.
func (p *Plugin) Run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	lis, err := net.Listen("tcp", p.GRPCAddr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", p.GRPCAddr, err)
	}

	grpcServer := grpc.NewServer()
	pluginv1.RegisterTaskExecutorServiceServer(grpcServer, &executorServer{plugin: p})

	go func() {
		log.Printf("[%s] gRPC listening on %s", p.Name, p.GRPCAddr)
		if err := grpcServer.Serve(lis); err != nil {
			log.Printf("[%s] gRPC server stopped: %v", p.Name, err)
		}
	}()

	var pluginID string
	for attempt := 1; attempt <= 5; attempt++ {
		pluginID, err = p.registerWithBackend(ctx)
		if err == nil {
			break
		}
		log.Printf("[%s] registration attempt %d failed: %v", p.Name, attempt, err)
		select {
		case <-ctx.Done():
			grpcServer.GracefulStop()
			return nil
		case <-time.After(time.Duration(attempt*2) * time.Second):
		}
	}
	if err != nil {
		grpcServer.GracefulStop()
		return fmt.Errorf("register with backend: %w", err)
	}
	log.Printf("[%s] registered, plugin_id=%s", p.Name, pluginID)

	go p.heartbeatLoop(ctx, pluginID)

	<-ctx.Done()
	log.Printf("[%s] shutting down", p.Name)
	grpcServer.GracefulStop()
	return nil
}

func (p *Plugin) registerWithBackend(ctx context.Context) (string, error) {
	conn, err := grpc.NewClient(p.BackendAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return "", err
	}
	defer conn.Close()
	client := pluginv1.NewPluginServiceClient(conn)
	resp, err := client.Register(ctx, &pluginv1.RegisterRequest{
		Name:        p.Name,
		Description: p.Description,
		GrpcAddress: p.advertiseAddr(),
		Version:     p.Version,
	})
	if err != nil {
		return "", err
	}
	if !resp.Accepted {
		return "", fmt.Errorf("rejected: %s", resp.Message)
	}
	return resp.PluginId, nil
}

func (p *Plugin) heartbeatLoop(ctx context.Context, pluginID string) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.sendHeartbeat(ctx, pluginID)
		}
	}
}

func (p *Plugin) sendHeartbeat(ctx context.Context, pluginID string) {
	conn, err := grpc.NewClient(p.BackendAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Printf("[%s] heartbeat dial error: %v", p.Name, err)
		return
	}
	defer conn.Close()
	client := pluginv1.NewPluginServiceClient(conn)
	if _, err := client.Heartbeat(ctx, &pluginv1.HeartbeatRequest{PluginId: pluginID}); err != nil {
		log.Printf("[%s] heartbeat error: %v", p.Name, err)
	}
}

// EnvOrDefault returns the env var value or the provided default.
func EnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func (p *Plugin) advertiseAddr() string {
	if p.AdvertiseAddr != "" {
		return p.AdvertiseAddr
	}
	return p.GRPCAddr
}

// ----- gRPC server implementation -----

type executorServer struct {
	pluginv1.UnimplementedTaskExecutorServiceServer
	plugin *Plugin
}

func (s *executorServer) GetTaskDefinitions(_ context.Context, _ *pluginv1.GetTaskDefinitionsRequest) (*pluginv1.GetTaskDefinitionsResponse, error) {
	var defs []*pluginv1.TaskDefinition
	for _, h := range s.plugin.handlers {
		def := h.Definition()
		schema, _ := json.Marshal(def.InputSchema)
		defs = append(defs, &pluginv1.TaskDefinition{
			Name:                def.Name,
			Slug:                def.Slug,
			Description:         def.Description,
			Category:            def.Category,
			IsSync:              def.IsSync,
			InputSchema:         string(schema),
			RequiredPermissions: def.RequiredPermissions,
		})
	}
	return &pluginv1.GetTaskDefinitionsResponse{Tasks: defs}, nil
}

func (s *executorServer) ValidateInput(_ context.Context, req *pluginv1.ValidateInputRequest) (*pluginv1.ValidateInputResponse, error) {
	for _, h := range s.plugin.handlers {
		if h.Definition().Slug == req.TaskSlug {
			return &pluginv1.ValidateInputResponse{Valid: true}, nil
		}
	}
	return &pluginv1.ValidateInputResponse{
		Valid:  false,
		Errors: []string{"unknown task: " + req.TaskSlug},
	}, nil
}

func (s *executorServer) ExecuteSync(ctx context.Context, req *pluginv1.TaskRequest) (*pluginv1.TaskResponse, error) {
	h := s.findHandler(req.TaskSlug)
	if h == nil {
		return &pluginv1.TaskResponse{Success: false, Error: "unknown task: " + req.TaskSlug}, nil
	}
	var input map[string]any
	if err := json.Unmarshal([]byte(req.InputJson), &input); err != nil {
		return &pluginv1.TaskResponse{Success: false, Error: "invalid input JSON: " + err.Error()}, nil
	}
	out, err := h.Execute(ctx, makeExecCtx(req, input))
	if err != nil {
		return &pluginv1.TaskResponse{Success: false, Error: err.Error()}, nil
	}
	outJSON, _ := json.Marshal(out)
	return &pluginv1.TaskResponse{Success: true, OutputJson: string(outJSON)}, nil
}

func (s *executorServer) ExecuteAsync(req *pluginv1.TaskRequest, stream pluginv1.TaskExecutorService_ExecuteAsyncServer) error {
	h := s.findHandler(req.TaskSlug)
	if h == nil {
		return stream.Send(&pluginv1.TaskProgress{Status: "failed", Error: "unknown task: " + req.TaskSlug})
	}
	var input map[string]any
	_ = json.Unmarshal([]byte(req.InputJson), &input)
	ec := makeExecCtx(req, input)

	if ah, ok := h.(AsyncHandler); ok {
		ch := make(chan AsyncProgress, 16)
		go func() {
			ah.ExecuteAsync(stream.Context(), ec, ch)
			close(ch)
		}()
		for p := range ch {
			msg := &pluginv1.TaskProgress{ProgressPct: p.Pct, Message: p.Message}
			switch {
			case p.Err != "":
				msg.Status = "failed"
				msg.Error = p.Err
			case p.Output != nil:
				outJSON, _ := json.Marshal(p.Output)
				msg.Status = "completed"
				msg.OutputJson = string(outJSON)
				msg.ProgressPct = 100
			default:
				msg.Status = "running"
			}
			if err := stream.Send(msg); err != nil {
				return err
			}
		}
	} else {
		_ = stream.Send(&pluginv1.TaskProgress{Status: "running", Message: "executing", ProgressPct: 0})
		out, err := h.Execute(stream.Context(), ec)
		if err != nil {
			return stream.Send(&pluginv1.TaskProgress{Status: "failed", Error: err.Error()})
		}
		outJSON, _ := json.Marshal(out)
		return stream.Send(&pluginv1.TaskProgress{Status: "completed", ProgressPct: 100, OutputJson: string(outJSON)})
	}
	return nil
}

func (s *executorServer) findHandler(slug string) Handler {
	for _, h := range s.plugin.handlers {
		if h.Definition().Slug == slug {
			return h
		}
	}
	return nil
}

func makeExecCtx(req *pluginv1.TaskRequest, input map[string]any) ExecuteContext {
	ec := ExecuteContext{
		ExecutionID: req.ExecutionId,
		TaskSlug:    req.TaskSlug,
		Input:       input,
	}
	if req.User != nil {
		ec.UserID = req.User.UserId
		ec.Username = req.User.Username
		ec.Email = req.User.Email
		ec.Roles = req.User.Roles
	}
	return ec
}
