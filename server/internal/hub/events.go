package hub

// EventType represents a WebSocket event type sent from server to client.
type EventType string

const (
	EventMessageCreate    EventType = "MESSAGE_CREATE"
	EventMessageUpdate    EventType = "MESSAGE_UPDATE"
	EventMessageDelete    EventType = "MESSAGE_DELETE"
	EventChannelCreate    EventType = "CHANNEL_CREATE"
	EventChannelUpdate    EventType = "CHANNEL_UPDATE"
	EventChannelDelete    EventType = "CHANNEL_DELETE"
	EventPresenceUpdate   EventType = "PRESENCE_UPDATE"
	EventVoiceStateUpdate EventType = "VOICE_STATE_UPDATE"
	EventVoiceSignal      EventType = "VOICE_SIGNAL"
	EventRoleUpdate       EventType = "ROLE_UPDATE"
	EventMemberUpdate     EventType = "MEMBER_UPDATE"
	EventPluginEvent      EventType = "PLUGIN_EVENT"
	EventTypingStart      EventType = "TYPING_START"
)

// Envelope is the wire format for all WebSocket messages.
type Envelope struct {
	Type    EventType `json:"t"`
	Payload any       `json:"d"`
}
