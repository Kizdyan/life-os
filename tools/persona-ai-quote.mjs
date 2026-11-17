/** One-click semantic captions. Local Whisper transcripts are never replaced by invented speech.
 * A quote is creative copy, explicitly NOT a real quotation from a person in footage.
 */
import {createHash} from 'node:crypto';
import {editPlanProvider} from './persona-quick-edit-plan.mjs';

const CONFIRMED_EMPTY=new Set(['no-audio','no-speech-detected']);
const MOODS=Object.freeze({dramatic:'Драматичное',calm:'Спокойное',funny:'Весёлое',
 dynamic:'Динамичное',premium:'Премиальное'});
const limit=(n,low,high)=>Math.max(low,Math.min(high,n));
const round=x=>Math.round(x);
const words=x=>x.trim().split(/\s+/u).filter(Boolean);
export function classifyQuoteSpeech(audio){
 if(!Array.isArray(audio)||!audio.length||audio.some(t=>!t||!Array.isArray(t.segments)))
  throw Error('Speech evaluation requires per-source Whisper evidence');
 const count=audio.flatMap(t=>t.segments).filter(s=>typeof s.text==='string')
  .reduce((n,s)=>n+words(s.text).length,0);
 // Unknown transcription MUST NOT be interpreted as silence. No quote is sent.
 if(audio.some(t=>!CONFIRMED_EMPTY.has(t.status)&&t.status!=='whisper-transcribed'))
  return {mode:'unverified',wordCount:count,reason:'Whisper unavailable or failed; speech presence unknown'};
 if(audio.some(t=>t.status==='whisper-transcribed'&&t.segments.some(s=>
  !Number.isFinite(s.startSec)||!Number.isFinite(s.endSec)||s.endSec<=s.startSec)))
  return {mode:'unverified',wordCount:count,reason:'Whisper timestamps unreliable'};
 if(count>=3)return {mode:'speech',wordCount:count,reason:'Sufficient timed Whisper words'};
 return {mode:'quote',wordCount:count,reason:'No meaningful speech or fewer than three Whisper words'};
}
function cleanTranscript(text){
 return String(text).replace(/[\x00-\x1f{}\\]/g,' ').replace(/\s+/g,' ').trim().slice(0,220);
}
export function cueFromWhisper({audio,choices}){
 if(!Array.isArray(choices)||choices.length<1||!Array.isArray(audio))throw Error('Transcript needs verified edit choices');
 const cues=[];let offset=0;
 for(const c of choices){
  const src=audio[c.fileIndex],from=c.startSec,to=c.startSec+c.durationSec;
  for(const seg of src?.segments??[]){
   if(typeof seg.text!=='string'||!Number.isFinite(seg.startSec)||!Number.isFinite(seg.endSec))continue;
   // Never attach ASR from a different take or unseen window.
   const start=Math.max(from,seg.startSec),end=Math.min(to,seg.endSec);
   if(end-start<.22)continue;
   const text=cleanTranscript(seg.text);
   if(!text)continue;
   const startMs=round((offset+start-from)*1000),endMs=round((offset+end-from)*1000);
   if(cues.length&&startMs<cues.at(-1).endMs)continue; // libass disallows overlaps
   cues.push({startMs,endMs,text});
   if(cues.length>=30)break;
  }
  offset+=c.durationSec;
 }
 return cues.slice(0,30);
}
export function validateQuoteText(raw){
 if(typeof raw!=='string')throw Error('AI quote must be a plain text phrase');
 const quote=raw.trim().replace(/^[\"'«„]+|[\"'»“]+$/gu,'').replace(/\s+/gu,' ');
 if(quote.length<4||quote.length>94||/[\r\n{}\\<>\x00-\x1f]/u.test(quote)||
  /https?:|@|#/iu.test(quote))throw Error('AI quote is unsafe or too long');
 const count=words(quote).length;
 if(count<2||count>7)throw Error('AI quote must have 2–7 words');
 if(/^(верь в себя|всё возможно|следуй за мечтой|живи моментом|будь собой)/iu.test(quote))
  throw Error('AI quote contains cliché');
 return quote;
}
export function quoteCue(quote,choices){
 const text=validateQuoteText(quote);
 const total=choices.reduce((n,c)=>n+c.durationSec,0);
 if(!Number.isFinite(total)||total<2)throw Error('Quote overlay needs a verified timeline');
 // Single lower-third accent, introduced after the first visual beat.
 const durationMs=round(total*1000),display=limit(round(total*0.43*1000),2200,4200);
 const startMs=limit(round(total*0.22*1000),0,Math.max(0,durationMs-display-200));
 return [{startMs,endMs:Math.min(durationMs,startMs+display),text,fadeMs:200}];
}
export async function generatePersonaQuote({mood=null,env=process.env,fetchImpl=fetch,timeoutMs=6500}={}){
 if(mood!==null&&!Object.hasOwn(MOODS,mood))throw Error('Invalid mood source for quotation');
 if(!env.OPENROUTER_API_KEY?.trim())throw Error('OpenRouter unavailable; no AI quotation invented');
 const provider=editPlanProvider(env);
 if(provider.provider!=='openrouter')throw Error('AI Quote Generator requires OpenRouter');
 const moodText=mood?MOODS[mood]:'настроение достоверно не определено';
 const messages=[{role:'system',content:[
  'Ты — сценарист в стиле «Тихая роскошь». Твоя задача — придумать ОДНУ оригинальную, не заимствованную, короткую поэтичную фразу для экранного титра.',
  'Никакой пафосной мотивации, банальностей, маркетинга или цитат известных людей.',
  'Фраза 2–7 слов, по-русски, без кавычек и переноса строки.',
  'Это новая авторская подпись, а НЕ произнесённые в видеоролике слова и не слова актёра.',
  'Не утверждай ничего о неизвестных визуальных деталях, звуках или личности персонажей.',
  'Верни строго JSON объект: {"quote":"..."} без других полей.'
 ].join(' ')},{role:'user',content:'Настроение видео: '+moodText+'. Придумай один сдержанный выразительный титр для короткого видео без содержательной речи. Пример тональности: «Тишина перед первым аккордом», «Поверил улыбке?»; не копируй примеры.'}];
 let response;
 try{response=await fetchImpl(provider.url,{method:'POST',headers:{
  Authorization:'Bearer '+provider.key,'Content-Type':'application/json'},
  body:JSON.stringify({model:provider.model,temperature:0.7,max_tokens:190,response_format:{type:'json_object'},messages}),
  signal:AbortSignal.timeout(limit(Math.trunc(timeoutMs),1,12000))})}
 catch{throw Error('AI Quote Generator timed out or OpenRouter unavailable')}
 if(!response?.ok)throw Error('Quote generator rejected (HTTP '+response?.status+')');
 let content;
 try{const raw=await response.text();if(raw.length>20000)throw Error();
  const body=JSON.parse(raw);content=body.choices?.[0]?.message?.content;
  if(typeof content==='string')content=JSON.parse(content);
 }catch{throw Error('Quote generator returned invalid JSON')}
 if(!content||typeof content!=='object'||Array.isArray(content)||typeof content.quote!=='string')
  throw Error('Quote generator omitted an original quote');
 return {quote:validateQuoteText(content.quote),mood,provider:'openrouter',model:provider.model,
  requestCount:1,promptSha256:createHash('sha256').update(messages.map(x=>x.content).join('\n')).digest('hex')};
}
