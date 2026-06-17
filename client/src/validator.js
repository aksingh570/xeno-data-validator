// All validation logic — runs entirely in the browser, no server needed

export const PHONE_RULES = {
  IN: { digits: 10, name: 'India' },
  SG: { digits: 8,  name: 'Singapore' },
  US: { digits: 10, name: 'USA' },
  GB: { digits: 10, name: 'UK' },
  AE: { digits: 9,  name: 'UAE' },
  AU: { digits: 9,  name: 'Australia' },
  CA: { digits: 10, name: 'Canada' },
  JP: { digits: 10, name: 'Japan' },
  MY: { digits: 9,  name: 'Malaysia' },
  PH: { digits: 10, name: 'Philippines' },
}

const DATE_FORMATS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{2}-\d{2}-\d{4}$/,
  /^\d{2}\/\d{2}\/\d{4}$/,
  /^\d{4}\/\d{2}\/\d{2}$/,
  /^\d{2}\.\d{2}\.\d{4}$/,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
]

export function isValidDate(value) {
  if (!value || String(value).trim() === '') return { valid: false, reason: 'Empty date' }
  const str = String(value).trim()
  if (!DATE_FORMATS.some(re => re.test(str))) return { valid: false, reason: `Unrecognized format: "${str}"` }
  const normalized = str.replace(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/, '$3-$2-$1')
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return { valid: false, reason: `Invalid date: "${str}"` }
  return { valid: true }
}

export function isValidPhone(value, countryCode) {
  if (!value || String(value).trim() === '') return { valid: false, reason: 'Empty phone number', fixed: null }
  const digits = String(value).replace(/[\s\-\+\(\)\.]/g, '')
  if (!/^\d+$/.test(digits)) return { valid: false, reason: `Non-numeric phone: "${value}"`, fixed: null }
  const rule = PHONE_RULES[countryCode]
  if (!rule) return { valid: true, fixed: digits }
  if (digits.length !== rule.digits) return { valid: false, reason: `${rule.name} phone must be ${rule.digits} digits, got ${digits.length}`, fixed: null }
  return { valid: true, fixed: digits }
}

export function isValidEmail(value) {
  if (!value || String(value).trim() === '') return { valid: false, reason: 'Empty email' }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())
    ? { valid: true }
    : { valid: false, reason: `Invalid email: "${value}"` }
}

export function isValidAmount(value) {
  if (value === undefined || value === null || String(value).trim() === '') return { valid: false, reason: 'Empty amount' }
  const cleaned = String(value).replace(/[,\s₹$£€]/g, '')
  const num = parseFloat(cleaned)
  if (isNaN(num)) return { valid: false, reason: `Non-numeric amount: "${value}"` }
  if (num < 0) return { valid: false, reason: `Negative amount: "${value}"` }
  return { valid: true }
}

export function detectFields(headers) {
  return {
    date:   headers.filter(h => /date|time|created|updated|timestamp|dob/i.test(h)),
    phone:  headers.filter(h => /phone|mobile|contact|tel|cell/i.test(h)),
    email:  headers.filter(h => /email|mail/i.test(h)),
    amount: headers.filter(h => /amount|price|total|cost|value|revenue|fee|charge/i.test(h)),
    id:     headers.filter(h => /^id$|_id$|^order_id|^customer_id|^product_id/i.test(h)),
  }
}

export function validateAndFixRow(row, headers, fieldMap, countryCode) {
  const errors = []
  const warnings = []
  const fixes = {}

  const isEmpty = headers.every(h => !row[h] || String(row[h]).trim() === '')
  if (isEmpty) return { valid: false, errors: [{ field: 'row', message: 'Empty row', type: 'required' }], warnings: [], fixes: {}, cleaned: null }

  fieldMap.date.forEach(f => {
    if (row[f] !== undefined) {
      const r = isValidDate(row[f])
      if (!r.valid) errors.push({ field: f, message: r.reason, type: 'date' })
    }
  })

  fieldMap.phone.forEach(f => {
    if (row[f] !== undefined) {
      const r = isValidPhone(row[f], countryCode)
      if (!r.valid) {
        errors.push({ field: f, message: r.reason, type: 'phone' })
      } else if (r.fixed && r.fixed !== String(row[f])) {
        fixes[f] = r.fixed
        warnings.push({ field: f, message: `Auto-cleaned: "${row[f]}" → "${r.fixed}"` })
      }
    }
  })

  fieldMap.email.forEach(f => {
    if (row[f] !== undefined && String(row[f]).trim() !== '') {
      const r = isValidEmail(row[f])
      if (!r.valid) errors.push({ field: f, message: r.reason, type: 'email' })
    }
  })

  fieldMap.amount.forEach(f => {
    if (row[f] !== undefined) {
      const r = isValidAmount(row[f])
      if (!r.valid) {
        errors.push({ field: f, message: r.reason, type: 'amount' })
      } else {
        const cleaned = String(row[f]).replace(/[,\s₹$£€]/g, '')
        if (cleaned !== String(row[f])) {
          fixes[f] = cleaned
          warnings.push({ field: f, message: `Auto-cleaned amount: "${row[f]}" → "${cleaned}"` })
        }
      }
    }
  })

  headers.slice(0, 3).forEach(h => {
    if (!row[h] || String(row[h]).trim() === '') {
      if (!errors.some(e => e.field === h))
        errors.push({ field: h, message: 'Required field is empty', type: 'required' })
    }
  })

  return { valid: errors.length === 0, errors, warnings, fixes, cleaned: { ...row, ...fixes } }
}

export function detectDuplicates(rows, headers) {
  const idFields    = headers.filter(h => /^id$|_id$|order_id|customer_id/i.test(h))
  const emailFields = headers.filter(h => /email/i.test(h))
  const keyFields   = [...idFields, ...emailFields].slice(0, 2)
  const seen = {}
  const duplicates = new Set()
  if (!keyFields.length) return duplicates
  rows.forEach((row, idx) => {
    const key = keyFields.map(f => row[f] || '').join('|')
    if (key.replace(/\|/g, '') === '') return
    if (seen[key] !== undefined) { duplicates.add(idx); duplicates.add(seen[key]) }
    else seen[key] = idx
  })
  return duplicates
}

export function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

export function computeColumnStats(rows, headers) {
  return headers.map(h => {
    const values = rows.map(r => (r[h] || '').toString().trim())
    const filled = values.filter(v => v !== '').length
    const freq = {}
    values.filter(v => v !== '').forEach(v => { freq[v] = (freq[v] || 0) + 1 })
    const topValues = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([value, count]) => ({ value, count }))
    return {
      field: h,
      total: rows.length,
      filled,
      nullCount: rows.length - filled,
      completeness: rows.length > 0 ? Math.round((filled / rows.length) * 100) : 0,
      unique: Object.keys(freq).length,
      topValues,
    }
  })
}

export function computeTimeline(rows, fieldMap) {
  if (!fieldMap.date.length) return []
  const dateField = fieldMap.date[0]
  const monthCounts = {}
  rows.forEach(row => {
    const dateStr = (row[dateField] || '').toString().trim()
    if (!dateStr) return
    const normalized = dateStr.replace(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/, '$3-$2-$1').replace(/T.*/, '')
    const d = new Date(normalized)
    if (!isNaN(d.getTime())) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthCounts[key] = (monthCounts[key] || 0) + 1
    }
  })
  return Object.entries(monthCounts).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }))
}

export function computeQualityScore(total, invalidCount, duplicateCount, autoFixedCount) {
  if (total === 0) return 100
  return Math.max(0, Math.round(100 - (invalidCount / total) * 65 - (duplicateCount / total) * 25 - (autoFixedCount / total) * 8))
}

export function computeQualityGrade(score) {
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'
}

// Run full validation on parsed rows+headers, return same shape as server used to
export function runValidation(rows, headers, countryCode, chunkSize) {
  const fieldMap = detectFields(headers)
  const duplicateIdxs = detectDuplicates(rows, headers)

  const validRows = [], autoFixedRows = [], invalidRows = [], errorLog = []
  const errorTypes = {}
  let totalWarnings = 0

  rows.forEach((row, idx) => {
    const isDuplicate = duplicateIdxs.has(idx)
    const result = validateAndFixRow(row, headers, fieldMap, countryCode)

    if (isDuplicate) result.errors.push({ field: 'record', message: 'Duplicate record detected', type: 'duplicate' })

    if (result.valid) {
      if (Object.keys(result.fixes).length > 0) {
        autoFixedRows.push({ rowNum: idx + 2, fixes: result.fixes, warnings: result.warnings })
        totalWarnings += result.warnings.length
      }
      validRows.push(result.cleaned || row)
    } else {
      result.errors.forEach(e => { errorTypes[e.type] = (errorTypes[e.type] || 0) + 1 })
      invalidRows.push({ row: idx + 2, data: row, errors: result.errors, warnings: result.warnings })
      errorLog.push({ _row: idx + 2, _errors: result.errors.map(e => `[${e.field}] ${e.message}`).join('; '), ...row })
    }
  })

  const total = rows.length
  const qualityScore = computeQualityScore(total, invalidRows.length, duplicateIdxs.size, autoFixedRows.length)
  const qualityGrade = computeQualityGrade(qualityScore)
  const columnStats = computeColumnStats(rows, headers)
  const timeline = computeTimeline(rows, fieldMap)
  const chunks = chunkArray(validRows, chunkSize)

  return {
    summary: {
      total,
      valid: validRows.length,
      invalid: invalidRows.length,
      autoFixed: autoFixedRows.length,
      duplicates: duplicateIdxs.size,
      warnings: totalWarnings,
      errorRate: total > 0 ? ((invalidRows.length / total) * 100).toFixed(1) + '%' : '0%',
      errorTypes,
      detectedFields: fieldMap,
      chunked: validRows.length > chunkSize,
      chunkCount: chunks.length,
      chunkSize,
      countryCode,
      qualityScore,
      qualityGrade,
    },
    validRows,
    errorLog,
    invalidRows: invalidRows.slice(0, 200),
    autoFixedRows: autoFixedRows.slice(0, 20),
    columnStats,
    timeline,
    chunks,
  }
}
