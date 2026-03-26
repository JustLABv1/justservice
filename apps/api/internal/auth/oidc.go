package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
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
