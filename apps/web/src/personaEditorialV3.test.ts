import {it,expect} from 'vitest';
import {createFridgeHumV3} from './personaEditorialV3';
import {createFridgeHumV2} from './personaEditorialV2';
import {validatePost,editorialDesignHash} from './personaEditorialModel';
it('creates only a separate final V3 with Literata/Golos and no author endorsements',()=>{
 const old=createFridgeHumV2(),saved=JSON.stringify(old),p=createFridgeHumV3();
 expect(p.id).toBe('carousel-fridge-hum-v3');expect(p.slides).toHaveLength(7);
 expect(p.fontPreset).toBe('literata-golos');expect(p.compositionPreset).toBe('fridge-hum-v3');
 expect(()=>validatePost(p)).not.toThrow();expect(JSON.stringify(old)).toBe(saved);
 expect(p.approvals).toMatchObject({topic:false,content:false,design:false,textApproved:false,designApproved:false});
 expect(p.slides.map(s=>s.text).join(' ')).not.toMatch(/(?:^|\s)(я|мой|моя|мне|мы)(?=\s|[.,:])/iu);
 expect(p.slides[6].text).toContain('Редакторский вывод');
 expect(editorialDesignHash(p)).not.toBe(editorialDesignHash(old));
});
