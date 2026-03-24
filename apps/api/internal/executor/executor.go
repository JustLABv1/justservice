package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"

	"github.com/justlab/justservice/api/internal/auth"
	"github.com/justlab/justservice/api/internal/models"
	"github.com/justlab/justservice/api/internal/plugin"
	"github.com/justlab/justservice/api/internal/respond"
	pluginv1 "github.com/justlab/justservice/api/proto/plugin/v1"
)

type Service struct {
	db       *sqlx.DB
	registry *plugin.Registry
}

func New(db *sqlx.DB, registry *plugin.Registry) *Service {
	return &Service{db: db, registry: registry}
}

func (s *Service) Execute(ctx context.Context, userID uuid.UUID, slug string, inputJSON json.RawMessage) (*models.Execution, error) {
	conn, td, err := s.registry.GetConnectionForTask(ctx, slug)
	if err != nil {
		return nil, err
	}
	exec, err := s.createExecution(ctx, userID, td.ID, inputJSON)
	if err != nil {
		return nil, fmt.Errorf("create execution record: %w", err)
	}
	if td.IsSync {
		s.executeSync(ctx, exec, td, conn)
	} else {
		go s.executeAsync(context.Background(), exec, td, conn)
	}
	return exec, nil
}

func (s *Service) createExecution(ctx context.Context, userID, taskDefID uuid.UUID, inputJSON json.RawMessage) (*models.Execution, error) {
	exec := &models.Execution{
		ID:               uuid.New(),
		UserID:           userID,
		TaskDefinitionID: taskDefID,
		InputJSON:        inputJSON,
		Status:           models.ExecutionStatusPending,
		StartedAt:        time.Now(),
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO executions (id, user_id, task_definition_id, input_json, status, started_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, exec.ID, exec.UserID, exec.TaskDefinitionID, exec.InputJSON, exec.Status, exec.StartedAt)
	return exec, err
}

func (s *Service) executeSync(ctx context.Context, exec *models.Execution, td *models.TaskDefinition, conn *grpc.ClientConn) {
	s.updateStatus(ctx, exec.ID, models.ExecutionStatusRunning, nil, nil)
	client := pluginv1.NewTaskExecutorServiceClient(conn)
	claims, _ := auth.GetClaims(ctx)
	req := &pluginv1.TaskRequest{
		ExecutionId: exec.ID.String(),
		TaskSlug:    td.Slug,
		InputJson:   string(exec.InputJSON),
	}
	if claims != nil {
		req.User = &pluginv1.UserContext{
			UserId:   claims.UserID,
			Username: claims.Username,
			Email:    claims.Email,
			Roles:    claims.Roles,
		}
	}
	resp, err := client.ExecuteSync(ctx, req)
	now := time.Now()
	if err != nil {
		errMsg := err.Error()
		s.updateStatus(ctx, exec.ID, models.ExecutionStatusFailed, &errMsg, &now)
		exec.Status = models.ExecutionStatusFailed
		return
	}
	if !resp.Success {
		s.updateStatus(ctx, exec.ID, models.ExecutionStatusFailed, &resp.Error, &now)
		exec.Status = models.ExecutionStatusFailed
		exec.Error.String = resp.Error
		return
	}
	output := json.RawMessage(resp.OutputJson)
	s.updateStatusWithOutput(ctx, exec.ID, models.ExecutionStatusCompleted, output, &now)
	exec.Status = models.ExecutionStatusCompleted
	exec.OutputJSON = output
}

func (s *Service) executeAsync(ctx context.Context, exec *models.Execution, td *models.TaskDefinition, conn *grpc.ClientConn) {
	s.updateStatus(ctx, exec.ID, models.ExecutionStatusRunning, nil, nil)
	client := pluginv1.NewTaskExecutorServiceClient(conn)
	stream, err := client.ExecuteAsync(ctx, &pluginv1.TaskRequest{
		ExecutionId: exec.ID.String(),
		TaskSlug:    td.Slug,
		InputJson:   string(exec.InputJSON),
	})
	if err != nil {
		now := time.Now()
		errMsg := err.Error()
		s.updateStatus(ctx, exec.ID, models.ExecutionStatusFailed, &errMsg, &now)
		return
	}
	for {
		progress, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			now := time.Now()
			errMsg := err.Error()
			s.updateStatus(ctx, exec.ID, models.ExecutionStatusFailed, &errMsg, &now)
			return
		}
		if progress.Status == "completed" {
			now := time.Now()
			output := json.RawMessage(progress.OutputJson)
			s.updateStatusWithOutput(ctx, exec.ID, models.ExecutionStatusCompleted, output, &now)
			return
		}
		if progress.Status == "failed" {
			now := time.Now()
			errMsg := progress.Error
			s.updateStatus(ctx, exec.ID, models.ExecutionStatusFailed, &errMsg, &now)
			return
		}
		log.Debug().
			Str("execution_id", exec.ID.String()).
			Int32("progress", progress.ProgressPct).
			Str("message", progress.Message).
			Msg("async task progress")
	}
}

func (s *Service) updateStatus(ctx context.Context, id uuid.UUID, status string, errMsg *string, completedAt *time.Time) {
	_, _ = s.db.ExecContext(ctx, `UPDATE executions SET status=$2, error=$3, completed_at=$4 WHERE id=$1`, id, status, errMsg, completedAt)
}

func (s *Service) updateStatusWithOutput(ctx context.Context, id uuid.UUID, status string, output json.RawMessage, completedAt *time.Time) {
	_, _ = s.db.ExecContext(ctx, `UPDATE executions SET status=$2, output_json=$3, completed_at=$4 WHERE id=$1`, id, status, output, completedAt)
}

type Handler struct {
	svc      *Service
	db       *sqlx.DB
	registry *plugin.Registry
}

func NewHandler(svc *Service, db *sqlx.DB, registry *plugin.Registry) *Handler {
	return &Handler{svc: svc, db: db, registry: registry}
}

func (h *Handler) ListTasks(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("q")
	var tasks []models.TaskDefinition
	query := `
		SELECT td.*, p.name as plugin_name
		FROM task_definitions td
		JOIN plugins p ON p.id = td.plugin_id
		WHERE p.status = 'healthy'
	`
	args := []any{}
	if search != "" {
		query += ` AND (td.name ILIKE $1 OR td.description ILIKE $1 OR td.category ILIKE $1)`
		args = append(args, "%"+search+"%")
	}
	query += ` ORDER BY td.category, td.name`
	if err := h.db.SelectContext(r.Context(), &tasks, query, args...); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to list tasks")
		return
	}
	respond.JSON(w, http.StatusOK, tasks)
}

func (h *Handler) GetTask(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	var td models.TaskDefinition
	err := h.db.GetContext(r.Context(), &td, `
		SELECT td.*, p.name as plugin_name
		FROM task_definitions td
		JOIN plugins p ON p.id = td.plugin_id
		WHERE td.slug = $1
	`, slug)
	if err != nil {
		respond.Error(w, http.StatusNotFound, "task not found")
		return
	}
	respond.JSON(w, http.StatusOK, td)
}

func (h *Handler) ExecuteTask(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	claims, ok := auth.GetClaims(r.Context())
	if !ok {
		respond.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}
	userID, _ := uuid.Parse(claims.UserID)
	var inputJSON json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&inputJSON); err != nil {
		inputJSON = json.RawMessage("{}")
	}
	exec, err := h.svc.Execute(r.Context(), userID, slug, inputJSON)
	if err != nil {
		respond.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.JSON(w, http.StatusAccepted, exec)
}

func (h *Handler) GetExecution(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid execution id")
		return
	}
	claims, _ := auth.GetClaims(r.Context())
	userID, _ := uuid.Parse(claims.UserID)
	var exec models.Execution
	if err := h.db.GetContext(r.Context(), &exec, `
		SELECT e.*, td.slug as task_slug, td.name as task_name
		FROM executions e
		JOIN task_definitions td ON td.id = e.task_definition_id
		WHERE e.id = $1 AND e.user_id = $2
	`, id, userID); err != nil {
		respond.Error(w, http.StatusNotFound, "execution not found")
		return
	}
	respond.JSON(w, http.StatusOK, exec)
}

func (h *Handler) ListExecutions(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.GetClaims(r.Context())
	userID, _ := uuid.Parse(claims.UserID)
	var execs []models.Execution
	if err := h.db.SelectContext(r.Context(), &execs, `
		SELECT e.*, td.slug as task_slug, td.name as task_name
		FROM executions e
		JOIN task_definitions td ON td.id = e.task_definition_id
		WHERE e.user_id = $1
		ORDER BY e.started_at DESC
		LIMIT 50
	`, userID); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to list executions")
		return
	}
	respond.JSON(w, http.StatusOK, execs)
}

func (h *Handler) StreamExecution(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid execution id")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		respond.Error(w, http.StatusInternalServerError, "streaming not supported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			var exec models.Execution
			if err := h.db.GetContext(r.Context(), &exec, `SELECT * FROM executions WHERE id=$1`, id); err != nil {
				fmt.Fprintf(w, "event: error\ndata: {\"error\":\"not found\"}\n\n")
				flusher.Flush()
				return
			}
			data, _ := json.Marshal(exec)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
			if exec.Status == models.ExecutionStatusCompleted || exec.Status == models.ExecutionStatusFailed {
				fmt.Fprintf(w, "event: done\ndata: {}\n\n")
				flusher.Flush()
				return
			}
		}
	}
}
