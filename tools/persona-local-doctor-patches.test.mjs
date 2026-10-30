import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assembleDoctorPatches} from './persona-local-doctor-patches.mjs';
const beats=[
 {purpose:'hook',line:'Я пришёл на кастинг.',action:'Держу папку в руках.',durationSec:3},
 {purpose:'development',line:'Режиссёр просит ноту.',action:'Подхожу к пианино.',durationSec:5},
 {purpose:'development',line:'Пианино отвечает само.',action:'Смотрю на клавиши.',durationSec:6},
 {purpose:'ending',line:'Наняли только пианино.',action:'Встаю и закрываю крышку.',durationSec:4},
];
const task=()=>({beats:structuredClone(beats),targetIndices:[2,3],lockedIndices:[0]});
const patch=()=>({patches:[
 {beatIndex:2,line:'Я пытаюсь перебить инструмент.',action:'Перекрываю клавиши ладонью.',durationSec:7},
 {beatIndex:3,line:'Меня взяли аккомпанировать пианино.',action:'Молча убираю свой стул.',durationSec:4}
],changeSummary:'Изменены два конкретных действия героя.'});
test('builds full revision without asking model to copy the untargeted source',()=>{
 const original=task(),candidate=patch(),out=assembleDoctorPatches(original,candidate);
 assert.equal(out.revisedBeats.length,4);
 assert.deepEqual(out.revisedBeats.slice(0,2),beats.slice(0,2));
 assert.deepEqual(out.diff.map(x=>x.beatIndex),[2,3]);
 assert.equal(out.totalDurationSec,19);
 assert.deepEqual(original.beats,beats);
 assert.notEqual(out.revisedBeats[0],original.beats[0]);
});
test('target subset can rewrite only final beat',()=>{
 const out=assembleDoctorPatches(task(),{patches:[patch().patches[1]],changeSummary:'Новый финал с поворотом'});
 assert.deepEqual(out.diff.map(x=>x.beatIndex),[3]);
 assert.deepEqual(out.revisedBeats[2],beats[2]);
});
test('rejects unauthorized, locked, duplicate, invalid and out-of-range beat indexes',()=>{
 for(const bad of [0,1,4,-1,1.2]){
  const p=patch();p.patches=[{...p.patches[0],beatIndex:bad}];
  assert.throws(()=>assembleDoctorPatches(task(),p),/index/);
 }
 const p=patch();p.patches=[p.patches[0],p.patches[0]];
 assert.throws(()=>assembleDoctorPatches(task(),p),/index/);
});
test('refuses extra fields that might try to smuggle modified purpose or new structure',()=>{
 const p=patch();p.patches[0].purpose='ending';
 assert.throws(()=>assembleDoctorPatches(task(),p),/extra fields/);
});
test('rejects no-op patches, repeated dialogue and invalid timing',()=>{
 const p=patch();p.patches[0]={beatIndex:2,...beats[2]};
 assert.throws(()=>assembleDoctorPatches(task(),p),/extra fields/);
 const noChange={...p,patches:[{beatIndex:2,line:beats[2].line,action:beats[2].action,durationSec:beats[2].durationSec}]};
 assert.throws(()=>assembleDoctorPatches(task(),noChange),/unchanged/);
 const duplicate=patch();duplicate.patches[0].line=beats[1].line;
 assert.throws(()=>assembleDoctorPatches(task(),duplicate),/duplicate/);
 for(const durationSec of [-1,0,100,'4 seconds',null]){
  const wrong=patch();wrong.patches[0].durationSec=durationSec;
  assert.throws(()=>assembleDoctorPatches(task(),wrong),/duration/);
 }
});
test('rejects four identical beat timings after patch merge',()=>{
 const original=task();original.targetIndices=[1,2,3];
 const candidate={patches:[
  {beatIndex:1,line:'Вдруг я нахожу ноту.',action:'Переворачиваю страницу.',durationSec:3},
  {beatIndex:2,line:'Пианино играет без меня.',action:'Отодвигаю руки.',durationSec:3},
  {beatIndex:3,line:'Директор выбирает инструмент.',action:'Выношу стул.',durationSec:3}
 ],changeSummary:'Изменились все длительности'};
 assert.throws(()=>assembleDoctorPatches(original,candidate),/uniform/);
});
test('does not accept zero patches or a patch targeting a protected frame',()=>{
 assert.throws(()=>assembleDoctorPatches(task(),{patches:[],changeSummary:'Нет'}),/expected/);
 const locked=task();locked.targetIndices=[0,2];locked.lockedIndices=[0];
 assert.throws(()=>assembleDoctorPatches(locked,patch()),/index/);
});
