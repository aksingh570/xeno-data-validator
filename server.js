const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, fileFilter: (req, file, cb) => {
  if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) cb(null, true);
  else cb(new Error('Only CSV files allowed'));
}});

// Country phone rules
const PHONE_RULES = {
  IN: { digits: 10, name: 'India' },
  SG: { digits: 8, name: 'Singapore' },
  US: { digits: 10, name: 'USA' },
  GB: { digits: 10, name: 'UK' },
  AE: { digits: 9, name: 'UAE' },
  AU: { digits: 9, name: 'Australia' },
  CA: { digits: 10, name: 'Canada' },
  JP: { digits: 10, name: 'Japan' },
};

// Date formats to validate against
const DATE_FORMATS = [
  /^\d{4}-\d{2}-\d{2}$/,           // YYYY-MM-DD
  /^\d{2}-\d{2}-\d{4}$/,           // DD-MM-YYYY
  /^\d{2}\/\d{2}\/\d{4}$/,         // DD/MM/YYYY or MM/DD/YYYY
  /^\d{4}\/\d{2}\/\d{2}$/,         // YYYY/MM/DD
  /^\d{2}\.\d{2}\.\d{4}$/,         // DD.MM.YYYY
];

function isValidDate(value) {
  if (!value || value.toString().trim() === '') return { valid: false, reason: 'Empty date' };
  const str = value.toString().trim();
  const matchesFormat = DATE_FORMATS.some(re => re.test(str));
  if (!matchesFormat) return { valid: false, reason: `Unrecognized date format: "${str}"` };
  const d = new Date(str.replace(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/, '$3-$2-$1'));
  if (isNaN(d.getTime())) return { valid: false, reason: `Invalid date value: "${str}"` };
  return { valid: true };
}

function isValidPhone(value, countryCode) {
  if (!value || value.toString().trim() === '') return { valid: false, reason: 'Empty phone number' };
  const digits = value.toString().replace(/[\s\-\+\(\)]/g, '');
  if (!/^\d+$/.test(digits)) return { valid: false, reason: `Non-numeric phone: "${value}"` };
  const rule = PHONE_RULES[countryCode];
  if (!rule) return { valid: true }; // unknown country, skip digit check
  if (digits.length !== rule.digits) return { valid: false, reason: `${rule.name} phone must be ${rule.digits} digits, got ${digits.length}` };
  return { valid: true };
}

function isValidEmail(value) {
  if (!value || value.toString().trim() === '') return { valid: false, reason: 'Empty email' };
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.toString())
    ? { valid: true }
    : { valid: false, reason: `Invalid email format: "${value}"` };
}

function isValidAmount(value) {
  if (value === undefined || value === null || value.toString().trim() === '') return { valid: false, reason: 'Empty amount' };
  const num = parseFloat(value);
  if (isNaN(num)) return { valid: false, reason: `Non-numeric amount: "${value}"` };
  if (num < 0) return { valid: false, reason: `Negative amount: "${value}"` };
  return { valid: true };
}

function detectDateFields(headers) {
  return headers.filter(h => /date|time|created|updated|timestamp/i.test(h));
}
function detectPhoneFields(headers) {
  return headers.filter(h => /phone|mobile|contact|tel/i.test(h));
}
function detectEmailFields(headers) {
  return headers.filter(h => /email|mail/i.test(h));
}
function detectAmountFields(headers) {
  return headers.filter(h => /amount|price|total|cost|value|revenue/i.test(h));
}

function validateRow(row, headers, config) {
  const errors = [];
  const countryCode = config.countryCode || 'IN';

  // Check for completely empty rows
  const isEmpty = headers.every(h => !row[h] || row[h].toString().trim() === '');
  if (isEmpty) return { valid: false, errors: ['Empty row'], cleaned: null };

  const dateFields = detectDateFields(headers);
  const phoneFields = detectPhoneFields(headers);
  const emailFields = detectEmailFields(headers);
  const amountFields = detectAmountFields(headers);

  dateFields.forEach(f => {
    if (row[f] !== undefined) {
      const r = isValidDate(row[f]);
      if (!r.valid) errors.push(`[${f}] ${r.reason}`);
    }
  });

  phoneFields.forEach(f => {
    if (row[f] !== undefined) {
      const r = isValidPhone(row[f], countryCode);
      if (!r.valid) errors.push(`[${f}] ${r.reason}`);
    }
  });

  emailFields.forEach(f => {
    if (row[f] !== undefined && row[f].toString().trim() !== '') {
      const r = isValidEmail(row[f]);
      if (!r.valid) errors.push(`[${f}] ${r.reason}`);
    }
  });

  amountFields.forEach(f => {
    if (row[f] !== undefined) {
      const r = isValidAmount(row[f]);
      if (!r.valid) errors.push(`[${f}] ${r.reason}`);
    }
  });

  // General: check required fields aren't empty (first 3 columns assumed required)
  headers.slice(0, 3).forEach(h => {
    if (!row[h] || row[h].toString().trim() === '') {
      if (!errors.some(e => e.includes(`[${h}]`)))
        errors.push(`[${h}] Required field is empty`);
    }
  });

  return { valid: errors.length === 0, errors, cleaned: row };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

app.post('/validate', upload.single('csvFile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const countryCode = (req.body.countryCode || 'IN').toUpperCase();
  const chunkSize = parseInt(req.body.chunkSize) || 500;
  const filePath = req.file.path;

  const rows = [];
  const headers = [];

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    await new Promise((resolve, reject) => {
      parse(fileContent, { columns: true, skip_empty_lines: true, trim: true }, (err, records) => {
        if (err) return reject(err);
        if (records.length > 0) headers.push(...Object.keys(records[0]));
        rows.push(...records);
        resolve();
      });
    });

    const validRows = [];
    const invalidRows = [];
    const errorLog = [];
    let totalErrors = 0;
    const errorTypes = {};

    rows.forEach((row, idx) => {
      const result = validateRow(row, headers, { countryCode });
      if (result.valid) {
        validRows.push(row);
      } else {
        totalErrors++;
        result.errors.forEach(e => {
          const type = e.match(/\[([^\]]+)\]/)?.[1] || 'General';
          errorTypes[type] = (errorTypes[type] || 0) + 1;
        });
        invalidRows.push({ row: idx + 2, data: row, errors: result.errors });
        errorLog.push({ _row: idx + 2, _errors: result.errors.join('; '), ...row });
      }
    });

    // Write valid CSV output
    const timestamp = Date.now();
    const validFile = `outputs/valid_${timestamp}.csv`;
    const errorFile = `outputs/errors_${timestamp}.csv`;

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

    // Chunk large files
    let chunks = [];
    if (validRows.length > chunkSize) {
      const chunked = chunkArray(validRows, chunkSize);
      chunks = await Promise.all(chunked.map((chunk, i) => new Promise((resolve, reject) => {
        const chunkFile = `outputs/chunk_${timestamp}_${i + 1}.csv`;
        stringify(chunk, { header: true }, (err, output) => {
          if (err) return reject(err);
          fs.writeFileSync(chunkFile, output);
          resolve({ file: chunkFile, rows: chunk.length, index: i + 1 });
        });
      })));
    }

    // Clean up upload
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      summary: {
        total: rows.length,
        valid: validRows.length,
        invalid: invalidRows.length,
        errorRate: ((invalidRows.length / rows.length) * 100).toFixed(1) + '%',
        errorTypes,
        chunked: chunks.length > 0,
        chunkCount: chunks.length,
        chunkSize
      },
      downloadTokens: {
        valid: path.basename(validFile),
        errors: path.basename(errorFile),
        chunks: chunks.map(c => ({ file: path.basename(c.file), rows: c.rows, index: c.index }))
      },
      invalidSample: invalidRows.slice(0, 5)
    });

  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: err.message });
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
