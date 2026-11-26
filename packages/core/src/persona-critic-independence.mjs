/** A different model name does not establish independence. Only explicit known developer
 * namespaces are accepted; aliases, auto-routing and unknown families abstain. */
export function criticFamily(model){
 if(typeof model!=='string')return null;
 const m=model.trim().toLowerCase();
 if(/^openai\/(?:gpt-|o[134](?:-|$))/.test(m))return 'openai';
 if(/^anthropic\/claude-/.test(m))return 'anthropic';
 if(/^google\/gemini-/.test(m))return 'google';
 if(/^deepseek\/deepseek-/.test(m))return 'deepseek';
 if(/^(?:qwen|alibaba)\/qwen[0-9-]/.test(m))return 'qwen';
 if(/^x-ai\/grok-/.test(m))return 'x-ai';
 if(/^mistralai\/mistral-/.test(m))return 'mistral';
 return null;
}
export function independentCritic(researchModel,reviewModel){
 const authorFamily=criticFamily(researchModel),reviewerFamily=criticFamily(reviewModel);
 return {authorFamily,reviewerFamily,eligible:Boolean(authorFamily&&reviewerFamily&&reviewerFamily!=='openai'&&reviewerFamily!==authorFamily)};
}
/** Select only from explicitly configured and capability-tested candidates.
 * No automatic paid retry, no substitution with the author's family. */
export function chooseIndependentCritic(researchModel,candidates){
 if(!Array.isArray(candidates))return null;
 return candidates.find(c=>c?.verified===true&&c?.available===true&&c?.sourceFetch===true&&independentCritic(researchModel,c.model).eligible)??null;
}
