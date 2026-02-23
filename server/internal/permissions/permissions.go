package permissions

import "database/sql"

// Permission is a named capability string stored in role_permissions.
type Permission string

const (
	// Messages
	MessagesS  Permission = "messages:send"
	MessagesD  Permission = "messages:delete"
	MessagesM  Permission = "messages:manage"

	// Channels & categories
	ChannelsV    Permission = "channels:view"
	ChannelsM    Permission = "channels:manage"
	CategoriesM  Permission = "categories:manage"

	// Members
	MembersKick Permission = "members:kick"
	MembersBan  Permission = "members:ban"

	// Roles
	RolesM Permission = "roles:manage"

	// Invites
	InvitesCreate Permission = "invites:create"

	// Plugins
	PluginsM Permission = "plugins:manage"

	// Audit log
	AuditLogView Permission = "audit_log:view"

	// Server
	ServerM Permission = "server:manage"
)

// All is the full set of defined permissions, useful for validation and seeding.
var All = []Permission{
	MessagesS, MessagesD, MessagesM,
	ChannelsV, ChannelsM, CategoriesM,
	MembersKick, MembersBan,
	RolesM,
	InvitesCreate,
	PluginsM,
	AuditLogView,
	ServerM,
}

// Valid reports whether p is a recognised permission string.
func Valid(p Permission) bool {
	for _, v := range All {
		if v == p {
			return true
		}
	}
	return false
}

// HasPermission reports whether userID holds the given permission.
//
// The server owner (servers.owner_id) always returns true regardless of role
// assignments. All other users are checked via member_roles → role_permissions.
func HasPermission(db *sql.DB, userID string, p Permission) (bool, error) {
	var has bool
	err := db.QueryRow(`
		SELECT EXISTS (
			-- Server owner has all permissions
			SELECT 1
			FROM servers
			WHERE id = 'main'
			  AND owner_id = ?

			UNION ALL

			-- Check role assignments
			SELECT 1
			FROM member_roles mr
			JOIN role_permissions rp ON rp.role_id = mr.role_id
			WHERE mr.user_id = ?
			  AND rp.permission = ?
		)
	`, userID, userID, string(p)).Scan(&has)
	if err != nil {
		return false, err
	}
	return has, nil
}

// RequirePermission is like HasPermission but returns a typed error on denial,
// suitable for inline checks in handlers.
func RequirePermission(db *sql.DB, userID string, p Permission) error {
	ok, err := HasPermission(db, userID, p)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden{Permission: p}
	}
	return nil
}

// ErrForbidden is returned when a user lacks a required permission.
type ErrForbidden struct {
	Permission Permission
}

func (e ErrForbidden) Error() string {
	return "forbidden: missing permission " + string(e.Permission)
}
