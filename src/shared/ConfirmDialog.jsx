import React from 'react';

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true, onConfirm, onCancel }) {
  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div className="modal narrow" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <div className="modal-body">
          <p className="hint">{message}</p>
        </div>
        <div className="modal-foot">
          <span />
          <div className="foot-right">
            <button className="btn ghost" onClick={onCancel}>{cancelLabel}</button>
            <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
