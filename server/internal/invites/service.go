package invites

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"time"
)

var (
	ErrNotFound      = errors.New("invite not found")
	ErrExpired       = errors.New("invite has expired")
	ErrExhausted     = errors.New("invite has reached its use limit")
	ErrAlreadyMember = errors.New("already a member of this server")
)

// ---- Domain types --------------------------------------------------------

type Invite struct {
	Token     string     `json:"token"`
	ChannelID *string    `json:"channel_id"`
	CreatorID string     `json:"creator_id"`
	MaxUses   int        `json:"max_uses"`
	Uses      int        `json:"uses"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

// InvitePreview is the public response for the join-preview screen.
// It deliberately omits sensitive fields and joins server metadata.
type InvitePreview struct {
	Token           string     `json:"token"`
	ServerName      string     `json:"server_name"`
	ServerIcon      string     `json:"server_icon"`
	MemberCount     int        `json:"member_count"`
	MaxUses         int        `json:"max_uses"`
	Uses            int        `json:"uses"`
	ExpiresAt       *time.Time `json:"expires_at,omitempty"`
	CreatorUsername string     `json:"creator_username"`
}

// ---- Service -------------------------------------------------------------

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

type CreateInviteInput struct {
	CreatorID string
	ChannelID *string    // optional: channel to land on after joining
	MaxUses   int        // 0 = unlimited
	ExpiresAt *time.Time // nil = never expires
}

func (s *Service) CreateInvite(ctx context.Context, in CreateInviteInput) (*Invite, error) {
	token, err := generateToken()
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO invites (token, channel_id, creator_id, max_uses, uses, expires_at, created_at)
		 VALUES (?, ?, ?, ?, 0, ?, ?)`,
		token, nullStr(in.ChannelID), in.CreatorID, in.MaxUses, nullTime(in.ExpiresAt), now,
	)
	if err != nil {
		return nil, err
	}

	return &Invite{
		Token:     token,
		ChannelID: in.ChannelID,
		CreatorID: in.CreatorID,
		MaxUses:   in.MaxUses,
		Uses:      0,
		ExpiresAt: in.ExpiresAt,
		CreatedAt: now,
	}, nil
}

// GetPreview returns the public join-preview data for an invite token.
// No auth required — called before the user has an account on this server.
func (s *Service) GetPreview(ctx context.Context, token string) (*InvitePreview, error) {
	var p InvitePreview
	var expiresAt sql.NullTime
	var serverIcon sql.NullString

	err := s.db.QueryRowContext(ctx, `
		SELECT
			i.token, i.max_uses, i.uses, i.expires_at,
			s.name, s.icon,
			u.username,
			(SELECT COUNT(*) FROM members) AS member_count
		FROM invites i
		JOIN servers s ON s.id = 'main'
		JOIN users u ON u.id = i.creator_id
		WHERE i.token = ?
	`, token).Scan(
		&p.Token, &p.MaxUses, &p.Uses, &expiresAt,
		&p.ServerName, &serverIcon,
		&p.CreatorUsername,
		&p.MemberCount,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	if expiresAt.Valid {
		t := expiresAt.Time
		p.ExpiresAt = &t
	}
	if serverIcon.Valid {
		p.ServerIcon = serverIcon.String
	}
	return &p, nil
}

// UseInvite atomically increments the invite's use counter and registers
// userID as a member. The atomic UPDATE enforces both expiry and max_uses in
// a single statement; 0 rows affected means the invite is invalid — a
// subsequent SELECT pinpoints the exact reason.
func (s *Service) UseInvite(ctx context.Context, token, userID string) error {
	// Cheapest early exit: already a member.
	var n int
	_ = s.db.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM members WHERE user_id = ?`, userID,
	).Scan(&n)
	if n > 0 {
		return ErrAlreadyMember
	}

	// Atomic increment — WHERE clause enforces validity constraints.
	res, err := s.db.ExecContext(ctx, `
		UPDATE invites
		SET    uses = uses + 1
		WHERE  token = ?
		  AND  (expires_at IS NULL OR expires_at > datetime('now'))
		  AND  (max_uses   = 0    OR uses < max_uses)
	`, token)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return s.diagnoseFailure(ctx, token)
	}

	_, err = s.db.ExecContext(ctx, `INSERT INTO members (user_id) VALUES (?)`, userID)
	return err
}

// diagnoseFailure runs only when UseInvite's UPDATE matched zero rows.
// It queries the invite to return the most precise error to the caller.
func (s *Service) diagnoseFailure(ctx context.Context, token string) error {
	var maxUses, uses int
	var expiresAt sql.NullTime

	err := s.db.QueryRowContext(ctx,
		`SELECT max_uses, uses, expires_at FROM invites WHERE token = ?`, token,
	).Scan(&maxUses, &uses, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	if expiresAt.Valid && time.Now().After(expiresAt.Time) {
		return ErrExpired
	}
	if maxUses > 0 && uses >= maxUses {
		return ErrExhausted
	}
	// Shouldn't be reachable under normal operation.
	return ErrExpired
}

// ListInvites returns all invites for the server ordered by creation date.
func (s *Service) ListInvites(ctx context.Context) ([]Invite, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT token, channel_id, creator_id, max_uses, uses, expires_at, created_at
		 FROM invites ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invites []Invite
	for rows.Next() {
		var inv Invite
		var channelID sql.NullString
		var expiresAt sql.NullTime
		if err := rows.Scan(&inv.Token, &channelID, &inv.CreatorID,
			&inv.MaxUses, &inv.Uses, &expiresAt, &inv.CreatedAt); err != nil {
			return nil, err
		}
		if channelID.Valid {
			inv.ChannelID = &channelID.String
		}
		if expiresAt.Valid {
			t := expiresAt.Time
			inv.ExpiresAt = &t
		}
		invites = append(invites, inv)
	}
	if invites == nil {
		invites = []Invite{}
	}
	return invites, rows.Err()
}

// RevokeInvite deletes the invite identified by token.
func (s *Service) RevokeInvite(ctx context.Context, token string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM invites WHERE token = ?`, token)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return ErrNotFound
	}
	return nil
}

// ---- Helpers -------------------------------------------------------------

// generateToken returns a 12-character base64url string (9 random bytes).
func generateToken() (string, error) {
	b := make([]byte, 9)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func nullStr(s *string) sql.NullString {
	if s == nil || *s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}

func nullTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *t, Valid: true}
}
