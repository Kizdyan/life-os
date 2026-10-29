#!/usr/bin/env node
/** Offline, script-free and mobile-friendly review of UNTRUSTED Skill candidates. */
import {readFile, writeFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const ID = /^([A-Za-z0-9][A-Za-z0-9-]{0,39})\/([A-Za-z0-9_.-]{1,100})\/([a-z0-9][a-z0-9._-]{0,99})$/;
const TOPIC = /^[a-z][a-z0-9-]{1,40}$/;
const text = s => typeof s === 'string' && s.length > 0 && s.length <= 120 &&
  !/[\x00-\x1f\x7f]/.test(s);
const escape = value => String(value).replace(/[&<>"']/g, ch =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));

export function validateSkillQueue(queue) {
  if (!queue || typeof queue !== 'object' || Array.isArray(queue) ||
      queue.schemaVersion !== 1 || queue.kind !== 'skill-review-queue' ||
      queue.source !== 'skills.sh' || queue.humanReviewRequired !== true ||
      queue.mayInstallAutomatically !== false || queue.mayExecuteAutomatically !== false ||
      queue.installationPerformed !== false || queue.executionPerformed !== false ||
      !Number.isSafeInteger(queue.topicCount) || queue.topicCount < 1 || queue.topicCount > 12 ||
      !Number.isSafeInteger(queue.totalUniqueCandidates) ||
      queue.totalUniqueCandidates < 0 || queue.totalUniqueCandidates > 600 ||
      !Array.isArray(queue.queue) || queue.queue.length > 100 ||
      queue.queue.length > queue.totalUniqueCandidates) throw Error('Invalid review queue envelope');
  const seen = new Set();
  for (const c of queue.queue) {
    if (!c || typeof c !== 'object' || Array.isArray(c) ||
        !text(c.id) || !ID.test(c.id) || seen.has(c.id) ||
        !text(c.name) || !Number.isSafeInteger(c.installsReported) || c.installsReported < 0 ||
        typeof c.discoveryScore !== 'number' || !Number.isFinite(c.discoveryScore) ||
        c.status !== 'discovery_only' || c.approved !== false || c.installed !== false ||
        c.verifiedWorking !== false || c.mayInstallAutomatically !== false ||
        c.mayExecuteAutomatically !== false || c.sourceRevision !== null ||
        c.license !== null || typeof c.possibleDuplicate !== 'boolean' ||
        !Array.isArray(c.matchedTopics) || !c.matchedTopics.length ||
        c.matchedTopics.length > queue.topicCount ||
        c.matchedTopics.some(t => !TOPIC.test(t)) ||
        new Set(c.matchedTopics).size !== c.matchedTopics.length ||
        !Array.isArray(c.requiredNextChecks) || c.requiredNextChecks.length < 1 ||
        c.requiredNextChecks.length > 12 ||
        c.requiredNextChecks.some(check => !text(check))) throw Error('Unsafe or promoted skill in review queue');
    const [, owner, repo, slug] = c.id.match(ID);
    if (repo === '.' || repo === '..' || slug === '.' || slug === '..' ||
        c.sourceUrl !== 'https://github.com/' + owner + '/' + repo ||
        c.catalogUrl !== 'https://skills.sh/' + c.id)
      throw Error('Untrusted source URL in review queue');
    seen.add(c.id);
  }
  return queue;
}

/** No scripts, remote resources, embedded file content or automatic network calls. */
export function renderSkillReviewDashboard(input) {
  const q = validateSkillQueue(input);
  const blocks = q.queue.map((c, i) => {
    const topics = c.matchedTopics.map(t => '<span class="topic">' + escape(t) + '</span>').join('');
    return '<article><div class="top"><span class="rank">#' + (i+1) +
      '</span><strong>' + escape(c.name) + '</strong><span class="status">Только найдено</span></div>' +
      '<p class="id">' + escape(c.id) + '</p><div class="topics">' + topics + '</div>' +
      '<p class="stats">Направлений: <b>' + c.matchedTopics.length +
      '</b> · Установок по данным каталога: ' + c.installsReported.toLocaleString('ru-RU') +
      (c.possibleDuplicate ? ' · Возможный дубликат' : '') + '</p>' +
      '<p class="warning">Не проверены: лицензия, исходный код, разрешения, качество, совместимость и установка.</p>' +
      '<div class="links"><a href="' + escape(c.catalogUrl) +
      '" target="_blank" rel="noopener noreferrer">Каталог</a><a href="' +
      escape(c.sourceUrl) + '" target="_blank" rel="noopener noreferrer">GitHub</a></div></article>';
  }).join('\n');
  return '<!doctype html>\n<html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">' +
    '<title>Skill Intelligence — очередь проверки</title>' +
    '<style>:root{font-family:system-ui,sans-serif;background:#f6f6f3;color:#202320}*{box-sizing:border-box}' +
    'body{margin:0;padding:18px}main{max-width:850px;margin:0 auto}h1{font-size:clamp(24px,5vw,36px);margin:8px 0}' +
    'header p{color:#555;line-height:1.45}section{display:grid;gap:12px;margin-top:18px}' +
    'article{background:#fff;border:1px solid #e5e5df;border-radius:16px;padding:16px;overflow-wrap:anywhere}' +
    '.top{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.rank{color:#666;font-variant-numeric:tabular-nums}' +
    '.status{font-size:12px;background:#f0eee5;color:#695e37;padding:5px 8px;border-radius:8px;margin-left:auto}' +
    '.id,.stats{font-size:13px;color:#606060}.topics,.links{display:flex;gap:7px;flex-wrap:wrap}' +
    '.topic{font-size:12px;border:1px solid #deded6;border-radius:999px;padding:4px 7px}' +
    '.warning{font-size:13px;color:#7d541b}.links a{color:#203b6b;text-decoration:underline;font-size:14px}' +
    '.notice{padding:12px;background:#e9ece6;border-radius:12px;font-size:14px}' +
    '@media(max-width:390px){body{padding:10px}article{padding:12px}.status{margin-left:0}}</style></head>' +
    '<body><main><header><small>AI CAPACITY OS · OFFLINE REVIEW</small>' +
    '<h1>Навыки для проверки</h1><p>Найдено кандидатов: <b>' + q.totalUniqueCandidates +
    '</b>. В отчёт включено: <b>' + q.queue.length + '</b>. Тем поиска: ' + q.topicCount +
    '.</p><p class="notice">Поиск в каталоге не означает допуск, установку или работу в Codex, Claude и ChatGPT. ' +
    'Все кандидаты требуют отдельной проверки исходников и разрешения.</p></header>' +
    '<section>' + (blocks || '<p>Подходящих кандидатов в текущей очереди нет.</p>') +
    '</section></main></body></html>\n';
}

async function runCli() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || process.argv.length !== 4) {
    console.error('Usage: npm run skills:dashboard -- queue.json NEW-dashboard.html');
    process.exitCode = 2; return;
  }
  try {
    const file = resolve(input);
    const info = await stat(file);
    if (!info.isFile() || info.size > 1_500_000) throw Error('Invalid input file');
    const q = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(resolve(output), renderSkillReviewDashboard(q), {flag:'wx'});
    console.log('Offline review dashboard written successfully (no external data transfer)');
  } catch {
    console.error('Failed to create dashboard: invalid queue or output exists');
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runCli();
