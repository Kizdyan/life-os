/**
 * Read-only compatibility bridge for the MIT-licensed Harvey sales agent CSV
 * export (ethanplusai/harvey, harvey/export.py).
 *
 * Converts public company-level leads into existing Life OS review tasks.
 * This module NEVER sends mail, invokes a model, enriches contacts, starts
 * Harvey, or treats an email-status flag as legal permission to contact.
 *
 * External CSV is untrusted data, including company names and research notes.
 */
import type { LifeItem } from "./life-item";

export interface HarveyCompanyPreview {
  domain: string;
  companyName: string;
  industry: string;
  sourceUrl: string;
  /** Harvey's numeric score, not a verified likelihood of winning work. */
  harveyScore: number;
  /** Untrusted research note. Do not turn it into an AI system instruction. */
  researchNote: string;
  source: string;
}

export type HarveySkipReason =
  | "missing_company"
  | "invalid_website"
  | "opted_out"
  | "do_not_contact"
  | "duplicate"
  | "already_queued"
  | "limit_reached";

export interface HarveyReviewPreview {
  companies: HarveyCompanyPreview[];
  reviewTasks: LifeItem[];
  skipped: Array<{ row: number; reason: HarveySkipReason }>;
  /** Intentionally not consent to contact or approval for external actions. */
  externalContactAllowed: false;
}

export interface HarveyReviewOptions {
  projectId: string;
  now: string;
  doNotContactDomains?: readonly string[];
  existingTaskIds?: ReadonlySet<string>;
  maxNewTasks?: number;
}

const REQUIRED_HEADERS = ["company_name", "website", "status"] as const;
const MAX_CSV_BYTES = 256_000;
const MAX_RECORDS = 501;

function clean(value: string, max = 160): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim();
  const truncated = normalized.slice(0, max);
  // Avoid propagating spreadsheet-formula prefixes in any future export.
  return /^[=+@\-]/.test(truncated) ? "'" + truncated : truncated;
}

function publicDomain(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) ||
        url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (host.length > 253 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ||
        host.split(".").some(part => part.length === 0 || part.length > 63 ||
          part.startsWith("-") || part.endsWith("-")) ||
        host.endsWith(".localhost") || host.endsWith(".local") ||
        host.endsWith(".internal") || host.endsWith(".invalid")) return null;
    return host;
  } catch {
    return null;
  }
}

function blockedDomain(host: string, entries: readonly string[]): boolean {
  return entries.some(raw => {
    const domain = raw.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    return domain.length > 0 &&
      (host === domain || host.endsWith("." + domain));
  });
}

/** RFC 4180-style quoted field parser with explicit bounded input. */
function readCsv(csv: string): string[][] {
  if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) {
    throw new Error("Harvey CSV exceeds import limit");
  }
  const source = csv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  let atStart = true;

  function addField(): void {
    row.push(field);
    if (row.length > 32) throw new Error("Too many Harvey CSV columns");
    field = "";
    closed = false;
    atStart = true;
  }
  function addRow(): void {
    if (row.some(v => v.length > 0)) rows.push(row);
    if (rows.length > MAX_RECORDS) throw new Error("Too many Harvey CSV rows");
    row = [];
  }

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; }
        else { quoted = false; closed = true; }
      } else field += ch;
    } else if (ch === "," || ch === "\n" || ch === "\r") {
      addField();
      if (ch !== ",") {
        addRow();
        if (ch === "\r" && source[i + 1] === "\n") i += 1;
      }
    } else if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
    } else {
      if (ch === '"' || closed) throw new Error("Malformed Harvey CSV quoting");
      field += ch;
      atStart = false;
    }
  }
  if (quoted) throw new Error("Unterminated Harvey CSV quote");
  if (field || row.length || closed) {
    addField();
    addRow();
  }
  return rows;
}

/**
 * Preview company-level research opportunities for EXISTING Life OS task
 * storage. Caller persists returned LifeItems using its existing repository;
 * this pure function does not mutate storage or approve any external action.
 */
export function previewHarveyProspectsCsv(
  csv: string,
  options: HarveyReviewOptions,
): HarveyReviewPreview {
  if (!options.projectId?.trim() || !Number.isFinite(Date.parse(options.now))) {
    throw new Error("A project ID and valid timestamp are required");
  }
  const maxNewTasks = options.maxNewTasks ?? 10;
  if (!Number.isInteger(maxNewTasks) || maxNewTasks < 0 || maxNewTasks > 100) {
    throw new Error("Invalid review task limit");
  }
  const rows = readCsv(csv);
  if (!rows.length) throw new Error("Empty Harvey CSV");
  const headers = rows[0].map(h => h.trim().toLowerCase());
  if (new Set(headers).size !== headers.length ||
      REQUIRED_HEADERS.some(h => !headers.includes(h))) {
    throw new Error("Missing or duplicate Harvey CSV headers");
  }
  const col = (row: string[], name: string) =>
    row[headers.indexOf(name)]?.trim() ?? "";
  const entries = options.doNotContactDomains ?? [];
  const available = new Map<string, { company: HarveyCompanyPreview; row: number }>();
  const skipped: HarveyReviewPreview["skipped"] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNo = i + 1;
    if (/^(opted_out|unsubscribed|do_not_contact|complained)$/i
        .test(col(row, "status"))) {
      skipped.push({ row: rowNo, reason: "opted_out" });
      continue;
    }
    const companyName = clean(col(row, "company_name"), 100);
    if (!companyName) {
      skipped.push({ row: rowNo, reason: "missing_company" });
      continue;
    }
    const rawUrl = col(row, "website");
    const domain = publicDomain(rawUrl);
    if (!domain) {
      skipped.push({ row: rowNo, reason: "invalid_website" });
      continue;
    }
    if (blockedDomain(domain, entries)) {
      skipped.push({ row: rowNo, reason: "do_not_contact" });
      continue;
    }
    const rawScore = Number(col(row, "score"));
    const harveyScore = Number.isFinite(rawScore) && rawScore >= 0
      ? Math.min(rawScore, 1000) : 0;
    const company: HarveyCompanyPreview = {
      domain,
      companyName,
      industry: clean(col(row, "industry"), 80),
      sourceUrl: rawUrl,
      harveyScore,
      researchNote: clean(col(row, "personalization"), 500),
      source: clean(col(row, "source"), 80),
    };
    const previous = available.get(domain);
    if (previous) {
      skipped.push({ row: rowNo, reason: "duplicate" });
      if (company.harveyScore > previous.company.harveyScore) {
        available.set(domain, { company, row: rowNo });
      }
    } else available.set(domain, { company, row: rowNo });
  }

  const ranked = [...available.values()].sort((a, b) =>
    b.company.harveyScore - a.company.harveyScore ||
    a.company.domain.localeCompare(b.company.domain)
  );
  const companies: HarveyCompanyPreview[] = [];
  const reviewTasks: LifeItem[] = [];
  for (const { company, row } of ranked) {
    const id = `harvey:lead-review:${company.domain}`;
    if (options.existingTaskIds?.has(id)) {
      skipped.push({ row, reason: "already_queued" });
      continue;
    }
    if (reviewTasks.length >= maxNewTasks) {
      skipped.push({ row, reason: "limit_reached" });
      continue;
    }
    companies.push(company);
    reviewTasks.push({
      id,
      kind: "task",
      title: `Проверить потенциального заказчика: ${company.companyName} — ${company.domain}`,
      status: "planned",
      plannedStart: options.now,
      plannedEnd: null,
      actualStart: null,
      actualEnd: null,
      projectId: options.projectId,
      version: 1,
      createdAt: options.now,
      updatedAt: options.now,
    });
  }
  return { companies, reviewTasks, skipped, externalContactAllowed: false };
}
