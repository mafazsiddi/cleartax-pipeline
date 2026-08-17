import React, { useState } from 'react';
import { Link as LinkIcon, ExternalLink, Trash2, Plus } from 'lucide-react';

export default function LinkList({ links, canEdit, canDelete, onAdd, onDelete }) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    const url = draft.trim();
    if (!url) return;
    setAdding(true);
    try {
      await onAdd(url);
      setDraft('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="link-list">
      {links.length === 0 && !canEdit && <p className="hint">No links.</p>}

      {links.map((l) => (
        <div key={l.id} className="attachment-row">
          <LinkIcon size={14} className="attachment-ic" />
          <div className="attachment-info">
            <a className="attachment-name" href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>
              {l.url}
            </a>
          </div>
          <a
            className="icon-btn small"
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open link"
            aria-label="Open link"
          >
            <ExternalLink size={14} />
          </a>
          {canDelete && (
            <button className="icon-btn small" onClick={() => onDelete(l.id)} title="Delete" aria-label="Delete link">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}

      {canEdit && (
        <div className="link-input-row" style={{ marginTop: links.length ? 8 : 0 }}>
          <input
            className="in"
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder="https://…"
            disabled={adding}
          />
          <button
            className="link-open-btn"
            onClick={submit}
            disabled={adding || !draft.trim()}
            title="Add link"
            aria-label="Add link"
          >
            <Plus size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
