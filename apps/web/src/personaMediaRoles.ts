export type InferredRole = "primary_take"|"alternate_take"|"broll"|"photo"|"audio"|"reference_other";
export type MediaKind = "take"|"photo"|"broll"|"audio"|"additional";
export type MediaOverride = "auto"|InferredRole;
export interface MediaClassification {role:InferredRole; kind:MediaKind; explanation:string; confidence:"high"|"medium"|"low";}
const RE_BROLL=/(?:b[\s_-]?roll|б[\s_-]?ролл|врезк|детал|перебив|atmos|cutaway|insert|scenery|фон|establish)/i;
const RE_REFERENCE=/(?:reference|references|референс|ref[_-]|пример|inspiration|moodboard)/i;
export function inferMediaRole(file:Pick<File,"name"|"type">,
  existing:ReadonlyArray<{role?:string;kind?:string}>,override:MediaOverride="auto"):MediaClassification{
 const name=file.name||"";
 const type=(file.type||"").toLowerCase();
 let role:InferredRole;
 let confidence:MediaClassification["confidence"]="medium";
 let explanation="";
 if(override!=="auto"){
  role=override;confidence="high";explanation="Пользователь уточнил тип материала";
 }else if(RE_REFERENCE.test(name)){
  role="reference_other";confidence="medium";explanation="Имя файла указывает на референс";
 }else if(type.startsWith("image/")||/\.(?:jpg|jpeg|png|heic|heif|webp)$/i.test(name)){
  role="photo";confidence="high";explanation="Определено по формату фотографии";
 }else if(type.startsWith("audio/")||/\.(?:m4a|wav|mp3|aiff|flac|aac)$/i.test(name)){
  role="audio";confidence="high";explanation="Определено по формату отдельного звука";
 }else if(type.startsWith("video/")||/\.(?:mov|mp4|m4v|avi|webm)$/i.test(name)){
  if(RE_BROLL.test(name)){role="broll";confidence="medium";explanation="Имя файла похоже на перебивку или B-roll";}
  else {
   role=existing.some(item=>item.role==="primary_take"||item.kind==="take")?"alternate_take":"primary_take";
   confidence="low";
   explanation=role==="primary_take"?"Первое видео сессии — вероятно основной дубль":"Следующее видео сессии — вероятно дополнительный дубль";
  }
 }else {role="reference_other";confidence="low";explanation="Прочий файл, ожидает проверки";}
 const kind:MediaKind=role==="primary_take"||role==="alternate_take"?"take":role==="reference_other"?"additional":role;
 return {role,kind,confidence,explanation};
}
export const roleLabel=(role:InferredRole)=>({
 primary_take:"Основной дубль",alternate_take:"Другой дубль",broll:"B-roll",
 photo:"Фото",audio:"Отдельный звук",reference_other:"Референс / другое"
})[role];
