import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { toast } from 'react-toastify';
import { X, Upload, ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { PRIORITIES } from '../shared/helpers.js';

const STEPS = ['upload', 'map', 'preview'];

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
}

function guessMatch(rawValue, candidates, idOf, nameOf) {
  const n = normalize(rawValue);
  if (!n) return null;
  const exact = candidates.find((c) => normalize(idOf(c)) === n || normalize(nameOf(c)) === n);
  if (exact) return idOf(exact);
  const partial = candidates.find((c) => n.includes(normalize(idOf(c))) || normalize(idOf(c)).includes(n));
  return partial ? idOf(partial) : null;
}

function splitLabelValue(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function BulkImportModal({ issueTypes, onClose, onImport }) {
  const [step, setStep] = useState('upload');
  const [rawRows, setRawRows] = useState([]);
  const [headersOn, setHeadersOn] = useState(true);

  const [mapping, setMapping] = useState({
    rowCol: null, parentCol: null, typeCol: null, titleCol: null,
    descCol: null, priorityCol: null, labelCols: [],
  });
  const [typeOverrides, setTypeOverrides] = useState({});
  const [priorityOverrides, setPriorityOverrides] = useState({});

  const [saving, setSaving] = useState(false);

  const headerRow = headersOn ? rawRows[0] : null;
  const dataRows = headersOn ? rawRows.slice(1) : rawRows;
  const columnCount = rawRows[0]?.length || 0;
  const columnLabel = (i) => (headerRow && headerRow[i]?.trim()) || `Column ${i + 1}`;

  const distinctTypeValues = useMemo(() => {
    if (mapping.typeCol == null) return [];
    const set = new Set();
    dataRows.forEach((r) => { const v = (r[mapping.typeCol] || '').trim(); if (v) set.add(v); });
    return [...set];
  }, [dataRows, mapping.typeCol]);

  const distinctPriorityValues = useMemo(() => {
    if (mapping.priorityCol == null) return [];
    const set = new Set();
    dataRows.forEach((r) => { const v = (r[mapping.priorityCol] || '').trim(); if (v) set.add(v); });
    return [...set];
  }, [dataRows, mapping.priorityCol]);

  // Guessed defaults, overridden by whatever the user has explicitly picked.
  // Purely derived (no setState-during-render) so this can't loop.
  const typeValueMap = useMemo(() => {
    const map = {};
    distinctTypeValues.forEach((v) => {
      map[v] = typeOverrides[v] !== undefined ? typeOverrides[v] : guessMatch(v, issueTypes, (t) => t.id, (t) => t.name);
    });
    return map;
  }, [distinctTypeValues, typeOverrides, issueTypes]);

  const priorityValueMap = useMemo(() => {
    const map = {};
    distinctPriorityValues.forEach((v) => {
      map[v] = priorityOverrides[v] !== undefined ? priorityOverrides[v] : guessMatch(v, PRIORITIES, (p) => p.id, (p) => p.name) || 'medium';
    });
    return map;
  }, [distinctPriorityValues, priorityOverrides]);

  const typesById = useMemo(() => Object.fromEntries(issueTypes.map((t) => [t.id, t])), [issueTypes]);

  const previewRows = useMemo(() => {
    if (step !== 'preview') return [];
    const canLinkParents = mapping.rowCol != null && mapping.parentCol != null;

    const rows = dataRows
      .map((r, i) => {
        const rowId = mapping.rowCol != null ? (r[mapping.rowCol] || '').trim() : String(i + 1);
        const title = mapping.titleCol != null ? (r[mapping.titleCol] || '').trim() : '';
        const rawType = mapping.typeCol != null ? (r[mapping.typeCol] || '').trim() : '';
        const rawPriority = mapping.priorityCol != null ? (r[mapping.priorityCol] || '').trim() : '';
        const isBlank = r.every((cell) => !cell || !String(cell).trim());
        const labelNames = [...new Set(mapping.labelCols.flatMap((col) => splitLabelValue(r[col])))];
        return {
          tempId: rowId || `row-${i}`,
          parentTempId: canLinkParents ? (r[mapping.parentCol] || '').trim() || null : null,
          issueTypeId: rawType ? typeValueMap[rawType] || null : null,
          rawType,
          title,
          description: mapping.descCol != null ? (r[mapping.descCol] || '').trim() : '',
          priority: rawPriority ? priorityValueMap[rawPriority] || 'medium' : 'medium',
          labelNames,
          isBlank,
          errors: [],
        };
      })
      .filter((r) => !r.isBlank);

    const byId = Object.fromEntries(rows.map((r) => [r.tempId, r]));
    rows.forEach((row) => {
      if (!row.title) row.errors.push('Missing title');
      if (!row.issueTypeId) row.errors.push(row.rawType ? `Unmapped type "${row.rawType}"` : 'Missing type');
      const level = row.issueTypeId ? typesById[row.issueTypeId]?.hierarchyLevel : null;
      row.level = level ?? 0;
      if (row.parentTempId) {
        const parent = byId[row.parentTempId];
        if (!parent) row.errors.push(`Parent row "${row.parentTempId}" not found`);
        else if (row.issueTypeId && parent.issueTypeId) {
          const parentLevel = typesById[parent.issueTypeId]?.hierarchyLevel;
          if (parentLevel + 1 !== level) row.errors.push('Cannot be nested under its mapped parent');
        }
      }
    });

    // Propagate: a row whose parent has errors can't be created either, since
    // its parentTempId will never resolve to a real id server-side.
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (row.errors.length || !row.parentTempId) continue;
        const parent = byId[row.parentTempId];
        if (parent && parent.errors.length && !row.errors.includes('Parent row has errors')) {
          row.errors.push('Parent row has errors');
          changed = true;
        }
      }
    }

    return rows;
  }, [step, dataRows, mapping, typeValueMap, priorityValueMap, typesById]);

  const validRows = previewRows.filter((r) => r.errors.length === 0);
  const invalidCount = previewRows.length - validRows.length;

  const handleFile = (file) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) { toast.error('That file has no rows.'); return; }
        setRawRows(res.data);
        setMapping((m) => ({ ...m, titleCol: null }));
        setStep('map');
      },
      error: (err) => toast.error(err.message || 'Could not parse that file.'),
    });
  };

  const setSingle = (field, value) => setMapping((m) => ({ ...m, [field]: value === '' ? null : Number(value) }));
  const toggleLabelCol = (idx) =>
    setMapping((m) => ({
      ...m,
      labelCols: m.labelCols.includes(idx) ? m.labelCols.filter((c) => c !== idx) : [...m.labelCols, idx],
    }));

  const canProceedFromMap = mapping.titleCol != null && mapping.typeCol != null;

  const runImport = async () => {
    setSaving(true);
    try {
      const payload = validRows.map((r) => ({
        tempId: r.tempId,
        parentTempId: r.parentTempId,
        issueTypeId: r.issueTypeId,
        title: r.title,
        description: r.description,
        priority: r.priority,
        labelNames: r.labelNames,
      }));
      const res = await onImport(payload);
      const labelNote = res.labels.length ? ` and created ${res.labels.length} label${res.labels.length === 1 ? '' : 's'}` : '';
      toast.success(`Imported ${res.issues.length} issue${res.issues.length === 1 ? '' : 's'}${labelNote}.`);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Bulk import failed.');
    } finally {
      setSaving(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Bulk import issues</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="import-steps">
          {['Upload', 'Map columns', 'Preview'].map((label, i) => (
            <span key={label} className={`import-step ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'past' : ''}`}>
              {label}
            </span>
          ))}
        </div>

        <div className="modal-body">
          {step === 'upload' && (
            <label className="import-drop">
              <Upload size={22} />
              <span>Drop a CSV file here, or click to browse</span>
              <span className="hint">Exported from Google Sheets or any spreadsheet tool.</span>
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
              />
            </label>
          )}

          {step === 'map' && (
            <>
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={headersOn} onChange={(e) => setHeadersOn(e.target.checked)} />
                <span className="field-lbl" style={{ textTransform: 'none' }}>First row is column headers</span>
              </label>

              <div className="import-map-grid">
                <MapField label="Type (required)" value={mapping.typeCol} onChange={(v) => setSingle('typeCol', v)} columnCount={columnCount} columnLabel={columnLabel} />
                <MapField label="Title (required)" value={mapping.titleCol} onChange={(v) => setSingle('titleCol', v)} columnCount={columnCount} columnLabel={columnLabel} />
                <MapField label="Row #" value={mapping.rowCol} onChange={(v) => setSingle('rowCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Parent row #" value={mapping.parentCol} onChange={(v) => setSingle('parentCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Description" value={mapping.descCol} onChange={(v) => setSingle('descCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Priority" value={mapping.priorityCol} onChange={(v) => setSingle('priorityCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
              </div>

              {mapping.parentCol != null && mapping.rowCol == null && (
                <p className="hint import-warn"><AlertTriangle size={12} /> Map a "Row #" column too, or parent linking will be ignored.</p>
              )}

              <div className="field">
                <span className="field-lbl">Labels (optional, pick any columns)</span>
                <div className="import-label-cols">
                  {Array.from({ length: columnCount }, (_, i) => (
                    <label key={i} className="import-label-col">
                      <input type="checkbox" checked={mapping.labelCols.includes(i)} onChange={() => toggleLabelCol(i)} />
                      {columnLabel(i)}
                    </label>
                  ))}
                </div>
              </div>

              {distinctTypeValues.length > 0 && (
                <div className="field">
                  <span className="field-lbl">Map type values</span>
                  <div className="import-value-map">
                    {distinctTypeValues.map((v) => (
                      <div key={v} className="import-value-row">
                        <span>{v}</span>
                        <div className="selwrap">
                          <select className="sel" value={typeValueMap[v] || ''} onChange={(e) => setTypeOverrides((m) => ({ ...m, [v]: e.target.value || null }))}>
                            <option value="">Ignore this value</option>
                            {issueTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {distinctPriorityValues.length > 0 && (
                <div className="field">
                  <span className="field-lbl">Map priority values</span>
                  <div className="import-value-map">
                    {distinctPriorityValues.map((v) => (
                      <div key={v} className="import-value-row">
                        <span>{v}</span>
                        <div className="selwrap">
                          <select className="sel" value={priorityValueMap[v] || ''} onChange={(e) => setPriorityOverrides((m) => ({ ...m, [v]: e.target.value || null }))}>
                            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 'preview' && (
            <>
              <p className="hint">
                {validRows.length} ready to import{invalidCount > 0 ? `, ${invalidCount} need attention` : ''}.
              </p>
              <div className="import-preview-list">
                {previewRows.map((r) => (
                  <div key={r.tempId} className={`import-preview-row ${r.errors.length ? 'has-err' : ''}`} style={{ paddingLeft: 10 + r.level * 20 }}>
                    {r.errors.length ? <AlertTriangle size={13} className="warn-ic" /> : <CheckCircle2 size={13} className="ok-ic" />}
                    <span className="import-row-type">{typesById[r.issueTypeId]?.name || r.rawType || '—'}</span>
                    <span className="import-row-title">{r.title || '(no title)'}</span>
                    {r.labelNames.length > 0 && <span className="import-row-labels">{r.labelNames.join(', ')}</span>}
                    {r.errors.length > 0 && <span className="import-row-err">{r.errors.join('; ')}</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <span>
            {step === 'map' && <button className="btn ghost" onClick={() => setStep('upload')}><ArrowLeft size={14} /> Back</button>}
            {step === 'preview' && <button className="btn ghost" onClick={() => setStep('map')}><ArrowLeft size={14} /> Back</button>}
          </span>
          <div className="foot-right">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            {step === 'map' && (
              <button className="btn primary" disabled={!canProceedFromMap} onClick={() => setStep('preview')}>
                Preview <ArrowRight size={14} />
              </button>
            )}
            {step === 'preview' && (
              <button className="btn primary" disabled={saving || validRows.length === 0} onClick={runImport}>
                {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                {saving ? 'Importing…' : `Import ${validRows.length} issue${validRows.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MapField({ label, value, onChange, columnCount, columnLabel, optional }) {
  return (
    <label className="field">
      <span className="field-lbl">{label}</span>
      <div className="selwrap">
        <select className="sel wide" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{optional ? 'Not mapped' : 'Choose a column…'}</option>
          {Array.from({ length: columnCount }, (_, i) => (
            <option key={i} value={i}>{columnLabel(i)}</option>
          ))}
        </select>
      </div>
    </label>
  );
}
