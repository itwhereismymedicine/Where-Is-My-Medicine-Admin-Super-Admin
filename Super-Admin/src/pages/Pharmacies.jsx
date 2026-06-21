import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import Modal from '../components/Modal.jsx'
import { Loading, ErrorNote, VerifyBadge } from '../components/Helpers.jsx'

export default function Pharmacies() {
  const { can, isSuper } = useAuth()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)        // { phone, mode: 'discount'|'location'|'suspend' }
  const [val, setVal] = useState({})
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/api/pharmacies').then(setRows).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  async function run(fn) {
    setBusy(true); setErr('')
    try { await fn(); setEdit(null); setVal({}); load() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (err && !rows) return <div className="page"><ErrorNote error={err} /></div>
  if (!rows) return <div className="page"><Loading /></div>

  const filtered = rows.filter((r) =>
    !q || (r.pharmacyName || '').toLowerCase().includes(q.toLowerCase()) ||
    (r.pharmacyCode || '').toLowerCase().includes(q.toLowerCase()) ||
    (r.mobileNumber || '').includes(q))

  return (
    <div className="page">
      <h1>Pharmacy Directory</h1>
      <div className="toolbar">
        <input style={{ maxWidth: 320 }} placeholder="Search name / code / phone"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorNote error={err} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Code</th><th>Pharmacy</th><th>Owner</th><th>State</th><th>Discount</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>{p.pharmacyCode || '—'}</td>
                <td>{p.pharmacyName}<div className="muted">{p.mobileNumber}</div></td>
                <td>{p.ownerName}</td>
                <td>{p.state}</td>
                <td>{p.discountPercent}%</td>
                <td><VerifyBadge acc={p} /></td>
                <td>
                  <div className="row">
                    {can('override_discount') && (
                      <button className="sm" onClick={() => { setEdit({ phone: p.id, mode: 'discount' }); setVal({ discountPercent: p.discountPercent }) }}>Discount</button>
                    )}
                    {can('suspend_pharmacy') && !p.suspended && (
                      <button className="sm" onClick={() => { setEdit({ phone: p.id, mode: 'suspend' }); setVal({ reason: '' }) }}>Suspend</button>
                    )}
                    {can('suspend_pharmacy') && p.suspended && (
                      <button className="sm green" onClick={() => run(() => api.post(`/api/pharmacies/${encodeURIComponent(p.id)}/unsuspend`))}>Unsuspend</button>
                    )}
                    {isSuper && (
                      <button className="sm" onClick={() => { setEdit({ phone: p.id, mode: 'location' }); setVal({ latitude: p.latitude, longitude: p.longitude }) }}>Location</button>
                    )}
                    {isSuper && (
                      <button className="sm red" onClick={() => {
                        if (confirm(`Permanently delete ${p.pharmacyName}? This cannot be undone.`))
                          run(() => api.del(`/api/pharmacies/${encodeURIComponent(p.id)}`))
                      }}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit?.mode === 'discount' && (
        <Modal title="Override discount %" onClose={() => setEdit(null)}>
          {!isSuper && <p className="muted">Admins may set up to 25%. Higher needs a Super Admin.</p>}
          <label>Discount %</label>
          <input type="number" value={val.discountPercent}
            onChange={(e) => setVal({ discountPercent: Number(e.target.value) })} />
          <ErrorNote error={err} />
          <div className="row" style={{ marginTop: 14 }}>
            <button className="primary" disabled={busy}
              onClick={() => run(() => api.put(`/api/pharmacies/${encodeURIComponent(edit.phone)}/discount`, { discountPercent: val.discountPercent }))}>
              Save
            </button>
          </div>
        </Modal>
      )}

      {edit?.mode === 'suspend' && (
        <Modal title="Suspend pharmacy" onClose={() => setEdit(null)}>
          <label>Reason</label>
          <textarea rows={3} value={val.reason} onChange={(e) => setVal({ reason: e.target.value })} />
          <div className="row" style={{ marginTop: 14 }}>
            <button className="red" disabled={busy}
              onClick={() => run(() => api.post(`/api/pharmacies/${encodeURIComponent(edit.phone)}/suspend`, { reason: val.reason }))}>
              Suspend
            </button>
          </div>
        </Modal>
      )}

      {edit?.mode === 'location' && (
        <Modal title="Override shop location" onClose={() => setEdit(null)}>
          <label>Latitude</label>
          <input type="number" value={val.latitude} onChange={(e) => setVal({ ...val, latitude: Number(e.target.value) })} />
          <label>Longitude</label>
          <input type="number" value={val.longitude} onChange={(e) => setVal({ ...val, longitude: Number(e.target.value) })} />
          <div className="row" style={{ marginTop: 14 }}>
            <button className="primary" disabled={busy}
              onClick={() => run(() => api.put(`/api/pharmacies/${encodeURIComponent(edit.phone)}/location`, { latitude: val.latitude, longitude: val.longitude }))}>
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
