import { useEffect, useState } from 'react'
import { api } from '../api.js'
import Modal from '../components/Modal.jsx'
import { Loading, ErrorNote, fmtTime } from '../components/Helpers.jsx'

export default function Approvals() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [active, setActive] = useState(null)   // pharmacy being reviewed
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/api/pharmacies/pending').then(setRows).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  async function approve(phone) {
    setBusy(true)
    try { await api.post(`/api/pharmacies/${encodeURIComponent(phone)}/approve`); close(); load() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function reject(phone) {
    setBusy(true)
    try {
      await api.post(`/api/pharmacies/${encodeURIComponent(phone)}/reject`, { reason })
      close(); load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  function close() { setActive(null); setRejecting(false); setReason('') }

  if (err) return <div className="page"><ErrorNote error={err} /></div>
  if (!rows) return <div className="page"><Loading /></div>

  return (
    <div className="page">
      <h1>Signup Approvals</h1>
      <p className="muted">Review drug license, Aadhaar &amp; shop photo, then approve or reject.</p>

      {rows.length === 0 && <div className="panel">No pending signups. 🎉</div>}

      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr><th>Pharmacy</th><th>Owner</th><th>City / State</th><th>Code</th><th>Submitted</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.pharmacyName}</td>
                <td>{p.ownerName}</td>
                <td>{p.city}, {p.state}</td>
                <td>{p.pharmacyCode || '—'}</td>
                <td className="muted">{fmtTime(p.updatedAtMillis)}</td>
                <td><button className="sm" onClick={() => setActive(p)}>Review</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active && (
        <Modal title={`Review — ${active.pharmacyName}`} wide onClose={close}>
          <div className="kv">
            <div>Owner</div><div>{active.ownerName}</div>
            <div>Mobile</div><div>{active.mobileNumber}</div>
            <div>Drug License #</div><div>{active.drugLicenseNumber}</div>
            <div>Aadhaar #</div><div>{active.aadharNumber}</div>
            <div>Address</div><div>{active.city}, {active.state} {active.pincode}</div>
            <div>Discount</div><div>{active.discountPercent}%</div>
            <div>Referral</div><div>{active.referralCode || '—'}</div>
          </div>

          <h3 style={{ marginTop: 16 }}>Documents</h3>
          <div className="row" style={{ marginTop: 8 }}>
            <DocLink label="Drug License" url={active.drugLicenseUri} />
            {(active.aadharUris || []).map((u, i) => <DocLink key={i} label={`Aadhaar ${i + 1}`} url={u} />)}
            <DocLink label="Shop Photo" url={active.photoUri} />
          </div>

          {!rejecting ? (
            <div className="row" style={{ marginTop: 20 }}>
              <button className="green" disabled={busy} onClick={() => approve(active.id)}>Approve</button>
              <button className="red" disabled={busy} onClick={() => setRejecting(true)}>Reject…</button>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <label>Rejection reason (sent to pharmacy)</label>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Drug license image is unreadable" />
              <div className="row" style={{ marginTop: 12 }}>
                <button className="red" disabled={busy || !reason.trim()} onClick={() => reject(active.id)}>
                  Confirm reject
                </button>
                <button disabled={busy} onClick={() => setRejecting(false)}>Cancel</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

function DocLink({ label, url }) {
  if (!url) return <span className="badge grey">{label}: none</span>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="row" style={{ flexDirection: 'column', width: 120 }}>
      <img className="thumb" style={{ width: 120, height: 80 }} src={url} alt={label}
        onError={(e) => { e.target.style.display = 'none' }} />
      <span>{label} ↗</span>
    </a>
  )
}
