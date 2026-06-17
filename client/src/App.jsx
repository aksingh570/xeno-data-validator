import { useState, useCallback, useEffect, useRef } from 'react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area
} from 'recharts'

// ─── Constants ────────────────────────────────────────────────
const COUNTRIES = [
  { code: 'IN', label: '🇮🇳 India', digits: 10 },
  { code: 'SG', label: '🇸🇬 Singapore', digits: 8 },
  { code: 'US', label: '🇺🇸 USA', digits: 10 },
  { code: 'GB', label: '🇬🇧 UK', digits: 10 },
  { code: 'AE', label: '🇦🇪 UAE', digits: 9 },
  { code: 'AU', label: '🇦🇺 Australia', digits: 9 },
  { code: 'CA', label: '🇨🇦 Canada', digits: 10 },
  { code: 'MY', label: '🇲🇾 Malaysia', digits: 9 },
  { code: 'PH', label: '🇵🇭 Philippines', digits: 10 },
]
const PIE_COLORS = { Valid: '#34d399', 'Auto-Fixed': '#a78bfa', Invalid: '#f87171' }
const BAR_COLORS = ['#f87171','#a78bfa','#34d399','#fbbf24','#22d3ee','#f472b6']
const STEPS = ['Upload', 'Preview', 'Validate', 'Results']
const STAGES = ['Reading file…', 'Parsing CSV…', 'Detecting fields…', 'Validating rows…', 'Auto-fixing…', 'Building report…']
const GRADE_COLOR = { A: '#34d399', B: '#22d3ee', C: '#fbbf24', D: '#f97316', F: '#f87171' }

// ─── useCountUp hook ──────────────────────────────────────────
function useCountUp(target, active) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active || target == null) { setVal(0); return }
    let start = null
    const dur = 900
    const raf = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / dur, 1)
      setVal(Math.round(p * target))
      if (p < 1) requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
  }, [target, active])
  return val
}

// ─── Quality Gauge (SVG arc) ───────────────────────────────────
function QualityGauge({ score, grade }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const sweep = circ * 0.75
  const filled = (score / 100) * sweep
  const color = GRADE_COLOR[grade] || '#22d3ee'
  const offset = circ * 0.125
  return (
    <div className="gauge-wrap">
      <svg width="150" height="118" viewBox="0 0 150 118">
        <circle cx="75" cy="85" r={r} fill="none"
          stroke="rgba(255,255,255,0.05)" strokeWidth="11"
          strokeDasharray={`${sweep} ${circ - sweep}`}
          strokeDashoffset={offset} strokeLinecap="round" />
        <circle cx="75" cy="85" r={r} fill="none"
          stroke={color} strokeWidth="11"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={offset} strokeLinecap="round"
          style={{
            transition: 'stroke-dasharray 1.4s cubic-bezier(.17,.67,.38,1)',
            filter: `drop-shadow(0 0 10px ${color}88)`
          }} />
        <text x="75" y="82" textAnchor="middle" fill={color}
          fontSize="30" fontWeight="900" fontFamily="Inter,sans-serif">{score}</text>
        <text x="75" y="100" textAnchor="middle" fill="#475569"
          fontSize="10" fontWeight="700" fontFamily="Inter,sans-serif" letterSpacing="1">QUALITY SCORE</text>
      </svg>
      <div className="gauge-grade" style={{ color }}>
        Grade <strong>{grade}</strong>
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────
function StatCard({ value, label, color, delay, active }) {
  const count = useCountUp(value, active)
  return (
    <div className={`stat-card sc-${color} anim-delay-${delay}`}>
      <div className="stat-glow" />
      <div className="stat-num">{count}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  )
}

// ─── Toast System ─────────────────────────────────────────────
function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">
            {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : t.type === 'warn' ? '⚠️' : 'ℹ️'}
          </span>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ─── Custom Recharts Tooltip ───────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="custom-tooltip">
      {label && <div className="tooltip-label">{label}</div>}
      <div className="tooltip-value">{payload[0].value}</div>
    </div>
  )
}

// ─── Step Bar ─────────────────────────────────────────────────
function StepBar({ step }) {
  return (
    <div className="steps">
      {STEPS.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? '1' : '0' }}>
          <div className={`step ${step > i + 1 ? 'done' : step === i + 1 ? 'active' : ''}`}>
            <div className="step-num">{step > i + 1 ? '✓' : i + 1}</div>
            {label}
          </div>
          {i < STEPS.length - 1 && <div className={`step-line ${step > i + 1 ? 'done' : ''}`} />}
        </div>
      ))}
    </div>
  )
}

// ─── Column Stats ─────────────────────────────────────────────
function ColumnStats({ stats }) {
  return (
    <div className="card">
      <div className="card-title">
        📊 Column-Level Data Quality
        <span className="sub">{stats.length} columns analysed</span>
      </div>
      <div className="col-stats-grid">
        {stats.map((col, i) => (
          <div key={col.field} className="col-stat-card" style={{ animationDelay: `${i * 0.04}s` }}>
            <div className="col-stat-header">
              <span className="col-name" title={col.field}>{col.field}</span>
              <span className={`col-pct ${col.completeness >= 90 ? 'pct-green' : col.completeness >= 70 ? 'pct-amber' : 'pct-red'}`}>
                {col.completeness}%
              </span>
            </div>
            <div className="col-bar-track">
              <div className="col-bar-fill" style={{
                width: `${col.completeness}%`,
                background: col.completeness >= 90 ? 'var(--green)' : col.completeness >= 70 ? 'var(--amber)' : 'var(--red)'
              }} />
            </div>
            <div className="col-meta">
              <span>{col.filled}/{col.total} filled</span>
              <span>{col.unique} unique</span>
              {col.nullCount > 0 && <span className="col-null">{col.nullCount} empty</span>}
            </div>
            {col.topValues.length > 0 && (
              <div className="col-top">
                {col.topValues.slice(0, 2).map(tv => (
                  <span key={tv.value} className="col-top-val" title={tv.value}>
                    {tv.value.length > 14 ? tv.value.slice(0, 14) + '…' : tv.value}
                    <em>×{tv.count}</em>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Insight Banner ───────────────────────────────────────────
function InsightBanner({ s }) {
  const fixRate = s.autoFixed + s.invalid > 0
    ? Math.round((s.autoFixed / (s.autoFixed + s.invalid)) * 100) : 0
  let icon, msg, cls
  if (s.invalid === 0 && s.autoFixed === 0) {
    icon = '🏆'; cls = 'insight-green'
    msg = `Perfect dataset! All ${s.total} rows passed validation with zero issues.`
  } else if (fixRate >= 60) {
    icon = '⚡'; cls = 'insight-purple'
    msg = `Auto-fix resolved ${fixRate}% of fixable issues — only ${s.invalid} rows need manual review out of ${s.total}.`
  } else if (parseFloat(s.errorRate) > 20) {
    icon = '⚠️'; cls = 'insight-amber'
    const topErr = Object.entries(s.errorTypes).sort((a, b) => b[1] - a[1])[0]
    msg = `${s.errorRate} error rate detected. Top issue: ${topErr?.[0] || 'unknown'} errors (${topErr?.[1] || 0} rows). Clean the source data before re-uploading.`
  } else {
    icon = '✅'; cls = 'insight-cyan'
    msg = `${s.valid} rows are ready to import.${s.autoFixed > 0 ? ` ${s.autoFixed} rows auto-fixed (phone/amount formatting).` : ''}${s.duplicates > 0 ? ` ${s.duplicates} duplicates flagged.` : ''}`
  }
  return (
    <div className={`insight-banner ${cls}`}>
      <span className="insight-icon">{icon}</span>
      <span>{msg}</span>
    </div>
  )
}

function detectFieldType(header) {
  if (/date|time|created|updated|timestamp|dob/i.test(header)) return 'date'
  if (/phone|mobile|tel|contact|cell/i.test(header)) return 'phone'
  if (/email|mail/i.test(header)) return 'email'
  if (/amount|price|total|cost|value|revenue|fee/i.test(header)) return 'amount'
  return null
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stageIdx, setStageIdx] = useState(0)
  const [error, setError] = useState(null)
  const [country, setCountry] = useState('IN')
  const [chunkSize, setChunkSize] = useState(100)
  const [dragging, setDragging] = useState(false)
  const [toasts, setToasts] = useState([])
  const fileInputRef = useRef()
  const resultsRef = useRef()

  function addToast(msg, type = 'info') {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }

  const handleFile = useCallback(async (f) => {
    if (!f) return
    if (!f.name.endsWith('.csv')) { addToast('Please upload a CSV file.', 'error'); return }
    setFile(f)
    setError(null)
    setResults(null)
    setPreview(null)
    setStep(2)
    addToast(`Loaded: ${f.name}`, 'success')
    const fd = new FormData()
    fd.append('csvFile', f)
    try {
      const res = await fetch('/preview', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.error) {
        setPreview(data)
        addToast(`${data.headers?.length} columns · ${data.preview?.length} preview rows loaded`, 'info')
      }
    } catch {}
  }, [])

  async function loadDemo() {
    try {
      addToast('Loading demo dataset…', 'info')
      const res = await fetch('/demo-csv')
      if (!res.ok) { addToast('Demo file not found on server', 'error'); return }
      const blob = await res.blob()
      const demoFile = new File([blob], 'demo_transactions.csv', { type: 'text/csv' })
      handleFile(demoFile)
    } catch {
      addToast('Could not load demo file', 'error')
    }
  }

  const handleValidate = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setProgress(0)
    setStageIdx(0)
    setStep(3)

    const stageDurations = [250, 350, 300, 550, 350, 250]
    let acc = 0
    const total = stageDurations.reduce((a, b) => a + b, 0)
    stageDurations.forEach((dur, i) => {
      setTimeout(() => {
        setStageIdx(i)
        setProgress(Math.round((acc / total) * 88))
      }, acc)
      acc += dur
    })

    const fd = new FormData()
    fd.append('csvFile', file)
    fd.append('countryCode', country)
    fd.append('chunkSize', String(chunkSize))

    try {
      const res = await fetch('/validate', { method: 'POST', body: fd })
      setProgress(100)
      if (!res.ok) {
        setError('Server error: ' + await res.text())
        setStep(2)
        addToast('Validation failed', 'error')
        return
      }
      const data = await res.json()
      if (data.error) { setError(data.error); setStep(2); return }
      setResults(data)
      setStep(4)
      const s = data.summary
      addToast(`Done! ${s.valid} valid · ${s.invalid} invalid · Score: ${s.qualityScore}/100`, 'success')
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200)
    } catch {
      setError('Cannot connect to server. Make sure it is running on port 3000.')
      setStep(2)
      addToast('Could not reach server', 'error')
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  const s = results?.summary
  const token = results?.downloadTokens?.valid?.replace('valid_', '').replace('.csv', '')

  const pieData = s ? [
    { name: 'Valid', value: s.valid - s.autoFixed },
    { name: 'Auto-Fixed', value: s.autoFixed },
    { name: 'Invalid', value: s.invalid },
  ].filter(d => d.value > 0) : []

  const barData = s ? Object.entries(s.errorTypes).map(([k, v]) => ({
    name: k.charAt(0).toUpperCase() + k.slice(1),
    errors: v,
  })) : []

  return (
    <div className="app-bg">
      <ToastContainer toasts={toasts} />

      {/* ── Header ── */}
      <header className="header">
        <div className="logo-wrap">
          <div className="logo-icon">⚡</div>
          <div>
            <div className="logo-text">Data<span>Validator</span></div>
            <div className="logo-sub">Transaction Data Validation &amp; Processing Platform</div>
          </div>
        </div>
        <div className="header-right">
          <div className="header-badge">
            Built for Xeno · Assignment 2026<br />
            Supports CSV · International formats
          </div>
        </div>
      </header>

      <div className="container">
        <StepBar step={step} />

        {/* ── Upload Card ── */}
        <div className="card">
          <div className="card-title">📁 Upload Transaction CSV</div>

          <div
            className={`upload-zone${dragging ? ' dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          >
            <span className="upload-icon">{file ? '✅' : '📂'}</span>
            {file ? (
              <>
                <h3>{file.name}</h3>
                <p style={{ marginTop: 6 }}>{(file.size / 1024).toFixed(1)} KB · Click to change file</p>
              </>
            ) : (
              <>
                <h3><span className="hl">Click to browse</span> or drag & drop your CSV</h3>
                <p style={{ marginTop: 6 }}>Order-level · Product-level · Payment data · Max 50 MB</p>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />

          <button className="btn-demo" onClick={loadDemo} type="button">
            🧪 Try with Demo Data
          </button>

          <div className="config-grid">
            <div>
              <div className="field-label">🌍 Country Code — Phone Validation</div>
              <select value={country} onChange={e => setCountry(e.target.value)}>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label} — {c.digits} digits</option>
                ))}
              </select>
            </div>
            <div>
              <div className="field-label">✂️ Chunk Size (rows per output file)</div>
              <input type="number" value={chunkSize} min={50} max={10000}
                onChange={e => setChunkSize(+e.target.value)} />
            </div>
          </div>

          <button className="btn-validate" onClick={handleValidate} disabled={!file || loading}>
            {loading
              ? <><span className="spinner" /> {STAGES[stageIdx]}</>
              : '⚡ Validate Data'}
          </button>

          {loading && (
            <div className="progress-wrap">
              <div className="stage-steps">
                {STAGES.map((st, i) => (
                  <div key={st} className={`stage-dot ${i < stageIdx ? 'done' : i === stageIdx ? 'active' : ''}`} title={st} />
                ))}
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="progress-label">{STAGES[stageIdx]}</div>
            </div>
          )}

          {error && <div className="error-banner">⚠️ {error}</div>}
        </div>

        {/* ── Preview Card ── */}
        {preview && (
          <div className="card">
            <div className="card-title">
              👁️ Data Preview
              <span className="sub">{preview.preview?.length} sample rows · {preview.headers?.length} columns</span>
            </div>
            <div className="field-badges">
              {preview.headers?.map(h => {
                const t = detectFieldType(h)
                return t ? <span key={h} className={`badge badge-${t}`}>{h}</span> : null
              })}
            </div>
            <div className="preview-wrap">
              <table>
                <thead><tr>{preview.headers?.map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {preview.preview?.map((row, i) => (
                    <tr key={i}>
                      {preview.headers?.map(h => (
                        <td key={h}>{row[h] || <span className="empty-cell">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {results && (
          <div ref={resultsRef}>

            {/* Insight */}
            <InsightBanner s={s} />

            {/* Quality Score + Stats */}
            <div className="quality-row">
              <div className="quality-card">
                <QualityGauge score={s.qualityScore} grade={s.qualityGrade} />
              </div>
              <div className="stats-grid-right">
                <StatCard value={s.total}      label="Total Rows"  color="cyan"   delay={1} active={!!results} />
                <StatCard value={s.valid}      label="Valid"       color="green"  delay={2} active={!!results} />
                <StatCard value={s.invalid}    label="Invalid"     color="red"    delay={3} active={!!results} />
                <StatCard value={s.autoFixed}  label="Auto-Fixed"  color="purple" delay={4} active={!!results} />
                <StatCard value={s.duplicates} label="Duplicates"  color="amber"  delay={5} active={!!results} />
              </div>
            </div>

            {/* Charts */}
            <div className="charts-grid">
              <div className="chart-card">
                <h4>Validation Breakdown</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%"
                      innerRadius={55} outerRadius={84}
                      paddingAngle={3} dataKey="value"
                      animationBegin={0} animationDuration={1000} stroke="none">
                      {pieData.map(entry => (
                        <Cell key={entry.name} fill={PIE_COLORS[entry.name]} />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="custom-tooltip">
                          <div className="tooltip-label">{payload[0].name}</div>
                          <div className="tooltip-value">{payload[0].value} rows</div>
                        </div>
                      ) : null
                    } />
                    <Legend iconType="circle" iconSize={8}
                      formatter={v => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card">
                <h4>Error Breakdown by Field</h4>
                {barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={barData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="errors" radius={[6, 6, 0, 0]} animationDuration={1200} maxBarSize={48}>
                        {barData.map((_, i) => (
                          <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399', fontSize: 14, fontWeight: 600 }}>
                    ✅ No errors found!
                  </div>
                )}
              </div>
            </div>

            {/* Transaction Timeline */}
            {results.timeline?.length > 1 && (
              <div className="card">
                <div className="card-title">
                  📈 Transaction Volume Timeline
                  <span className="sub">
                    Monthly distribution · {results.timeline[0].month} → {results.timeline[results.timeline.length - 1].month}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={results.timeline} margin={{ top: 6, right: 12, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tl-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="custom-tooltip">
                          <div className="tooltip-label">{label}</div>
                          <div className="tooltip-value">{payload[0].value} transactions</div>
                        </div>
                      ) : null
                    } />
                    <Area type="monotone" dataKey="count" stroke="#22d3ee" strokeWidth={2.5}
                      fill="url(#tl-grad)"
                      dot={{ fill: '#22d3ee', r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#22d3ee' }}
                      animationDuration={1200} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Summary Pills */}
            <div className="card">
              <div className="card-title">📋 Validation Summary</div>
              <div className="info-pills">
                <span className="info-pill">📊 Error Rate: {s.errorRate}</span>
                <span className="info-pill">🌍 Country: {s.countryCode}</span>
                <span className="info-pill">✂️ Chunk Size: {s.chunkSize} rows</span>
                {s.detectedFields?.date?.length > 0 && <span className="info-pill">📅 Date: {s.detectedFields.date.join(', ')}</span>}
                {s.detectedFields?.phone?.length > 0 && <span className="info-pill">📞 Phone: {s.detectedFields.phone.join(', ')}</span>}
                {s.detectedFields?.email?.length > 0 && <span className="info-pill">📧 Email: {s.detectedFields.email.join(', ')}</span>}
                {s.detectedFields?.amount?.length > 0 && <span className="info-pill">💰 Amount: {s.detectedFields.amount.join(', ')}</span>}
              </div>
            </div>

            {/* Column Stats */}
            {results.columnStats?.length > 0 && <ColumnStats stats={results.columnStats} />}

            {/* Downloads */}
            <div className="card">
              <div className="card-title">⬇️ Download Results</div>
              <div className="dl-grid">
                <a href={`/download/${results.downloadTokens.valid}`} className="dl-card valid">
                  <span className="dl-icon">⬇</span>
                  <span className="dl-name">Valid Rows CSV</span>
                  <span className="dl-meta">({s.valid} rows)</span>
                </a>
                <a href={`/download/${results.downloadTokens.errors}`} className="dl-card errors">
                  <span className="dl-icon">⬇</span>
                  <span className="dl-name">Error Log CSV</span>
                  <span className="dl-meta">({s.invalid} rows)</span>
                </a>
                <a href={`/download-all/${token}`} className="dl-card zip">
                  <span className="dl-icon">🗜</span>
                  <span className="dl-name">Download All as ZIP</span>
                </a>
              </div>
            </div>

            {/* Chunking Section */}
            <div className="card">
              <div className="card-title">
                ✂️ Auto-Split Chunks
                <span className="sub">
                  {s.chunked
                    ? `${results.downloadTokens.chunks.length} files generated · ${s.chunkSize} rows each`
                    : `${s.valid} valid rows · chunk size ${s.chunkSize} · no split needed`}
                </span>
              </div>

              {s.chunked && results.downloadTokens.chunks.length > 0 ? (
                <>
                  <div className="chunk-info-bar">
                    <span className="chunk-info-item">📊 Total valid rows: <strong>{s.valid}</strong></span>
                    <span className="chunk-info-item">📦 Files created: <strong>{results.downloadTokens.chunks.length}</strong></span>
                    <span className="chunk-info-item">📄 Rows per chunk: <strong>{s.chunkSize}</strong></span>
                  </div>
                  <div className="chunks-grid">
                    {results.downloadTokens.chunks.map(c => (
                      <a key={c.index} href={`/download/${c.file}`} className="chunk-item-link">
                        <div className="chunk-num">#{c.index}</div>
                        <div className="chunk-rows">{c.rows} rows</div>
                        <div className="chunk-dl">⬇ Download</div>
                      </a>
                    ))}
                  </div>
                </>
              ) : (
                <div className="chunk-no-split">
                  <span className="chunk-ok-icon">✅</span>
                  <div>
                    <strong>{s.valid} rows fit within chunk size of {s.chunkSize}</strong>
                    <p>No splitting required. All valid rows are in a single output file. Lower the chunk size to generate multiple files.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Auto-fixed */}
            {results.autoFixedRows?.length > 0 && (
              <div className="card">
                <div className="card-title">
                  ✨ Auto-Fixed Rows
                  <span className="sub">{results.autoFixedRows.length} rows cleaned automatically</span>
                </div>
                {results.autoFixedRows.map((f, i) => (
                  <div key={i} className="fix-item">
                    <span>✦</span>
                    <span><strong style={{ color: '#c4b5fd' }}>Row {f.rowNum}:</strong> {f.warnings?.map(w => w.message).join(' · ')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Error Table */}
            {results.invalidRows?.length > 0 && (
              <div className="card">
                <div className="card-title">
                  ❌ Invalid Rows — Full Detail
                  <span className="sub">{results.invalidRows.length} rows with issues</span>
                </div>
                <div className="error-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>Row #</th>
                        <th>Validation Errors</th>
                        <th>Data Preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.invalidRows.map((r, i) => (
                        <tr key={i}>
                          <td className="err-row-num">#{r.row}</td>
                          <td>
                            <div className="err-tags">
                              {r.errors.map((e, j) => (
                                <span key={j} className={`err-tag et-${e.type}`}>
                                  [{e.field}] {e.message}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{ color: '#475569', fontSize: 11 }}>
                            {Object.entries(r.data).slice(0, 4).map(([k, v]) => (
                              <span key={k} style={{ marginRight: 10 }}>
                                <strong style={{ color: '#64748b' }}>{k}:</strong> {v || <span className="empty-cell">—</span>}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
