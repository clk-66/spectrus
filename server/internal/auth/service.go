package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserExists         = errors.New("username already taken")
	ErrInvalidCredentials = errors.New("invalid username or password")
	ErrTokenExpired       = errors.New("refresh token expired or invalid")
)

// User is the internal representation of a server account.
type User struct {
	ID          string
	Username    string
	DisplayName string
	CreatedAt   time.Time
}

// TokenPair holds the issued access and refresh tokens.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64 // seconds until access token expiry
}

// Service handles auth business logic.
type Service struct {
	db              *sql.DB
	jwtSecret       string
	accessTokenTTL  time.Duration
	refreshTokenTTL time.Duration
}

func NewService(db *sql.DB, jwtSecret string, accessTTL, refreshTTL time.Duration) *Service {
	return &Service{
		db:              db,
		jwtSecret:       jwtSecret,
		accessTokenTTL:  accessTTL,
		refreshTokenTTL: refreshTTL,
	}
}

type RegisterInput struct {
	Username    string
	DisplayName string
	Password    string
}

func (s *Service) Register(ctx context.Context, in RegisterInput) (*User, *TokenPair, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, nil, err
	}

	user := &User{
		ID:          uuid.NewString(),
		Username:    in.Username,
		DisplayName: in.DisplayName,
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)`,
		user.ID, user.Username, user.DisplayName, string(hash),
	)
	if err != nil {
		if isUniqueConstraint(err) {
			return nil, nil, ErrUserExists
		}
		return nil, nil, err
	}

	// Automatically add to members table.
	_, _ = s.db.ExecContext(ctx, `INSERT INTO members (user_id) VALUES (?)`, user.ID)

	pair, err := s.issueTokenPair(ctx, user.ID)
	if err != nil {
		return nil, nil, err
	}
	return user, pair, nil
}

func (s *Service) Login(ctx context.Context, username, password string) (*User, *TokenPair, error) {
	var user User
	var passwordHash string

	err := s.db.QueryRowContext(ctx,
		`SELECT id, username, display_name, password_hash, created_at FROM users WHERE username = ?`,
		username,
	).Scan(&user.ID, &user.Username, &user.DisplayName, &passwordHash, &user.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		return nil, nil, ErrInvalidCredentials
	}

	pair, err := s.issueTokenPair(ctx, user.ID)
	if err != nil {
		return nil, nil, err
	}
	return &user, pair, nil
}

func (s *Service) Refresh(ctx context.Context, rawToken string) (*TokenPair, error) {
	hash := HashToken(rawToken)

	var tokenID, userID string
	var expiresAt time.Time

	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, expires_at
		FROM refresh_tokens
		WHERE token_hash = ?
	`, hash).Scan(&tokenID, &userID, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrTokenExpired
	}
	if err != nil {
		return nil, err
	}

	if time.Now().After(expiresAt) {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM refresh_tokens WHERE id = ?`, tokenID)
		return nil, ErrTokenExpired
	}

	// Rotate: delete old token, issue new pair.
	_, _ = s.db.ExecContext(ctx, `DELETE FROM refresh_tokens WHERE id = ?`, tokenID)
	return s.issueTokenPair(ctx, userID)
}

func (s *Service) issueTokenPair(ctx context.Context, userID string) (*TokenPair, error) {
	accessToken, err := GenerateAccessToken(userID, s.jwtSecret, s.accessTokenTTL)
	if err != nil {
		return nil, err
	}

	rawRefresh := GenerateRefreshToken()
	expiresAt := time.Now().Add(s.refreshTokenTTL)

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
		uuid.NewString(), userID, HashToken(rawRefresh), expiresAt,
	)
	if err != nil {
		return nil, err
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		ExpiresIn:    int64(s.accessTokenTTL.Seconds()),
	}, nil
}

func isUniqueConstraint(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}
