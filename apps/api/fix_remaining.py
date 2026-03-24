#!/usr/bin/env python3
import os
import subprocess

BASE = "/Volumes/Storage/projects/justlab/justservice/apps/api"

files = {}

files["internal/models/models.go"] = '''package models

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// User represents an application user.
type User struct {
	ID           uuid.UUID      `db:"id" json:"id"`
	Email        string         `db:"email" json:"email"`
	Username     string         `db:"username" json:"username"`
	PasswordHash sql.NullString `db:"password_hash" json:"-"`
	OIDCSubject  sql.NullString `db:"oidc_subject" json:"oidc_subject,omitempty"`
	OIDCIssuer   sql.NullString `db:"oidc_issuer" json:"oidc_issuer,omitempty"`
	IsActive     bool           `db:"is_active" json:"is_active"`
	CreatedAt    time.Time      `db:"created_at" json:"created_at"`
	UpdatedAt    time.Time      `db:"updated_at" json:"updated_at"`
}

// Role represents an RBAC role.
type Role struct {
	ID          uuid.UUID `db:"id" json:"id"`
	Name        string    `db:"name" json:"name"`
	Description string    `db:"description" json:"description"`
	IsSystem    bool      `db:"is_system" json:"is_system"`
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
}

// Permission represents a fine-grained permission (resource:action).
type Permission struct {
	ID          uuid.UUID `db:"id" json:"id"`
	Name        string    `db:"name" json:"name"`
	Resource    string    `db:"resource" json:"resource"`
	Action      string    `db:"action" json:"action"`
	Description string    `db:"description" json:"description"`
}

// Plugin represents a registered plugin.
type Plugin struct {
	ID               uuid.UUID  `db:"id" json:"id"`
	Name             string     `db:"name" json:"name"`
	Description      string     `db:"description" json:"description"`
	GRPCAddress      string     `db:"grpc_address" json:"grpc_address"`
	Status           string     `db:"status" json:"status"` // healthy, unhealthy, unknown
	CapabilitiesJSON []byte     `db:"capabilities_json" json:"-"`
	RegisteredAt     time.Time  `db:"registered_at" json:"registered_at"`
	LastHeartbeat    *time.Time `db:"last_heartbeat" json:"last_heartbeat,omitempty"`
}

// TaskDefinition describes a task exposed by a plugin.
type TaskDefinition struct {
	ID              uuid.UUID       `db:"id" json:"id"`
	PluginID        uuid.UUID       `db:"plugin_id" json:"plugin_id"`
	PluginName      string          `db:"plugin_name,omitempty" json:"plugin_name,omitempty"`
	Name            string          `db:"name" json:"name"`
	Slug            string          `db:"slug" json:"slug"`
	Description     string          `db:"description" json:"description"`
	Category        string          `db:"category" json:"category"`
	InputSchemaJSON json.RawMessage `db:"input_schema_json" json:"input_schema"`
	IsSync          bool            `db:"is_sync" json:"is_sync"`
	RequiredPerms   []string        `db:"required_perms,omitempty" json:"required_permissions,omitempty"`
	CreatedAt       time.Time       `db:"created_at" json:"created_at"`
}

// ExecutionStatus constants.
const (
	ExecutionStatusPending   = "pending"
	ExecutionStatusRunning   = "running"
	ExecutionStatusCompleted = "completed"
	ExecutionStatusFailed    = "failed"
)

// Execution represents a task execution record.
type Execution struct {
	ID               uuid.UUID       `db:"id" json:"id"`
	UserID           uuid.UUID       `db:"user_id" json:"user_id"`
	TaskDefinitionID uuid.UUID       `db:"task_definition_id" json:"task_definition_id"`
	TaskSlug         string          `db:"task_slug,omitempty" json:"task_slug,omitempty"`
	TaskName         string          `db:"task_name,omitempty" json:"task_name,omitempty"`
	InputJSON        json.RawMessage `db:"input_json" json:"input"`
	OutputJSON       json.RawMessage `db:"output_json" json:"output,omitempty"`
	Status           string          `db:"status" json:"status"`
	Error            sql.NullString  `db:"error" json:"error,omitempty"`
	StartedAt        time.Time       `db:"started_at" json:"started_at"`
	CompletedAt      *time.Time      `db:"completed_at" json:"completed_at,omitempty"`
}

// OIDCProvider stores OIDC provider configuration.
type OIDCProvider struct {
	ID                    uuid.UUID `db:"id" json:"id"`
	Name                  string    `db:"name" json:"name"`
	IssuerURL             string    `db:"issuer_url" json:"issuer_url"`
	ClientID              string    `db:"client_id" json:"client_id"`
	ClientSecretEncrypted string    `db:"client_secret_encrypted" json:"-"`
	Scopes                []string  `db:"scopes" json:"scopes"`
	Enabled               bool      `db:"enabled" json:"enabled"`
	CreatedAt             time.Time `db:"created_at" json:"created_at"`
}

// AuditLog records all significant actions.
type AuditLog struct {
	ID           uuid.UUID       `db:"id" json:"id"`
	UserID       *uuid.UUID      `db:"user_id" json:"user_id,omitempty"`
	Action       string          `db:"action" json:"action"`
	ResourceType string          `db:"resource_type" json:"resource_type"`
	ResourceID   string          `db:"resource_id" json:"resource_id"`
	MetadataJSON json.RawMessage `db:"metadata_json" json:"metadata,omitempty"`
	CreatedAt    time.Time       `db:"created_at" json:"created_at"`
}
'''

files["internal/rbac/rbac.go"] = '''package rbac

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

const (
	PermAdminAccess   = "admin:access"
	PermPluginManage  = "plugin:manage"
	PermTaskExecute   = "task:execute"
	PermTaskViewAll   = "task:view_all"
	PermUserManage    = "user:manage"
	PermRoleManage    = "role:manage"
	PermOIDCManage    = "oidc:manage"
	PermSettingsManage = "settings:manage"
	PermAuditView     = "audit:view"
)

type Service struct {
	db *sqlx.DB
}

func New(db *sqlx.DB) *Service {
	return &Service{db: db}
}

func (s *Service) HasPermission(ctx context.Context, userID uuid.UUID, permission string) (bool, error) {
	var count int
	err := s.db.GetContext(ctx, &count, `
		SELECT COUNT(*)
		FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE ur.user_id = $1 AND (p.resource || \':\' || p.action) = $2
	`, userID, permission)
	if err != nil {
		return false, fmt.Errorf("check permission: %w", err)
	}
	return count > 0, nil
}

func (s *Service) GetUserRoles(ctx context.Context, userID uuid.UUID) ([]string, error) {
	var roles []string
	err := s.db.SelectContext(ctx, &roles, `
		SELECT r.name FROM roles r
		JOIN user_roles ur ON ur.role_id = r.id
		WHERE ur.user_id = $1
	`, userID)
	return roles, err
}

func (s *Service) GetUserPermissions(ctx context.Context, userID uuid.UUID) ([]string, error) {
	var perms []string
	err := s.db.SelectContext(ctx, &perms, `
		SELECT DISTINCT (p.resource || \':\' || p.action)
		FROM permissions p
		JOIN role_permissions rp ON rp.permission_id = p.id
		JOIN user_roles ur ON ur.role_id = rp.role_id
		WHERE ur.user_id = $1
	`, userID)
	return perms, err
}

func (s *Service) AssignRole(ctx context.Context, userID, roleID uuid.UUID) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO user_roles (user_id, role_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, userID, roleID)
	return err
}

func (s *Service) RemoveRole(ctx context.Context, userID, roleID uuid.UUID) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2
	`, userID, roleID)
	return err
}
'''

files["internal/respond/respond.go"] = '''package respond

import (
	"encoding/json"
	"net/http"
)

func JSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, map[string]string{"error": message})
}
'''

files["internal/middleware/middleware.go"] = '''package middleware

import (
	"net/http"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/justlab/justservice/api/internal/auth"
	"github.com/justlab/justservice/api/internal/rbac"
	"github.com/justlab/justservice/api/internal/respond"
	"github.com/google/uuid"
)

func Authenticate(authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := auth.ExtractBearerToken(r)
			if token == "" {
				respond.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}
			claims, err := authSvc.ValidateAccessToken(token)
			if err != nil {
				respond.Error(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}
			ctx := auth.SetClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func OptionalAuthenticate(authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := auth.ExtractBearerToken(r)
			if token != "" {
				if claims, err := authSvc.ValidateAccessToken(token); err == nil {
					r = r.WithContext(auth.SetClaims(r.Context(), claims))
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func RequirePermission(rbacSvc *rbac.Service, permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := auth.GetClaims(r.Context())
			if !ok {
				respond.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}
			userID, err := uuid.Parse(claims.UserID)
			if err != nil {
				respond.Error(w, http.StatusForbidden, "forbidden")
				return
			}
			ok, err = rbacSvc.HasPermission(r.Context(), userID, permission)
			if err != nil || !ok {
				respond.Error(w, http.StatusForbidden, "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(ww, r)
		log.Info().
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Int("status", ww.status).
			Dur("duration", time.Since(start)).
			Str("remote", r.RemoteAddr).
			Msg("request")
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(status int) {
	rw.status = status
	rw.ResponseWriter.WriteHeader(status)
}
'''

for rel_path, content in files.items():
    full_path = os.path.join(BASE, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w') as f:
        f.write(content)
    line_count = content.count('\n')
    print(f"Written {rel_path} ({line_count} lines)")

print("\nRunning go build...")
result = subprocess.run(
    ["go", "build", "./..."],
    cwd=BASE,
    capture_output=True,
    text=True
)
if result.returncode == 0:
    print("go build: SUCCESS")
else:
    print(f"go build errors:\n{result.stderr}")
