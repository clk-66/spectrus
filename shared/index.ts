// WebSocket event types — must stay in sync with server/internal/hub/events.go
export type EventType =
  | 'MESSAGE_CREATE'
  | 'MESSAGE_UPDATE'
  | 'MESSAGE_DELETE'
  | 'CHANNEL_CREATE'
  | 'CHANNEL_UPDATE'
  | 'CHANNEL_DELETE'
  | 'PRESENCE_UPDATE'
  | 'VOICE_STATE_UPDATE'
  | 'VOICE_SIGNAL'
  | 'ROLE_UPDATE'
  | 'MEMBER_UPDATE'
  | 'PLUGIN_EVENT';

export interface Envelope<T = unknown> {
  t: EventType;
  d: T;
}

// Auth
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserSummary;
}

export interface UserSummary {
  id: string;
  username: string;
  display_name: string;
}

// Channels
export type ChannelType = 'text' | 'voice';

export interface Channel {
  id: string;
  category_id: string | null;
  name: string;
  type: ChannelType;
  position: number;
  topic?: string;
}

// Messages
export interface Message {
  id: string;
  channel_id: string;
  author: UserSummary;
  content: string;
  edited_at?: string;
  created_at: string;
}

// Presence
export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface PresenceUpdate {
  user_id: string;
  status: PresenceStatus;
}

// Voice
export interface VoiceStateUpdate {
  user_id: string;
  channel_id: string | null;
}

export interface VoiceSignal {
  type: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  from_user_id: string;
}
