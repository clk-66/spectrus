package channels

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
)

var ErrNotFound = errors.New("not found")

// ---- Domain types --------------------------------------------------------

type Category struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Position int       `json:"position"`
	Channels []Channel `json:"channels"`
}

type Channel struct {
	ID         string  `json:"id"`
	CategoryID *string `json:"category_id"`
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	Position   int     `json:"position"`
	Topic      *string `json:"topic"`
}

type AuthorSummary struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

type Message struct {
	ID        string        `json:"id"`
	ChannelID string        `json:"channel_id"`
	Author    AuthorSummary `json:"author"`
	Content   string        `json:"content"`
	EditedAt  *time.Time    `json:"edited_at,omitempty"`
	CreatedAt time.Time     `json:"created_at"`
}

type MessagePage struct {
	Messages   []Message `json:"messages"`
	NextCursor string    `json:"next_cursor,omitempty"`
	HasMore    bool      `json:"has_more"`
}

// ---- Service -------------------------------------------------------------

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// ListCategoriesWithChannels returns all categories (each pre-loaded with their
// channels) and a separate slice for channels that have no category.
func (s *Service) ListCategoriesWithChannels(ctx context.Context) ([]Category, []Channel, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, category_id, name, type, position, topic
		FROM channels
		ORDER BY position ASC, rowid ASC
	`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	byCategory := map[string][]Channel{}
	var uncategorized []Channel

	for rows.Next() {
		var ch Channel
		var catID, topic sql.NullString
		if err := rows.Scan(&ch.ID, &catID, &ch.Name, &ch.Type, &ch.Position, &topic); err != nil {
			return nil, nil, err
		}
		if catID.Valid {
			ch.CategoryID = &catID.String
		}
		if topic.Valid {
			ch.Topic = &topic.String
		}
		if ch.CategoryID != nil {
			byCategory[*ch.CategoryID] = append(byCategory[*ch.CategoryID], ch)
		} else {
			uncategorized = append(uncategorized, ch)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	catRows, err := s.db.QueryContext(ctx, `
		SELECT id, name, position FROM categories ORDER BY position ASC, rowid ASC
	`)
	if err != nil {
		return nil, nil, err
	}
	defer catRows.Close()

	var categories []Category
	for catRows.Next() {
		var cat Category
		if err := catRows.Scan(&cat.ID, &cat.Name, &cat.Position); err != nil {
			return nil, nil, err
		}
		cat.Channels = byCategory[cat.ID]
		if cat.Channels == nil {
			cat.Channels = []Channel{}
		}
		categories = append(categories, cat)
	}
	if err := catRows.Err(); err != nil {
		return nil, nil, err
	}

	if categories == nil {
		categories = []Category{}
	}
	if uncategorized == nil {
		uncategorized = []Channel{}
	}
	return categories, uncategorized, nil
}

func (s *Service) CreateCategory(ctx context.Context, name string, position int) (*Category, error) {
	cat := &Category{
		ID:       uuid.NewString(),
		Name:     name,
		Position: position,
		Channels: []Channel{},
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO categories (id, name, position) VALUES (?, ?, ?)`,
		cat.ID, cat.Name, cat.Position,
	)
	return cat, err
}

type CreateChannelInput struct {
	CategoryID *string // nil = no category
	Name       string
	Type       string // "text" | "voice"
	Position   int
	Topic      *string
}

func (s *Service) CreateChannel(ctx context.Context, in CreateChannelInput) (*Channel, error) {
	ch := &Channel{
		ID:         uuid.NewString(),
		CategoryID: in.CategoryID,
		Name:       in.Name,
		Type:       in.Type,
		Position:   in.Position,
		Topic:      in.Topic,
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO channels (id, category_id, name, type, position, topic) VALUES (?, ?, ?, ?, ?, ?)`,
		ch.ID, nullStr(in.CategoryID), ch.Name, ch.Type, ch.Position, nullStr(in.Topic),
	)
	return ch, err
}

// UpdateChannelInput uses pointer fields so PATCH can distinguish "not
// supplied" (nil) from "explicitly cleared" (pointer to empty string).
// Sending category_id as "" removes the category association.
type UpdateChannelInput struct {
	Name       *string
	CategoryID *string // "" to clear
	Position   *int
	Topic      *string // "" to clear
}

func (s *Service) UpdateChannel(ctx context.Context, id string, in UpdateChannelInput) (*Channel, error) {
	var ch Channel
	var catID, topic sql.NullString

	err := s.db.QueryRowContext(ctx,
		`SELECT id, category_id, name, type, position, topic FROM channels WHERE id = ?`, id,
	).Scan(&ch.ID, &catID, &ch.Name, &ch.Type, &ch.Position, &topic)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	if catID.Valid {
		ch.CategoryID = &catID.String
	}
	if topic.Valid {
		ch.Topic = &topic.String
	}

	// Apply only the fields that were supplied.
	if in.Name != nil {
		ch.Name = *in.Name
	}
	if in.CategoryID != nil {
		if *in.CategoryID == "" {
			ch.CategoryID = nil
		} else {
			ch.CategoryID = in.CategoryID
		}
	}
	if in.Position != nil {
		ch.Position = *in.Position
	}
	if in.Topic != nil {
		if *in.Topic == "" {
			ch.Topic = nil
		} else {
			ch.Topic = in.Topic
		}
	}

	_, err = s.db.ExecContext(ctx,
		`UPDATE channels SET name = ?, category_id = ?, position = ?, topic = ? WHERE id = ?`,
		ch.Name, nullStr(ch.CategoryID), ch.Position, nullStr(ch.Topic), ch.ID,
	)
	return &ch, err
}

func (s *Service) DeleteChannel(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM channels WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

const (
	defaultLimit = 50
	maxLimit     = 100
)

// ListMessages returns messages for a channel in chronological order (oldest
// first). Pass before="" for the most recent page. Subsequent pages: pass the
// next_cursor from the previous response as before=.
func (s *Service) ListMessages(ctx context.Context, channelID, before string, limit int) (*MessagePage, error) {
	if limit <= 0 || limit > maxLimit {
		limit = defaultLimit
	}

	// Fetch limit+1 rows to detect whether there is a next page.
	var (
		rows *sql.Rows
		err  error
	)
	const q = `
		SELECT m.id, m.channel_id, m.content, m.edited_at, m.created_at,
		       u.id, u.username, u.display_name
		FROM messages m
		JOIN users u ON u.id = m.author_id
		WHERE m.channel_id = ?
	`
	if before == "" {
		rows, err = s.db.QueryContext(ctx,
			q+`ORDER BY m.created_at DESC LIMIT ?`,
			channelID, limit+1,
		)
	} else {
		rows, err = s.db.QueryContext(ctx,
			q+`AND m.created_at < ? ORDER BY m.created_at DESC LIMIT ?`,
			channelID, before, limit+1,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []Message
	for rows.Next() {
		var msg Message
		var editedAt sql.NullTime
		if err := rows.Scan(
			&msg.ID, &msg.ChannelID, &msg.Content, &editedAt, &msg.CreatedAt,
			&msg.Author.ID, &msg.Author.Username, &msg.Author.DisplayName,
		); err != nil {
			return nil, err
		}
		if editedAt.Valid {
			msg.EditedAt = &editedAt.Time
		}
		msgs = append(msgs, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	hasMore := len(msgs) > limit
	if hasMore {
		msgs = msgs[:limit]
	}

	// Query returned DESC; reverse to chronological ASC for the client.
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	page := &MessagePage{HasMore: hasMore}
	if msgs == nil {
		page.Messages = []Message{}
	} else {
		page.Messages = msgs
		if hasMore {
			// Cursor = created_at of the oldest message in this page.
			page.NextCursor = msgs[0].CreatedAt.UTC().Format(time.RFC3339Nano)
		}
	}
	return page, nil
}

func (s *Service) CreateMessage(ctx context.Context, channelID, authorID, content string) (*Message, error) {
	id := uuid.NewString()
	now := time.Now().UTC()

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO messages (id, channel_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)`,
		id, channelID, authorID, content, now,
	)
	if err != nil {
		return nil, err
	}

	var author AuthorSummary
	_ = s.db.QueryRowContext(ctx,
		`SELECT id, username, display_name FROM users WHERE id = ?`, authorID,
	).Scan(&author.ID, &author.Username, &author.DisplayName)

	return &Message{
		ID:        id,
		ChannelID: channelID,
		Author:    author,
		Content:   content,
		CreatedAt: now,
	}, nil
}

// ChannelExists reports whether a channel with id exists.
func (s *Service) ChannelExists(ctx context.Context, id string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM channels WHERE id = ?`, id).Scan(&n)
	return n > 0, err
}

// nullStr converts a *string to sql.NullString. An empty-string pointer is
// treated as NULL (used to clear optional FK / text columns via PATCH).
func nullStr(s *string) sql.NullString {
	if s == nil || *s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}
