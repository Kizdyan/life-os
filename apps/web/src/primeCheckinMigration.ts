import { makePrimeDailyReflection, readPrimeDailyReflection, type PrimeDailyReflection } from './dailyCheckin';
import { readPrimeJournal, voidPrimeEvent, type PrimeStorage } from './primeBuild';

/** Moves legacy local reflection events into the canonical Check-in domain.
 * The original journal/audit remains as historical provenance, but its event
 * is voided so there is only one active daily reflection.
 */
export async function migrateLegacyPrimeReflections(
  store: PrimeStorage,
  persist: (reflection: PrimeDailyReflection) => Promise<void>,
): Promise<number> {
  let moved = 0;
  const legacy = readPrimeJournal(store).events.filter(e => e.type === 'reflection' && !e.voided && e.answers);
  for (const item of legacy) {
    if (!readPrimeDailyReflection(store, item.date)) {
      await persist(makePrimeDailyReflection(item.date, item.answers!, item.selfRespect, item.alignment));
      if (!readPrimeDailyReflection(store, item.date)) throw Error('Prime check-in migration not persisted');
      moved++;
    }
    voidPrimeEvent(store, item.id);
  }
  return moved;
}
