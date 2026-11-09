export type PersonaAiMediaJob={version:1;projectId:string;createdAt:string;status:'awaiting-author-review';model:string;variation:'cinematic'|'humor'|'intimate'|'unexpected';briefFingerprintSha256:string;briefSnapshot:string;outputPath:string;videoPath:string;qaPath:string;resultPath:string;sourceCount:number;sessionId?:string;distributionAllowed:false};
const sha=/^[a-f0-9]{64}$/i;
export function readPersonaAiMediaJob(value:unknown):PersonaAiMediaJob|null{
 const v=value as Partial<PersonaAiMediaJob>;
 if(!v||typeof v!=='object'||v.version!==1||typeof v.projectId!=='string'||!v.projectId||typeof v.createdAt!=='string'||!Number.isFinite(Date.parse(v.createdAt))||v.status!=='awaiting-author-review'||typeof v.model!=='string'||!v.model||!['cinematic','humor','intimate','unexpected'].includes(String(v.variation))||typeof v.briefFingerprintSha256!=='string'||!sha.test(v.briefFingerprintSha256)||typeof v.briefSnapshot!=='string'||!v.briefSnapshot||v.briefSnapshot.length>100000||typeof v.outputPath!=='string'||!v.outputPath||typeof v.videoPath!=='string'||!v.videoPath||typeof v.qaPath!=='string'||!v.qaPath||typeof v.resultPath!=='string'||!v.resultPath||!Number.isInteger(v.sourceCount)||v.sourceCount<2||v.sourceCount>12||v.distributionAllowed!==false||(v.sessionId!==undefined&&!/^[a-f0-9-]{36}$/.test(v.sessionId)))return null;
 return v as PersonaAiMediaJob;
}

