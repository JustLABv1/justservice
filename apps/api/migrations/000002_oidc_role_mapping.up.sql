ALTER TABLE oidc_providers
  ADD COLUMN roles_claim TEXT NOT NULL DEFAULT '',
  ADD COLUMN role_mappings JSONB NOT NULL DEFAULT '{}';
