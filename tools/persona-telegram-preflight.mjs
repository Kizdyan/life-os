import {pathToFileURL} from 'node:url';

// Read-only Telegram destination capability check. Never logs token, URLs or provider errors.
export async function telegramPreflight({env=process.env,fetchImpl=globalThis.fetch}={}){
 const token=env.PERSONA_TELEGRAM_BOT_TOKEN?.trim();
 const channel=env.PERSONA_TELEGRAM_CHANNEL?.trim();
 const expected=env.PERSONA_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/,'');
 const blocked=reason=>({status:'BLOCKED',reason,published:false});
 if(!token||!/^\d+:[A-Za-z0-9_-]+$/.test(token)||!channel||!/^@[A-Za-z0-9_]{5,32}$/.test(channel)||!expected||!/^[A-Za-z0-9_]+$/.test(expected))return blocked('CONFIG_REQUIRED');
 async function call(method,body={}){
  const response=await fetchImpl('https://api.telegram.org/bot'+token+'/'+method,{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
   redirect:'error',signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(!response.ok||data?.ok!==true)throw Error('API_FAILURE');
  return data.result;
 }
 try{
  const bot=await call('getMe');
  if(bot?.is_bot!==true||!Number.isSafeInteger(bot.id)||bot.username?.toLowerCase()!==expected.toLowerCase())return blocked('BOT_MISMATCH');
  const chat=await call('getChat',{chat_id:channel});
  if(chat?.type!=='channel'||!Number.isSafeInteger(chat.id)||chat.username?.toLowerCase()!==channel.slice(1).toLowerCase())return blocked('CHANNEL_MISMATCH');
  const member=await call('getChatMember',{chat_id:chat.id,user_id:bot.id});
  if(member?.user?.id!==bot.id||member.status!=='administrator'||member.can_post_messages!==true)return blocked('POST_PERMISSION_REQUIRED');
  return {status:'DESTINATION_VERIFIED',channel:chat.username,chatId:chat.id,bot:bot.username,canPost:true,canEdit:member.can_edit_messages===true,checkedAt:new Date().toISOString(),published:false};
 }catch{return blocked('API_UNAVAILABLE_OR_DENIED')}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await telegramPreflight();
 console.log(JSON.stringify(result,null,2));
 if(result.status!=='DESTINATION_VERIFIED')process.exitCode=1;
}
