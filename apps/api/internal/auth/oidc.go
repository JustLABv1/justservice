package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

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
		Scopes:       append([]string{go_oidc.ScopeOpenID, "profile", "email"}, []string(m.Scopes)...),
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
	callbackBaseURL = strings.TrimRight(callbackBaseURL, "/")
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
	cookie, err := r.Cookie(oidcStateCookieName)
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

// resolveRoles extracts roles from raw OIDC claims using a dot-separated path
// (e.g. "roles" or "realm_access.roles") and applies optional role_mappings.
//
// Behaviour:
//   - If rolesClaim is empty, returns nil (caller uses default "user" role).
//   - If the claim exists but is empty, returns nil (falls back to "user").
//   - If roleMappings is non-empty, only OIDC roles that appear as keys are
//     kept; unmapped roles are dropped.
//   - If roleMappings is empty, OIDC role names are used as-is.
func resolveRoles(claims map[string]any, rolesClaim string, roleMappings models.JSONB) []string {
	if rolesClaim == "" {
		return nil
	}

	// Navigate dot-separated path through the claims object.
	parts := strings.Split(rolesClaim, ".")
	var current any = claims
	for _, part := range parts {
		m, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = m[part]
	}

	// Extract a string slice from whatever value we found.
	var oidcRoles []string
	switch v := current.(type) {
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				oidcRoles = append(oidcRoles, s)
			}
		}
	case []string:
		oidcRoles = append(oidcRoles, v...)
	}

	if len(oidcRoles) == 0 {
		return nil
	}

	// Parse optional role_mappings JSON.
	var mappings map[string]string
	if len(roleMappings) > 0 {
		_ = json.Unmarshal(roleMappings, &mappings)
	}

	if len(mappings) == 0 {
		// No mappings configured: use OIDC role names as application role names.
		return oidcRoles
	}

	// Apply mappings; drop unmapped roles.
	seen := map[string]bool{}
	var appRoles []string
	for _, oidcRole := range oidcRoles {
		if appRole, ok := mappings[oidcRole]; ok && !seen[appRole] {
			seen[appRole] = true
			appRoles = append(appRoles, appRole)
		}
	}
	return appRoles
}
