import type { LifeItem } from '../../../packages/core/src/life-item';
import { enqueueLocalHarveyReviewTasks } from './localRuntime';

/**
 * Review-only pilot: keep prospect-derived tasks on the user's device using
 * the EXISTING offline Life OS store. Do not send them to Supabase with a
 * publishable key, since the web app has not established a user-authenticated
 * session for its RLS policies.
 *
 * The Supabase repository method exists but must not be invoked by the
 * preview UI until user-specific authentication and sync are verified.
 */
export async function saveHarveyReviewTasks(
  items: readonly LifeItem[],
): Promise<number> {
  return enqueueLocalHarveyReviewTasks(localStorage, items);
}
