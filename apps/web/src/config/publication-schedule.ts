/** The single source of truth for proposed publication days, Moscow local clock.
 * JS dayOfWeek: Sunday=0 ... Saturday=6. Calendar columns start on Monday.
 * These slots never publish automatically or modify already saved author dates.
 */
export const DEFAULT_PERSONA_PUBLICATION_SCHEDULE = Object.freeze({
 reels:Object.freeze({dayOfWeek:2,time:'19:00'}),
 carousel:Object.freeze({dayOfWeek:4,time:'09:00'}),
 photo:Object.freeze({dayOfWeek:6,time:'21:00'}),
 timezone:'Europe/Moscow',
});
export const PERSONA_PUBLICATION_SCHEDULE = DEFAULT_PERSONA_PUBLICATION_SCHEDULE;
export type PersonaPublicationKind='reels'|'carousel'|'photo';
export function personaPublicationSlot(kind:PersonaPublicationKind){
 return PERSONA_PUBLICATION_SCHEDULE[kind]??DEFAULT_PERSONA_PUBLICATION_SCHEDULE[kind];
}
export function personaPublicationMondayIndex(dayOfWeek:number):number{
 if(!Number.isInteger(dayOfWeek)||dayOfWeek<0||dayOfWeek>6)
  throw Error('Publication weekday must be a JS dayOfWeek 0–6');
 return (dayOfWeek+6)%7;
}
