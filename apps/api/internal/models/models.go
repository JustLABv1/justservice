package models

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
