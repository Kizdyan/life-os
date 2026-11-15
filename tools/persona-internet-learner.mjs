const grades={warm:'colorbalance=rs=0.025:bs=-0.025,',cool:'colorbalance=rs=-0.025:bs=0.025,',neutral:''};

export function parseLearnedRules(rules){
 const {subtitles,colorGrade,editing}=rules??{};
 const preset=subtitles?.preset, color=subtitles?.color, sizePx1080=subtitles?.sizePx1080;
 const temperature=colorGrade?.temperature, hold=editing?.medianShotSec;
 if(rules?.version!==1||rules.provider!=='openrouter'||typeof rules.sourceUrl!=='string'||
    !['cinematic','dynamic-interview','unknown'].includes(preset)||
    (color!==null&&(typeof color!=='string'||!/^#[\da-f]{6}$/i.test(color)))||
    (sizePx1080!==null&&(!Number.isInteger(sizePx1080)||sizePx1080<36||sizePx1080>150))||
    !Object.hasOwn(grades,temperature)||!Number.isFinite(hold)||hold<=0||hold>180)
  throw Error('Некорректные правила референса.');
 return {
  preset:preset==='unknown'?'cinematic':preset,
  typography:{...(color?{color:color.toUpperCase()}:{}),...(sizePx1080?{sizePx1080}:{})},
  grade:grades[temperature],hookSeconds:Math.max(1.2,Math.min(3.2,hold)),
 };
}
