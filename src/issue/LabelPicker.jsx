import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

const SWATCHES = ['#8b5cf6', '#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#64748b', '#ec4899', '#06b6d4'];

export default function LabelPicker({ projectLabels, attachedLabels, onAttach, onDetach, onCreateLabel, canEdit }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(SWATCHES[0]);

  const attachedIds = new Set(attachedLabels.map((l) => l.id));
  const available = projectLabels.filter((l) => !attachedIds.has(l.id));

  return (
    <div className="label-picker">
      <div className="label-chips">
        {attachedLabels.map((l) => (
          <span key={l.id} className="label-chip" style={{ background: `${l.color}22`, color: l.color }}>
            {l.name}
            {canEdit && (
              <button className="label-chip-x" onClick={() => onDetach(l.id)} aria-label={`Remove ${l.name}`}>
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <button className="label-add-btn" onClick={() => setOpen((o) => !o)}>
            <Plus size={12} /> Label
          </button>
        )}
      </div>

      {open && (
        <div className="label-dropdown">
          {available.map((l) => (
            <button key={l.id} className="label-option" onClick={() => { onAttach(l.id); setOpen(false); }}>
              <span className="label-swatch" style={{ background: l.color }} />
              {l.name}
            </button>
          ))}
          {available.length === 0 && <p className="hint" style={{ margin: '4px 8px' }}>No more labels to add.</p>}

          <div className="label-create">
            <input
              className="in"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New label name"
            />
            <div className="label-swatches">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  className={`label-swatch-btn ${newColor === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                  aria-label={`Choose color ${c}`}
                />
              ))}
            </div>
            <button
              className="btn primary"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={!newName.trim()}
              onClick={async () => {
                if (!newName.trim()) return;
                await onCreateLabel(newName.trim(), newColor);
                setNewName('');
              }}
            >
              Create label
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
