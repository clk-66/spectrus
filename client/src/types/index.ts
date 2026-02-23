// ---- Core domain types ---------------------------------------------------

export interface Server {
  id: string;
  name: string;
  icon?: string;
  banner?: string;
  ownerId: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  position: number;
  channels: Channel[];
}

export interface Channel {
  id: string;
  categoryId?: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
  topic?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  content: string;
  editedAt?: string;
  createdAt: string;
}

export interface Member {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  nick?: string;
  roles: RoleSummary[];
  joinedAt: string;
}

export interface Role {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions: string[];
  createdAt: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  color: number;
}

export interface Invite {
  token: string;
  channelId?: string;
  creatorId: string;
  maxUses: number;
  uses: number;
  expiresAt?: string;
  createdAt: string;
}

export interface InvitePreview {
  token: string;
  serverName: string;
  serverIcon?: string;
  memberCount: number;
  creatorUsername: string;
  expiresAt?: string;
}

export interface Plugin {
  id: string;
  repoUrl: string;
  manifest: PluginManifest;
  enabled: boolean;
  installedAt: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  spectrusMinVersion: string;
  permissions: string[];
  backendEntry: string;
  clientEntry?: string;
}

// ---- Auth ----------------------------------------------------------------

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

// ---- Real-time -----------------------------------------------------------

export type Theme = 'dark' | 'light';

/** A user currently typing in a channel. expiresAt is Date.now() + 6000. */
export interface TypingUser {
  userId: string;
  username: string;
  expiresAt: number;
}

/** Who is in which voice channel. channelId null = left. */
export interface VoiceStateEntry {
  userId: string;
  channelId: string | null;
}

/** Shape of all incoming WebSocket events. */
export type WSEvent =
  | { t: 'MESSAGE_CREATE';      d: { channelId: string; message: Message } }
  | { t: 'MESSAGE_UPDATE';      d: { channelId: string; messageId: string; content: string } }
  | { t: 'MESSAGE_DELETE';      d: { channelId: string; messageId: string } }
  | { t: 'CHANNEL_CREATE';      d: { channel?: Channel; category?: Category } }
  | { t: 'CHANNEL_UPDATE';      d: { channel: Channel } }
  | { t: 'CHANNEL_DELETE';      d: { channelId: string } }
  | { t: 'PRESENCE_UPDATE';     d: { userId: string; status: string } }
  | { t: 'VOICE_STATE_UPDATE';  d: { userId: string; channelId: string | null } }
  | { t: 'VOICE_SIGNAL';        d: Record<string, unknown> }
  | { t: 'ROLE_UPDATE';         d: { role: Role } }
  | { t: 'MEMBER_UPDATE';       d: { member: Member } }
  | { t: 'PLUGIN_EVENT';        d: { pluginId: string; payload: unknown } }
  | { t: 'TYPING_START';        d: { userId: string; channelId: string; username: string } };
