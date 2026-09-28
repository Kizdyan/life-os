import type { ApplyOutcomeResult } from './outcomes';
import type { LifeItem } from './life-item';
import type { LifeItemRepository } from './outcome-store';

export interface SupabaseRestConfig {
  url: string;
  publishableKey: string;
  accessToken?: string;
}

export class SupabaseLifeItemRepository implements LifeItemRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  private headers(extra: Record<string,string> = {}) {
    return {
      apikey: this.config.publishableKey,
      Authorization: `Bearer ${this.config.accessToken || this.config.publishableKey}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async get(itemId: string): Promise<LifeItem> {
    const url = new URL('/rest/v1/life_items', this.config.url);
    url.searchParams.set('id', `eq.${itemId}`);
    url.searchParams.set('select', '*');
    const response = await fetch(url, { headers: this.headers() });
    if (!response.ok) throw new Error(`life_items read failed: ${response.status}`);
    const rows = await response.json() as Record<string, unknown>[];
    if (!rows[0]) throw new Error(`Life item not found: ${itemId}`);
    return fromRow(rows[0]);
  }

  async commit(result: ApplyOutcomeResult): Promise<void> {
    const requests: Promise<Response>[] = [
      fetch(new URL(`/rest/v1/life_items?id=eq.${encodeURIComponent(result.current.id)}`, this.config.url), {
        method: 'PATCH', headers: this.headers({ Prefer: 'return=minimal' }), body: JSON.stringify(toRow(result.current)),
      }),
      fetch(new URL('/rest/v1/life_outcomes?on_conflict=id', this.config.url), {
        method: 'POST', headers: this.headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(toOutcomeRow(result)),
      }),
    ];
    if (result.successor) {
      requests.push(fetch(new URL('/rest/v1/life_items?on_conflict=id', this.config.url), {
        method: 'POST', headers: this.headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(toRow(result.successor)),
      }));
    }
    const responses = await Promise.all(requests);
    const failed = responses.find((r) => !r.ok);
    if (failed) throw new Error(`Outcome persistence failed: ${failed.status}`);
  }
}

function fromRow(row: Record<string, unknown>): LifeItem {
  return {
    id: String(row.id), kind: row.kind as LifeItem['kind'], title: String(row.title),
    status: row.status as LifeItem['status'], plannedStart: row.planned_start as string | null,
    plannedEnd: row.planned_end as string | null, actualStart: row.actual_start as string | null,
    actualEnd: row.actual_end as string | null, projectId: row.project_id as string | null,
    version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function toRow(item: LifeItem) {
  return { id:item.id, kind:item.kind, title:item.title, status:item.status, planned_start:item.plannedStart,
    planned_end:item.plannedEnd, actual_start:item.actualStart, actual_end:item.actualEnd,
    project_id:item.projectId, version:item.version, created_at:item.createdAt, updated_at:item.updatedAt };
}

function toOutcomeRow(result: ApplyOutcomeResult) {
  const o=result.outcome;
  return { id:o.id,item_id:o.itemId,planned_date:o.plannedDate,result:o.result,source:o.source,
    successor_item_id:o.successorItemId,recorded_at:o.recordedAt };
}
