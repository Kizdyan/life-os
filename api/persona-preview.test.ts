import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './persona';

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
function request(body:unknown){return new Request('http://localhost/api/persona',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}

describe('Persona accessible, no-paid-API trial',()=>{
  it('returns a usable script draft clearly labeled template mode with no network calls',async()=>{
    vi.stubEnv('PERSONA_ENABLE_EXTERNAL_AI','false');
    const network=vi.fn();vi.stubGlobal('fetch',network);
    const response=await handler.fetch(request({action:'generate',idea:{id:'one',title:'Первая проба в кадре',angle:'Как меняется сцена',format:'reel',score:0}}));
    expect(response.status).toBe(200);
    const data=await response.json();
    expect(data.mode).toBe('template');
    expect(data.draft.title).toContain('Первая проба');
    expect(data.draft.slides.length).toBeGreaterThanOrEqual(5);
    expect(network).not.toHaveBeenCalled();
  });
  it('returns idea bank with declared mode and does not call paid models',async()=>{
    vi.stubEnv('PERSONA_ENABLE_EXTERNAL_AI','false');
    const network=vi.fn();vi.stubGlobal('fetch',network);
    const response=await handler.fetch(request({action:'plan',history:[]}));
    expect(response.status).toBe(200);
    const data=await response.json();
    expect(data.mode).toBe('template');
    expect(data.ideas.length).toBeGreaterThanOrEqual(10);
    expect(network).not.toHaveBeenCalled();
  });
});
