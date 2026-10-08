// Pure provider-routing state machine. No credentials, network access or billable calls here.
export type RouteFailure = 'QUOTA' | 'PERMISSION' | 'ECONOMY' | 'TIMEOUT' | 'OUTAGE';
export class RouteFailureError extends Error {
  constructor(readonly reason: RouteFailure) {
    super('provider_route:' + reason);
  }
}
export type ProviderAttempt<T> = (model: string, isFallback: boolean) =>
  Promise<{ status: number; value?: T }>;
export type BudgetReserve = (isFallback: boolean) => Promise<boolean>;

/** Each alternative reserves its own budget before invoking a provider. */
export async function runProviderRouter<T>(
  models: string[],
  reserve: BudgetReserve,
  attempt: ProviderAttempt<T>,
  onQuota?: () => void,
): Promise<T> {
  const distinct = [...new Set(models.filter((m) => !!m.trim()))].slice(0, 2);
  for (let i = 0; i < distinct.length; i++) {
    const fallback = i > 0;
    if (!(await reserve(fallback))) throw new RouteFailureError('ECONOMY');
    let status: number;
    let value: T | undefined;
    try {
      ({ status, value } = await attempt(distinct[i], fallback));
    } catch {
      if (i < distinct.length - 1) continue;
      throw new RouteFailureError('TIMEOUT');
    }
    if (status >= 200 && status < 300) {
      if (value === undefined) throw new RouteFailureError('OUTAGE');
      return value;
    }
    if (status === 429) {
      onQuota?.();
      throw new RouteFailureError('QUOTA');
    }
    if (status === 401 || status === 403) throw new RouteFailureError('PERMISSION');
    if (![400, 404, 408, 500, 502, 503, 504].includes(status) ||
        i === distinct.length - 1) throw new RouteFailureError('OUTAGE');
  }
  throw new RouteFailureError('OUTAGE');
}
