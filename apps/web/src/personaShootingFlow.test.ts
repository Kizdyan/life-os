import{describe,expect,it}from'vitest';import{attachShootingBrief,completePersonaShooting,mergePersonaIdeas,readPersonaIdeas,writePersonaIdeas,type PersonaIdea,type PersonaShootingBrief}from'./personaIdeaState';
const idea:PersonaIdea={id:'idea-1',title:'Backstage',angle:'За минуту до сцены',format:'reel',score:96,status:'candidate'};
const brief:PersonaShootingBrief={title:'Backstage',orientation:'vertical',resolution:'4k',fps:30,audio:'Петличка',lighting:'Мягкий свет',background:'Кулисы',shots:[{id:'hook',purpose:'Хук',shotSize:'medium-close',angle:'уровень глаз',cameraPosition:'штатив',cameraHeight:'уровень глаз',distance:'1 м',composition:'верхняя треть',movement:'статично',durationSeconds:6,takes:2,action:'реплика в камеру',dialogue:'До выхода минута.',bRoll:false,bRollInstruction:null},{id:'broll',purpose:'Деталь',shotSize:'detail',angle:'сверху',cameraPosition:'в руках',cameraHeight:'над реквизитом',distance:'30 см',composition:'предмет в центре',movement:'медленный проход',durationSeconds:5,takes:2,action:'снять реквизит',dialogue:null,bRoll:true,bRollInstruction:'Сними два прохода по реквизиту.'}],references:[]};
describe('Persona idea → shooting → saved result',()=>{it('persists the selected idea, full brief and completed iPhone shooting result end-to-end',()=>{let ideas=attachShootingBrief([idea],'idea-1',brief,'2026-10-06T10:00:00.000Z');ideas=completePersonaShooting(ideas,'idea-1',{completedAt:'2026-10-06T10:30:00.000Z',shotIds:['hook','broll']});expect(ideas[0].shootingResult).toEqual({status:'completed',completedAt:'2026-10-06T10:30:00.000Z',shotIds:['hook','broll']});const bag=new Map<string,string>();const storage={getItem:(k:string)=>bag.get(k)??null,setItem:(k:string,v:string)=>void bag.set(k,v)};writePersonaIdeas(storage,ideas);const restored=readPersonaIdeas(storage);expect(restored[0].shootingBrief?.shots).toHaveLength(2);expect(restored[0].shootingResult?.shotIds).toEqual(['hook','broll'])})});

describe('Persona shooting plans belong to the approved content, not recycled IDs', () => {
  const approved: PersonaIdea = {
    ...idea,
    score: 92,
    angle: 'One precise backstage scene',
    hook: 'This happens behind the curtain',
    script: 'A particular 20-second performance moment',
    soloPlan: 'Phone at eye level',
    estimatedDurationSeconds: 22,
  };
  const previous = attachShootingBrief([approved], approved.id, brief)[0];

  it('retains an already-reviewed shooting brief for unchanged approved content', () => {
    const [merged] = mergePersonaIdeas([approved], [previous]);
    expect(merged.shootingBrief).toEqual(brief);
  });

  it('rejects stale briefs when the script changes under the same candidate ID', () => {
    const [merged] = mergePersonaIdeas([{ ...approved, script: 'A different script' }], [previous]);
    expect(merged.shootingBrief).toBeUndefined();
  });

  it('does not attach a previous scene to a new idea reusing the same model-generated ID', () => {
    const [merged] = mergePersonaIdeas([{ ...approved, title: 'Different scene', angle: 'New subject' }], [previous]);
    expect(merged.shootingBrief).toBeUndefined();
    expect(merged.status).toBe(approved.status);
  });

  it('discards a completed shooting result when content revisions require a fresh brief', () => {
    const completed = completePersonaShooting([previous], previous.id,
      { completedAt: '2026-10-08T12:00:00Z', shotIds: ['hook'] })[0];
    const [merged] = mergePersonaIdeas([{ ...approved, hook: 'Different hook' }], [completed]);
    expect(merged.shootingResult).toBeUndefined();
  });
});
