import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const dir=new URL('../apps/web/src/assets/fonts/editorial-v3/',import.meta.url);
function glyph(data,code){
 const count=data.readUInt16BE(4);let cmap;
 for(let i=0;i<count;i++){const at=12+16*i;if(data.toString('ascii',at,at+4)==='cmap')cmap=data.readUInt32BE(at+8)}
 assert.ok(cmap,'cmap required');
 for(let i=0;i<data.readUInt16BE(cmap+2);i++){
  const entry=cmap+4+8*i,platform=data.readUInt16BE(entry),sub=cmap+data.readUInt32BE(entry+4),format=data.readUInt16BE(sub);
  if(platform!==0&&platform!==3)continue;
  if(format===12){for(let g=0;g<data.readUInt32BE(sub+12);g++){const p=sub+16+12*g,a=data.readUInt32BE(p),b=data.readUInt32BE(p+4);if(code>=a&&code<=b)return data.readUInt32BE(p+8)+code-a}}
  if(format===4&&code<=65535){const n=data.readUInt16BE(sub+6)/2,end=sub+14,start=end+2*n+2,delta=start+2*n,range=delta+2*n;
   for(let s=0;s<n;s++)if(code>=data.readUInt16BE(start+2*s)&&code<=data.readUInt16BE(end+2*s)){
    const d=data.readInt16BE(delta+2*s),r=data.readUInt16BE(range+2*s);
    if(!r)return(code+d)&65535;const g=data.readUInt16BE(range+2*s+r+2*(code-data.readUInt16BE(start+2*s)));return g?(g+d)&65535:0;
   }
  }
 }
 return 0;
}
test('actual licensed Literata and Golos font bytes match official provenance and contain full Russian glyphs',async()=>{
 const manifest=JSON.parse(await readFile(new URL('provenance.json',dir),'utf8'));
 for(const font of manifest){
  const bytes=await readFile(new URL(font.name+'.ttf',dir));
  const hash=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');assert.equal(hash,font.gitBlobSha);
  for(const c of'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя—«»0123456789')assert.ok(glyph(bytes,c.codePointAt(0)),font.name+' missing '+c);
  assert.match(await readFile(new URL(font.name+'-OFL.txt',dir),'utf8'),/SIL OPEN FONT LICENSE/);
 }
});
