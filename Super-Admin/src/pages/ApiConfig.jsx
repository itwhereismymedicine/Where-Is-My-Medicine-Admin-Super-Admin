import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Loading, ErrorNote } from '../components/Helpers.jsx'

// The AI model settings the app reads at runtime (feature_flags/config.ai).
const ROWS = [
  { key: 'geminiModel', label: 'Gemini — prescription / label / lab model', hint: 'e.g. gemini-2.5-flash' },
  { key: 'geminiFallbackModel', label: 'Gemini — fallback model', hint: 'e.g. gemini-2.5-flash-lite' },
]

const DEFAULTS = { geminiModel: 'gemini-2.5-flash', geminiFallbackModel: 'gemini-2.5-flash-lite' }

export default function ApiConfig() {
  const [ai, setAi] = useState(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    api.get('/api/config/flags')
      .then((d) => setAi({ ...DEFAULTS, ...(d.ai || {}) }))
      .catch((e) => setErr(e.message))
  }, [])

  const save = async () => {
    setSaving(true); setSaved(false)
    try { await api.put('/api/config/ai', ai); setSaved(true) }
    catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  if (err) return <div className="page"><ErrorNote error={err} /></div>
  if (!ai) return <div className="page"><Loading /></div>

  const rows = ROWS.filter((r) => r.label.toLowerCase().includes(q.toLowerCase()) || r.key.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="page">
      <h1>API &amp; AI Models</h1>
      <p className="muted">
        Edit the AI model names the app uses. Changes push to every app instantly
        (the app reads <code>feature_flags/config.ai</code> in realtime) — no app update needed.
      </p>

      <div className="row" style={{ marginTop: 12, maxWidth: 620 }}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search APIs / models…" style={{ flex: 1 }} />
      </div>

      <div className="panel" style={{ marginTop: 14, maxWidth: 620 }}>
        {rows.length === 0 && <p className="muted">No matching setting.</p>}
        {rows.map((r) => (
          <label key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            <span style={{ fontWeight: 600 }}>{r.label}</span>
            <input type="text" value={ai[r.key] || ''}
              onChange={(e) => setAi({ ...ai, [r.key]: e.target.value })} placeholder={r.hint} />
            <span className="muted" style={{ fontSize: 12 }}>{r.hint}</span>
          </label>
        ))}
        <div className="row" style={{ marginTop: 8, alignItems: 'center', gap: 12 }}>
          <button className="primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save models'}
          </button>
          {saved && <span style={{ color: '#0F9D55', fontWeight: 600 }}>Saved — live in the app.</span>}
        </div>
      </div>

      <p className="muted" style={{ marginTop: 14, fontSize: 12, maxWidth: 620 }}>
        Tip: if a model is deprecated, just set the current one here (e.g. the latest Gemini Flash)
        and every app switches to it immediately — no rebuild or reinstall.
      </p>
    </div>
  )
}
