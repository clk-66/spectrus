package roles

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/clk-66/spectrus/internal/permissions"
)

var (
	ErrNotFound   = errors.New("not found")
	ErrRoleInUse  = errors.New("role has members assigned — unassign all members first")
	ErrNotMember  = errors.New("user is not a member of this server")
)

// ---- Domain types --------------------------------------------------------

type Role struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Color       int       `json:"color"`
	Position    int       `json:"position"`
	Permissions []string  `json:"permissions"`
	CreatedAt   time.Time `json:"created_at"`
}

type RoleSummary struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color int    `json:"color"`
}

type Member struct {
	UserID      string        `json:"user_id"`
	Username    string        `json:"username"`
	DisplayName string        `json:"display_name"`
	AvatarURL   *string       `json:"avatar_url,omitempty"`
	Nick        *string       `json:"nick,omitempty"`
	Roles       []RoleSummary `json:"roles"`
	JoinedAt    time.Time     `json:"joined_at"`
}

// ---- Service -------------------------------------------------------------

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// SeedDefaults creates a default "admin" role with all permissions if the
// roles table is empty. Called once at startup.
func (s *Service) SeedDefaults(ctx context.Context) error {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM roles`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}

	allPerms := make([]string, len(permissions.All))
	for i, p := range permissions.All {
		allPerms[i] = string(p)
	}

	role, err := s.CreateRole(ctx, CreateRoleInput{
		Name:        "admin",
		Color:       0,
		Position:    0,
		Permissions: allPerms,
	})
	if err != nil {
		return err
	}
	slog.Info("seeded default admin role", "role_id", role.ID)
	return nil
}

// ListRoles returns all roles with their permission sets.
func (s *Service) ListRoles(ctx context.Context) ([]Role, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, color, position, created_at
		FROM roles
		ORDER BY position ASC, created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Build ordered slice and index.
	var roleList []Role
	roleIndex := map[string]*Role{}

	for rows.Next() {
		var r Role
		if err := rows.Scan(&r.ID, &r.Name, &r.Color, &r.Position, &r.CreatedAt); err != nil {
			return nil, err
		}
		r.Permissions = []string{}
		roleList = append(roleList, r)
		roleIndex[r.ID] = &roleList[len(roleList)-1]
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Attach permissions in a second query (avoids N+1).
	permRows, err := s.db.QueryContext(ctx, `SELECT role_id, permission FROM role_permissions`)
	if err != nil {
		return nil, err
	}
	defer permRows.Close()

	for permRows.Next() {
		var roleID, perm string
		if err := permRows.Scan(&roleID, &perm); err != nil {
			return nil, err
		}
		if r, ok := roleIndex[roleID]; ok {
			r.Permissions = append(r.Permissions, perm)
		}
	}
	if err := permRows.Err(); err != nil {
		return nil, err
	}

	if roleList == nil {
		roleList = []Role{}
	}
	return roleList, nil
}

type CreateRoleInput struct {
	Name        string
	Color       int
	Position    int
	Permissions []string // validated by caller
}

func (s *Service) CreateRole(ctx context.Context, in CreateRoleInput) (*Role, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	role := &Role{
		ID:          uuid.NewString(),
		Name:        in.Name,
		Color:       in.Color,
		Position:    in.Position,
		Permissions: in.Permissions,
		CreatedAt:   time.Now().UTC(),
	}
	if role.Permissions == nil {
		role.Permissions = []string{}
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO roles (id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)`,
		role.ID, role.Name, role.Color, role.Position, role.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	for _, perm := range role.Permissions {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)`,
			role.ID, perm,
		); err != nil {
			return nil, err
		}
	}

	return role, tx.Commit()
}

// UpdateRoleInput uses pointer fields so PATCH can leave unmentioned fields
// untouched. Permissions *[]string: nil = don't change; &[]string{} = clear all.
type UpdateRoleInput struct {
	Name        *string
	Color       *int
	Permissions *[]string
}

func (s *Service) UpdateRole(ctx context.Context, id string, in UpdateRoleInput) (*Role, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var role Role
	err = tx.QueryRowContext(ctx,
		`SELECT id, name, color, position, created_at FROM roles WHERE id = ?`, id,
	).Scan(&role.ID, &role.Name, &role.Color, &role.Position, &role.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	if in.Name != nil {
		role.Name = *in.Name
	}
	if in.Color != nil {
		role.Color = *in.Color
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE roles SET name = ?, color = ? WHERE id = ?`,
		role.Name, role.Color, role.ID,
	); err != nil {
		return nil, err
	}

	// Replace permissions only when the field was explicitly provided.
	if in.Permissions != nil {
		if _, err := tx.ExecContext(ctx,
			`DELETE FROM role_permissions WHERE role_id = ?`, role.ID,
		); err != nil {
			return nil, err
		}
		for _, perm := range *in.Permissions {
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)`,
				role.ID, perm,
			); err != nil {
				return nil, err
			}
		}
	}

	// Always load the final permission set for the response.
	role.Permissions, err = s.loadPermissions(tx, ctx, role.ID)
	if err != nil {
		return nil, err
	}

	return &role, tx.Commit()
}

func (s *Service) DeleteRole(ctx context.Context, id string) error {
	// Verify the role exists.
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM roles WHERE id = ?`, id,
	).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}

	// Refuse if any member holds this role.
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM member_roles WHERE role_id = ?`, id,
	).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return ErrRoleInUse
	}

	_, err := s.db.ExecContext(ctx, `DELETE FROM roles WHERE id = ?`, id)
	return err
}

// AssignRole adds role_id to the member identified by userID.
// Idempotent: assigning an already-held role is a no-op.
func (s *Service) AssignRole(ctx context.Context, userID, roleID string) error {
	if err := s.requireMember(ctx, userID); err != nil {
		return err
	}
	if err := s.requireRole(ctx, roleID); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO member_roles (user_id, role_id) VALUES (?, ?)`,
		userID, roleID,
	)
	return err
}

// RemoveRole removes role_id from the member identified by userID.
// Idempotent: removing a role the member doesn't hold is a no-op.
func (s *Service) RemoveRole(ctx context.Context, userID, roleID string) error {
	if err := s.requireMember(ctx, userID); err != nil {
		return err
	}
	if err := s.requireRole(ctx, roleID); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM member_roles WHERE user_id = ? AND role_id = ?`,
		userID, roleID,
	)
	return err
}

// ListMembers returns all members with their role summaries.
func (s *Service) ListMembers(ctx context.Context) ([]Member, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT m.user_id, u.username, u.display_name, u.avatar_url, m.nick, m.joined_at
		FROM members m
		JOIN users u ON u.id = m.user_id
		ORDER BY m.joined_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []Member
	memberIndex := map[string]*Member{}

	for rows.Next() {
		var m Member
		var avatarURL, nick sql.NullString
		if err := rows.Scan(
			&m.UserID, &m.Username, &m.DisplayName, &avatarURL, &nick, &m.JoinedAt,
		); err != nil {
			return nil, err
		}
		if avatarURL.Valid {
			m.AvatarURL = &avatarURL.String
		}
		if nick.Valid {
			m.Nick = &nick.String
		}
		m.Roles = []RoleSummary{}
		members = append(members, m)
		memberIndex[m.UserID] = &members[len(members)-1]
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Attach role summaries in a second query.
	roleRows, err := s.db.QueryContext(ctx, `
		SELECT mr.user_id, r.id, r.name, r.color
		FROM member_roles mr
		JOIN roles r ON r.id = mr.role_id
		ORDER BY r.position ASC
	`)
	if err != nil {
		return nil, err
	}
	defer roleRows.Close()

	for roleRows.Next() {
		var userID string
		var rs RoleSummary
		if err := roleRows.Scan(&userID, &rs.ID, &rs.Name, &rs.Color); err != nil {
			return nil, err
		}
		if m, ok := memberIndex[userID]; ok {
			m.Roles = append(m.Roles, rs)
		}
	}
	if err := roleRows.Err(); err != nil {
		return nil, err
	}

	if members == nil {
		members = []Member{}
	}
	return members, nil
}

// GetMember returns a single member with their roles — used for MEMBER_UPDATE broadcasts.
func (s *Service) GetMember(ctx context.Context, userID string) (*Member, error) {
	var m Member
	var avatarURL, nick sql.NullString

	err := s.db.QueryRowContext(ctx, `
		SELECT m.user_id, u.username, u.display_name, u.avatar_url, m.nick, m.joined_at
		FROM members m
		JOIN users u ON u.id = m.user_id
		WHERE m.user_id = ?
	`, userID).Scan(&m.UserID, &m.Username, &m.DisplayName, &avatarURL, &nick, &m.JoinedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotMember
	}
	if err != nil {
		return nil, err
	}
	if avatarURL.Valid {
		m.AvatarURL = &avatarURL.String
	}
	if nick.Valid {
		m.Nick = &nick.String
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT r.id, r.name, r.color
		FROM member_roles mr
		JOIN roles r ON r.id = mr.role_id
		WHERE mr.user_id = ?
		ORDER BY r.position ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m.Roles = []RoleSummary{}
	for rows.Next() {
		var rs RoleSummary
		if err := rows.Scan(&rs.ID, &rs.Name, &rs.Color); err != nil {
			return nil, err
		}
		m.Roles = append(m.Roles, rs)
	}
	return &m, rows.Err()
}

// ---- Internal helpers ----------------------------------------------------

// loadPermissions fetches permission strings for a role within an existing
// transaction (or any db.QueryContext-compatible executor).
func (s *Service) loadPermissions(tx *sql.Tx, ctx context.Context, roleID string) ([]string, error) {
	rows, err := tx.QueryContext(ctx,
		`SELECT permission FROM role_permissions WHERE role_id = ?`, roleID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	if perms == nil {
		perms = []string{}
	}
	return perms, rows.Err()
}

func (s *Service) requireMember(ctx context.Context, userID string) error {
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM members WHERE user_id = ?`, userID,
	).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotMember
	}
	return nil
}

func (s *Service) requireRole(ctx context.Context, roleID string) error {
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM roles WHERE id = ?`, roleID,
	).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
