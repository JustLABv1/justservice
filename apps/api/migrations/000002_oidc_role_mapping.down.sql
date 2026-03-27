ALTER TABLE oidc_providers
  DROP COLUMN IF EXISTS roles_claim,
  DROP COLUMN IF EXISTS role_mappings;
