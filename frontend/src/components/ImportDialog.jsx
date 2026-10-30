import { useRef, useState } from 'react';
import { Alert, Badge, Modal } from './ui';
import { downloadWorkbook, readRows } from '../utils/spreadsheet';

const ACTION_BADGE = {
  create: <Badge tone="success">New</Badge>,
  update: <Badge tone="info">Update</Badge>,
  unchanged: <Badge>No change</Badge>,
  error: <Badge tone="danger">Error</Badge>,
};

/**
 * Two-step spreadsheet import: read the file in the browser, ask the server
 * for a preview (nothing saved), then import for real once the user agrees.
 *
 * props: title, noun ("products"), columns (alias map), required fields,
 * template ({ filename, columns, rows }), submit(body) -> API call,
 * options: [{ key, label, hint }] extra checkboxes sent with the request.
 */
export default function ImportDialog({ title, noun, columns, required = ['name'], template, submit, options = [], onClose, onDone }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [preview, setPreview] = useState(null);
  const [flags, setFlags] = useState(() => Object.fromEntries(options.map((o) => [o.key, false])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const runPreview = async (rows, nextFlags = flags) => {
    setBusy(true);
    setError('');
    try {
      setPreview(await submit({ rows, dryRun: true, ...nextFlags }));
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setDone(null);
    setError('');
    setBusy(true);
    try {
      const result = await readRows(file, columns, required);
      if (!result.rows.length) throw new Error(`No ${noun} found under the header row.`);
      setParsed(result);
      await runPreview(result.rows);
    } catch (e) {
      setParsed(null);
      setError(e.message);
      setBusy(false);
    }
  };

  const toggle = (key) => {
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    if (parsed) runPreview(parsed.rows, next);
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await submit({ rows: parsed.rows, dryRun: false, ...flags });
      if (!result.saved) {
        setPreview(result);
        throw new Error('Some rows have errors. Fix them in the file and choose it again.');
      }
      setDone(result);
      onDone?.(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => downloadWorkbook(template.filename, [{ name: noun, columns: template.columns, rows: template.rows }]);

  return (
    <Modal
      size="lg"
      title={title}
      subtitle="Excel (.xlsx) or CSV. Nothing is saved until you confirm."
      onClose={onClose}
      footer={
        done ? (
          <button type="button" onClick={onClose} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm">Done</button>
        ) : (
          <>
            <button type="button" onClick={onClose} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy || !preview || preview.errorCount > 0 || preview.created + preview.updated === 0}
              className="app-btn-primary flex-[2] rounded-lg px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {busy && preview ? 'Working…' : preview ? `Import ${preview.created + preview.updated} ${noun}` : 'Import'}
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {done ? (
          <Alert tone="success">
            Imported: {done.created} new, {done.updated} updated{done.unchanged ? `, ${done.unchanged} already up to date` : ''}.
          </Alert>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-[var(--border-strong)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{fileName || 'Choose your spreadsheet'}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {parsed ? `${parsed.rows.length} rows · columns found: ${parsed.matched.join(', ')}${parsed.ignored.length ? ` · ignored: ${parsed.ignored.join(', ')}` : ''}` : 'The first row must be the column names. Not sure? Start from the template.'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={downloadTemplate} className="app-btn-secondary rounded-lg border px-3 py-2 text-sm font-medium">Template</button>
                <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="app-btn-primary rounded-lg px-3 py-2 text-sm disabled:opacity-60">{parsed ? 'Choose another' : 'Choose file'}</button>
                <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={chooseFile} />
              </div>
            </div>

            {options.map((o) => (
              <label key={o.key} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                <input type="checkbox" className="mt-0.5" checked={flags[o.key]} onChange={() => toggle(o.key)} disabled={busy} />
                <span>{o.label}{o.hint ? <span className="block text-xs text-[var(--text-muted)]">{o.hint}</span> : null}</span>
              </label>
            ))}

            {busy && !preview ? <p className="text-sm text-[var(--text-muted)]">Reading the file…</p> : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}

            {preview ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['New', preview.created, 'text-emerald-600 dark:text-emerald-400'],
                    ['Updated', preview.updated, 'text-slate-600 dark:text-slate-300'],
                    ['No change', preview.unchanged, 'text-[var(--text-secondary)]'],
                    ['Errors', preview.errorCount, preview.errorCount ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-secondary)]'],
                  ].map(([label, value, cls]) => (
                    <div key={label} className="app-panel-soft rounded-xl border px-3 py-2.5">
                      <p className="text-xs text-[var(--text-muted)]">{label}</p>
                      <p className={`num text-lg font-semibold ${cls}`}>{value}</p>
                    </div>
                  ))}
                </div>
                {preview.errorCount ? <Alert tone="warning">Fix the rows marked Error in your file, then choose it again. Nothing has been saved.</Alert> : null}
                <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-default)]">
                  <table className="min-w-full text-sm">
                    <thead className="app-table-head sticky top-0">
                      <tr><th className="px-3 py-2 text-left font-medium">Row</th><th className="px-3 py-2 text-left font-medium">Name</th><th className="px-3 py-2 text-left font-medium">Result</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {preview.rows.map((r) => (
                        <tr key={`${r.row}-${r.name}`}>
                          <td className="num px-3 py-1.5 text-[var(--text-muted)]">{r.row}</td>
                          <td className="px-3 py-1.5 text-[var(--text-primary)]">{r.name}</td>
                          <td className="px-3 py-1.5">
                            <span className="flex flex-wrap items-center gap-2">
                              {ACTION_BADGE[r.action]}
                              {r.message ? <span className="text-xs text-red-600 dark:text-red-400">{r.message}</span> : null}
                              {r.changes ? <span className="text-xs text-[var(--text-muted)]">{r.changes.join(', ')}</span> : null}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.total > preview.rows.length ? <p className="text-xs text-[var(--text-muted)]">Showing the first {preview.rows.length} of {preview.total} rows.</p> : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
