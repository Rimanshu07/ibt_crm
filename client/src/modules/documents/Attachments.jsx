import { useEffect, useState } from 'react';
import { api, download, money, fmtDateTime, qs } from '../../core/api.js';
import { Empty, Modal, useConfirm, useToast } from '../../core/ui.jsx';
import { RefPicker } from '../../core/forms.jsx';
import { fileToBase64 } from '../../core/files.js';

/** Files kept for records: vendor package PDFs / emails, confirmations, invoices. Filter by trip or supplier. */
export default function Attachments({ tripId, supplierId, title = 'Files kept for records' }) {
  const toast = useToast(); const confirm = useConfirm();
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = () => api(`/attachments${qs({ trip_id: tripId, supplier_id: supplierId })}`).then((r) => setRows(r.data)).catch((e) => toast(e.message, 'bad'));
  useEffect(() => { load(); }, [tripId, supplierId]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (a) => {
    if (!(await confirm({ title: 'Delete file?', message: `"${a.title}" will be removed from the records.`, confirmText: 'Delete', tone: 'danger' }))) return;
    await api(`/attachments/${a.id}`, { method: 'DELETE' }); toast('Deleted'); load();
  };
  const kind = { vendor_package: 'Vendor package', confirmation: 'Confirmation', invoice: 'Vendor invoice', other: 'Other' };
  return (
    <div className="card flush">
      <div className="card-head"><h2>{title}</h2>{tripId && <button className="btn secondary small" onClick={() => setAdding(true)}>+ Add file / email</button>}</div>
      {!rows ? <Empty>Loading…</Empty> : rows.length === 0 ? <Empty>Nothing yet. Vendor PDFs and emails used in quotes are saved here automatically.</Empty> : (
        <table><tbody>{rows.map((a) => (
          <tr key={a.id}>
            <td>{a.has_file ? '📄' : '✉'} <b>{a.title}</b><div className="muted small">{kind[a.kind] || a.kind}{a.supplier_name ? ` · ${a.supplier_name}` : ''}{!tripId && a.trip_no ? ` · Trip ${a.trip_no} (${a.guest_name})` : ''}</div></td>
            <td className="nowrap">{a.amount ? money(a.amount, a.currency || 'INR') : ''}</td>
            <td className="muted small nowrap">{fmtDateTime(a.created_at)}{a.created_by_name ? ` · ${a.created_by_name}` : ''}</td>
            <td className="right nowrap">
              <button className="btn secondary small" onClick={() => download(`/attachments/${a.id}/download`, a.file_name || `${a.title}.txt`).catch((e) => toast(e.message, 'bad'))}>Download</button>
              <button className="btn remove xs" onClick={() => remove(a)}>Delete</button>
            </td>
          </tr>
        ))}</tbody></table>
      )}
      {adding && <AddAttachment tripId={tripId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function AddAttachment({ tripId, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', kind: 'vendor_package', supplier_id: null, text: '', amount: '', currency: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, trip_id: tripId, title: f.title || file?.name || 'Vendor email' };
      if (file) Object.assign(body, { file_name: file.name, mime: file.type, data_base64: await fileToBase64(file) });
      await api('/attachments', { method: 'POST', body }); toast('Saved'); onSaved();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Keep a file for records" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || (!file && !f.text.trim())} onClick={save}>Save</button></>}>
      <div className="stack">
        <label className="field"><span>Title</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Kerala package – Intersight" /></label>
        <label className="field"><span>Type</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="vendor_package">Vendor package</option><option value="confirmation">Confirmation</option><option value="invoice">Vendor invoice</option><option value="other">Other</option></select></label>
        <label className="field"><span>Vendor</span><RefPicker refType="supplier" value={f.supplier_id} onChange={(v) => setF({ ...f, supplier_id: v })} /></label>
        <label className="field"><span>File (PDF, image, Excel…)</span><input type="file" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        <label className="field"><span>…or paste the email text</span><textarea rows={5} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></label>
        <div className="row"><label className="field"><span>Amount</span><input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
          <label className="field"><span>Currency</span><input maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></label></div>
      </div>
    </Modal>
  );
}
