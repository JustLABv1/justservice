-- 000001_init.up.sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE users (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username         VARCHAR(100) NOT NULL UNIQUE,
    email            VARCHAR(255) NOT NULL UNIQUE,
    password_hash    TEXT,
    oidc_subject     VARCHAR(255),
    oidc_issuer      TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (oidc_subject, oidc_issuer)
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
    token       TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Roles
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    is_system   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permissions
CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    resource    VARCHAR(100) NOT NULL,
    action      VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    UNIQUE (resource, action)
);

-- Role <-> Permission join
CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- User <-> Role join
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- OIDC providers
CREATE TABLE oidc_providers (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                     VARCHAR(100) NOT NULL UNIQUE,
    issuer_url               TEXT NOT NULL,
    client_id                TEXT NOT NULL,
    client_secret_encrypted  TEXT NOT NULL,
    scopes                   JSONB NOT NULL DEFAULT '[]',
    enabled                  BOOLEAN NOT NULL DEFAULT true,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Plugins
CREATE TABLE plugins (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT NOT NULL DEFAULT '',
    grpc_address    TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'unknown',
    capabilities_json JSONB,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat  TIMESTAMPTZ
);

-- Task definitions (registered by plugins)
CREATE TABLE task_definitions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plugin_id        UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    name             VARCHAR(200) NOT NULL,
    slug             VARCHAR(200) NOT NULL UNIQUE,
    description      TEXT NOT NULL DEFAULT '',
    category         VARCHAR(100) NOT NULL DEFAULT 'general',
    input_schema_json JSONB NOT NULL DEFAULT '{}',
    is_sync          BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_task_definitions_plugin_id ON task_definitions(plugin_id);
CREATE INDEX idx_task_definitions_slug ON task_definitions(slug);

-- Executions
CREATE TABLE executions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id),
    task_definition_id  UUID NOT NULL REFERENCES task_definitions(id),
    input_json          JSONB NOT NULL DEFAULT '{}',
    output_json         JSONB,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    error               TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);
CREATE INDEX idx_executions_user_id ON executions(user_id);
CREATE INDEX idx_executions_status ON executions(status);

-- Audit log
CREATE TABLE audit_log (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    action        VARCHAR(200) NOT NULL,
    resource_type VARCHAR(100) NOT NULL DEFAULT '',
    resource_id   VARCHAR(200) NOT NULL DEFAULT '',
    metadata_json JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Platform settings
CREATE TABLE settings (
    key        VARCHAR(100) PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Seed data: built-in permissions
-- ============================================================
INSERT INTO permissions (id, name, resource, action, description) VALUES
    (uuid_generate_v4(), 'admin:access',    'admin',    'access',    'Access the admin dashboard'),
    (uuid_generate_v4(), 'plugin:manage',   'plugin',   'manage',    'Manage plugin registrations'),
    (uuid_generate_v4(), 'task:execute',    'task',     'execute',   'Execute tasks'),
    (uuid_generate_v4(), 'task:view_all',   'task',     'view_all',  'View all task executions'),
    (uuid_generate_v4(), 'user:manage',     'user',     'manage',    'Create and manage users'),
    (uuid_generate_v4(), 'role:manage',     'role',     'manage',    'Create and manage roles'),
    (uuid_generate_v4(), 'oidc:manage',     'oidc',     'manage',    'Configure OIDC providers'),
    (uuid_generate_v4(), 'settings:manage', 'settings', 'manage',    'Change platform settings'),
    (uuid_generate_v4(), 'audit:view',      'audit',    'view',      'View audit log');

-- Seed built-in roles
INSERT INTO roles (id, name, description, is_system) VALUES
    (uuid_generate_v4(), 'admin', 'Full platform administrator', true),
    (uuid_generate_v4(), 'user',  'Standard user — can execute tasks and view own executions', true);

-- Assign ALL permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin';

-- Assign task:execute to user role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user' AND p.name = 'task:execute';
