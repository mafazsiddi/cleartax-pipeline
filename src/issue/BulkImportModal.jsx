import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { toast } from 'react-toastify';
import { X, Upload, ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { PRIORITIES } from '../shared/helpers.js';

const STEPS = ['upload', 'map', 'preview'];
const DEFAULT_TYPE_ID = 'task';

// Header aliases used to auto-map columns from a CSV exported straight out of
// the team's Google Sheet (Status, Task Name, Property, Region, Priority,
// Assignor, Assignee, Description, Link, Attachment) without any manual mapping.
const COLUMN_ALIASES = {
  statusCol: ['status'],
  titleCol: ['taskname', 'title', 'task', 'name', 'summary'],
  propertyCol: ['property'],
  regionCol: ['region'],
  priorityCol: ['priority'],
  assignorCol: ['assignor', 'assignedby'],
  assigneeCol: ['assignee', 'assignedto'],
  descCol: ['description', 'desc'],
  linkCol: ['link', 'links', 'url'],
  attachmentCol: ['attachment', 'attachments'],
  typeCol: ['type', 'issuetype'],
  rowCol: ['row', 'rowno', 'rownumber'],
  parentCol: ['parentrow', 'parentrowno', 'parent'],
};

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

function autoMapColumns(headerRow) {
  const mapping = {};
  const taken = new Set();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = headerRow.findIndex((h, i) => !taken.has(i) && aliases.includes(normalize(h)));
    if (idx !== -1) {
      mapping[field] = idx;
      taken.add(idx);
    }
  }
  return mapping;
}

export default function BulkImportModal({ issueTypes, statuses, members, onClose, onImport }) {
  const [step, setStep] = useState('upload');
  const [rawRows, setRawRows] = useState([]);
  const [headersOn, setHeadersOn] = useState(true);

  const [mapping, setMapping] = useState({
    rowCol: null, parentCol: null, typeCol: null, statusCol: null, titleCol: null,
    propertyCol: null, regionCol: null, descCol: null, priorityCol: null,
    assignorCol: null, assigneeCol: null, linkCol: null, attachmentCol: null, labelCols: [],
  });
  const [typeOverrides, setTypeOverrides] = useState({});
  const [statusOverrides, setStatusOverrides] = useState({});
  const [priorityOverrides, setPriorityOverrides] = useState({});
  const [assignorOverrides, setAssignorOverrides] = useState({});
  const [assigneeOverrides, setAssigneeOverrides] = useState({});

  const [saving, setSaving] = useState(false);

  const defaultStatus = statuses.find((s) => s.isDefault) || statuses[0] || null;

  const headerRow = headersOn ? rawRows[0] : null;
  const dataRows = headersOn ? rawRows.slice(1) : rawRows;
  const columnCount = rawRows[0]?.length || 0;
  const columnLabel = (i) => (headerRow && headerRow[i]?.trim()) || `Column ${i + 1}`;

  function distinctValues(col) {
    if (col == null) return [];
    const set = new Set();
    dataRows.forEach((r) => { const v = (r[col] || '').trim(); if (v) set.add(v); });
    return [...set];
  }

  const distinctTypeValues = useMemo(() => distinctValues(mapping.typeCol), [dataRows, mapping.typeCol]);
  const distinctStatusValues = useMemo(() => distinctValues(mapping.statusCol), [dataRows, mapping.statusCol]);
  const distinctPriorityValues = useMemo(() => distinctValues(mapping.priorityCol), [dataRows, mapping.priorityCol]);
  const distinctAssignorValues = useMemo(() => distinctValues(mapping.assignorCol), [dataRows, mapping.assignorCol]);
  const distinctAssigneeValues = useMemo(() => distinctValues(mapping.assigneeCol), [dataRows, mapping.assigneeCol]);

  // Guessed defaults, overridden by whatever the user has explicitly picked.
  // Purely derived (no setState-during-render) so this can't loop.
  const typeValueMap = useMemo(() => {
    const map = {};
    distinctTypeValues.forEach((v) => {
      map[v] = typeOverrides[v] !== undefined ? typeOverrides[v] : guessMatch(v, issueTypes, (t) => t.id, (t) => t.name);
    });
    return map;
  }, [distinctTypeValues, typeOverrides, issueTypes]);

  const statusValueMap = useMemo(() => {
    const map = {};
    distinctStatusValues.forEach((v) => {
      map[v] = statusOverrides[v] !== undefined
        ? statusOverrides[v]
        : guessMatch(v, statuses, (s) => s.id, (s) => s.name) || defaultStatus?.id || null;
    });
    return map;
  }, [distinctStatusValues, statusOverrides, statuses, defaultStatus]);

  const priorityValueMap = useMemo(() => {
    const map = {};
    distinctPriorityValues.forEach((v) => {
      map[v] = priorityOverrides[v] !== undefined ? priorityOverrides[v] : guessMatch(v, PRIORITIES, (p) => p.id, (p) => p.name) || 'medium';
    });
    return map;
  }, [distinctPriorityValues, priorityOverrides]);

  const assignorValueMap = useMemo(() => {
    const map = {};
    distinctAssignorValues.forEach((v) => {
      map[v] = assignorOverrides[v] !== undefined ? assignorOverrides[v] : guessMatch(v, members, (m) => m.id, (m) => m.name);
    });
    return map;
  }, [distinctAssignorValues, assignorOverrides, members]);

  const assigneeValueMap = useMemo(() => {
    const map = {};
    distinctAssigneeValues.forEach((v) => {
      map[v] = assigneeOverrides[v] !== undefined ? assigneeOverrides[v] : guessMatch(v, members, (m) => m.id, (m) => m.name);
    });
    return map;
  }, [distinctAssigneeValues, assigneeOverrides, members]);

  const typesById = useMemo(() => Object.fromEntries(issueTypes.map((t) => [t.id, t])), [issueTypes]);

  const previewRows = useMemo(() => {
    if (step !== 'preview') return [];
    const canLinkParents = mapping.rowCol != null && mapping.parentCol != null;

    const rows = dataRows
      .map((r, i) => {
        const rowId = mapping.rowCol != null ? (r[mapping.rowCol] || '').trim() : String(i + 1);
        const title = mapping.titleCol != null ? (r[mapping.titleCol] || '').trim() : '';
        const rawType = mapping.typeCol != null ? (r[mapping.typeCol] || '').trim() : '';
        const rawStatus = mapping.statusCol != null ? (r[mapping.statusCol] || '').trim() : '';
        const rawPriority = mapping.priorityCol != null ? (r[mapping.priorityCol] || '').trim() : '';
        const rawAssignor = mapping.assignorCol != null ? (r[mapping.assignorCol] || '').trim() : '';
        const rawAssignee = mapping.assigneeCol != null ? (r[mapping.assigneeCol] || '').trim() : '';
        const isBlank = r.every((cell) => !cell || !String(cell).trim());
        const labelNames = [...new Set(mapping.labelCols.flatMap((col) => splitLabelValue(r[col])))];
        return {
          tempId: rowId || `row-${i}`,
          parentTempId: canLinkParents ? (r[mapping.parentCol] || '').trim() || null : null,
          issueTypeId: mapping.typeCol != null ? (rawType ? typeValueMap[rawType] || null : null) : DEFAULT_TYPE_ID,
          rawType,
          statusId: rawStatus ? statusValueMap[rawStatus] || defaultStatus?.id || null : defaultStatus?.id || null,
          title,
          property: mapping.propertyCol != null ? (r[mapping.propertyCol] || '').trim() : '',
          region: mapping.regionCol != null ? (r[mapping.regionCol] || '').trim() : '',
          description: mapping.descCol != null ? (r[mapping.descCol] || '').trim() : '',
          priority: rawPriority ? priorityValueMap[rawPriority] || 'medium' : 'medium',
          assignorId: rawAssignor ? assignorValueMap[rawAssignor] || null : null,
          assigneeId: rawAssignee ? assigneeValueMap[rawAssignee] || null : null,
          link: mapping.linkCol != null ? (r[mapping.linkCol] || '').trim() : '',
          attachmentLink: mapping.attachmentCol != null ? (r[mapping.attachmentCol] || '').trim() : '',
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
  }, [step, dataRows, mapping, typeValueMap, statusValueMap, priorityValueMap, assignorValueMap, assigneeValueMap, typesById, defaultStatus]);

  const validRows = previewRows.filter((r) => r.errors.length === 0);
  const invalidCount = previewRows.length - validRows.length;

  const handleFile = (file) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) { toast.error('That file has no rows.'); return; }
        setRawRows(res.data);
        if (headersOn) {
          const guessed = autoMapColumns(res.data[0]);
          setMapping((m) => ({ ...m, ...guessed }));
        }
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

  const canProceedFromMap = mapping.titleCol != null;

  const runImport = async () => {
    setSaving(true);
    try {
      const payload = validRows.map((r) => ({
        tempId: r.tempId,
        parentTempId: r.parentTempId,
        issueTypeId: r.issueTypeId,
        statusId: r.statusId,
        title: r.title,
        property: r.property || null,
        region: r.region || null,
        description: r.description,
        priority: r.priority,
        assignorId: r.assignorId,
        assigneeId: r.assigneeId,
        link: r.link || null,
        attachmentLink: r.attachmentLink || null,
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
              <span className="hint">Exported from Google Sheets or any spreadsheet tool — columns named Status, Task Name, Property, Region, Priority, Assignor, Assignee, Description, Link and Attachment are mapped automatically.</span>
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
                <MapField label="Task Name (required)" value={mapping.titleCol} onChange={(v) => setSingle('titleCol', v)} columnCount={columnCount} columnLabel={columnLabel} />
                <MapField label="Status" value={mapping.statusCol} onChange={(v) => setSingle('statusCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Property" value={mapping.propertyCol} onChange={(v) => setSingle('propertyCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Region" value={mapping.regionCol} onChange={(v) => setSingle('regionCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Priority" value={mapping.priorityCol} onChange={(v) => setSingle('priorityCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Assignor" value={mapping.assignorCol} onChange={(v) => setSingle('assignorCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Assignee" value={mapping.assigneeCol} onChange={(v) => setSingle('assigneeCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Description" value={mapping.descCol} onChange={(v) => setSingle('descCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Link" value={mapping.linkCol} onChange={(v) => setSingle('linkCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Attachment" value={mapping.attachmentCol} onChange={(v) => setSingle('attachmentCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Type" value={mapping.typeCol} onChange={(v) => setSingle('typeCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Row #" value={mapping.rowCol} onChange={(v) => setSingle('rowCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
                <MapField label="Parent row #" value={mapping.parentCol} onChange={(v) => setSingle('parentCol', v)} columnCount={columnCount} columnLabel={columnLabel} optional />
              </div>

              {mapping.typeCol == null && (
                <p className="hint">No Type column mapped — every row will be imported as a Task.</p>
              )}
              {mapping.statusCol == null && (
                <p className="hint">No Status column mapped — every row will be imported into "{defaultStatus?.name || 'the default status'}".</p>
              )}
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

              {distinctStatusValues.length > 0 && (
                <div className="field">
                  <span className="field-lbl">Map status values</span>
                  <div className="import-value-map">
                    {distinctStatusValues.map((v) => (
                      <div key={v} className="import-value-row">
                        <span>{v}</span>
                        <div className="selwrap">
                          <select className="sel" value={statusValueMap[v] || ''} onChange={(e) => setStatusOverrides((m) => ({ ...m, [v]: e.target.value || null }))}>
                            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              {distinctAssignorValues.length > 0 && (
                <div className="field">
                  <span className="field-lbl">Map assignor values</span>
                  <div className="import-value-map">
                    {distinctAssignorValues.map((v) => (
                      <div key={v} className="import-value-row">
                        <span>{v}</span>
                        <div className="selwrap">
                          <select className="sel" value={assignorValueMap[v] || ''} onChange={(e) => setAssignorOverrides((m) => ({ ...m, [v]: e.target.value || null }))}>
                            <option value="">Unspecified</option>
                            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {distinctAssigneeValues.length > 0 && (
                <div className="field">
                  <span className="field-lbl">Map assignee values</span>
                  <div className="import-value-map">
                    {distinctAssigneeValues.map((v) => (
                      <div key={v} className="import-value-row">
                        <span>{v}</span>
                        <div className="selwrap">
                          <select className="sel" value={assigneeValueMap[v] || ''} onChange={(e) => setAssigneeOverrides((m) => ({ ...m, [v]: e.target.value || null }))}>
                            <option value="">Unassigned</option>
                            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
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
