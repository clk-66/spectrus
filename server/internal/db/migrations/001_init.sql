-- Users
CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url   TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens (stored as hash, never plaintext)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    color      INTEGER DEFAULT 0,
    position   INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Role permissions (named permission strings, one row per grant)
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission TEXT NOT NULL,
    PRIMARY KEY (role_id, permission)
);

-- Members (users who belong to this server)
CREATE TABLE IF NOT EXISTS members (
    user_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    nick      TEXT,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Member role assignments
CREATE TABLE IF NOT EXISTS member_roles (
    user_id TEXT NOT NULL REFERENCES members(user_id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Channel categories
CREATE TABLE IF NOT EXISTS categories (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    position INTEGER DEFAULT 0
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
    id          TEXT PRIMARY KEY,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK(type IN ('text', 'voice')),
    position    INTEGER DEFAULT 0,
    topic       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id  TEXT NOT NULL REFERENCES users(id),
    content    TEXT NOT NULL,
    edited_at  DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_created
    ON messages(channel_id, created_at DESC);

-- Invite links
CREATE TABLE IF NOT EXISTS invites (
    token      TEXT PRIMARY KEY,
    channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
    creator_id TEXT NOT NULL REFERENCES users(id),
    max_uses   INTEGER DEFAULT 0,
    uses       INTEGER DEFAULT 0,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Server identity (single-row table — one instance = one server)
CREATE TABLE IF NOT EXISTS servers (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    icon       TEXT,
    banner     TEXT,
    owner_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO servers (id, name) VALUES ('main', 'My Spectrus Server');

-- Installed plugins
CREATE TABLE IF NOT EXISTS plugins (
    id           TEXT PRIMARY KEY,
    repo_url     TEXT NOT NULL UNIQUE,
    manifest     TEXT NOT NULL,        -- JSON blob (spectrus-plugin.json contents)
    enabled      INTEGER NOT NULL DEFAULT 1,
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    payload     TEXT,                  -- JSON blob (before/after state or extra context)
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- Server settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('server_name',      'My Spectrus Server'),
    ('server_icon',      ''),
    ('welcome_message',  '');
