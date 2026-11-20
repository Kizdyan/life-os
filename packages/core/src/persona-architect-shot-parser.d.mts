/** Type contract for the existing strictly validated .mjs shot parser. */
export type ArchitectTimedShot={
  order:number;
  startSec:number;
  endSec:number;
  durationSec:number;
  action:string;
};
export type ArchitectSourceIdea={
  id:string;
  title:string;
  hook:string;
  mainShots:string;
  broll:string;
  music:string;
  duration:string;
};
export function parseArchitectTimedShots(mainShots:string):ArchitectTimedShot[];
export function validateArchitectIdeas(
  items:unknown,
):Array<{item:ArchitectSourceIdea;scenes:ArchitectTimedShot[]}>;
