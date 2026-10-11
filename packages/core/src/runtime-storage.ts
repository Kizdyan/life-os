export type RuntimeRecordKind =
  | 'life_item'
  | 'life_outcome'
  | 'memory'
  | 'audit'
  | 'project'
  | 'goal'
  | 'setting';

export interface RuntimeRecord<TPayload = Record<string, unknown>> {
  id: string;
  userId: string;
  kind: RuntimeRecordKind;
  version: number;
  payload: TPayload;
  deleted: boolean;
  updatedAt: string;
}

export interface SyncMutation<TPayload = Record<string, unknown>> {
  mutationId: string;
  userId: string;
  recordId: string;
  kind: RuntimeRecordKind;
  expectedVersion: number | null;
  payload: TPayload;
  deleted: boolean;
  clientUpdatedAt: string;
}

export interface RuntimeConflict {
  expectedVersion: number | null;
  currentVersion: number | null;
}

export interface SyncResult<TPayload = Record<string, unknown>> {
  mutationId: string;
  status: 'applied' | 'duplicate' | 'conflict';
  storeRevision: number;
  record: RuntimeRecord<TPayload> | null;
  conflict: RuntimeConflict | null;
}

export interface RuntimeSnapshot {
  storeRevision: number;
  records: RuntimeRecord[];
}

export interface DurableRuntimeStore {
  read(userId: string, recordId: string): Promise<RuntimeRecord | null>;
  list(userId: string, sinceRevision?: number): Promise<RuntimeSnapshot>;
  apply(mutation: SyncMutation): Promise<SyncResult>;
}

interface Receipt {
  storeRevision: number;
  recordKey: string;
  recordVersion: number;
}

export class InMemoryDurableRuntimeStore implements DurableRuntimeStore {
  private readonly records = new Map<string, RuntimeRecord>();
  private readonly receipts = new Map<string, Receipt>();
  private revision = 0;

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async read(userId: string, recordId: string): Promise<RuntimeRecord | null> {
    const record = this.records.get(recordKey(userId, recordId));
    return record ? clone(record) : null;
  }

  async list(userId: string): Promise<RuntimeSnapshot> {
    return {
      storeRevision: this.revision,
      records: [...this.records.values()]
        .filter((record) => record.userId === userId)
        .map(clone),
    };
  }

  async apply(mutation: SyncMutation): Promise<SyncResult> {
    validateMutation(mutation);

    const receiptKey = mutationReceiptKey(mutation.userId, mutation.mutationId);
    const receipt = this.receipts.get(receiptKey);
    if (receipt) {
      const record = this.records.get(receipt.recordKey) ?? null;
      return {
        mutationId: mutation.mutationId,
        status: 'duplicate',
        storeRevision: receipt.storeRevision,
        record: record ? clone(record) : null,
        conflict: null,
      };
    }

    const key = recordKey(mutation.userId, mutation.recordId);
    const current = this.records.get(key) ?? null;
    const currentVersion = current?.version ?? null;

    if (mutation.expectedVersion !== currentVersion) {
      return {
        mutationId: mutation.mutationId,
        status: 'conflict',
        storeRevision: this.revision,
        record: current ? clone(current) : null,
        conflict: {
          expectedVersion: mutation.expectedVersion,
          currentVersion,
        },
      };
    }

    const next: RuntimeRecord = {
      id: mutation.recordId,
      userId: mutation.userId,
      kind: mutation.kind,
      version: (current?.version ?? 0) + 1,
      payload: clone(mutation.payload),
      deleted: mutation.deleted,
      updatedAt: this.now(),
    };

    this.revision += 1;
    this.records.set(key, next);
    this.receipts.set(receiptKey, {
      storeRevision: this.revision,
      recordKey: key,
      recordVersion: next.version,
    });

    return {
      mutationId: mutation.mutationId,
      status: 'applied',
      storeRevision: this.revision,
      record: clone(next),
      conflict: null,
    };
  }
}

function validateMutation(mutation: SyncMutation): void {
  if (!mutation.mutationId.trim()) throw new Error('mutationId is required');
  if (!mutation.userId.trim()) throw new Error('userId is required');
  if (!mutation.recordId.trim()) throw new Error('recordId is required');
  if (mutation.expectedVersion !== null && (!Number.isInteger(mutation.expectedVersion) || mutation.expectedVersion < 1)) {
    throw new Error('expectedVersion must be null or a positive integer');
  }
}

function recordKey(userId: string, recordId: string): string {
  return `${userId}:${recordId}`;
}

function mutationReceiptKey(userId: string, mutationId: string): string {
  return `${userId}:${mutationId}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
