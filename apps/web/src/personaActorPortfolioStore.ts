import {generateActorPortfolio,isActorPortfolio,type ActorPortfolioProject} from '../../../packages/core/src/persona-arsenal.mjs';
export const ACTOR_PORTFOLIO_STORE='lifeos:persona:actor-portfolio:v1';
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export function readActorPortfolios(storage:StorageLike):ActorPortfolioProject[]{
 const raw=storage.getItem(ACTOR_PORTFOLIO_STORE);
 if(raw===null)return [];
 const value:unknown=JSON.parse(raw);
 if(!Array.isArray(value)||value.length>100||!value.every(isActorPortfolio)||
    new Set(value.map(x=>x.id)).size!==value.length)throw Error('Actor portfolio storage is invalid; original data kept');
 return value;
}
export function addActorPortfolio(storage:StorageLike,input:{id:string;title:string;genre:'drama'|'comedy'|'musical';now?:string}){
 const current=readActorPortfolios(storage);
 if(current.some(x=>x.id===input.id))throw Error('Duplicate actor portfolio ID');
 const portfolio=generateActorPortfolio(input);
 storage.setItem(ACTOR_PORTFOLIO_STORE,JSON.stringify([...current,portfolio]));
 return portfolio;
}
export function updateActorPortfolio(storage:StorageLike,project:ActorPortfolioProject){
 const current=readActorPortfolios(storage);
 if(!isActorPortfolio(project)||!current.some(x=>x.id===project.id))throw Error('Invalid portfolio update');
 const existing=current.find(x=>x.id===project.id)!;
 if(existing.createdAt!==project.createdAt||existing.genre!==project.genre)throw Error('Portfolio identity changed');
 storage.setItem(ACTOR_PORTFOLIO_STORE,JSON.stringify(current.map(x=>x.id===project.id?project:x)));
 return project;
}
