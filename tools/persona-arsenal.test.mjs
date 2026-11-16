import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arsenalKnowledge,arsenalRule,visualIdentityConfig,generateActorPortfolio,isActorPortfolio,buildAssociativeEditPlan} from '../packages/core/src/persona-arsenal.mjs';
import {getPersonaVisualIdentity,personaIdentityFfmpegFilter,PERSONA_VISUAL_IDENTITY_ID} from './persona-visual-identity.mjs';
import {spawnSync} from 'node:child_process';

test('Arsenal contains ten specifically sourced, versioned rules without fabricated reference IDs',()=>{
 const kb=arsenalKnowledge();
 assert.equal(kb.rules.length,10);
 assert.equal(kb.rules.find(x=>x.id==='KB-08')?.referenceId,138);
 assert.equal(kb.rules.find(x=>x.id==='KB-03')?.referenceId,141);
 assert.equal(kb.rules.find(x=>x.id==='KB-09')?.referenceId,null);
 assert.match(arsenalRule('KB-08').effect,/competence/);
 assert.equal(kb.policies.authorApprovalRequired,true);
});

test('actor mini-film: 30–60 sec, real conflict, distinct acting performances, Match Cut and overhead comedy',()=>{
 for(const genre of ['drama','comedy','musical']){
  const p=generateActorPortfolio({id:'actor-'+genre,title:'Тестовая художественная визитка',genre,now:'2026-11-16T12:00:00Z'});
  assert.equal(p.kind,'actor_portfolio');
  assert.ok(p.durationSec>=30&&p.durationSec<=60);
  assert.equal(p.storyboard.length,6);
  assert.equal(p.script.length,6);
  assert.ok(p.conflict.includes('но'));
  assert.ok(p.storyboard.some(x=>x.kind==='match_cut'));
  assert.ok(p.storyboard.every(x=>x.mediaStatus==='not_recorded'&&x.editorialApproved===false));
  assert.equal(p.editPlan.publicationApproved,false);
  assert.ok(p.editPlan.beats.some(x=>x.purpose==='associative_object'));
  assert.ok(p.editPlan.beats.some(x=>x.purpose==='actor_performance'));
  assert.ok(p.storyboard.every(x=>typeof x.lighting.key==='string'));
  assert.ok(isActorPortfolio(p));
  if(genre==='comedy')assert.ok(p.storyboard.some(x=>x.kind==='top_down'&&x.framing==='top-down'));
  if(genre==='drama')assert.ok(p.storyboard.some(x=>x.lighting.preset==='dramatic'&&x.lighting.back.includes('контровой')));
 }
 assert.throws(()=>generateActorPortfolio({id:'../unsafe',title:'Bad',genre:'drama'}),/Invalid/);
});

test('associative plan never invents approved footage or inserts unreviewed props',()=>{
 const shots=[{id:'A',kind:'face',action:'паузa'},{id:'B',kind:'object',action:'свеча'},{id:'C',kind:'face',action:'реакция'}];
 const original=buildAssociativeEditPlan(shots,[{shotId:'B',assetId:'asset1',isVerified:true,rightsConfirmed:true,authorReviewed:false,approvedForEdit:true}]);
 assert.deepEqual(original.beats.map(x=>x.purpose),['actor_performance','associative_object','actor_performance']);
 assert.equal(original.beats[1].mediaStatus,'awaiting_author_footage');
 assert.equal(original.beats[1].approvedAssetId,undefined);
 const withReview=buildAssociativeEditPlan(shots,[{shotId:'B',assetId:'asset1',isVerified:true,rightsConfirmed:true,authorReviewed:true,approvedForEdit:true}]);
 assert.equal(withReview.beats[1].approvedAssetId,'asset1');
 assert.equal(withReview.publicationApproved,false);
});

test('single visual identity covers React styling and opt-in FFmpeg; existing projects unchanged',()=>{
 const ui=visualIdentityConfig(),config=getPersonaVisualIdentity();
 assert.deepEqual(ui.colors,config.colors);
 assert.equal(personaIdentityFfmpegFilter(), '');
 assert.equal(personaIdentityFfmpegFilter(PERSONA_VISUAL_IDENTITY_ID),config.ffmpeg.videoFilter);
 assert.throws(()=>personaIdentityFfmpegFilter('malicious,format=yuv444p'),/Unknown/);
 const result=spawnSync('node',['tools/persona-visual-identity.mjs','ffmpeg-filter'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.stdout.trim(),config.ffmpeg.videoFilter);
});
