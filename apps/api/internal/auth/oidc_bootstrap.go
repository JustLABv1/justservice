package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"github.com/justlab/justservice/api/internal/config"
)

func ReconcileOIDCProviders(ctx context.Context, db *sqlx.DB, providers []config.OIDCProviderBootstrapConfig) error {
	seenNames := make(map[string]struct{}, len(providers))

	for index, provider := range providers {
		normalized, err := normalizeBootstrapProvider(provider)
		if err != nil {
			return fmt.Errorf("bootstrap provider %d: %w", index, err)
		}
		if _, exists := seenNames[normalized.Name]; exists {
			return fmt.Errorf("bootstrap provider %d: duplicate provider name %q", index, normalized.Name)
		}
		seenNames[normalized.Name] = struct{}{}

		scopesJSON, err := json.Marshal(normalized.Scopes)
		if err != nil {
			return fmt.Errorf("bootstrap provider %q: marshal scopes: %w", normalized.Name, err)
		}

		roleMappingsJSON, err := json.Marshal(normalized.RoleMappings)
		if err != nil {
			return fmt.Errorf("bootstrap provider %q: marshal role_mappings: %w", normalized.Name, err)
		}
		if normalized.RoleMappings == nil {
			roleMappingsJSON = []byte("{}")
		}

		if _, err := db.ExecContext(ctx, `
			INSERT INTO oidc_providers (id, name, issuer_url, client_id, client_secret_encrypted, scopes, roles_claim, role_mappings, enabled)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (name) DO UPDATE
			SET issuer_url = EXCLUDED.issuer_url,
			    client_id = EXCLUDED.client_id,
			    client_secret_encrypted = EXCLUDED.client_secret_encrypted,
			    scopes = EXCLUDED.scopes,
			    roles_claim = EXCLUDED.roles_claim,
			    role_mappings = EXCLUDED.role_mappings,
			    enabled = EXCLUDED.enabled
		`, uuid.New(), normalized.Name, normalized.IssuerURL, normalized.ClientID, normalized.ClientSecret, scopesJSON, normalized.RolesClaim, roleMappingsJSON, normalized.Enabled); err != nil {
			return fmt.Errorf("bootstrap provider %q: upsert provider: %w", normalized.Name, err)
		}
	}

	return nil
}

func normalizeBootstrapProvider(provider config.OIDCProviderBootstrapConfig) (config.OIDCProviderBootstrapConfig, error) {
	normalized := config.OIDCProviderBootstrapConfig{
		Name:         strings.TrimSpace(provider.Name),
		IssuerURL:    strings.TrimSpace(provider.IssuerURL),
		ClientID:     strings.TrimSpace(provider.ClientID),
		ClientSecret: strings.TrimSpace(provider.ClientSecret),
		RolesClaim:   strings.TrimSpace(provider.RolesClaim),
		RoleMappings: provider.RoleMappings,
		Enabled:      provider.Enabled,
	}

	for _, scope := range provider.Scopes {
		scope = strings.TrimSpace(scope)
		if scope == "" {
			continue
		}
		normalized.Scopes = append(normalized.Scopes, scope)
	}

	switch {
	case normalized.Name == "":
		return normalized, fmt.Errorf("name is required")
	case normalized.IssuerURL == "":
		return normalized, fmt.Errorf("issuer_url is required")
	case normalized.ClientID == "":
		return normalized, fmt.Errorf("client_id is required")
	case normalized.ClientSecret == "":
		return normalized, fmt.Errorf("client_secret is required")
	}

	return normalized, nil
}
