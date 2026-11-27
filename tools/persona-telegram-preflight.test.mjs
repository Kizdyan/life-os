import {test} from 'node:test';
import assert from 'node:assert/strict';
import {telegramPreflight} from './persona-telegram-preflight.mjs';
const env={PERSONA_TELEGRAM_BOT_TOKEN:'123:fixture',PERSONA_TELEGRAM_CHANNEL:'@test_channel',PERSONA_TELEGRAM_BOT_USERNAME:'@testbot'};
const bot={id:123,is_bot:true,username:'testbot'},chat={id:-100123,type:'channel',username:'test_channel'},member={user:{id:123},status:'administrator',can_post_messages:true,can_edit_messages:false};
function mock(results){const methods=[];return {methods,fetchImpl:async(url,opts)=>{methods.push(url.split('/').at(-1));assert.equal(opts.redirect,'error');return {ok:true,json:async()=>({ok:true,result:results.shift()})}}}}
test('missing configuration performs no requests',async()=>{const m=mock([]);assert.equal((await telegramPreflight({env:{},fetchImpl:m.fetchImpl})).reason,'CONFIG_REQUIRED');assert.deepEqual(m.methods,[])});
test('verifies bot channel and permissions without publishing',async()=>{const m=mock([bot,chat,member]);const r=await telegramPreflight({env,fetchImpl:m.fetchImpl});assert.equal(r.status,'DESTINATION_VERIFIED');assert.equal(r.published,false);assert.deepEqual(m.methods,['getMe','getChat','getChatMember']);assert.ok(!JSON.stringify(r).includes(env.PERSONA_TELEGRAM_BOT_TOKEN))});
test('mismatches and missing posting permission fail closed',async()=>{for(const [results,reason] of [[[ {...bot,username:'otherbot'}],'BOT_MISMATCH'],[[bot,{...chat,type:'group'}],'CHANNEL_MISMATCH'],[[bot,chat,{...member,can_post_messages:false}],'POST_PERMISSION_REQUIRED']]){const m=mock(results);assert.equal((await telegramPreflight({env,fetchImpl:m.fetchImpl})).reason,reason)}});
test('network errors never disclose credentials',async()=>{const r=await telegramPreflight({env,fetchImpl:async()=>{throw Error(env.PERSONA_TELEGRAM_BOT_TOKEN)}});assert.equal(r.reason,'API_UNAVAILABLE_OR_DENIED');assert.ok(!JSON.stringify(r).includes(env.PERSONA_TELEGRAM_BOT_TOKEN))});
