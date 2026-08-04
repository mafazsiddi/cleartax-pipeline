import React, { useRef, useState } from 'react';
import { Paperclip, Download, Trash2, Upload } from 'lucide-react';
import { formatBytes } from '../shared/helpers.js';

export default function AttachmentList({ attachments, canEdit, uploading, uploadError, onUpload, onDownload, onDelete }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const handleFiles = (files) => {
    if (files && files[0]) onUpload(files[0]);
  };

  const handleDownload = async (a) => {
    setDownloadingId(a.id);
    try {
      await onDownload(a);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="attachment-list">
      {attachments.length === 0 && !canEdit && <p className="hint">No attachments.</p>}

      {attachments.map((a) => (
        <div key={a.id} className="attachment-row">
          <Paperclip size={14} className="attachment-ic" />
          <div className="attachment-info">
            <span className="attachment-name">{a.fileName}</span>
            <span className="attachment-meta">{formatBytes(a.fileSize)}</span>
          </div>
          <button
            className="icon-btn small"
            onClick={() => handleDownload(a)}
            disabled={downloadingId === a.id}
            title="Download"
            aria-label={`Download ${a.fileName}`}
          >
            <Download size={14} />
          </button>
          {canEdit && (
            <button className="icon-btn small" onClick={() => onDelete(a.id)} title="Delete" aria-label="Delete attachment">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}

      {canEdit && (
        <div
          className={`attachment-drop ${dragOver ? 'drop' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
          <Upload size={16} />
          <span>{uploading ? 'Uploading…' : 'Click or drop a file to attach'}</span>
        </div>
      )}
      {uploadError && <p className="err">{uploadError}</p>}
    </div>
  );
}
