#!/usr/bin/env python3
import os

BASE = "/Volumes/Storage/projects/justlab/justservice/apps/api"

files = {}

files["internal/auth/auth.go"] = '''package auth

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
	var roleID uuid.UUID
	if err := s.db.GetContext(ctx, &roleID, `SELECT id FROM roles WHERE name = \'user\'`); err == nil {
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
	if err := s.db.GetContext(ctx, &roleID, `SELECT id FROM roles WHERE name = \'user\'`); err == nil {
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
'''

files["internal/auth/oidc.go"] = '''package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"

	go_oidc "github.com/coreos/go-oidc/v3/oidc"
	"github.com/jmoiron/sqlx"
	"golang.org/x/oauth2"

	"github.com/justlab/justservice/api/internal/models"
)

type OIDCProvider struct {
	provider *go_oidc.Provider
	verifier *go_oidc.IDTokenVerifier
	config   oauth2.Config
	model    models.OIDCProvider
	db       *sqlx.DB
}

func NewOIDCProvider(ctx context.Context, m models.OIDCProvider, callbackURL string, db *sqlx.DB) (*OIDCProvider, error) {
	provider, err := go_oidc.NewProvider(ctx, m.IssuerURL)
	if err != nil {
		return nil, fmt.Errorf("init OIDC provider %q: %w", m.Name, err)
	}
	secret, err := decryptSecret(m.ClientSecretEncrypted)
	if err != nil {
		return nil, fmt.Errorf("decrypt client secret: %w", err)
	}
	oauthConfig := oauth2.Config{
		ClientID:     m.ClientID,
		ClientSecret: secret,
		RedirectURL:  callbackURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       append([]string{go_oidc.ScopeOpenID, "profile", "email"}, m.Scopes...),
	}
	verifier := provider.Verifier(&go_oidc.Config{ClientID: m.ClientID})
	return &OIDCProvider{
		provider: provider,
		verifier: verifier,
		config:   oauthConfig,
		model:    m,
		db:       db,
	}, nil
}

func (p *OIDCProvider) AuthCodeURL(state string) string {
	return p.config.AuthCodeURL(state, oauth2.AccessTypeOnline)
}

func (p *OIDCProvider) Exchange(ctx context.Context, code string) (*go_oidc.IDToken, error) {
	token, err := p.config.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		return nil, errors.New("no id_token in response")
	}
	idToken, err := p.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return nil, fmt.Errorf("verify id_token: %w", err)
	}
	return idToken, nil
}

func LoadOIDCProviders(ctx context.Context, db *sqlx.DB, callbackBaseURL string) (map[string]*OIDCProvider, error) {
	var providers []models.OIDCProvider
	if err := db.SelectContext(ctx, &providers, `SELECT * FROM oidc_providers WHERE enabled = true`); err != nil {
		return nil, err
	}
	result := make(map[string]*OIDCProvider, len(providers))
	for _, m := range providers {
		p, err := NewOIDCProvider(ctx, m, callbackBaseURL+"/api/auth/oidc/"+m.ID.String()+"/callback", db)
		if err != nil {
			continue
		}
		result[m.ID.String()] = p
	}
	return result, nil
}

func GenerateState() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

func ValidateState(r *http.Request, state string) error {
	cookie, err := r.Cookie("oidc_state")
	if err != nil {
		return errors.New("missing state cookie")
	}
	if cookie.Value != state {
		return errors.New("state mismatch")
	}
	return nil
}

func decryptSecret(encrypted string) (string, error) {
	return encrypted, nil
}
'''

files["internal/auth/handlers.go"] = '''package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/justlab/justservice/api/internal/respond"
)

type contextKey int

const claimsKey contextKey = 0

func SetClaims(ctx context.Context, claims *Claims) context.Context {
	return context.WithValue(ctx, claimsKey, claims)
}

func GetClaims(ctx context.Context) (*Claims, bool) {
	claims, ok := ctx.Value(claimsKey).(*Claims)
	return claims, ok
}

type Handler struct {
	svc           *Service
	oidcProviders map[string]*OIDCProvider
}

func NewHandler(svc *Service, oidcProviders map[string]*OIDCProvider) *Handler {
	return &Handler{svc: svc, oidcProviders: oidcProviders}
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Username == "" || body.Password == "" {
		respond.Error(w, http.StatusBadRequest, "username and password required")
		return
	}
	pair, err := h.svc.LoginLocal(r.Context(), body.Username, body.Password)
	if err != nil {
		respond.Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    pair.RefreshToken,
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
	})
	respond.JSON(w, http.StatusOK, pair)
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Username == "" || body.Email == "" || body.Password == "" {
		respond.Error(w, http.StatusBadRequest, "username, email, and password required")
		return
	}
	if len(body.Password) < 8 {
		respond.Error(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	user, err := h.svc.RegisterLocal(r.Context(), body.Username, body.Email, body.Password)
	if err != nil {
		log.Error().Err(err).Msg("register user")
		respond.Error(w, http.StatusConflict, "username or email already taken")
		return
	}
	respond.JSON(w, http.StatusCreated, user)
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("refresh_token")
	if err != nil {
		respond.Error(w, http.StatusUnauthorized, "no refresh token")
		return
	}
	pair, err := h.svc.RefreshTokens(r.Context(), cookie.Value)
	if err != nil {
		respond.Error(w, http.StatusUnauthorized, "invalid or expired refresh token")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    pair.RefreshToken,
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
	})
	respond.JSON(w, http.StatusOK, pair)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("refresh_token"); err == nil {
		h.svc.RevokeRefreshToken(r.Context(), cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:    "refresh_token",
		Value:   "",
		Path:    "/api/auth",
		Expires: time.Unix(0, 0),
		MaxAge:  -1,
	})
	respond.JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := GetClaims(r.Context())
	if !ok {
		respond.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "invalid user id in token")
		return
	}
	user, err := h.svc.GetUserByID(r.Context(), userID)
	if err != nil {
		respond.Error(w, http.StatusNotFound, "user not found")
		return
	}
	respond.JSON(w, http.StatusOK, map[string]any{
		"user":        user,
		"roles":       claims.Roles,
		"permissions": claims.Permissions,
	})
}

func (h *Handler) OIDCAuthorize(w http.ResponseWriter, r *http.Request) {
	providerID := r.PathValue("providerID")
	p, ok := h.oidcProviders[providerID]
	if !ok {
		respond.Error(w, http.StatusNotFound, "OIDC provider not found")
		return
	}
	state, err := GenerateState()
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to generate state")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_state",
		Value:    state,
		Path:     "/api/auth/oidc",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   300,
	})
	http.Redirect(w, r, p.AuthCodeURL(state), http.StatusFound)
}

func (h *Handler) OIDCCallback(w http.ResponseWriter, r *http.Request) {
	providerID := r.PathValue("providerID")
	p, ok := h.oidcProviders[providerID]
	if !ok {
		respond.Error(w, http.StatusNotFound, "OIDC provider not found")
		return
	}
	if err := ValidateState(r, r.URL.Query().Get("state")); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid state")
		return
	}
	idToken, err := p.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		log.Error().Err(err).Msg("OIDC exchange")
		respond.Error(w, http.StatusUnauthorized, "OIDC authentication failed")
		return
	}
	var stdClaims struct {
		Subject           string `json:"sub"`
		Email             string `json:"email"`
		PreferredUsername string `json:"preferred_username"`
		Name              string `json:"name"`
	}
	if err := idToken.Claims(&stdClaims); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to parse claims")
		return
	}
	username := stdClaims.PreferredUsername
	if username == "" {
		username = stdClaims.Name
	}
	if username == "" {
		username = stdClaims.Email
	}
	user, err := h.svc.UpsertOIDCUser(r.Context(), stdClaims.Subject, p.model.IssuerURL, stdClaims.Email, username)
	if err != nil {
		log.Error().Err(err).Msg("upsert OIDC user")
		respond.Error(w, http.StatusInternalServerError, "failed to create user")
		return
	}
	pair, err := h.svc.issueTokens(r.Context(), *user)
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to issue tokens")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    pair.RefreshToken,
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
	})
	http.Redirect(w, r, "/?token="+pair.AccessToken, http.StatusFound)
}

func (h *Handler) ListOIDCProviders(w http.ResponseWriter, r *http.Request) {
	type publicProvider struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	var result []publicProvider
	for id, p := range h.oidcProviders {
		result = append(result, publicProvider{ID: id, Name: p.model.Name})
	}
	respond.JSON(w, http.StatusOK, result)
}
'''

files["internal/executor/executor.go"] = '''package executor

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
		WHERE p.status = \'healthy\'
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
				fmt.Fprintf(w, "event: error\ndata: {\\"error\\":\\"not found\\"}\n\n")
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
'''

files["internal/plugin/registry.go"] = '''package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
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
	var pluginID uuid.UUID
	err = r.db.GetContext(ctx, &pluginID, `
		INSERT INTO plugins (id, name, description, grpc_address, status, registered_at, last_heartbeat)
		VALUES ($1, $2, $3, $4, \'healthy\', $5, $5)
		ON CONFLICT (name) DO UPDATE
		  SET description = EXCLUDED.description,
		      grpc_address = EXCLUDED.grpc_address,
		      status = \'healthy\',
		      last_heartbeat = $5
		RETURNING id
	`, uuid.New(), req.Name, req.Description, req.GrpcAddress, now)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("upsert plugin: %w", err)
	}

	for _, td := range defs.Tasks {
		schemaBytes, _ := json.Marshal(td.InputSchema)
		_, err := r.db.ExecContext(ctx, `
			INSERT INTO task_definitions (id, plugin_id, name, slug, description, category, input_schema_json, is_sync)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (slug) DO UPDATE
			  SET name = EXCLUDED.name,
			      description = EXCLUDED.description,
			      category = EXCLUDED.category,
			      input_schema_json = EXCLUDED.input_schema_json,
			      is_sync = EXCLUDED.is_sync
		`, uuid.New(), pluginID, td.Name, td.Slug, td.Description, td.Category, string(schemaBytes), td.IsSync)
		if err != nil {
			log.Error().Err(err).Str("slug", td.Slug).Msg("sync task definition")
		}
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

func (r *Registry) Heartbeat(ctx context.Context, pluginID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE plugins SET last_heartbeat = NOW(), status = \'healthy\'
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
		WHERE td.slug = $1 AND p.status = \'healthy\'
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
		UPDATE plugins SET status = \'unhealthy\'
		WHERE last_heartbeat < NOW() - INTERVAL \'60 seconds\'
		  AND status = \'healthy\'
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
'''

files["internal/server/server.go"] = '''package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/justlab/justservice/api/internal/admin"
	"github.com/justlab/justservice/api/internal/auth"
	"github.com/justlab/justservice/api/internal/executor"
	"github.com/justlab/justservice/api/internal/middleware"
	"github.com/justlab/justservice/api/internal/plugin"
	"github.com/justlab/justservice/api/internal/rbac"
)

func New(
	authSvc *auth.Service,
	authHandler *auth.Handler,
	rbacSvc *rbac.Service,
	registry *plugin.Registry,
	execHandler *executor.Handler,
	adminHandler *admin.Handler,
) http.Handler {
	r := chi.NewRouter()

	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "https://*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/api", func(r chi.Router) {
		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", authHandler.Login)
			r.Post("/register", authHandler.Register)
			r.Post("/refresh", authHandler.Refresh)
			r.Post("/logout", authHandler.Logout)
			r.Get("/oidc/providers", authHandler.ListOIDCProviders)
			r.Get("/oidc/{providerID}/authorize", authHandler.OIDCAuthorize)
			r.Get("/oidc/{providerID}/callback", authHandler.OIDCCallback)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.Authenticate(authSvc))

			r.Get("/auth/me", authHandler.Me)

			r.Route("/tasks", func(r chi.Router) {
				r.Get("/", execHandler.ListTasks)
				r.Get("/{slug}", execHandler.GetTask)
				r.With(middleware.RequirePermission(rbacSvc, rbac.PermTaskExecute)).
					Post("/{slug}/execute", execHandler.ExecuteTask)
			})

			r.Route("/executions", func(r chi.Router) {
				r.Get("/", execHandler.ListExecutions)
				r.Get("/{id}", execHandler.GetExecution)
				r.Get("/{id}/stream", execHandler.StreamExecution)
			})
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.Authenticate(authSvc))
			r.Use(middleware.RequirePermission(rbacSvc, rbac.PermAdminAccess))

			r.Route("/admin", func(r chi.Router) {
				r.Get("/stats", adminHandler.Stats)
				r.Get("/executions", adminHandler.ListExecutions)
				r.Get("/users", adminHandler.ListUsers)
				r.Get("/plugins", adminHandler.ListPlugins)
				r.Delete("/plugins/{id}", adminHandler.DeregisterPlugin)
				r.Get("/roles", adminHandler.ListRoles)
				r.Get("/permissions", adminHandler.ListPermissions)
				r.Get("/oidc", adminHandler.ListOIDCProviders)
				r.Post("/oidc", adminHandler.CreateOIDCProvider)
				r.Get("/audit-log", adminHandler.AuditLog)
			})
		})
	})

	return r
}
'''

files["cmd/server/main.go"] = '''package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/justlab/justservice/api/internal/admin"
	"github.com/justlab/justservice/api/internal/auth"
	"github.com/justlab/justservice/api/internal/config"
	"github.com/justlab/justservice/api/internal/db"
	"github.com/justlab/justservice/api/internal/executor"
	"github.com/justlab/justservice/api/internal/plugin"
	"github.com/justlab/justservice/api/internal/rbac"
	"github.com/justlab/justservice/api/internal/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("load config")
	}

	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if cfg.Log.Format == "console" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}
	level, err := zerolog.ParseLevel(cfg.Log.Level)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)

	database, err := db.Connect(&cfg.Database)
	if err != nil {
		log.Fatal().Err(err).Msg("connect to database")
	}
	defer database.Close()

	if err := db.Migrate(&cfg.Database); err != nil {
		log.Fatal().Err(err).Msg("run migrations")
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	rbacSvc := rbac.New(database)
	authSvc := auth.New(database, &cfg.JWT, rbacSvc)

	baseURL := os.Getenv("JUSTSERVICE_BASE_URL")
	if baseURL == "" {
		baseURL = fmt.Sprintf("http://localhost:%d", cfg.Server.Port)
	}
	oidcProviders, err := auth.LoadOIDCProviders(ctx, database, baseURL)
	if err != nil {
		log.Warn().Err(err).Msg("load OIDC providers")
		oidcProviders = map[string]*auth.OIDCProvider{}
	}

	authHandler := auth.NewHandler(authSvc, oidcProviders)

	registry := plugin.NewRegistry(database)
	registry.StartHealthMonitor(ctx)

	go func() {
		if err := plugin.ListenAndServeGRPC(ctx, cfg.GRPC.Addr(), registry); err != nil {
			log.Error().Err(err).Msg("gRPC server stopped")
		}
	}()

	execSvc := executor.New(database, registry)
	execHandler := executor.NewHandler(execSvc, database, registry)
	adminHandler := admin.New(database)

	handler := server.New(authSvc, authHandler, rbacSvc, registry, execHandler, adminHandler)
	httpServer := &http.Server{
		Addr:         cfg.Server.Addr(),
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Info().Str("addr", cfg.Server.Addr()).Msg("HTTP server listening")
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("HTTP server error")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("HTTP shutdown error")
	}
	log.Info().Msg("shutdown complete")
}
'''

for rel_path, content in files.items():
    full_path = os.path.join(BASE, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w') as f:
        f.write(content)
    line_count = content.count('\n')
    print(f"Written {rel_path} ({line_count} lines)")

print("All files written.")
