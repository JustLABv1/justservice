package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/justlab/justservice/api/internal/models"
	pluginv1 "github.com/justlab/justservice/api/proto/plugin/v1"
)

type Registry struct {
	db          *sqlx.DB
	mu          sync.RWMutex
	connections map[uuid.UUID]*grpc.ClientConn
}

func NewRegistry(db *sqlx.DB) *Registry {
	return &Registry{
		db:          db,
		connections: make(map[uuid.UUID]*grpc.ClientConn),
	}
}

func (r *Registry) RegisterPlugin(ctx context.Context, req *pluginv1.RegisterRequest) (*pluginv1.RegisterResponse, error) {
	conn, err := grpc.NewClient(req.GrpcAddress,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return &pluginv1.RegisterResponse{Accepted: false, Message: "cannot connect to plugin"}, nil
	}

	client := pluginv1.NewTaskExecutorServiceClient(conn)
	defs, err := client.GetTaskDefinitions(ctx, &pluginv1.GetTaskDefinitionsRequest{})
	if err != nil {
		conn.Close()
		return &pluginv1.RegisterResponse{Accepted: false, Message: fmt.Sprintf("get tasks: %v", err)}, nil
	}

	now := time.Now()
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("begin plugin sync transaction: %w", err)
	}
	defer tx.Rollback()

	var pluginID uuid.UUID
	err = tx.GetContext(ctx, &pluginID, `
		INSERT INTO plugins (id, name, description, grpc_address, status, registered_at, last_heartbeat)
		VALUES ($1, $2, $3, $4, 'healthy', $5, $5)
		ON CONFLICT (name) DO UPDATE
		  SET description = EXCLUDED.description,
		      grpc_address = EXCLUDED.grpc_address,
		      status = 'healthy',
		      last_heartbeat = $5
		RETURNING id
	`, uuid.New(), req.Name, req.Description, req.GrpcAddress, now)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("upsert plugin: %w", err)
	}

	slugs := make([]string, 0, len(defs.Tasks))
	for _, td := range defs.Tasks {
		schemaBytes, err := normalizeTaskSchema(td.InputSchema)
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("decode schema for task %q: %w", td.Slug, err)
		}

		slugs = append(slugs, td.Slug)
		_, err = tx.ExecContext(ctx, `
			INSERT INTO task_definitions (id, plugin_id, name, slug, description, category, input_schema_json, is_sync)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (slug) DO UPDATE
			  SET name = EXCLUDED.name,
			      description = EXCLUDED.description,
			      category = EXCLUDED.category,
			      input_schema_json = EXCLUDED.input_schema_json,
			      is_sync = EXCLUDED.is_sync
		`, uuid.New(), pluginID, td.Name, td.Slug, td.Description, td.Category, schemaBytes, td.IsSync)
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("sync task definition %q: %w", td.Slug, err)
		}
	}

	if len(slugs) == 0 {
		if _, err := tx.ExecContext(ctx, `DELETE FROM task_definitions WHERE plugin_id = $1`, pluginID); err != nil {
			conn.Close()
			return nil, fmt.Errorf("cleanup task definitions for plugin %q: %w", req.Name, err)
		}
	} else {
		if _, err := tx.ExecContext(ctx, `
			DELETE FROM task_definitions
			WHERE plugin_id = $1 AND NOT (slug = ANY($2))
		`, pluginID, pq.Array(slugs)); err != nil {
			conn.Close()
			return nil, fmt.Errorf("cleanup stale task definitions for plugin %q: %w", req.Name, err)
		}
	}

	if err := tx.Commit(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("commit plugin sync transaction: %w", err)
	}

	r.mu.Lock()
	r.connections[pluginID] = conn
	r.mu.Unlock()

	log.Info().Str("plugin", req.Name).Str("id", pluginID.String()).
		Int("tasks", len(defs.Tasks)).Msg("plugin registered")

	return &pluginv1.RegisterResponse{
		PluginId: pluginID.String(),
		Accepted: true,
		Message:  "registered successfully",
	}, nil
}

func normalizeTaskSchema(raw string) (json.RawMessage, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return json.RawMessage(`{}`), nil
	}

	if !json.Valid([]byte(trimmed)) {
		return nil, fmt.Errorf("invalid JSON schema")
	}

	return json.RawMessage(trimmed), nil
}

func (r *Registry) Heartbeat(ctx context.Context, pluginID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE plugins SET last_heartbeat = NOW(), status = 'healthy'
		WHERE id = $1
	`, pluginID)
	return err
}

func (r *Registry) GetConnection(pluginID uuid.UUID) (*grpc.ClientConn, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	conn, ok := r.connections[pluginID]
	return conn, ok
}

func (r *Registry) GetConnectionForTask(ctx context.Context, slug string) (*grpc.ClientConn, *models.TaskDefinition, error) {
	var td models.TaskDefinition
	err := r.db.GetContext(ctx, &td, `
		SELECT td.*, p.name as plugin_name
		FROM task_definitions td
		JOIN plugins p ON p.id = td.plugin_id
		WHERE td.slug = $1 AND p.status = 'healthy'
	`, slug)
	if err != nil {
		return nil, nil, fmt.Errorf("task %q not found or plugin unhealthy: %w", slug, err)
	}

	conn, ok := r.GetConnection(td.PluginID)
	if !ok {
		p, err := r.getPlugin(ctx, td.PluginID)
		if err != nil {
			return nil, nil, fmt.Errorf("plugin not connected: %w", err)
		}
		conn, err = grpc.NewClient(p.GRPCAddress, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err != nil {
			return nil, nil, fmt.Errorf("reconnect plugin: %w", err)
		}
		r.mu.Lock()
		r.connections[td.PluginID] = conn
		r.mu.Unlock()
	}
	return conn, &td, nil
}

func (r *Registry) getPlugin(ctx context.Context, id uuid.UUID) (*models.Plugin, error) {
	var p models.Plugin
	return &p, r.db.GetContext(ctx, &p, `SELECT * FROM plugins WHERE id = $1`, id)
}

func (r *Registry) StartHealthMonitor(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				r.checkHealth(ctx)
			}
		}
	}()
}

func (r *Registry) checkHealth(ctx context.Context) {
	_, err := r.db.ExecContext(ctx, `
		UPDATE plugins SET status = 'unhealthy'
		WHERE last_heartbeat < NOW() - INTERVAL '60 seconds'
		  AND status = 'healthy'
	`)
	if err != nil {
		log.Error().Err(err).Msg("health check query")
	}
}

type gRPCRegistrationServer struct {
	pluginv1.UnimplementedPluginServiceServer
	registry *Registry
}

func NewGRPCServer(registry *Registry) *grpc.Server {
	s := grpc.NewServer()
	pluginv1.RegisterPluginServiceServer(s, &gRPCRegistrationServer{registry: registry})
	return s
}

func (s *gRPCRegistrationServer) Register(ctx context.Context, req *pluginv1.RegisterRequest) (*pluginv1.RegisterResponse, error) {
	return s.registry.RegisterPlugin(ctx, req)
}

func (s *gRPCRegistrationServer) Heartbeat(ctx context.Context, req *pluginv1.HeartbeatRequest) (*pluginv1.HeartbeatResponse, error) {
	id, err := uuid.Parse(req.PluginId)
	if err != nil {
		return &pluginv1.HeartbeatResponse{Ok: false}, nil
	}
	if err := s.registry.Heartbeat(ctx, id); err != nil {
		return &pluginv1.HeartbeatResponse{Ok: false}, nil
	}
	return &pluginv1.HeartbeatResponse{Ok: true}, nil
}

func ListenAndServeGRPC(ctx context.Context, addr string, registry *Registry) error {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("grpc listen: %w", err)
	}
	srv := NewGRPCServer(registry)
	log.Info().Str("addr", addr).Msg("gRPC registration server listening")
	go func() {
		<-ctx.Done()
		srv.GracefulStop()
	}()
	return srv.Serve(lis)
}
