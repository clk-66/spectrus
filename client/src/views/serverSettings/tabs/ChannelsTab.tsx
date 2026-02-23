import { useState } from 'react';
import { Hash, Volume2, Plus, Trash2, GripVertical } from 'lucide-react';
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
import { useChannelsStore } from '../../../stores/useChannelsStore';
import {
  createCategory,
  createChannel,
  updateChannel,
  deleteChannel,
} from '../../../api/channels';
import { getCategories } from '../../../api/channels';
import { API_BASE } from '../../../constants';
import type { Channel, Category } from '../../../types';
import styles from '../ServerSettings.module.css';

// ---- Sortable channel row -------------------------------------------------

function SortableChannelRow({
  channel,
  isActive,
  onSelect,
}: {
  channel: Channel;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });

  return (
    <button
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`${styles.channelTreeRow} ${isActive ? styles.channelTreeRowActive : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        style={{ color: 'var(--text-muted)', cursor: 'grab', lineHeight: 0 }}
        aria-label="Drag to reorder"
      >
        <GripVertical size={11} />
      </span>
      {channel.type === 'voice' ? <Volume2 size={13} /> : <Hash size={13} />}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {channel.name}
      </span>
    </button>
  );
}

// ---- Main component -------------------------------------------------------

export function ChannelsTab() {
  const serverHost       = useAuthStore((s) => s.serverHost);
  const activeServerId   = useUIStore((s) => s.activeServerId) ?? serverHost;
  const storeCategories  = useChannelsStore((s) => s.categories.get(activeServerId) ?? []);
  const storeUncategorized = useChannelsStore((s) => s.uncategorized.get(activeServerId) ?? []);
  const { setCategories } = useChannelsStore();

  // Local working copies (so DnD reorders are instant)
  const [categories,    setLocalCats]    = useState<Category[]>(storeCategories);
  const [uncategorized, setLocalUncat]   = useState<Channel[]>(storeUncategorized);
  const [selectedId,    setSelectedId]   = useState<string | null>(null);

  // Editor state
  const [editName,      setEditName]    = useState('');
  const [editTopic,     setEditTopic]   = useState('');
  const [editType,      setEditType]    = useState<'text' | 'voice'>('text');
  const [saving,        setSaving]      = useState(false);
  const [saveOk,        setSaveOk]      = useState(false);
  const [saveErr,       setSaveErr]     = useState('');
  const [deleting,      setDeleting]    = useState(false);

  // Inline add forms
  const [addingCat,        setAddingCat]     = useState(false);
  const [newCatName,       setNewCatName]    = useState('');
  const [addingChannelCat, setAddingChannelCat] = useState<string | null>(null); // catId or 'uncat'
  const [newChanName,      setNewChanName]   = useState('');
  const [newChanType,      setNewChanType]   = useState<'text' | 'voice'>('text');

  const sensors = useSensors(useSensor(PointerSensor));

  // Find selected channel from either categories or uncategorized
  const allChannels: Channel[] = [
    ...uncategorized,
    ...categories.flatMap((c) => c.channels),
  ];
  const selectedChannel = allChannels.find((c) => c.id === selectedId) ?? null;

  function selectChannel(ch: Channel) {
    setSelectedId(ch.id);
    setEditName(ch.name);
    setEditTopic(ch.topic ?? '');
    setEditType(ch.type);
    setSaveOk(false);
    setSaveErr('');
  }

  async function handleSaveChannel() {
    if (!selectedId) return;
    setSaving(true);
    setSaveOk(false);
    setSaveErr('');
    try {
      const updated = await updateChannel(API_BASE, activeServerId, selectedId, {
        name:  editName.trim() || selectedChannel?.name,
        topic: editType === 'text' ? editTopic.trim() || null : null,
      });
      // Update local state
      setLocalCats((prev) => prev.map((cat) => ({
        ...cat,
        channels: cat.channels.map((c) => c.id === updated.id ? updated : c),
      })));
      setLocalUncat((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteChannel() {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await deleteChannel(API_BASE, activeServerId, selectedId);
      setLocalCats((prev) => prev.map((cat) => ({
        ...cat,
        channels: cat.channels.filter((c) => c.id !== selectedId),
      })));
      setLocalUncat((prev) => prev.filter((c) => c.id !== selectedId));
      setSelectedId(null);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to delete.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    try {
      const cat = await createCategory(API_BASE, activeServerId, newCatName.trim());
      const newCat: Category = { ...cat, channels: [] };
      setLocalCats((prev) => [...prev, newCat]);
      setAddingCat(false);
      setNewCatName('');
      // Sync store
      setCategories(activeServerId, [...categories, newCat], uncategorized);
    } catch { /* ignore */ }
  }

  async function handleAddChannel(categoryId: string | null) {
    if (!newChanName.trim()) return;
    try {
      const ch = await createChannel(API_BASE, activeServerId, {
        name:       newChanName.trim(),
        type:       newChanType,
        categoryId: categoryId ?? undefined,
        position:   0,
      });
      if (categoryId) {
        setLocalCats((prev) => prev.map((cat) =>
          cat.id === categoryId
            ? { ...cat, channels: [...cat.channels, ch] }
            : cat
        ));
      } else {
        setLocalUncat((prev) => [...prev, ch]);
      }
      setAddingChannelCat(null);
      setNewChanName('');
      setNewChanType('text');
    } catch { /* ignore */ }
  }

  function handleChannelDragEnd(catId: string | null, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (catId === null) {
      setLocalUncat((prev) => {
        const oldIdx = prev.findIndex((c) => c.id === active.id);
        const newIdx = prev.findIndex((c) => c.id === over.id);
        const reordered = arrayMove(prev, oldIdx, newIdx);
        reordered.forEach((c, i) => {
          void updateChannel(API_BASE, activeServerId, c.id, { position: i });
        });
        return reordered;
      });
    } else {
      setLocalCats((prev) => prev.map((cat) => {
        if (cat.id !== catId) return cat;
        const oldIdx = cat.channels.findIndex((c) => c.id === active.id);
        const newIdx = cat.channels.findIndex((c) => c.id === over.id);
        const reordered = arrayMove(cat.channels, oldIdx, newIdx);
        reordered.forEach((c, i) => {
          void updateChannel(API_BASE, activeServerId, c.id, { position: i });
        });
        return { ...cat, channels: reordered };
      }));
    }
  }

  return (
    <>
      <h2 className={styles.tabHeader}>Channels</h2>

      <div className={styles.channelsPanelLayout}>
        {/* ---- Channel tree (left) ---- */}
        <div className={styles.channelTreePane}>
          <div className={styles.channelTreeHeader}>
            <span className={styles.sectionTitle}>Structure</span>
            <button
              className={styles.btnSecondary}
              style={{ height: 26, padding: '0 8px', fontSize: 'var(--text-xs)' }}
              type="button"
              onClick={() => setAddingCat(true)}
            >
              <Plus size={11} style={{ marginRight: 2 }} />
              Category
            </button>
          </div>

          {/* Uncategorized */}
          {uncategorized.length > 0 && (
            <div className={styles.catSection}>
              <div className={styles.catHeader}>
                <span>Uncategorized</span>
                <button
                  type="button"
                  className={styles.catAddBtn}
                  onClick={() => setAddingChannelCat('uncat')}
                  aria-label="Add channel"
                >
                  <Plus size={12} />
                </button>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleChannelDragEnd(null, e)}
              >
                <SortableContext
                  items={uncategorized.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {uncategorized.map((ch) => (
                    <SortableChannelRow
                      key={ch.id}
                      channel={ch}
                      isActive={ch.id === selectedId}
                      onSelect={() => selectChannel(ch)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {addingChannelCat === 'uncat' && (
                <InlineChannelForm
                  name={newChanName}
                  type={newChanType}
                  onNameChange={setNewChanName}
                  onTypeChange={setNewChanType}
                  onConfirm={() => void handleAddChannel(null)}
                  onCancel={() => setAddingChannelCat(null)}
                />
              )}
            </div>
          )}

          {/* Categories */}
          {categories.map((cat) => (
            <div key={cat.id} className={styles.catSection}>
              <div className={styles.catHeader}>
                <span>{cat.name}</span>
                <button
                  type="button"
                  className={styles.catAddBtn}
                  onClick={() => setAddingChannelCat(cat.id)}
                  aria-label={`Add channel to ${cat.name}`}
                >
                  <Plus size={12} />
                </button>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleChannelDragEnd(cat.id, e)}
              >
                <SortableContext
                  items={cat.channels.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {cat.channels.map((ch) => (
                    <SortableChannelRow
                      key={ch.id}
                      channel={ch}
                      isActive={ch.id === selectedId}
                      onSelect={() => selectChannel(ch)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {addingChannelCat === cat.id && (
                <InlineChannelForm
                  name={newChanName}
                  type={newChanType}
                  onNameChange={setNewChanName}
                  onTypeChange={setNewChanType}
                  onConfirm={() => void handleAddChannel(cat.id)}
                  onCancel={() => setAddingChannelCat(null)}
                />
              )}
            </div>
          ))}

          {/* Uncategorized add btn if no uncategorized channels yet */}
          {uncategorized.length === 0 && (
            <>
              {addingChannelCat === 'uncat' ? (
                <InlineChannelForm
                  name={newChanName}
                  type={newChanType}
                  onNameChange={setNewChanName}
                  onTypeChange={setNewChanType}
                  onConfirm={() => void handleAddChannel(null)}
                  onCancel={() => setAddingChannelCat(null)}
                />
              ) : (
                <button
                  type="button"
                  className={styles.channelTreeRow}
                  style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}
                  onClick={() => setAddingChannelCat('uncat')}
                >
                  <Plus size={12} /> Add channel
                </button>
              )}
            </>
          )}

          {/* Add category form */}
          {addingCat && (
            <div className={styles.inlineForm}>
              <input
                className="input"
                style={{ flex: 1, height: 28 }}
                placeholder="Category name"
                value={newCatName}
                autoFocus
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAddCategory(); if (e.key === 'Escape') setAddingCat(false); }}
              />
              <button className={styles.btnPrimary} style={{ height: 28, padding: '0 10px' }} onClick={() => void handleAddCategory()}>Add</button>
              <button className={styles.btnSecondary} style={{ height: 28, padding: '0 10px' }} onClick={() => setAddingCat(false)}>✕</button>
            </div>
          )}
        </div>

        {/* ---- Channel editor (right) ---- */}
        <div className={styles.channelEditor}>
          {!selectedChannel ? (
            <div className={styles.channelEditorEmpty}>
              <Hash size={32} style={{ opacity: 0.3 }} />
              <span>Select a channel to edit</span>
            </div>
          ) : (
            <>
              <h3 className={styles.sectionTitle} style={{ marginBottom: 16 }}>
                Edit #{selectedChannel.name}
              </h3>

              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="chan-name">Channel name</label>
                <input
                  id="chan-name"
                  className="input"
                  value={editName}
                  maxLength={100}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.label}>Channel type</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['text', 'voice'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={editType === t ? styles.btnPrimary : styles.btnSecondary}
                      style={{ height: 30, padding: '0 14px' }}
                      onClick={() => setEditType(t)}
                    >
                      {t === 'text' ? <Hash size={13} style={{ marginRight: 5 }} /> : <Volume2 size={13} style={{ marginRight: 5 }} />}
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {editType === 'text' && (
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="chan-topic">Topic</label>
                  <input
                    id="chan-topic"
                    className="input"
                    placeholder="Optional channel topic"
                    value={editTopic}
                    maxLength={500}
                    onChange={(e) => setEditTopic(e.target.value)}
                  />
                </div>
              )}

              {saveErr && <div className={styles.inlineError}>{saveErr}</div>}

              <div className={styles.roleEditorActions}>
                <button
                  className={styles.btnPrimary}
                  onClick={() => void handleSaveChannel()}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {saveOk && <span className={styles.successMsg}>Saved!</span>}
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    className={styles.btnDanger}
                    onClick={() => void handleDeleteChannel()}
                    disabled={deleting}
                  >
                    <Trash2 size={13} style={{ marginRight: 5 }} />
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ---- Inline channel add form ----------------------------------------------

function InlineChannelForm({
  name,
  type,
  onNameChange,
  onTypeChange,
  onConfirm,
  onCancel,
}: {
  name: string;
  type: 'text' | 'voice';
  onNameChange: (v: string) => void;
  onTypeChange: (v: 'text' | 'voice') => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0 8px 8px' }}>
      <input
        className="input"
        style={{ height: 28 }}
        placeholder="Channel name"
        value={name}
        autoFocus
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel(); }}
      />
      <div style={{ display: 'flex', gap: 4 }}>
        <select
          style={{ fontSize: 'var(--text-xs)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', padding: '2px 6px', height: 26 }}
          value={type}
          onChange={(e) => onTypeChange(e.target.value as 'text' | 'voice')}
        >
          <option value="text">Text</option>
          <option value="voice">Voice</option>
        </select>
        <button style={{ height: 26, fontSize: 'var(--text-xs)', padding: '0 8px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }} onClick={onConfirm}>Add</button>
        <button style={{ height: 26, fontSize: 'var(--text-xs)', padding: '0 8px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} onClick={onCancel}>✕</button>
      </div>
    </div>
  );
}

// Suppress unused import warning — getCategories used indirectly via setCategories
void getCategories;
