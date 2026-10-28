#!/usr/bin/env node
/**
 * Read-only local inspection of a downloaded agent Skill directory.
 * Does not download, run or install skills. JSON report contains hashes,
 * file paths and findings, never source content or environment variables.
 * Usage: node scripts/skill-source-inspect.mjs path/to/skill
 */
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, posix, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_FILES = 300;
const MAX_BYTES = 3_000_000;
const MAX_FILE_BYTES = 512_000;
const TEXT_FILE = /(?:\.(?:md|mdx|txt|json|yaml|yml|toml|js|jsx|mjs|cjs|ts|tsx|py|sh|bash|ps1|bat|css|html|xml|sql|svg|geojson)|^Dockerfile$|^Makefile$)$/i;
const RULES = [
  ['remote_shell', /(?:curl|wget)[^\n]{0,300}\|\s*(?:sudo\s+)?(?:sh|bash)\b/i, 'block'],
  ['approval_bypass', /ignore (?:all )?(?:previous|prior|system) instructions|bypass (?:security|human )?approval/i, 'block'],
  ['destructive_root', /\brm\s+-[rRfF]{1,5}\s+\/(?:\s|$)/m, 'block'],
  ['secrets_access', /(?:process\.env|os\.environ|\.aws\/credentials|\.ssh\/id_|\bprintenv\b)/i, 'review'],
  ['unattended_global_install', /\b(?:npx\s+)?skills\s+add[^\n]{0,160}(?:-g\b|--global|--yes|-y\b)/i, 'review'],
  ['network_upload', /(?:curl|wget)[^\n]{0,300}(?:--data|--upload-file|-X\s+POST)/i, 'review'],
  ['dynamic_execution', /(?:child_process|subprocess|\beval\s*\(|\bexec\s*\()/i, 'review'],
];
const SHA = text => createHash('sha256').update(text).digest('hex');
const issue = (path, rule, severity) => ({ path, rule, severity });

export async function inspectLocalSkillDirectory(directory) {
  const root = resolve(directory);
  const findings = [];
  const files = [];
  const contentByPath = new Map();
  let totalBytes = 0;
  let inventoryComplete = true;
  const initial = await lstat(root);
  if (!initial.isDirectory() || initial.isSymbolicLink()) throw new Error('Skill root must be an ordinary directory');
  async function walk(abs, relative = '') {
    const entries = await readdir(abs, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const subpath = relative ? posix.join(relative, entry.name) : entry.name;
      if (entry.name === '.git') {
        // A Skill subfolder must never hide a nested repository or Git metadata.
        inventoryComplete = false;
        findings.push(issue(subpath, 'embedded_git_metadata', 'block'));
        continue;
      }
      const fullPath = join(abs, entry.name);
      const stat = await lstat(fullPath);
      if (stat.isSymbolicLink()) {
        inventoryComplete = false;
        findings.push(issue(subpath, 'symlink_not_allowed', 'block'));
        continue;
      }
      if (stat.isDirectory()) {
        await walk(fullPath, subpath);
        continue;
      }
      if (!stat.isFile()) {
        inventoryComplete = false;
        findings.push(issue(subpath, 'non_regular_file', 'block'));
        continue;
      }
      if (files.length >= MAX_FILES) {
        inventoryComplete = false;
        findings.push(issue(subpath, 'file_count_limit', 'block'));
        return;
      }
      if (!TEXT_FILE.test(entry.name) || stat.size > MAX_FILE_BYTES || totalBytes + stat.size > MAX_BYTES) {
        inventoryComplete = false;
        findings.push(issue(subpath, !TEXT_FILE.test(entry.name) ? 'unsupported_binary_or_extension' : 'size_limit', 'block'));
        continue;
      }
      const data = await readFile(fullPath);
      // A file may change during inspection. Never silently attest stale metadata.
      const again = await lstat(fullPath);
      if (!again.isFile() || again.isSymbolicLink() || again.size !== data.length ||
          again.mtimeMs !== stat.mtimeMs || again.ino !== stat.ino) {
        inventoryComplete = false;
        findings.push(issue(subpath, 'changed_during_inspection', 'block'));
        continue;
      }
      if (data.includes(0)) {
        inventoryComplete = false;
        findings.push(issue(subpath, 'embedded_null_byte', 'block'));
        continue;
      }
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(data); }
      catch {
        inventoryComplete = false;
        findings.push(issue(subpath, 'invalid_utf8', 'block'));
        continue;
      }
      // SVG payloads may contain executable markup. Search only actual SVG
      // resources, not documentation that merely discusses <script> tags.
      if (/\.svg$/i.test(subpath) &&
          /<script\b|\bon[a-z]+\s*=|(?:xlink:)?href\s*=\s*["']\s*javascript:|<foreignObject\b/i.test(text)) {
        findings.push(issue(subpath, 'embedded_svg_script', 'block'));
      }
      totalBytes += data.length;
      files.push({ path: subpath, sizeBytes: data.length, sha256: SHA(data) });
      contentByPath.set(subpath, text);
      for (const [rule, regex, severity] of RULES) {
        if (regex.test(text)) findings.push(issue(subpath, rule, severity));
      }
      if (/\.(?:sh|py|js|cjs|mjs|ts|ps1|bat)$/i.test(subpath)) {
        findings.push(issue(subpath, 'executable_helper_requires_review', 'review'));
      }
    }
  }
  await walk(root);
  if (!contentByPath.has('SKILL.md')) findings.push(issue('SKILL.md', 'missing_root_manifest', 'block'));
  const linked = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const [source, text] of contentByPath) {
    if (!/\.md$/i.test(source)) continue;
    for (const match of text.matchAll(linked)) {
      const ref = match[1];
      if (/^(?:https?:\/\/|mailto:|#)/i.test(ref)) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('/')) {
        findings.push(issue(source, 'nonlocal_link_requires_review', 'review'));
        continue;
      }
      let decoded;
      try { decoded = decodeURIComponent(ref.split(/[?#]/, 1)[0]); }
      catch { findings.push(issue(source, 'malformed_link', 'block')); continue; }
      if (decoded.includes('\\') || decoded.includes('\0')) {
        findings.push(issue(source, 'unsafe_link', 'block')); continue;
      }
      const target = posix.normalize(posix.join(posix.dirname(source), decoded));
      if (target === '..' || target.startsWith('../')) {
        findings.push(issue(source, 'link_escapes_skill', 'block'));
      } else if (!contentByPath.has(target)) {
        findings.push(issue(source, 'missing_linked_resource:' + ref, 'block'));
      }
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifestSha256 = files.find(f => f.path === 'SKILL.md')?.sha256 ?? null;
  const bundleSha256 = SHA(files.map(f => [f.path,f.sizeBytes,f.sha256].join('\0')+'\n').join(''));
  return {
    schemaVersion: 1, sourceDirectoryName: basename(root),
    inventoryComplete, staticCheckPassed: inventoryComplete && findings.length === 0,
    humanReviewRequired: true, manifestSha256, bundleSha256,
    scannedFiles: files.length, totalBytes, files, findings,
    revisionVerified: false,
    installationPerformed: false, executionPerformed: false,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/skill-source-inspect.mjs <directory>'); process.exitCode = 2;
  } else inspectLocalSkillDirectory(process.argv[2])
    .then(report => {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      if (!report.staticCheckPassed) process.exitCode = 1;
    }).catch(error => { console.error(error.message); process.exitCode = 2; });
}
