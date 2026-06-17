const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure required directories exist (needed on fresh deploys like Render)
['uploads', 'outputs'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) cb(null, true);
    else cb(new Error('Only CSV files allowed'));
  }
});

const PHONE_RULES = {
  IN: { digits: 10, name: 'India' },
  SG: { digits: 8, name: 'Singapore' },
  US: { digits: 10, name: 'USA' },
  GB: { digits: 10, name: 'UK' },
  AE: { digits: 9, name: 'UAE' },
  AU: { digits: 9, name: 'Australia' },
  CA: { digits: 10, name: 'Canada' },
  JP: { digits: 10, name: 'Japan' },
  MY: { digits: 9, name: 'Malaysia' },
  PH: { digits: 10, name: 'Philippines' },
};

const DATE_FORMATS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{2}-\d{2}-\d{4}$/,
  /^\d{2}\/\d{2}\/\d{4}$/,
  /^\d{4}\/\d{2}\/\d{2}$/,
  /^\d{2}\.\d{2}\.\d{4}$/,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
];

function isValidDate(value) {
  if (!value || value.toString().trim() === '') return { valid: false, reason: 'Empty date' };
  const str = value.toString().trim();
  const matchesFormat = DATE_FORMATS.some(re => re.test(str));
  if (!matchesFormat) return { valid: false, reason: `Unrecognized format: "${str}"` };
  const normalized = str.replace(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/, '$3-$2-$1');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return { valid: false, reason: `Invalid date: "${str}"` };
  return { valid: true };
}

function autoFixPhone(value) {
  return value.toString().replace(/[\s\-\+\(\)\.]/g, '');
}

function isValidPhone(value, countryCode) {
  if (!value || value.toString().trim() === '') return { valid: false, reason: 'Empty phone number', fixed: null };
  const digits = autoFixPhone(value);
  if (!/^\d+$/.test(digits)) return { valid: false, reason: `Non-numeric phone: "${value}"`, fixed: null };
  const rule = PHONE_RULES[countryCode];
  if (!rule) return { valid: true, fixed: digits };
  if (digits.length !== rule.digits) return { valid: false, reason: `${rule.name} phone must be ${rule.digits} digits, got ${digits.length}`, fixed: null };
  return { valid: true, fixed: digits };
}

function isValidEmail(value) {
  if (!value || value.toString().trim() === '') return { valid: false, reason: 'Empty email' };
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.toString().trim())
    ? { valid: true }
    : { valid: false, reason: `Invalid email: "${value}"` };
}

function isValidAmount(value) {
  if (value === undefined || value === null || value.toString().trim() === '') return { valid: false, reason: 'Empty amount' };
  const cleaned = value.toString().replace(/[,\s₹$£€]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return { valid: false, reason: `Non-numeric amount: "${value}"` };
  if (num < 0) return { valid: false, reason: `Negative amount: "${value}"` };
  return { valid: true };
}

function detectFields(headers) {
  return {
    date: headers.filter(h => /date|time|created|updated|timestamp|dob/i.test(h)),
    phone: headers.filter(h => /phone|mobile|contact|tel|cell/i.test(h)),
    email: headers.filter(h => /email|mail/i.test(h)),
    amount: headers.filter(h => /amount|price|total|cost|value|revenue|fee|charge/i.test(h)),
    id: headers.filter(h => /^id$|_id$|^order_id|^customer_id|^product_id/i.test(h)),
  };
}

function validateAndFixRow(row, headers, fieldMap, config) {
  const errors = [];
  const warnings = [];
  const fixes = {};
  const countryCode = config.countryCode || 'IN';

  const isEmpty = headers.every(h => !row[h] || row[h].toString().trim() === '');
  if (isEmpty) return { valid: false, errors: ['Empty row'], warnings: [], fixes: {}, cleaned: null };

  fieldMap.date.forEach(f => {
    if (row[f] !== undefined) {
      const r = isValidDate(row[f]);
      if (!r.valid) errors.push({ field: f, message: r.reason, type: 'date' });
    }
  });

  fieldMap.phone.forEach(f => {
    if (row[f] !== undefined) {
      const r = isValidPhone(row[f], countryCode);
      if (!r.valid) {
        errors.push({ field: f, message: r.reason, type: 'phone' });
      } else if (r.fixed && r.fixed !== row[f].toString()) {
        fixes[f] = r.fixed;
        warnings.push({ field: f, message: `Auto-cleaned: "${row[f]}" → "${r.fixed}"` });
      }
    }
  });

  fieldMap.email.forEach(f => {
    if (row[f] !== undefined && row[f].toString().trim() !== '') {
      const r = isValidEmail(row[f]);
      if (!r.valid) errors.push({ field: f, message: r.reason, type: 'email' });
    }
  });

  fieldMap.amount.forEach(f => {
    if (row[f] !== undefined) {
      const r = isValidAmount(row[f]);
      if (!r.valid) errors.push({ field: f, message: r.reason, type: 'amount' });
      else {
        const cleaned = row[f].toString().replace(/[,\s₹$£€]/g, '');
        if (cleaned !== row[f].toString()) {
          fixes[f] = cleaned;
          warnings.push({ field: f, message: `Auto-cleaned amount: "${row[f]}" → "${cleaned}"` });
        }
      }
    }
  });

  headers.slice(0, 3).forEach(h => {
    if (!row[h] || row[h].toString().trim() === '') {
      if (!errors.some(e => e.field === h))
        errors.push({ field: h, message: 'Required field is empty', type: 'required' });
    }
  });

  const cleanedRow = { ...row, ...fixes };
  return { valid: errors.length === 0, errors, warnings, fixes, cleaned: cleanedRow };
}

function detectDuplicates(rows, headers) {
  const idFields = headers.filter(h => /^id$|_id$|order_id|customer_id/i.test(h));
  const emailFields = headers.filter(h => /email/i.test(h));
  const seen = {};
  const duplicates = new Set();
  const keyFields = [...idFields, ...emailFields].slice(0, 2);
  if (keyFields.length === 0) return duplicates;
  rows.forEach((row, idx) => {
    const key = keyFields.map(f => row[f] || '').join('|');
    if (key.replace(/\|/g, '') === '') return;
    if (seen[key] !== undefined) {
      duplicates.add(idx);
      duplicates.add(seen[key]);
    } else {
      seen[key] = idx;
    }
  });
  return duplicates;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function computeColumnStats(rows, headers) {
  return headers.map(h => {
    const values = rows.map(r => (r[h] || '').toString().trim());
    const filled = values.filter(v => v !== '').length;
    const freq = {};
    values.filter(v => v !== '').forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    const topValues = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([value, count]) => ({ value, count }));
    return {
      field: h,
      total: rows.length,
      filled,
      nullCount: rows.length - filled,
      completeness: rows.length > 0 ? Math.round((filled / rows.length) * 100) : 0,
      unique: Object.keys(freq).length,
      topValues,
    };
  });
}

function computeTimeline(rows, fieldMap) {
  if (fieldMap.date.length === 0) return [];
  const dateField = fieldMap.date[0];
  const monthCounts = {};
  rows.forEach(row => {
    const dateStr = (row[dateField] || '').toString().trim();
    if (!dateStr) return;
    const normalized = dateStr
      .replace(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/, '$3-$2-$1')
      .replace(/T.*/, '');
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    }
  });
  return Object.entries(monthCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

// Preview endpoint
app.post('/preview', upload.single('csvFile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = req.file.path;
  try {
    const content = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
    await new Promise((resolve, reject) => {
      parse(content, { columns: true, skip_empty_lines: true, trim: true, to: 10 }, (err, records) => {
        if (err) return reject(err);
        const headers = records.length > 0 ? Object.keys(records[0]) : [];
        res.json({ headers, preview: records.slice(0, 5), totalCols: headers.length });
        resolve();
      });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

// Validate endpoint
app.post('/validate', upload.single('csvFile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const countryCode = (req.body.countryCode || 'IN').toUpperCase();
  const chunkSize = parseInt(req.body.chunkSize) || 500;
  const filePath = req.file.path;
  const rows = [];
  const headers = [];

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
    await new Promise((resolve, reject) => {
      parse(fileContent, { columns: true, skip_empty_lines: true, trim: true }, (err, records) => {
        if (err) return reject(err);
        if (records.length > 0) headers.push(...Object.keys(records[0]));
        rows.push(...records);
        resolve();
      });
    });

    const fieldMap = detectFields(headers);
    const duplicateIdxs = detectDuplicates(rows, headers);

    const validRows = [];
    const autoFixedRows = [];
    const invalidRows = [];
    const errorLog = [];
    const errorTypes = {};
    let totalWarnings = 0;

    rows.forEach((row, idx) => {
      const isDuplicate = duplicateIdxs.has(idx);
      const result = validateAndFixRow(row, headers, fieldMap, { countryCode });

      if (isDuplicate) {
        result.errors.push({ field: 'record', message: 'Duplicate record detected', type: 'duplicate' });
      }

      if (result.valid) {
        if (Object.keys(result.fixes).length > 0) {
          autoFixedRows.push({ rowNum: idx + 2, fixes: result.fixes, warnings: result.warnings });
          totalWarnings += result.warnings.length;
        }
        validRows.push(result.cleaned || row);
      } else {
        result.errors.forEach(e => {
          errorTypes[e.type] = (errorTypes[e.type] || 0) + 1;
        });
        invalidRows.push({ row: idx + 2, data: row, errors: result.errors, warnings: result.warnings });
        errorLog.push({ _row: idx + 2, _errors: result.errors.map(e => `[${e.field}] ${e.message}`).join('; '), ...row });
      }
    });

    // Quality score: weighted deduction for invalid, duplicates, auto-fixed
    const total = rows.length;
    const qualityScore = total > 0
      ? Math.max(0, Math.round(
          100
          - (invalidRows.length / total) * 65
          - (duplicateIdxs.size / total) * 25
          - (autoFixedRows.length / total) * 8
        ))
      : 100;

    const qualityGrade =
      qualityScore >= 90 ? 'A' :
      qualityScore >= 75 ? 'B' :
      qualityScore >= 60 ? 'C' :
      qualityScore >= 40 ? 'D' : 'F';

    const columnStats = computeColumnStats(rows, headers);
    const timeline = computeTimeline(rows, fieldMap);

    const timestamp = Date.now();
    const validFile = path.join(__dirname, `outputs/valid_${timestamp}.csv`);
    const errorFile = path.join(__dirname, `outputs/errors_${timestamp}.csv`);

    await new Promise((resolve, reject) => {
      stringify(validRows, { header: true }, (err, output) => {
        if (err) return reject(err);
        fs.writeFileSync(validFile, output);
        resolve();
      });
    });

    await new Promise((resolve, reject) => {
      stringify(errorLog, { header: true }, (err, output) => {
        if (err) return reject(err);
        fs.writeFileSync(errorFile, output);
        resolve();
      });
    });

    let chunks = [];
    if (validRows.length > chunkSize) {
      const chunked = chunkArray(validRows, chunkSize);
      chunks = await Promise.all(chunked.map((chunk, i) => new Promise((resolve, reject) => {
        const chunkFile = path.join(__dirname, `outputs/chunk_${timestamp}_${i + 1}.csv`);
        stringify(chunk, { header: true }, (err, output) => {
          if (err) return reject(err);
          fs.writeFileSync(chunkFile, output);
          resolve({ file: chunkFile, rows: chunk.length, index: i + 1 });
        });
      })));
    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
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
        chunked: chunks.length > 0,
        chunkCount: chunks.length,
        chunkSize,
        countryCode,
        qualityScore,
        qualityGrade,
      },
      columnStats,
      timeline,
      downloadTokens: {
        valid: path.basename(validFile),
        errors: path.basename(errorFile),
        chunks: chunks.map(c => ({ file: path.basename(c.file), rows: c.rows, index: c.index }))
      },
      invalidRows,
      autoFixedRows: autoFixedRows.slice(0, 20),
    });

  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: err.message });
  }
});

// Demo CSV endpoint
app.get('/demo-csv', (req, res) => {
  const demoPath = path.join(__dirname, 'test_transactions.csv');
  if (fs.existsSync(demoPath)) {
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(demoPath);
  } else {
    res.status(404).json({ error: 'Demo file not found' });
  }
});

app.get('/download/:filename', (req, res) => {
  const file = path.join(__dirname, 'outputs', req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File not found' });
  res.download(file);
});

app.get('/download-all/:token', (req, res) => {
  const token = req.params.token;
  const outputDir = path.join(__dirname, 'outputs');
  const files = fs.readdirSync(outputDir).filter(f => f.includes(token));
  if (files.length === 0) return res.status(404).json({ error: 'No files found' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename=validated_${token}.zip`);
  const archive = archiver('zip');
  archive.pipe(res);
  files.forEach(f => archive.file(path.join(outputDir, f), { name: f }));
  archive.finalize();
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
