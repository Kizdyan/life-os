import {homedir} from 'node:os';
import {join,resolve} from 'node:path';

export const PRODUCTION_LUT_MIX=0.60;

export function personaMediaPaths(env=process.env){
 const root=resolve(env.PERSONA_MEDIA_ROOT?.trim()||join(homedir(),'Documents','Persona'));
 return {root,humbleLut:join(root,'luts','IWLTBAP Humble - Standard.cube')};
}
