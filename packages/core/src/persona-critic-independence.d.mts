export type CriticFamily='openai'|'anthropic'|'google'|'deepseek'|'qwen'|'x-ai'|'mistral';
export function criticFamily(model:unknown):CriticFamily|null;
export function independentCritic(researchModel:unknown,reviewModel:unknown):{authorFamily:CriticFamily|null;reviewerFamily:CriticFamily|null;eligible:boolean};
export function chooseIndependentCritic<T extends {model:string;verified:boolean;available:boolean;sourceFetch:boolean}>(researchModel:unknown,candidates:T[]):T|null;
