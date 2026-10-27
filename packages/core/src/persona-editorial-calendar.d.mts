export type PersonaEditorialSlot={
 slotId:string;date:string;weekIndex:number;format:'reel'|'photo'|'carousel';
 purpose:string;status:string;contentId:string|null;approved:boolean;platforms:string[];notes?:string;
};
export const WEEKLY_SLOTS:ReadonlyArray<{weekday:number;format:string;purpose:string}>;
export function buildPersonaEditorialCalendar(options:{
 startDate:string;days?:number;existing?:PersonaEditorialSlot[];
}):{
 version:number;
 horizon:{startDate:string;endDate:string;days:number};
 target:{reelsPerWeek:number;photosPerWeek:number;carouselsPerWeek:number;stories:string};
 reserveTarget:{reels:number;photos:number;carousels:number};
 slots:PersonaEditorialSlot[];
 guidance:Record<string,string>;
};
