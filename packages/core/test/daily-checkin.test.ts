import {describe,expect,it} from 'vitest';import {normalizeSleep} from '../src/daily-checkin';
describe('sleep',()=>{it('keeps empty sleep empty',()=>expect(normalizeSleep('')).toBeNull());it('accepts decimal comma',()=>expect(normalizeSleep('10,5')).toBe(10.5));});
