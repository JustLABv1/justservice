package rbac

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
		WHERE ur.user_id = $1 AND (p.resource || ':' || p.action) = $2
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
		SELECT DISTINCT (p.resource || ':' || p.action)
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
