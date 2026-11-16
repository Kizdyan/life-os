#!/usr/bin/env node
/** Shared Codex/FFmpeg visual identity. Opt-in only; never overwrites source media. */
import config from '../config/persona-visual-identity.json' with {type:'json'};
import {fileURLToPath} from 'node:url';
export const PERSONA_VISUAL_IDENTITY_ID=config.id;
export function getPersonaVisualIdentity(){
 if(config.version!==1||config.id!=='persona-visual-identity-v1')throw Error('Unrecognized identity version');
 const filter=config.ffmpeg?.videoFilter;
 if(typeof filter!=='string'||!/^eq=contrast=1\.0[0-9]:saturation=0\.9[0-9]:gamma=1\.0$/u.test(filter))
  throw Error('Invalid FFmpeg identity filter');
 return structuredClone(config);
}
export function personaIdentityFfmpegFilter(identity){
 if(identity===undefined||identity===null||identity===false)return '';
 if(identity!==PERSONA_VISUAL_IDENTITY_ID)throw Error('Unknown visual identity ID');
 return getPersonaVisualIdentity().ffmpeg.videoFilter;
}
const cli=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(cli){
 const command=process.argv[2];
 if(command==='config')process.stdout.write(JSON.stringify(getPersonaVisualIdentity(),null,2)+'\n');
 else if(command==='ffmpeg-filter')process.stdout.write(personaIdentityFfmpegFilter(PERSONA_VISUAL_IDENTITY_ID)+'\n');
 else{console.error('Usage: node tools/persona-visual-identity.mjs [config|ffmpeg-filter]');process.exitCode=2}
}
