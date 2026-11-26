import {describe,it,expect} from 'vitest';
import {editorialReserve,moscowCalendarDate} from './personaEditorialReserve';
import {createSeedEditorialCarousel} from './personaEditorialModel';
describe('weekly reserve evidence',()=>{
 it('uses Moscow calendar day, not browser timezone',()=>{
  expect(moscowCalendarDate(new Date('2026-11-26T22:00:00Z'))).toBe('2026-11-27');
 });
 it('does not count empty days, old drafts or author flags as verified packages',()=>{
  const post={...createSeedEditorialCarousel('PHOTO-001'),scheduledDate:'2026-11-28'};
  const out=editorialReserve([post],'2026-11-27');
  expect(out.endDate).toBe('2026-12-03');expect(out.rows).toHaveLength(7);
  expect(out.assignedDays).toBe(1);expect(out.editorialCandidateDays).toBe(0);
  expect(out.verifiedPackages).toBeNull();expect(out.publicationAuthorized).toBe(false);
  expect(out.rows[1].materials[0].blockers).toContain('Нет актуального независимого редакционного заключения');
  expect(out.rows[0].status).toBe('UNASSIGNED');
 });
 it('retains multiple commitments rather than inventing a winner or moving a date',()=>{
  const first={...createSeedEditorialCarousel('PHOTO-001'),scheduledDate:'2026-11-28'};
  const second={...createSeedEditorialCarousel('PHOTO-002'),scheduledDate:'2026-11-28'};
  const out=editorialReserve([first,second],'2026-11-27');
  expect(out.rows[1].status).toBe('MULTIPLE_COMMITMENTS');
  expect(out.rows[1].materials.map(m=>m.id)).toEqual([first.id,second.id]);
  expect(out.assignedDays).toBe(1);
 });
});
