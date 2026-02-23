import { useState, useEffect, useCallback } from 'react';
import { Plus, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useUIStore } from '../../../stores/useUIStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { getRoles, getMembers } from '../../../api/members';
import { createRole, updateRole, deleteRole } from '../../../api/roles';
import { API_BASE } from '../../../constants';
import type { Role, Member } from '../../../types';
import styles from '../ServerSettings.module.css';

// ---- Permission groups ----------------------------------------------------

const PERM_GROUPS = [
  { label: 'Messages',  perms: ['messages:send', 'messages:delete', 'messages:manage'] },
  { label: 'Channels',  perms: ['channels:view', 'channels:manage', 'categories:manage'] },
  { label: 'Members',   perms: ['members:kick', 'members:ban'] },
  { label: 'Roles',     perms: ['roles:manage'] },
  { label: 'Invites',   perms: ['invites:create'] },
  { label: 'Plugins',   perms: ['plugins:manage'] },
  { label: 'Server',    perms: ['server:manage', 'audit_log:view'] },
] as const;

// ---- Color helpers --------------------------------------------------------

const SWATCHES = [
  { label: 'Default',  value: 0 },
  { label: 'Red',      value: 0xFF4444 },
  { label: 'Orange',   value: 0xFF7700 },
  { label: 'Gold',     value: 0xFFD700 },
  { label: 'Green',    value: 0x57F287 },
  { label: 'Blue',     value: 0x3498DB },
  { label: 'Purple',   value: 0x9B59B6 },
  { label: 'Pink',     value: 0xEB459E },
];

function colorToHex(color: number): string {
  if (color === 0) return '';
  return `#${color.toString(16).padStart(6, '0')}`;
}

function hexToColor(hex: string): number {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return 0;
  const n = parseInt(cleaned, 16);
  return isNaN(n) ? 0 : n;
}

function colorToCss(color: number): string {
  return color === 0 ? 'var(--bg-tertiary)' : colorToHex(color);
}

// ---- Sortable role row ----------------------------------------------------

function SortableRoleRow({
  role,
  isActive,
  onSelect,
}: {
  role: Role;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: role.id });

  return (
    <button
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={`${styles.roleRow} ${isActive ? styles.roleRowActive : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span
        className={styles.roleDragHandle}
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <GripVertical size={13} />
      </span>
      <span
        className={styles.roleColorDot}
        style={{ background: colorToCss(role.color) }}
      />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {role.name}
      </span>
    </button>
  );
}

// ---- Main component -------------------------------------------------------

export function RolesTab() {
  const serverHost     = useAuthStore((s) => s.serverHost);
  const activeServerId = useUIStore((s) => s.activeServerId) ?? serverHost;

  const [roles,           setRoles]           = useState<Role[]>([]);
  const [members,         setMembers]         = useState<Member[]>([]);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [deleting,        setDeleting]        = useState(false);
  const [saveOk,          setSaveOk]          = useState(false);
  const [saveErr,         setSaveErr]         = useState('');

  // Editor state (mirrors selected role, reset on selection change)
  const [editName,        setEditName]        = useState('');
  const [editColor,       setEditColor]       = useState(0);
  const [editHex,         setEditHex]         = useState('');
  const [editPerms,       setEditPerms]       = useState<Set<string>>(new Set());

  const sensors = useSensors(useSensor(PointerSensor));

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getRoles(API_BASE, activeServerId),
      getMembers(API_BASE, activeServerId),
    ])
      .then(([r, m]) => {
        setRoles(r);
        setMembers(m);
      })
      .finally(() => setLoading(false));
  }, [activeServerId]);

  useEffect(() => { load(); }, [load]);

  // Sync editor state when selection changes
  const selectedRole = roles.find((r) => r.id === selectedId) ?? null;
  useEffect(() => {
    if (!selectedRole) return;
    setEditName(selectedRole.name);
    setEditColor(selectedRole.color);
    setEditHex(colorToHex(selectedRole.color));
    setEditPerms(new Set(selectedRole.permissions));
    setSaveOk(false);
    setSaveErr('');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSwatchClick(value: number) {
    setEditColor(value);
    setEditHex(colorToHex(value));
  }

  function handleHexChange(raw: string) {
    setEditHex(raw);
    const color = hexToColor(raw);
    if (raw === '' || raw === '#' || (raw.startsWith('#') && raw.length === 7)) {
      setEditColor(color);
    }
  }

  function togglePerm(perm: string) {
    setEditPerms((prev) => {
      const next = new Set(prev);
      next.has(perm) ? next.delete(perm) : next.add(perm);
      return next;
    });
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    setSaveOk(false);
    setSaveErr('');
    try {
      const updated = await updateRole(API_BASE, activeServerId, selectedId, {
        name:        editName.trim() || selectedRole?.name,
        color:       editColor,
        permissions: Array.from(editPerms),
      });
      setRoles((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    try {
      const role = await createRole(API_BASE, activeServerId, {
        name:        'New Role',
        color:       0,
        permissions: [],
      });
      setRoles((prev) => [...prev, role]);
      setSelectedId(role.id);
    } catch { /* ignore */ }
  }

  async function handleDelete() {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await deleteRole(API_BASE, activeServerId, selectedId);
      setRoles((prev) => prev.filter((r) => r.id !== selectedId));
      setSelectedId(null);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to delete role.');
    } finally {
      setDeleting(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRoles((prev) => {
      const oldIdx = prev.findIndex((r) => r.id === active.id);
      const newIdx = prev.findIndex((r) => r.id === over.id);
      const reordered = arrayMove(prev, oldIdx, newIdx);
      // Persist new positions
      reordered.forEach((r, i) => {
        void updateRole(API_BASE, activeServerId, r.id, { position: i });
      });
      return reordered;
    });
  }

  // Count members per role for delete-guard
  const memberCountForRole = (roleId: string): number =>
    members.filter((m) => m.roles.some((r) => r.id === roleId)).length;

  if (loading) return <p className={styles.loadingRow}>Loading roles…</p>;

  return (
    <>
      <h2 className={styles.tabHeader}>Roles</h2>

      <div className={styles.rolesPanelLayout}>
        {/* ---- Role list (left) ---- */}
        <div className={styles.roleList}>
          <div className={styles.roleListHeader}>
            <span className={styles.sectionTitle}>All roles</span>
            <button
              className={styles.btnSecondary}
              style={{ height: 26, padding: '0 8px', fontSize: 'var(--text-xs)' }}
              onClick={() => void handleCreate()}
              type="button"
            >
              <Plus size={12} style={{ marginRight: 3 }} />
              New
            </button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={roles.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {roles.map((role) => (
                <SortableRoleRow
                  key={role.id}
                  role={role}
                  isActive={role.id === selectedId}
                  onSelect={() => setSelectedId(role.id)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {roles.length === 0 && (
            <span className={styles.loadingRow} style={{ fontSize: 'var(--text-xs)' }}>
              No roles yet.
            </span>
          )}
        </div>

        {/* ---- Role editor (right) ---- */}
        <div className={styles.roleEditor}>
          {!selectedRole ? (
            <div className={styles.channelEditorEmpty}>
              <Shield size={32} style={{ opacity: 0.3 }} />
              <span>Select a role to edit</span>
            </div>
          ) : (
            <>
              {/* Name */}
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="role-name">Role name</label>
                <input
                  id="role-name"
                  className="input"
                  value={editName}
                  maxLength={50}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              {/* Color */}
              <div className={styles.fieldGroup}>
                <span className={styles.label}>Role color</span>
                <div className={styles.colorPicker}>
                  {SWATCHES.map(({ label, value }) => (
                    <button
                      key={value}
                      type="button"
                      title={label}
                      className={`${styles.swatch} ${editColor === value ? styles.swatchActive : ''} ${value === 0 ? styles.swatchDefault : ''}`}
                      style={value !== 0 ? { background: colorToHex(value) } : {}}
                      onClick={() => handleSwatchClick(value)}
                      aria-label={label}
                    />
                  ))}
                  <input
                    className={styles.hexInput}
                    type="text"
                    placeholder="#hexcolor"
                    value={editHex}
                    maxLength={7}
                    onChange={(e) => handleHexChange(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Permissions */}
              <div className={styles.fieldGroup} style={{ marginTop: 8 }}>
                <span className={styles.label}>Permissions</span>
                {PERM_GROUPS.map(({ label, perms }) => (
                  <div key={label} className={styles.permGroup}>
                    <p className={styles.permGroupLabel}>{label}</p>
                    {perms.map((perm) => {
                      const id = `perm-${perm}`;
                      return (
                        <div key={perm} className={styles.permRow}>
                          <input
                            id={id}
                            type="checkbox"
                            className={styles.permCheckbox}
                            checked={editPerms.has(perm)}
                            onChange={() => togglePerm(perm)}
                          />
                          <label htmlFor={id} className={styles.permLabel}>
                            {perm}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {saveErr && <div className={styles.inlineError}>{saveErr}</div>}

              <div className={styles.roleEditorActions}>
                <button
                  className={styles.btnPrimary}
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {saveOk && <span className={styles.successMsg}>Saved!</span>}

                <div style={{ marginLeft: 'auto' }}>
                  <div title={memberCountForRole(selectedRole.id) > 0 ? `Role has ${memberCountForRole(selectedRole.id)} member(s)` : ''}>
                    <button
                      className={styles.btnDanger}
                      onClick={() => void handleDelete()}
                      disabled={deleting || memberCountForRole(selectedRole.id) > 0}
                    >
                      {deleting ? 'Deleting…' : 'Delete Role'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// Need this import for the empty state icon
function Shield(props: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 24, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
