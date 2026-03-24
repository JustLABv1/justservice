package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"

	"github.com/justlab/justservice/api/internal/config"
	"github.com/justlab/justservice/api/internal/models"
	"github.com/justlab/justservice/api/internal/rbac"
)

type Claims struct {
	UserID      string   `json:"uid"`
	Username    string   `json:"username"`
	Email       string   `json:"email"`
	Roles       []string `json:"roles"`
	Permissions []string `json:"perms"`
	jwt.RegisteredClaims
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

type Service struct {
	db   *sqlx.DB
	cfg  *config.JWTConfig
	rbac *rbac.Service
}

func New(db *sqlx.DB, cfg *config.JWTConfig, rbac *rbac.Service) *Service {
	return &Service{db: db, cfg: cfg, rbac: rbac}
}

func (s *Service) LoginLocal(ctx context.Context, username, password string) (*TokenPair, error) {
	var user models.User
	err := s.db.GetContext(ctx, &user, `
		SELECT * FROM users WHERE (username = $1 OR email = $1) AND is_active = true
	`, username)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}
	if !user.PasswordHash.Valid {
		return nil, errors.New("password login not available for this account")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash.String), []byte(password)); err != nil {
		return nil, errors.New("invalid credentials")
	}
	return s.issueTokens(ctx, user)
}

func (s *Service) RegisterLocal(ctx context.Context, username, email, password string) (*models.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	var user models.User
	err = s.db.GetContext(ctx, &user, `
		INSERT INTO users (id, username, email, password_hash)
		VALUES ($1, $2, $3, $4)
		RETURNING *
	`, uuid.New(), username, email, string(hash))
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	// First registered user gets admin; all subsequent users get the base role.
	var count int
	_ = s.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM users`)
	roleName := "user"
	if count <= 1 {
		roleName = "admin"
	}
	var roleID uuid.UUID
	if err := s.db.GetContext(ctx, &roleID, `SELECT id FROM roles WHERE name = $1`, roleName); err == nil {
		_ = s.rbac.AssignRole(ctx, user.ID, roleID)
	}
	return &user, nil
}

func (s *Service) RefreshTokens(ctx context.Context, refreshToken string) (*TokenPair, error) {
	var userID uuid.UUID
	err := s.db.GetContext(ctx, &userID, `
		SELECT user_id FROM refresh_tokens
		WHERE token = $1 AND expires_at > NOW() AND revoked = false
	`, refreshToken)
	if err != nil {
		return nil, errors.New("invalid or expired refresh token")
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE refresh_tokens SET revoked = true WHERE token = $1`, refreshToken)
	var user models.User
	if err := s.db.GetContext(ctx, &user, `SELECT * FROM users WHERE id = $1 AND is_active = true`, userID); err != nil {
		return nil, errors.New("user not found")
	}
	return s.issueTokens(ctx, user)
}

func (s *Service) RevokeRefreshToken(ctx context.Context, refreshToken string) {
	_, _ = s.db.ExecContext(ctx, `UPDATE refresh_tokens SET revoked = true WHERE token = $1`, refreshToken)
}

func (s *Service) ValidateAccessToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.cfg.Secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func (s *Service) GetUserByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var user models.User
	if err := s.db.GetContext(ctx, &user, `SELECT * FROM users WHERE id = $1`, id); err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Service) UpsertOIDCUser(ctx context.Context, subject, issuer, email, username string) (*models.User, error) {
	var user models.User
	err := s.db.GetContext(ctx, &user, `
		INSERT INTO users (id, username, email, oidc_subject, oidc_issuer)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (oidc_subject, oidc_issuer) DO UPDATE
		  SET email = EXCLUDED.email, username = EXCLUDED.username, updated_at = NOW()
		RETURNING *
	`, uuid.New(), username, email, subject, issuer)
	if err != nil {
		return nil, fmt.Errorf("upsert oidc user: %w", err)
	}
	var roleID uuid.UUID
	if err := s.db.GetContext(ctx, &roleID, `SELECT id FROM roles WHERE name = 'user'`); err == nil {
		_ = s.rbac.AssignRole(ctx, user.ID, roleID)
	}
	return &user, nil
}

func (s *Service) issueTokens(ctx context.Context, user models.User) (*TokenPair, error) {
	roles, _ := s.rbac.GetUserRoles(ctx, user.ID)
	perms, _ := s.rbac.GetUserPermissions(ctx, user.ID)

	now := time.Now()
	claims := &Claims{
		UserID:      user.ID.String(),
		Username:    user.Username,
		Email:       user.Email,
		Roles:       roles,
		Permissions: perms,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.AccessTokenTTL)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	accessToken, err := token.SignedString([]byte(s.cfg.Secret))
	if err != nil {
		return nil, fmt.Errorf("sign token: %w", err)
	}

	refreshToken, err := generateToken(32)
	if err != nil {
		return nil, err
	}

	_, err = s.db.ExecContext(ctx, `
		INSERT INTO refresh_tokens (token, user_id, expires_at)
		VALUES ($1, $2, $3)
	`, refreshToken, user.ID, now.Add(s.cfg.RefreshTokenTTL))
	if err != nil {
		log.Error().Err(err).Msg("store refresh token")
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(s.cfg.AccessTokenTTL.Seconds()),
	}, nil
}

func generateToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func ExtractBearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if len(header) > 7 && header[:7] == "Bearer " {
		return header[7:]
	}
	return ""
}
