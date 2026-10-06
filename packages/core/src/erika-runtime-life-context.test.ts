import { describe, expect, it } from 'vitest';
import type { AutonomyEngine } from './engine';
import type { LifeItem } from './life-item';
import { buildErikaLifeContext } from './erika-life-context';
import { ErikaRuntime } from './erika-runtime';

const item:LifeItem={id:'work',kind:'task',title:'Главная работа дня',status:'planned',plannedStart:'2026-10-06T15:00:00+03:00',plannedEnd:'2026-10-06T16:00:00+03:00',actualStart:null,actualEnd:null,projectId:null,version:1,createdAt:'2026-10-06T10:00:00+03:00',updatedAt:'2026-10-06T10:00:00+03:00'};

describe('ErikaRuntime long-term life context',()=>{it('uses accumulated analytics, preferences, goals and desired-life context in a planning/focus reply',async()=>{const lifeContext=buildErikaLifeContext({profile:{preferences:[{key:'theatre_exit_buffer_minutes',value:45,source:'user',updatedAt:'2026-10-01T10:00:00Z'}],goals:[{id:'director',title:'Снять режиссёрский дебют',priority:9,horizon:'long'}],desiredLife:['жить в светлой просторной квартире рядом с центром']},analytics:{completionRate:62,onTimeRate:55,insights:['При достаточном объёме данных более стабильный сон связан с лучшим фокусом.']}});const runtime=new ErikaRuntime({} as AutonomyEngine,{findItem:async()=>null,today:()=> '2026-10-06',tomorrow:()=> '2026-10-07',now:()=> '2026-10-06T12:00:00+03:00',listItems:async()=>[item],consecutiveMissesByItem:async()=>({}),lifeContext:async()=>lifeContext});const result=await runtime.execute('Что держим в поле?');expect(result.understood).toBe(true);expect(result.message).toContain('Снять режиссёрский дебют');expect(result.message).toContain('светлой просторной квартире');expect(result.message).toContain('55%');expect(result.message).toContain('45 мин');expect(result.message).toContain('стабильный сон')})});
