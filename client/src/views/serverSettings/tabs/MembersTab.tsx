import { useState, useEffect, useMemo } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { getMembers, getRoles, assignRole, removeRole } from '../../../api/members';
import { kickMember } from '../../../api/settings';
import { API_BASE, DEFAULT_SERVER_ID } from '../../../constants';
import type { Member, Role } from '../../../types';
import styles from '../ServerSettings.module.css';

function colorToCss(color: number): string {
  return color === 0 ? 'var(--border)' : `#${color.toString(16).padStart(6, '0')}`;
}

export function MembersTab() {
  const activeServerId = useUIStore((s) => s.activeServerId) ?? DEFAULT_SERVER_ID;

  const [members,     setMembers]     = useState<Member[]>([]);
  const [roles,       setRoles]       = useState<Role[]>([]);
  const [search,      setSearch]      = useState('');
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [confirmKick, setConfirmKick] = useState(false);
  const [confirmBan,  setConfirmBan]  = useState(false);
  const [acting,      setActing]      = useState(false);
  const [actionErr,   setActionErr]   = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([getMembers(API_BASE, activeServerId), getRoles(API_BASE, activeServerId)])
      .then(([m, r]) => { setMembers(m); setRoles(r); })
      .finally(() => setLoading(false));
  }, [activeServerId]);

  const filtered = useMemo(
    () =>
      members.filter(
        (m) =>
          m.displayName.toLowerCase().includes(search.toLowerCase()) ||
          m.username.toLowerCase().includes(search.toLowerCase())
      ),
    [members, search]
  );

  const selectedMember = members.find((m) => m.userId === selectedId) ?? null;

  async function handleToggleRole(roleId: string, has: boolean) {
    if (!selectedId) return;
    try {
      if (has) {
        await removeRole(API_BASE, activeServerId, selectedId, roleId);
      } else {
        await assignRole(API_BASE, activeServerId, selectedId, roleId);
      }
      // Re-fetch member to get updated roles
      const updated = await getMembers(API_BASE, activeServerId);
      setMembers(updated);
    } catch { /* ignore */ }
  }

  async function handleKick() {
    if (!selectedId) return;
    setActing(true);
    setActionErr('');
    try {
      await kickMember(API_BASE, activeServerId, selectedId);
      setMembers((prev) => prev.filter((m) => m.userId !== selectedId));
      setSelectedId(null);
      setConfirmKick(false);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Failed to kick member.');
    } finally {
      setActing(false);
    }
  }

  async function handleBan() {
    if (!selectedId) return;
    setActing(true);
    setActionErr('');
    try {
      // Ban uses the same kick endpoint for MVP (no separate bans table)
      await kickMember(API_BASE, activeServerId, selectedId);
      setMembers((prev) => prev.filter((m) => m.userId !== selectedId));
      setSelectedId(null);
      setConfirmBan(false);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Failed to ban member.');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <p className={styles.loadingRow}>Loading members…</p>;

  return (
    <>
      <h2 className={styles.tabHeader}>Members</h2>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: -16, marginBottom: 16 }}>
        {members.length} {members.length === 1 ? 'member' : 'members'}
      </p>

      <div className={styles.membersLayout}>
        {/* ---- Member list (left) ---- */}
        <div className={styles.membersList}>
          <div className={styles.membersSearchWrap}>
            <input
              className="input"
              type="search"
              placeholder="Search members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 && (
            <div className={styles.emptyState}>No members found.</div>
          )}

          {filtered.map((member) => (
            <button
              key={member.userId}
              type="button"
              className={`${styles.memberRow} ${member.userId === selectedId ? styles.memberRowActive : ''}`}
              onClick={() => {
                setSelectedId(member.userId);
                setConfirmKick(false);
                setConfirmBan(false);
                setActionErr('');
              }}
            >
              {member.avatarUrl ? (
                <img className={styles.memberAvatar} src={member.avatarUrl} alt="" />
              ) : (
                <div className={styles.memberAvatarPlaceholder}>
                  {member.displayName[0]?.toUpperCase() ?? '?'}
                </div>
              )}
              <div className={styles.memberInfo}>
                <div className={styles.memberDisplayName}>{member.displayName}</div>
                <div className={styles.memberUsername}>@{member.username}</div>
                {member.roles.length > 0 && (
                  <div className={styles.roleBadges}>
                    {member.roles.slice(0, 3).map((r) => (
                      <span
                        key={r.id}
                        className={styles.roleBadge}
                        style={{
                          color:            colorToCss(r.color),
                          borderColor:      colorToCss(r.color),
                          backgroundColor:  `color-mix(in srgb, ${colorToCss(r.color)} 10%, transparent)`,
                        }}
                      >
                        {r.name}
                      </span>
                    ))}
                    {member.roles.length > 3 && (
                      <span className={styles.roleBadge} style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                        +{member.roles.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* ---- Member detail (right) ---- */}
        <div className={styles.memberDetail}>
          {!selectedMember ? (
            <div className={styles.memberDetailEmpty}>
              Select a member to manage them
            </div>
          ) : (
            <>
              {/* Header */}
              <div className={styles.memberDetailHeader}>
                {selectedMember.avatarUrl ? (
                  <img className={styles.memberDetailAvatar} src={selectedMember.avatarUrl} alt="" />
                ) : (
                  <div className={styles.memberDetailAvatarPlaceholder}>
                    {selectedMember.displayName[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <div>
                  <h3 className={styles.memberDetailName}>{selectedMember.displayName}</h3>
                  <p className={styles.memberDetailUsername}>@{selectedMember.username}</p>
                </div>
              </div>

              <div className={styles.divider} />

              {/* Role assignment */}
              <div className={styles.fieldGroup}>
                <span className={styles.sectionTitle}>Roles</span>
                <div className={styles.memberRoleList}>
                  {roles.map((role) => {
                    const has = selectedMember.roles.some((r) => r.id === role.id);
                    const checkId = `role-toggle-${role.id}`;
                    return (
                      <label key={role.id} className={styles.memberRoleToggle} htmlFor={checkId}>
                        <input
                          id={checkId}
                          type="checkbox"
                          className={styles.permCheckbox}
                          checked={has}
                          onChange={() => void handleToggleRole(role.id, has)}
                        />
                        <span
                          className={styles.roleColorDot}
                          style={{ background: colorToCss(role.color) }}
                        />
                        <span className={styles.permLabel}>{role.name}</span>
                      </label>
                    );
                  })}
                  {roles.length === 0 && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      No roles defined yet.
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.divider} />

              {/* Actions */}
              {actionErr && <div className={styles.inlineError} style={{ marginBottom: 12 }}>{actionErr}</div>}

              {!confirmKick && !confirmBan && (
                <div className={styles.memberActions}>
                  <button
                    className={styles.btnDanger}
                    type="button"
                    onClick={() => { setConfirmKick(true); setConfirmBan(false); }}
                  >
                    Kick
                  </button>
                  <button
                    className={styles.btnDanger}
                    type="button"
                    style={{ background: 'color-mix(in srgb, var(--danger) 15%, transparent)' }}
                    onClick={() => { setConfirmBan(true); setConfirmKick(false); }}
                  >
                    Ban
                  </button>
                </div>
              )}

              {confirmKick && (
                <div className={styles.confirmRow}>
                  <span style={{ flex: 1 }}>
                    Kick <strong>@{selectedMember.username}</strong> from the server?
                  </span>
                  <button className={styles.btnDanger} disabled={acting} onClick={() => void handleKick()}>
                    {acting ? 'Kicking…' : 'Kick'}
                  </button>
                  <button className={styles.btnSecondary} onClick={() => setConfirmKick(false)}>Cancel</button>
                </div>
              )}

              {confirmBan && (
                <div className={styles.confirmRow}>
                  <span style={{ flex: 1 }}>
                    Ban <strong>@{selectedMember.username}</strong>? They will be removed from the server.
                  </span>
                  <button className={styles.btnDanger} disabled={acting} onClick={() => void handleBan()}>
                    {acting ? 'Banning…' : 'Ban'}
                  </button>
                  <button className={styles.btnSecondary} onClick={() => setConfirmBan(false)}>Cancel</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
