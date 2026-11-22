import {expect,it} from 'vitest';
import {composeEditorialByMeaning,editorialSourcesPass,reviseEditorialPost} from './personaEditorialModel';
import {createFridgeHumV3,applyFridgeHumFinalPass,fridgeHumV3Evidence,preserveFridgeHumBeforeFinalPass,fridgeHumFinalSnapshotKey} from './personaEditorialV3';
it('repairs only the legacy slide-five line break, preserving words, caption and all six other slides',()=>{
 const current=applyFridgeHumFinalPass(composeEditorialByMeaning(createFridgeHumV3()));
 const old=reviseEditorialPost(current,{slides:current.slides.map((s,i)=>i===4?{...s,headline:'Обмен звуками —\nдо сведения.'}:s)});
 const saved=JSON.stringify(old),fixed=applyFridgeHumFinalPass(old);
 expect(fixed.slides[4].headline).toBe('Обмен звуками\n— до сведения.');
 expect(fixed.slides[4].headline!.replace(/\s+/gu,' ')).toBe(old.slides[4].headline!.replace(/\s+/gu,' '));
 for(const i of [0,1,2,3,5,6])expect(fixed.slides[i]).toEqual(old.slides[i]);
 expect(fixed.caption).toBe(old.caption);expect(fixed.slides[4].body).toBe(old.slides[4].body);
 expect(fixed.fontPreset).toBe(old.fontPreset);expect(fixed.compositionPreset).toBe(old.compositionPreset);
 expect(fixed.slides.map(s=>s.background)).toEqual(old.slides.map(s=>s.background));
 expect(editorialSourcesPass(fixed)).toBe(false);expect(fixed.approvals.content).toBe(false);expect(fixed.approvals.design).toBe(false);
 expect(JSON.stringify(old)).toBe(saved);
 expect(fridgeHumV3Evidence(fixed).status).toBe('MATCHES_RECHECKED_COPY');
});
it('uses existing revisions for only four slide edits, public caption, same fonts images and composition',()=>{
 const p=composeEditorialByMeaning(createFridgeHumV3()),original=JSON.stringify(p),q=applyFridgeHumFinalPass(p);
 expect(q.id).toBe(p.id);expect(q.fontPreset).toBe(p.fontPreset);expect(q.compositionPreset).toBe(p.compositionPreset);
 for(const i of [2,3,5])expect(q.slides[i]).toEqual(p.slides[i]);
 expect(q.slides.map(s=>s.background)).toEqual(p.slides.map(s=>s.background));
 expect(q.slides[0].headline).toBe('Зачем музыке\nгул холодильника?');
 expect(q.slides[4].text).toContain('Ливсей заранее');
 expect(q.slides[6].text).not.toContain('Редакторский вывод');
 expect(q.caption).not.toMatch(/provenance|черновик|вёрстк|Literata|Golos|иллюстрации|не утвержд/iu);
 expect(q.approvals).toMatchObject({content:false,design:false,textApproved:false,designApproved:false});
 expect(editorialSourcesPass(q)).toBe(false);expect(JSON.stringify(p)).toBe(original);
 expect(applyFridgeHumFinalPass(q)).toBe(q);
});
it('binds the actual source recheck to exact public copy, while later wording changes need recheck',()=>{
 const p=applyFridgeHumFinalPass(composeEditorialByMeaning(createFridgeHumV3()));
 expect(fridgeHumV3Evidence(p).status).toBe('MATCHES_RECHECKED_COPY');
 expect(fridgeHumV3Evidence(p).sourceCheck).toBe('PASS');
 const q=reviseEditorialPost(p,{caption:p.caption+' Непроверенное дополнение.'});
 expect(fridgeHumV3Evidence(q).status).toBe('NEEDS_RECHECK');
 expect(fridgeHumV3Evidence(q).sourceCheck).not.toBe('PASS');
 expect(()=>applyFridgeHumFinalPass(q)).toThrow(/сохранённой редакции/);
});
it('preserves the exact prior browser draft before replacing it and rejects conflicting snapshots',()=>{
 const p=composeEditorialByMeaning(createFridgeHumV3()),q=applyFridgeHumFinalPass(p),data=new Map<string,string>();
 const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)}};
 preserveFridgeHumBeforeFinalPass(storage,p,q);
 expect(data.get(fridgeHumFinalSnapshotKey(q))).toBe(JSON.stringify(p));
 const later={...q,revision:q.revision+1};
 expect(fridgeHumV3Evidence(later,data.get(fridgeHumFinalSnapshotKey(later))).previousRevision).toEqual(p);
 preserveFridgeHumBeforeFinalPass(storage,p,q);
 expect(()=>preserveFridgeHumBeforeFinalPass(storage,{...p,caption:'Другой черновик'},q)).toThrow(/Архив/);
});
