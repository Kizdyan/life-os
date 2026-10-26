import type { LifeItem } from '../../../packages/core/src/life-item';
import { SupabaseLifeItemRepository } from '../../../packages/core/src/supabase-repository';
import { enqueueLocalHarveyReviewTasks } from './localRuntime';
import { backendMode } from './api';

/**
 * Save reviewed company-level tasks. No email address, research note or
 * correspondence is sent to Life OS, and no outreach is triggered.
 */
export async function saveHarveyReviewTasks(items: readonly LifeItem[]): Promise<number | null> {
  if (backendMode === 'local') {
    return enqueueLocalHarveyReviewTasks(localStorage, items);
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error('Supabase is not configured');
  await new SupabaseLifeItemRepository({ url, publishableKey })
    .enqueueHarveyReviewTasks(items);
  // Upsert conflict-ignore does not report how many records were new.
  return null;
}
