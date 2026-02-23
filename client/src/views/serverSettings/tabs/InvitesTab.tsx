import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { getInvites, createInvite, revokeInvite } from '../../../api/invites';
import { API_BASE, DEFAULT_SERVER_ID } from '../../../constants';
import type { Invite } from '../../../types';
import styles from '../ServerSettings.module.css';

type ExpiryOption = 'never' | '1h' | '24h' | '7d' | '30d';

const EXPIRY_LABELS: Record<ExpiryOption, string> = {
  never: 'Never',
  '1h':  '1 hour',
  '24h': '24 hours',
  '7d':  '7 days',
  '30d': '30 days',
};

function expiryToIso(option: ExpiryOption): string | undefined {
  const now = Date.now();
  const map: Record<ExpiryOption, number | null> = {
    never: null,
    '1h':  3_600_000,
    '24h': 86_400_000,
    '7d':  7 * 86_400_000,
    '30d': 30 * 86_400_000,
  };
  const ms = map[option];
  return ms !== null ? new Date(now + ms).toISOString() : undefined;
}

function formatExpiry(invite: Invite): string {
  if (!invite.expiresAt) return 'Never';
  const d = new Date(invite.expiresAt);
  if (d < new Date()) return 'Expired';
  return d.toLocaleDateString();
}

function usesLabel(invite: Invite): string {
  if (invite.maxUses === 0) return `${invite.uses} (unlimited)`;
  return `${invite.uses} / ${invite.maxUses}`;
}

export function InvitesTab() {
  const activeServerId = useUIStore((s) => s.activeServerId) ?? DEFAULT_SERVER_ID;
  const currentUser    = useAuthStore((s) => s.currentUser);

  const [invites,   setInvites]   = useState<Invite[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadErr,   setLoadErr]   = useState('');

  // Create form
  const [showCreate,   setShowCreate]   = useState(false);
  const [maxUses,      setMaxUses]      = useState('0');
  const [expiry,       setExpiry]       = useState<ExpiryOption>('never');
  const [creating,     setCreating]     = useState(false);
  const [createErr,    setCreateErr]    = useState('');

  // Revoke
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getInvites(API_BASE, activeServerId)
      .then((list) => { setInvites(list); setLoadErr(''); })
      .catch((err: unknown) => setLoadErr(err instanceof Error ? err.message : 'Failed to load invites.'))
      .finally(() => setLoading(false));
  }, [activeServerId]);

  async function handleCreate() {
    setCreating(true);
    setCreateErr('');
    try {
      const maxUsesNum = parseInt(maxUses, 10);
      const invite = await createInvite(API_BASE, activeServerId, {
        maxUses:   isNaN(maxUsesNum) ? 0 : maxUsesNum,
        expiresAt: expiryToIso(expiry),
      });
      setInvites((prev) => [invite, ...prev]);
      setShowCreate(false);
      setMaxUses('0');
      setExpiry('never');
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : 'Failed to create invite.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(token: string) {
    setRevokingToken(token);
    try {
      await revokeInvite(API_BASE, activeServerId, token);
      setInvites((prev) => prev.filter((i) => i.token !== token));
    } catch { /* ignore */ }
    finally { setRevokingToken(null); }
  }

  if (loading) return <p className={styles.loadingRow}>Loading invites…</p>;

  return (
    <>
      <h2 className={styles.tabHeader}>Invites</h2>

      {loadErr && <div className={styles.inlineError} style={{ marginBottom: 16 }}>{loadErr}</div>}

      {/* Active invites table */}
      {invites.length === 0 ? (
        <div className={styles.emptyState}>No active invites. Create one below.</div>
      ) : (
        <table className={styles.inviteTable}>
          <thead>
            <tr>
              <th>Token</th>
              <th>Created by</th>
              <th>Uses</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.token}>
                <td>
                  <code className={styles.inviteToken}>
                    {invite.token.slice(0, 8)}…
                  </code>
                </td>
                <td>
                  {invite.creatorId === currentUser?.id
                    ? 'You'
                    : invite.creatorId.slice(0, 8)}
                </td>
                <td>{usesLabel(invite)}</td>
                <td>{formatExpiry(invite)}</td>
                <td>
                  <button
                    className={styles.btnDanger}
                    style={{ height: 28, padding: '0 10px', fontSize: 'var(--text-xs)' }}
                    disabled={revokingToken === invite.token}
                    onClick={() => void handleRevoke(invite.token)}
                    title="Revoke invite"
                    aria-label="Revoke invite"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Create invite */}
      {!showCreate ? (
        <button
          className={styles.btnPrimary}
          type="button"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={14} style={{ marginRight: 6 }} />
          Create Invite
        </button>
      ) : (
        <div className={styles.inviteCreatePanel}>
          <h3 className={styles.inviteCreateTitle}>New invite link</h3>

          <div className={styles.inviteFormRow}>
            <div className={styles.inviteFormField}>
              <label className={styles.label} htmlFor="invite-max-uses">Max uses</label>
              <input
                id="invite-max-uses"
                className="input"
                type="number"
                min={0}
                value={maxUses}
                style={{ width: 100 }}
                onChange={(e) => setMaxUses(e.target.value)}
              />
              <span className={styles.fieldHint}>0 = unlimited</span>
            </div>

            <div className={styles.inviteFormField}>
              <label className={styles.label} htmlFor="invite-expiry">Expires after</label>
              <select
                id="invite-expiry"
                className="input"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value as ExpiryOption)}
                style={{ cursor: 'pointer' }}
              >
                {(Object.keys(EXPIRY_LABELS) as ExpiryOption[]).map((opt) => (
                  <option key={opt} value={opt}>{EXPIRY_LABELS[opt]}</option>
                ))}
              </select>
            </div>
          </div>

          {createErr && <div className={styles.inlineError} style={{ marginTop: 8 }}>{createErr}</div>}

          <div className={styles.saveRow}>
            <button
              className={styles.btnPrimary}
              disabled={creating}
              onClick={() => void handleCreate()}
            >
              {creating ? 'Creating…' : 'Generate Link'}
            </button>
            <button
              className={styles.btnSecondary}
              onClick={() => { setShowCreate(false); setCreateErr(''); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
