export type PersonaEditorialSlot={
 slotId:string;date:string;weekIndex:number;format:'reel'|'photo'|'carousel';
 purpose:string;status:string;contentId:string|null;approved:boolean;platforms:string[];notes?:string;
};
export const WEEKLY_SLOTS:ReadonlyArray<{weekday:number;format:string;purpose:string}>;
export function buildPersonaEditorialCalendar(options:{
 startDate:string;days?:number;existing?:PersonaEditorialSlot[];sprintStartDate?:string|null;occupiedDates?:string[];
}):{
 version:number;
 horizon:{startDate:string;endDate:string;days:number};
 target:{reelsPerWeek:number;photosPerWeek:number;carouselsPerWeek:number;stories:string};
 reserveTarget:{reels:number;photos:number;carousels:number};
 slots:PersonaEditorialSlot[];
 sprint?:{startDate:string;endDate:string;timezone:'Europe/Moscow';status:'PLANNING_ONLY'};
 guidance:Record<string,string>;
};
