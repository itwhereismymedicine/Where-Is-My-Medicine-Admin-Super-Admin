import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { Loading, ErrorNote, fmtTime } from '../components/Helpers.jsx'

// Max image upload size. Uploads are stored as a data URI on the gallery doc
// itself (no separate file storage wired up), so this is the ceiling.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 // 2 MB

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

// Image carousel pushed to the main marketing website — Super Admin only.
// Every active image shows below the live demo in an auto-scrolling carousel
// with prev/next arrows. Upload as many as you like; reorder with "Order".
export default function Gallery() {
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const [imageUrl, setImageUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [title, setTitle] = useState('')
  const [order, setOrder] = useState(0)
  const fileInput = useRef(null)

  const load = () =>
    api.get('/api/gallery/admin')
      .then((data) => setItems(data.images || []))
      .catch((e) => setErr(e.message))

  useEffect(() => { load() }, [])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    if (!file.type.startsWith('image/')) { setErr('Choose an image file.'); return }
    if (file.size > MAX_UPLOAD_BYTES) {
      setErr(`That image is too big (${(file.size / (1024 * 1024)).toFixed(1)} MB) — use one under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB, or paste an image URL instead.`)
      return
    }
    try {
      setImageUrl(await fileToDataUrl(file))
    } catch (e2) { setErr(e2.message) }
  }

  function clearForm() {
    setImageUrl('')
    setLinkUrl('')
    setTitle('')
    setOrder(0)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function addImage() {
    setErr(''); setMsg('')
    if (!imageUrl) { setErr('Add an image — paste a URL or upload a file.'); return }
    setBusy(true)
    try {
      await api.post('/api/gallery', { imageUrl, linkUrl, title, order: Number(order) || 0, active: true })
      setMsg('Image added — it will now show on the main website.')
      clearForm()
      load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function toggleActive(item) {
    setErr(''); setMsg('')
    setBusy(true)
    try {
      await api.put(`/api/gallery/${item.id}`, {
        imageUrl: item.imageUrl,
        linkUrl: item.linkUrl || '',
        title: item.title || '',
        order: item.order || 0,
        active: !item.active,
      })
      load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function remove(item) {
    setErr(''); setMsg('')
    if (!window.confirm('Remove this image from the website carousel?')) return
    setBusy(true)
    try {
      await api.del(`/api/gallery/${item.id}`)
      setMsg('Image removed.')
      load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (err && !items) return <div className="page"><ErrorNote error={err} /></div>
  if (!items) return <div className="page"><Loading /></div>

  const isUpload = imageUrl.startsWith('data:')

  return (
    <div className="page">
      <h1>Website Carousel</h1>
      <p className="muted">
        Upload images to the image carousel shown on the main website, just below the live
        demo. Active images auto-scroll and visitors can step through them with the ◀ ▶
        arrows. Super Admin only.
      </p>

      <div className="panel" style={{ maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Add an image</h3>
        <label>Image URL</label>
        <input
          value={isUpload ? '' : imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://example.com/banner.jpg"
          disabled={isUpload}
        />
        <p className="muted" style={{ margin: '6px 0' }}>— or upload an image (up to 2 MB) —</p>
        <input type="file" accept="image/*" ref={fileInput} onChange={handleFile} />
        {isUpload && (
          <p className="muted" style={{ marginTop: 4 }}>
            Image loaded from upload.{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); clearForm() }}>Remove</a>
          </p>
        )}

        <label style={{ marginTop: 12 }}>Caption / alt text (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Monsoon offer — 20% off"
        />

        <label>Link when clicked (optional)</label>
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://example.com/offer"
        />

        <label>Order (lower shows first)</label>
        <input
          type="number"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          style={{ width: 120 }}
        />

        {imageUrl && (
          <div style={{ marginTop: 14 }}>
            <p className="muted" style={{ marginBottom: 6 }}>Preview</p>
            <div style={{
              border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
              background: 'var(--surface-2)', maxWidth: 360,
            }}>
              <img src={imageUrl} alt={title || 'Gallery image'} style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'contain' }} />
            </div>
          </div>
        )}

        {err && <p className="err">{err}</p>}
        {msg && <p className="ok">{msg}</p>}

        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary" disabled={busy} onClick={addImage}>
            {busy ? 'Adding…' : 'Add to carousel'}
          </button>
        </div>
      </div>

      <h3 style={{ marginTop: 22 }}>On the website ({items.length})</h3>
      {items.length === 0 ? (
        <div className="panel" style={{ maxWidth: 560 }}>No images yet. Add one above.</div>
      ) : (
        <div className="grid-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {items.map((item) => (
            <div className="panel" key={item.id} style={{ opacity: item.active ? 1 : 0.6 }}>
              <div style={{
                border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
                background: 'var(--surface-2)', marginBottom: 10,
              }}>
                <img src={item.imageUrl} alt={item.title || 'Gallery image'} style={{ width: '100%', display: 'block', height: 140, objectFit: 'cover' }} />
              </div>
              <div className="kv" style={{ gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: 13 }}>
                <div>Status</div>
                <div style={{ color: item.active ? '#22c55e' : 'var(--muted)' }}>
                  {item.active ? '● Live' : '○ Hidden'}
                </div>
                <div>Caption</div><div>{item.title || '—'}</div>
                <div>Order</div><div>{item.order ?? 0}</div>
                <div>Link</div>
                <div style={{ wordBreak: 'break-all' }}>{item.linkUrl
                  ? <a href={item.linkUrl} target="_blank" rel="noopener noreferrer">{item.linkUrl}</a>
                  : '—'}</div>
                <div>When</div><div className="muted">{fmtTime(item.createdAtMillis)}</div>
              </div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <button className="sm" disabled={busy} onClick={() => toggleActive(item)}>
                  {item.active ? 'Hide' : 'Show'}
                </button>
                <button className="sm red" disabled={busy} onClick={() => remove(item)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
