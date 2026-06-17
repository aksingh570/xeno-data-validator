import { useState, useCallback, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import JSZip from 'jszip'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area
} from 'recharts'
import { runValidation, PHONE_RULES } from './validator.js'

// ─── Constants ────────────────────────────────────────────────
const COUNTRIES = Object.entries(PHONE_RULES).map(([code, r]) => ({ code, label: code, name: r.name, digits: r.digits }))
const PIE_COLORS = { Valid: '#34d399', 'Auto-Fixed': '#a78bfa', Invalid: '#f87171' }
const BAR_COLORS = ['#f87171','#a78bfa','#34d399','#fbbf24','#22d3ee','#f472b6']
const STEPS = ['Upload', 'Preview', 'Validate', 'Results']
const STAGES = ['Reading file…', 'Parsing CSV…', 'Detecting fields…', 'Validating rows…', 'Auto-fixing…', 'Building report…']
const GRADE_COLOR = { A: '#16a34a', B: '#0891b2', C: '#d97706', D: '#f97316', F: '#dc2626' }

const DEMO_CSV = `order_id,customer_name,email,phone_number,city,order_date,product_name,quantity,amount,payment_mode
ORD001,Ankita Singh,ankita@gmail.com,9876543210,Delhi,2025-03-15,Kurta Set,2,1500.00,UPI
ORD002,Rahul Sharma,rahul.sharma@yahoo.com,9123456789,Mumbai,2025-04-01,Sneakers,1,2999.00,Credit Card
ORD003,Priya Mehta,priyamehta@gmail.com,8800112233,Bangalore,14-02-2025,Handbag,1,4500.50,Debit Card
ORD004,Sneha Patel,,9988776655,Chennai,2025-01-20,Watch,1,8999.00,Cash
ORD005,Vikas Nair,vikasnair@gmail.com,12345,Pune,2025-03-30,Laptop Stand,3,750.00,UPI
ORD006,Meera Joshi,meera.joshi@hotmail.com,7766554433,Hyderabad,2025/02/10,Earphones,2,1299.99,Net Banking
ORD007,,rohit@gmail.com,9871234560,Kolkata,2025-04-05,T-Shirt,5,499.00,UPI
ORD008,Deepa Iyer,deepa.iyer@gmail.com,9900887766,Ahmedabad,2025-03-22,Saree,1,3200.00,Credit Card
ORD009,Arjun Das,arjundas_invalid_email,8877665544,Delhi,2025-04-10,Backpack,1,1800.00,Debit Card
ORD010,Simran Kaur,simran@gmail.com,9812345678,Chandigarh,2025-03-18,Sunglasses,2,650.00,Cash
ORD011,Karan Malhotra,karan.m@outlook.com,7890123456,Jaipur,25-03-2025,Shoes,1,3500.00,UPI
ORD012,Nisha Verma,nisha.verma@gmail.com,9001234567,Lucknow,2025-02-28,Dress,2,2100.00,Credit Card
ORD013,Amit Kumar,amitk@yahoo.com,,Bhopal,2025-03-05,Phone Case,4,299.00,Cash
ORD014,Pooja Reddy,pooja.reddy@gmail.com,9456789012,Vizag,2025-04-12,Perfume,1,1200.00,Net Banking
ORD015,Ravi Shankar,ravi@gmail.com,9345678901,Coimbatore,2026-15-45,Headphones,1,2500.00,UPI
ORD016,Sunita Gupta,sunita.gupta@gmail.com,8234567890,Nagpur,2025-03-28,Yoga Mat,1,800.00,Debit Card
ORD017,Farhan Sheikh,farhan@hotmail.com,7123456789,Surat,2025-04-03,Jacket,1,4200.00,Credit Card
ORD018,Lakshmi Nambiar,lakshmi@gmail.com,9678901234,Kochi,2025-02-14,Gold Earrings,1,6500.00,Net Banking
ORD019,Manish Tiwari,manish.tiwari@gmail.com,8901234567,Patna,2025-03-10,Wallet,2,950.00,UPI
ORD020,Zoya Khan,zoya.khan@gmail.com,9234567801,Indore,2025-04-08,Kurti,3,1100.00,Cash
ORD021,Arun Pillai,not-a-valid-email,9567890123,Thrissur,2025-01-30,Belt,1,450.00,UPI
ORD022,Divya Saxena,divya@gmail.com,9890123456,Agra,2025-03-14,Scarf,2,380.00,Debit Card
ORD023,Nikhil Bhatt,nikhil.bhatt@yahoo.com,8765432109,Vadodara,2025-04-07,Sunscreen,3,599.00,Credit Card
ORD024,Kaveri Rao,kaveri.rao@gmail.com,9321098765,Mysore,2025-02-20,Silk Saree,1,7800.00,Net Banking
ORD025,Harpreet Singh,harpreet@gmail.com,9871109876,Amritsar,32-13-2025,Turban Fabric,2,1350.00,Cash`

// ─── Hooks ────────────────────────────────────────────────────
function useCountUp(target, active) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active || target == null) { setVal(0); return }
    let start = null
    const dur = 900
    const raf = ts => {
      if (!start) start = ts
      const p = Math.min((ts - start) / dur, 1)
      setVal(Math.round(p * target))
      if (p < 1) requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
  }, [target, active])
  return val
}

// ─── Quality Gauge ─────────────────────────────────────────────
function QualityGauge({ score, grade }) {
  const r = 52, circ = 2 * Math.PI * r, sweep = circ * 0.75
  const filled = (score / 100) * sweep
  const color = GRADE_COLOR[grade] || '#0891b2'
  const offset = circ * 0.125
  return (
    <div className="gauge-wrap">
      <svg width="150" height="118" viewBox="0 0 150 118">
        <circle cx="75" cy="85" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="11"
          strokeDasharray={`${sweep} ${circ - sweep}`} strokeDashoffset={offset} strokeLinecap="round" />
        <circle cx="75" cy="85" r={r} fill="none" stroke={color} strokeWidth="11"
          strokeDasharray={`${filled} ${circ - filled}`} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(.17,.67,.38,1)', filter: `drop-shadow(0 0 8px ${color}88)` }} />
        <text x="75" y="82" textAnchor="middle" fill={color} fontSize="30" fontWeight="900" fontFamily="Inter,sans-serif">{score}</text>
        <text x="75" y="100" textAnchor="middle" fill="#7eafc8" fontSize="10" fontWeight="700" fontFamily="Inter,sans-serif" letterSpacing="1">QUALITY SCORE</text>
      </svg>
      <div className="gauge-grade" style={{ color }}>Grade <strong>{grade}</strong></div>
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

// ─── Toast ────────────────────────────────────────────────────
function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{t.type==='success'?'✅':t.type==='error'?'❌':t.type==='warn'?'⚠️':'ℹ️'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ─── Tooltip ──────────────────────────────────────────────────
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
        <div key={label} style={{ display:'flex', alignItems:'center', flex: i < STEPS.length-1 ? '1' : '0' }}>
          <div className={`step ${step>i+1?'done':step===i+1?'active':''}`}>
            <div className="step-num">{step>i+1?'✓':i+1}</div>{label}
          </div>
          {i < STEPS.length-1 && <div className={`step-line ${step>i+1?'done':''}`} />}
        </div>
      ))}
    </div>
  )
}

// ─── Column Stats ─────────────────────────────────────────────
function ColumnStats({ stats }) {
  return (
    <div className="card">
      <div className="card-title">📊 Column-Level Data Quality <span className="sub">{stats.length} columns analysed</span></div>
      <div className="col-stats-grid">
        {stats.map((col, i) => (
          <div key={col.field} className="col-stat-card" style={{ animationDelay: `${i * 0.04}s` }}>
            <div className="col-stat-header">
              <span className="col-name" title={col.field}>{col.field}</span>
              <span className={`col-pct ${col.completeness>=90?'pct-green':col.completeness>=70?'pct-amber':'pct-red'}`}>{col.completeness}%</span>
            </div>
            <div className="col-bar-track">
              <div className="col-bar-fill" style={{ width:`${col.completeness}%`, background:col.completeness>=90?'var(--green)':col.completeness>=70?'#d97706':'var(--red)' }} />
            </div>
            <div className="col-meta">
              <span>{col.filled}/{col.total} filled</span>
              <span>{col.unique} unique</span>
              {col.nullCount > 0 && <span className="col-null">{col.nullCount} empty</span>}
            </div>
            {col.topValues.length > 0 && (
              <div className="col-top">
                {col.topValues.slice(0,2).map(tv => (
                  <span key={tv.value} className="col-top-val" title={tv.value}>
                    {tv.value.length>14?tv.value.slice(0,14)+'…':tv.value}<em>×{tv.count}</em>
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
  const fixRate = s.autoFixed + s.invalid > 0 ? Math.round((s.autoFixed / (s.autoFixed + s.invalid)) * 100) : 0
  let icon, msg, cls
  if (s.invalid === 0 && s.autoFixed === 0) {
    icon='🏆'; cls='insight-green'; msg=`Perfect dataset! All ${s.total} rows passed validation with zero issues.`
  } else if (fixRate >= 60) {
    icon='⚡'; cls='insight-purple'; msg=`Auto-fix resolved ${fixRate}% of fixable issues — only ${s.invalid} rows need manual review out of ${s.total}.`
  } else if (parseFloat(s.errorRate) > 20) {
    const topErr = Object.entries(s.errorTypes).sort((a,b)=>b[1]-a[1])[0]
    icon='⚠️'; cls='insight-amber'; msg=`${s.errorRate} error rate. Top issue: ${topErr?.[0]||'unknown'} errors (${topErr?.[1]||0} rows). Clean source data before re-uploading.`
  } else {
    icon='✅'; cls='insight-cyan'; msg=`${s.valid} rows ready to import.${s.autoFixed>0?` ${s.autoFixed} rows auto-fixed.`:''}${s.duplicates>0?` ${s.duplicates} duplicates flagged.`:''}`
  }
  return <div className={`insight-banner ${cls}`}><span className="insight-icon">{icon}</span><span>{msg}</span></div>
}

function detectFieldType(h) {
  if (/date|time|created|updated|timestamp|dob/i.test(h)) return 'date'
  if (/phone|mobile|tel|contact|cell/i.test(h)) return 'phone'
  if (/email|mail/i.test(h)) return 'email'
  if (/amount|price|total|cost|value|revenue|fee/i.test(h)) return 'amount'
  return null
}

function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [step, setStep]       = useState(1)
  const [file, setFile]       = useState(null)
  const [preview, setPreview] = useState(null)
  const [results, setResults] = useState(null)
  const [downloads, setDownloads] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stageIdx, setStageIdx] = useState(0)
  const [error, setError]     = useState(null)
  const [country, setCountry] = useState('IN')
  const [chunkSize, setChunkSize] = useState(100)
  const [dragging, setDragging] = useState(false)
  const [toasts, setToasts]   = useState([])
  const fileInputRef = useRef()
  const resultsRef   = useRef()
  const blobUrls     = useRef([])

  // Clean up blob URLs on unmount
  useEffect(() => () => blobUrls.current.forEach(URL.revokeObjectURL), [])

  function addToast(msg, type = 'info') {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }

  function makeBlob(csvString) {
    const blob = new Blob([csvString], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    blobUrls.current.push(url)
    return url
  }

  const handleFile = useCallback((f) => {
    if (!f) return
    if (!f.name.endsWith('.csv')) { addToast('Please upload a CSV file.', 'error'); return }
    setFile(f); setError(null); setResults(null); setPreview(null); setDownloads(null); setStep(2)
    addToast(`Loaded: ${f.name}`, 'success')

    Papa.parse(f, {
      header: true, skipEmptyLines: true, preview: 10,
      complete: results => {
        setPreview({ headers: results.meta.fields, preview: results.data.slice(0, 5) })
        addToast(`${results.meta.fields?.length} columns detected`, 'info')
      }
    })
  }, [])

  function loadDemo() {
    addToast('Loading demo dataset…', 'info')
    const f = new File([DEMO_CSV], 'demo_transactions.csv', { type: 'text/csv' })
    handleFile(f)
  }

  const handleValidate = async () => {
    if (!file) return
    setLoading(true); setError(null); setProgress(0); setStageIdx(0); setStep(3)

    const stageDurations = [250, 350, 300, 550, 350, 250]
    let acc = 0
    const total = stageDurations.reduce((a, b) => a + b, 0)
    stageDurations.forEach((dur, i) => {
      setTimeout(() => { setStageIdx(i); setProgress(Math.round((acc / total) * 85)) }, acc)
      acc += dur
    })

    // Parse full CSV in browser
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (parsed) => {
        try {
          const rows    = parsed.data
          const headers = parsed.meta.fields || []

          setStageIdx(4); setProgress(88)
          const res = runValidation(rows, headers, country, chunkSize)

          setStageIdx(5); setProgress(95)

          // Generate downloadable blob URLs
          const validCSV  = Papa.unparse(res.validRows)
          const errorCSV  = Papa.unparse(res.errorLog)
          const validUrl  = makeBlob(validCSV)
          const errorUrl  = makeBlob(errorCSV)

          // Chunks
          const chunkLinks = res.chunks.map((chunk, i) => {
            const url = makeBlob(Papa.unparse(chunk))
            return { url, rows: chunk.length, index: i + 1 }
          })

          // ZIP
          const zip = new JSZip()
          zip.file('valid_rows.csv', validCSV)
          zip.file('error_log.csv', errorCSV)
          res.chunks.forEach((chunk, i) => zip.file(`chunk_${i+1}.csv`, Papa.unparse(chunk)))
          const zipBlob = await zip.generateAsync({ type: 'blob' })
          const zipUrl  = URL.createObjectURL(zipBlob)
          blobUrls.current.push(zipUrl)

          setDownloads({
            valid:  { url: validUrl,  filename: 'valid_rows.csv',  count: res.summary.valid },
            errors: { url: errorUrl,  filename: 'error_log.csv',   count: res.summary.invalid },
            chunks: chunkLinks,
            zip:    { url: zipUrl,    filename: 'validated_data.zip' },
          })

          setResults(res); setProgress(100); setStep(4)
          const s = res.summary
          addToast(`Done! ${s.valid} valid · ${s.invalid} invalid · Score: ${s.qualityScore}/100`, 'success')
          setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200)
        } catch (e) {
          setError('Validation failed: ' + e.message); setStep(2)
          addToast('Validation error', 'error')
        } finally {
          setLoading(false)
          setTimeout(() => setProgress(0), 800)
        }
      },
      error: err => {
        setError('Could not parse CSV: ' + err.message); setStep(2)
        setLoading(false); addToast('CSV parse error', 'error')
      }
    })
  }

  const s = results?.summary

  const pieData = s ? [
    { name: 'Valid',      value: s.valid - s.autoFixed },
    { name: 'Auto-Fixed', value: s.autoFixed },
    { name: 'Invalid',    value: s.invalid },
  ].filter(d => d.value > 0) : []

  const barData = s ? Object.entries(s.errorTypes).map(([k, v]) => ({
    name: k.charAt(0).toUpperCase() + k.slice(1), errors: v,
  })) : []

  return (
    <div className="app-bg">
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <header className="header">
        <div className="logo-wrap">
          <div className="logo-icon">⚡</div>
          <div>
            <div className="logo-text">Data<span>Validator</span></div>
            <div className="logo-sub">Transaction Data Validation &amp; Processing Platform</div>
          </div>
        </div>
        <div className="header-right">
          <div className="header-badge">Built for Xeno · Assignment 2026<br />Supports CSV · International formats</div>
        </div>
      </header>

      <div className="container">
        <StepBar step={step} />

        {/* Upload */}
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
              <><h3>{file.name}</h3><p style={{ marginTop:6 }}>{(file.size/1024).toFixed(1)} KB · Click to change</p></>
            ) : (
              <><h3><span className="hl">Click to browse</span> or drag &amp; drop your CSV</h3>
              <p style={{ marginTop:6 }}>Order-level · Product-level · Payment data · Max 50 MB</p></>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display:'none' }}
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />

          <button className="btn-demo" onClick={loadDemo} type="button">🧪 Try with Demo Data</button>

          <div className="config-grid">
            <div>
              <div className="field-label">🌍 Country Code — Phone Validation</div>
              <select value={country} onChange={e => setCountry(e.target.value)}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.digits} digits)</option>)}
              </select>
            </div>
            <div>
              <div className="field-label">✂️ Chunk Size (rows per output file)</div>
              <input type="number" value={chunkSize} min={10} max={10000} onChange={e => setChunkSize(+e.target.value)} />
            </div>
          </div>

          <button className="btn-validate" onClick={handleValidate} disabled={!file || loading}>
            {loading ? <><span className="spinner" /> {STAGES[stageIdx]}</> : '⚡ Validate Data'}
          </button>

          {loading && (
            <div className="progress-wrap">
              <div className="stage-steps">
                {STAGES.map((st, i) => <div key={st} className={`stage-dot ${i<stageIdx?'done':i===stageIdx?'active':''}`} title={st} />)}
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{ width:`${progress}%` }} /></div>
              <div className="progress-label">{STAGES[stageIdx]}</div>
            </div>
          )}

          {error && <div className="error-banner">⚠️ {error}</div>}
        </div>

        {/* Preview */}
        {preview && (
          <div className="card">
            <div className="card-title">👁️ Data Preview <span className="sub">{preview.preview?.length} sample rows · {preview.headers?.length} columns</span></div>
            <div className="field-badges">
              {preview.headers?.map(h => { const t = detectFieldType(h); return t ? <span key={h} className={`badge badge-${t}`}>{h}</span> : null })}
            </div>
            <div className="preview-wrap">
              <table>
                <thead><tr>{preview.headers?.map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {preview.preview?.map((row, i) => (
                    <tr key={i}>{preview.headers?.map(h => <td key={h}>{row[h]||<span className="empty-cell">—</span>}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Results */}
        {results && downloads && (
          <div ref={resultsRef}>
            <InsightBanner s={s} />

            {/* Quality + Stats */}
            <div className="quality-row">
              <div className="quality-card"><QualityGauge score={s.qualityScore} grade={s.qualityGrade} /></div>
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
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={84}
                      paddingAngle={3} dataKey="value" animationBegin={0} animationDuration={1000} stroke="none">
                      {pieData.map(e => <Cell key={e.name} fill={PIE_COLORS[e.name]} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => active && payload?.length ? (
                      <div className="custom-tooltip"><div className="tooltip-label">{payload[0].name}</div><div className="tooltip-value">{payload[0].value} rows</div></div>
                    ) : null} />
                    <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ color:'#5a7a96', fontSize:11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card">
                <h4>Error Breakdown by Field</h4>
                {barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={barData} margin={{ top:4, right:4, left:-22, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill:'#5a7a96', fontSize:11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill:'#5a7a96', fontSize:11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill:'rgba(0,0,0,0.03)' }} />
                      <Bar dataKey="errors" radius={[6,6,0,0]} animationDuration={1200} maxBarSize={48}>
                        {barData.map((_,i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#16a34a', fontSize:14, fontWeight:600 }}>✅ No errors found!</div>
                )}
              </div>
            </div>

            {/* Timeline */}
            {results.timeline?.length > 1 && (
              <div className="card">
                <div className="card-title">📈 Transaction Volume Timeline
                  <span className="sub">{results.timeline[0].month} → {results.timeline[results.timeline.length-1].month}</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={results.timeline} margin={{ top:6, right:12, left:-20, bottom:0 }}>
                    <defs>
                      <linearGradient id="tl-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0891b2" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill:'#5a7a96', fontSize:11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:'#5a7a96', fontSize:11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                      <div className="custom-tooltip"><div className="tooltip-label">{label}</div><div className="tooltip-value">{payload[0].value} transactions</div></div>
                    ) : null} />
                    <Area type="monotone" dataKey="count" stroke="#0891b2" strokeWidth={2.5} fill="url(#tl-grad)"
                      dot={{ fill:'#0891b2', r:3, strokeWidth:0 }} activeDot={{ r:5 }} animationDuration={1200} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Summary */}
            <div className="card">
              <div className="card-title">📋 Validation Summary</div>
              <div className="info-pills">
                <span className="info-pill">📊 Error Rate: {s.errorRate}</span>
                <span className="info-pill">🌍 Country: {s.countryCode}</span>
                <span className="info-pill">✂️ Chunk Size: {s.chunkSize}</span>
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
                <a href={downloads.valid.url} download={downloads.valid.filename} className="dl-card valid">
                  <span className="dl-icon">⬇</span>
                  <span className="dl-name">Valid Rows CSV</span>
                  <span className="dl-meta">({downloads.valid.count} rows)</span>
                </a>
                <a href={downloads.errors.url} download={downloads.errors.filename} className="dl-card errors">
                  <span className="dl-icon">⬇</span>
                  <span className="dl-name">Error Log CSV</span>
                  <span className="dl-meta">({downloads.errors.count} rows)</span>
                </a>
                <a href={downloads.zip.url} download={downloads.zip.filename} className="dl-card zip">
                  <span className="dl-icon">🗜</span>
                  <span className="dl-name">Download All as ZIP</span>
                </a>
              </div>
            </div>

            {/* Chunks */}
            <div className="card">
              <div className="card-title">✂️ Auto-Split Chunks
                <span className="sub">{s.chunked ? `${downloads.chunks.length} files · ${s.chunkSize} rows each` : `${s.valid} rows fit in one file`}</span>
              </div>
              {s.chunked && downloads.chunks.length > 0 ? (
                <>
                  <div className="chunk-info-bar">
                    <span className="chunk-info-item">📊 Total valid rows: <strong>{s.valid}</strong></span>
                    <span className="chunk-info-item">📦 Files created: <strong>{downloads.chunks.length}</strong></span>
                    <span className="chunk-info-item">📄 Rows per chunk: <strong>{s.chunkSize}</strong></span>
                  </div>
                  <div className="chunks-grid">
                    {downloads.chunks.map(c => (
                      <a key={c.index} href={c.url} download={`chunk_${c.index}.csv`} className="chunk-item-link">
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
                    <p>No splitting required. Lower the chunk size input above to generate multiple files.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Auto-fixed */}
            {results.autoFixedRows?.length > 0 && (
              <div className="card">
                <div className="card-title">✨ Auto-Fixed Rows <span className="sub">{results.autoFixedRows.length} rows cleaned</span></div>
                {results.autoFixedRows.map((f, i) => (
                  <div key={i} className="fix-item">
                    <span>✦</span>
                    <span><strong style={{ color:'#6d28d9' }}>Row {f.rowNum}:</strong> {f.warnings?.map(w => w.message).join(' · ')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Error Table */}
            {results.invalidRows?.length > 0 && (
              <div className="card">
                <div className="card-title">❌ Invalid Rows — Full Detail <span className="sub">{results.invalidRows.length} rows with issues</span></div>
                <div className="error-scroll">
                  <table>
                    <thead><tr><th style={{ width:60 }}>Row #</th><th>Errors</th><th>Data Preview</th></tr></thead>
                    <tbody>
                      {results.invalidRows.map((r, i) => (
                        <tr key={i}>
                          <td className="err-row-num">#{r.row}</td>
                          <td><div className="err-tags">{r.errors.map((e,j) => <span key={j} className={`err-tag et-${e.type}`}>[{e.field}] {e.message}</span>)}</div></td>
                          <td style={{ color:'#5a7a96', fontSize:11 }}>
                            {Object.entries(r.data).slice(0,4).map(([k,v]) => (
                              <span key={k} style={{ marginRight:10 }}><strong style={{ color:'#8faec5' }}>{k}:</strong> {v||<span className="empty-cell">—</span>}</span>
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
