#!/usr/bin/env node
/**
 * scan-logs.mjs — scans API and Maestro logs for PII leaks.
 *
 * Checks for:
 *   - Iraqi phone numbers (+9647xxxxxxxxx / 07xxxxxxxxx)
 *   - JWT tokens (eyJ…)
 *   - OTP codes (6-digit codes on their own)
 *   - Precise GPS coordinates (lat/lng with ≥4 decimal places)
 *
 * Usage:
 *   node e2e/mobile/scan-logs.mjs <log-file> [<log-file> ...]
 *   node e2e/mobile/scan-logs.mjs --dir <directory>   # scans *.log and *.txt recursively
 *
 * Exits 0 when clean, 1 when any match is found.
 * Called from run-flows.sh after every flow.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// ── patterns ──────────────────────────────────────────────────────────────────
const PATTERNS = [
  {
    name: 'Iraqi phone number',
    re: /(\+9647\d{8,9}|07\d{8,9})/g,
  },
  {
    name: 'JWT token',
    // eyJ… header.payload.signature
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    name: '6-digit OTP code',
    // standalone 6-digit number (not part of a longer number)
    re: /(?<![0-9])\d{6}(?![0-9])/g,
  },
  {
    name: 'Precise GPS coordinate',
    // lat or lng with ≥4 decimal places — reveals exact position
    re: /\b-?\d{1,3}\.\d{4,}\b/g,
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────
function collectFiles(paths) {
  const files = [];
  for (const p of paths) {
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) { console.error(`scan-logs: not found: ${p}`); continue; }
    if (st.isDirectory()) {
      const entries = readdirSync(p, { recursive: true });
      for (const e of entries) {
        const full = join(p, e);
        const ext = extname(e).toLowerCase();
        if (['.log', '.txt', '.json'].includes(ext) && statSync(full).isFile()) {
          files.push(full);
        }
      }
    } else {
      files.push(p);
    }
  }
  return files;
}

function scanFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error(`scan-logs: cannot read ${filePath}: ${e.message}`);
    return [];
  }
  const findings = [];
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const lineNo = content.slice(0, m.index).split('\n').length;
      findings.push({ file: filePath, line: lineNo, pattern: name, match: m[0] });
    }
  }
  return findings;
}

// ── main ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let paths = [];

if (args[0] === '--dir' && args[1]) {
  paths = [args[1]];
} else if (args.length > 0) {
  paths = args;
} else {
  console.error('Usage: scan-logs.mjs <file...> | --dir <dir>');
  process.exit(2);
}

const files = collectFiles(paths);
if (files.length === 0) {
  console.log('scan-logs: no files to scan');
  process.exit(0);
}

let totalFindings = 0;
for (const f of files) {
  const findings = scanFile(f);
  for (const { file, line, pattern, match } of findings) {
    // Redact most of the match to avoid printing the leaked value in CI logs
    const redacted = match.length > 6 ? match.slice(0, 3) + '…' + match.slice(-2) : '***';
    console.error(`LEAK [${pattern}] ${file}:${line}  value≈${redacted}`);
    totalFindings++;
  }
}

if (totalFindings === 0) {
  console.log(`scan-logs: clean (${files.length} files scanned)`);
  process.exit(0);
} else {
  console.error(`scan-logs: FAILED — ${totalFindings} PII leak(s) in ${files.length} files`);
  process.exit(1);
}
