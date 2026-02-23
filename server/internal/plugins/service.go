package plugins

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/clk-66/spectrus/internal/permissions"
)

var (
	ErrNotFound        = errors.New("plugin not found")
	ErrDuplicateRepo   = errors.New("plugin from this repository is already installed")
	ErrInvalidManifest = errors.New("invalid manifest")
)

// Manifest is the parsed spectrus-plugin.json from the plugin repository.
type Manifest struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Version            string   `json:"version"`
	Description        string   `json:"description"`
	Author             string   `json:"author"`
	SpectrusMinVersion string   `json:"spectrus_min_version"`
	Permissions        []string `json:"permissions"`
	BackendEntry       string   `json:"backend_entry"`
	ClientEntry        string   `json:"client_entry,omitempty"`
}

// Plugin is the database record with its parsed manifest.
type Plugin struct {
	ID          string    `json:"id"`
	RepoURL     string    `json:"repo_url"`
	Manifest    *Manifest `json:"manifest"`
	Enabled     bool      `json:"enabled"`
	InstalledAt time.Time `json:"installed_at"`
}

// Service manages plugin records in the database.
type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// List returns all installed plugins ordered by install time.
func (s *Service) List(ctx context.Context) ([]Plugin, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, repo_url, manifest, enabled, installed_at
		FROM plugins
		ORDER BY installed_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Plugin
	for rows.Next() {
		p, err := scanPlugin(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if out == nil {
		out = []Plugin{}
	}
	return out, nil
}

// Install fetches spectrus-plugin.json from the GitHub repository, validates it,
// and stores the record in the database with enabled=false.
func (s *Service) Install(ctx context.Context, repoURL string) (*Plugin, error) {
	repoURL = strings.TrimRight(repoURL, "/")

	manifest, rawJSON, err := fetchManifest(repoURL)
	if err != nil {
		return nil, err
	}
	if err := validateManifest(manifest); err != nil {
		return nil, err
	}

	p := &Plugin{
		ID:          uuid.NewString(),
		RepoURL:     repoURL,
		Manifest:    manifest,
		Enabled:     false,
		InstalledAt: time.Now().UTC(),
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO plugins (id, repo_url, manifest, enabled, installed_at) VALUES (?, ?, ?, 0, ?)`,
		p.ID, p.RepoURL, rawJSON, p.InstalledAt,
	)
	if err != nil {
		if isUniqueConstraint(err) {
			return nil, ErrDuplicateRepo
		}
		return nil, err
	}
	return p, nil
}

// SetEnabled toggles a plugin's enabled flag and returns the updated record.
func (s *Service) SetEnabled(ctx context.Context, id string, enabled bool) (*Plugin, error) {
	enabledInt := 0
	if enabled {
		enabledInt = 1
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE plugins SET enabled = ? WHERE id = ?`, enabledInt, id,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.get(ctx, id)
}

// Delete removes a plugin record permanently.
func (s *Service) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM plugins WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ---- Internal helpers -----------------------------------------------------

func (s *Service) get(ctx context.Context, id string) (*Plugin, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, repo_url, manifest, enabled, installed_at FROM plugins WHERE id = ?`, id,
	)
	p, err := scanPlugin(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return p, err
}

// scanner is satisfied by both *sql.Row and *sql.Rows.
type scanner interface {
	Scan(dest ...any) error
}

func scanPlugin(row scanner) (*Plugin, error) {
	var p Plugin
	var manifestJSON string
	var enabledInt int
	if err := row.Scan(&p.ID, &p.RepoURL, &manifestJSON, &enabledInt, &p.InstalledAt); err != nil {
		return nil, err
	}
	p.Enabled = enabledInt == 1
	var m Manifest
	if err := json.Unmarshal([]byte(manifestJSON), &m); err != nil {
		return nil, fmt.Errorf("unmarshal manifest for plugin %s: %w", p.ID, err)
	}
	p.Manifest = &m
	return &p, nil
}

// fetchManifest downloads spectrus-plugin.json from the default branch of a
// GitHub repository. repoURL must be of the form https://github.com/owner/repo.
func fetchManifest(repoURL string) (*Manifest, string, error) {
	rawURL, err := toRawURL(repoURL)
	if err != nil {
		return nil, "", err
	}

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Get(rawURL)
	if err != nil {
		return nil, "", fmt.Errorf("fetch manifest: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, "", fmt.Errorf("%w: spectrus-plugin.json not found in repository", ErrInvalidManifest)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("fetch manifest: unexpected status %d from GitHub", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024)) // 64 KB cap
	if err != nil {
		return nil, "", fmt.Errorf("read manifest body: %w", err)
	}

	var m Manifest
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, "", fmt.Errorf("%w: malformed JSON in spectrus-plugin.json", ErrInvalidManifest)
	}

	return &m, string(body), nil
}

// toRawURL converts a GitHub repo URL to the raw content URL for spectrus-plugin.json
// on the default branch (HEAD).
//
//	https://github.com/owner/repo → https://raw.githubusercontent.com/owner/repo/HEAD/spectrus-plugin.json
func toRawURL(repoURL string) (string, error) {
	const githubPrefix = "https://github.com/"
	if !strings.HasPrefix(repoURL, githubPrefix) {
		return "", fmt.Errorf("%w: only GitHub repositories are supported (URL must start with %s)",
			ErrInvalidManifest, githubPrefix)
	}
	path := strings.TrimPrefix(repoURL, githubPrefix)
	parts := strings.SplitN(path, "/", 3)
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return "", fmt.Errorf("%w: invalid GitHub URL (expected https://github.com/owner/repo)",
			ErrInvalidManifest)
	}
	return fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/HEAD/spectrus-plugin.json",
		parts[0], parts[1]), nil
}

// validateManifest checks that all required fields are present and that every
// declared permission is known to this server instance.
func validateManifest(m *Manifest) error {
	required := []struct {
		field string
		value string
	}{
		{"id", m.ID},
		{"name", m.Name},
		{"version", m.Version},
		{"spectrus_min_version", m.SpectrusMinVersion},
		{"backend_entry", m.BackendEntry},
	}
	for _, r := range required {
		if r.value == "" {
			return fmt.Errorf("%w: missing required field %q", ErrInvalidManifest, r.field)
		}
	}
	if m.Permissions == nil {
		return fmt.Errorf("%w: missing required field \"permissions\"", ErrInvalidManifest)
	}
	for _, p := range m.Permissions {
		if !permissions.Valid(permissions.Permission(p)) {
			return fmt.Errorf("%w: unknown permission %q", ErrInvalidManifest, p)
		}
	}
	return nil
}

func isUniqueConstraint(err error) bool {
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}
