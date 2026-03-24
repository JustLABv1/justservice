package admin

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"github.com/justlab/justservice/api/internal/models"
	"github.com/justlab/justservice/api/internal/respond"
)

// Handler provides admin HTTP handlers.
type Handler struct {
	db *sqlx.DB
}

func New(db *sqlx.DB) *Handler {
	return &Handler{db: db}
}

// Stats returns dashboard stats.
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	var stats struct {
		TotalUsers      int `json:"total_users" db:"total_users"`
		TotalPlugins    int `json:"total_plugins" db:"total_plugins"`
		TotalTasks      int `json:"total_tasks" db:"total_tasks"`
		TotalExecutions int `json:"total_executions" db:"total_executions"`
		RunningNow      int `json:"running_now" db:"running_now"`
	}
	err := h.db.GetContext(r.Context(), &stats, `
		SELECT
		  (SELECT COUNT(*) FROM users) AS total_users,
		  (SELECT COUNT(*) FROM plugins WHERE status='healthy') AS total_plugins,
		  (SELECT COUNT(*) FROM task_definitions) AS total_tasks,
		  (SELECT COUNT(*) FROM executions) AS total_executions,
		  (SELECT COUNT(*) FROM executions WHERE status='running') AS running_now
	`)
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to load stats")
		return
	}
	respond.JSON(w, http.StatusOK, stats)
}

// ListExecutions returns all executions for all users (admin view).
func (h *Handler) ListExecutions(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	query := `
		SELECT e.*, td.slug as task_slug, td.name as task_name
		FROM executions e
		JOIN task_definitions td ON td.id = e.task_definition_id
		WHERE 1=1
	`
	args := []any{}
	if status != "" {
		query += " AND e.status = $1"
		args = append(args, status)
	}
	query += " ORDER BY e.started_at DESC LIMIT 200"
	var execs []models.Execution
	if err := h.db.SelectContext(r.Context(), &execs, query, args...); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to list executions")
		return
	}
	respond.JSON(w, http.StatusOK, execs)
}

// ListUsers returns all users.
func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	var users []models.User
	if err := h.db.SelectContext(r.Context(), &users, `SELECT * FROM users ORDER BY created_at DESC`); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	respond.JSON(w, http.StatusOK, users)
}

// ListPlugins returns all registered plugins.
func (h *Handler) ListPlugins(w http.ResponseWriter, r *http.Request) {
	var plugins []models.Plugin
	if err := h.db.SelectContext(r.Context(), &plugins, `SELECT * FROM plugins ORDER BY registered_at DESC`); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to list plugins")
		return
	}
	respond.JSON(w, http.StatusOK, plugins)
}

// DeregisterPlugin removes a plugin registration.
func (h *Handler) DeregisterPlugin(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid plugin id")
		return
	}
	_, err = h.db.ExecContext(r.Context(), `DELETE FROM plugins WHERE id=$1`, id)
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to deregister plugin")
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"message": "plugin deregistered"})
}

// ListRoles returns all roles.
func (h *Handler) ListRoles(w http.ResponseWriter, r *http.Request) {
	var roles []models.Role
	if err := h.db.SelectContext(r.Context(), &roles, `SELECT * FROM roles ORDER BY name`); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to list roles")
		return
	}
	respond.JSON(w, http.StatusOK, roles)
}

// ListPermissions returns all permissions.
func (h *Handler) ListPermissions(w http.ResponseWriter, r *http.Request) {
	var perms []models.Permission
	if err := h.db.SelectContext(r.Context(), &perms, `SELECT * FROM permissions ORDER BY resource, action`); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to list permissions")
		return
	}
	respond.JSON(w, http.StatusOK, perms)
}

// ListOIDCProviders returns configured OIDC providers (admin view with full config).
func (h *Handler) ListOIDCProviders(w http.ResponseWriter, r *http.Request) {
	var providers []models.OIDCProvider
	if err := h.db.SelectContext(r.Context(), &providers, `SELECT * FROM oidc_providers ORDER BY name`); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to list OIDC providers")
		return
	}
	respond.JSON(w, http.StatusOK, providers)
}

// CreateOIDCProvider adds a new OIDC provider.
func (h *Handler) CreateOIDCProvider(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name         string   `json:"name"`
		IssuerURL    string   `json:"issuer_url"`
		ClientID     string   `json:"client_id"`
		ClientSecret string   `json:"client_secret"`
		Scopes       []string `json:"scopes"`
		Enabled      bool     `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	scopesJSON, _ := json.Marshal(body.Scopes)
	var id uuid.UUID
	err := h.db.GetContext(r.Context(), &id, `
		INSERT INTO oidc_providers (id, name, issuer_url, client_id, client_secret_encrypted, scopes, enabled)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, uuid.New(), body.Name, body.IssuerURL, body.ClientID, body.ClientSecret, string(scopesJSON), body.Enabled)
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to create provider")
		return
	}
	respond.JSON(w, http.StatusCreated, map[string]string{"id": id.String()})
}

// AuditLog returns recent audit log entries.
func (h *Handler) AuditLog(w http.ResponseWriter, r *http.Request) {
	var entries []models.AuditLog
	if err := h.db.SelectContext(r.Context(), &entries, `
		SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500
	`); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to load audit log")
		return
	}
	respond.JSON(w, http.StatusOK, entries)
}
