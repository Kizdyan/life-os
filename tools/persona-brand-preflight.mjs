/** Standalone metadata preflight. Not wired into production or rendered-image QA. */
export function brandPreflight(profile,draft){
 const errors=[], warnings=[];
 if(!profile||profile.id!=="old-money-editorial") return {status:"FAIL",errors:["Unknown brand profile"],warnings};
 if(!draft||typeof draft!=="object") return {status:"FAIL",errors:["Missing draft"],warnings};
 if(draft.brandId!==profile.id) errors.push("Brand profile mismatch");
 if(draft.themeFirst!==false) errors.push("Brand-first art direction must be explicit");
 if(!Array.isArray(draft.slides)||!draft.slides.length) errors.push("No slides");
 else{
  if(!draft.slides[0]?.context?.trim()) errors.push("Cover needs context for new viewer");
  draft.slides.forEach((s,i)=>{
   if(!s||typeof s!=="object"){errors.push(`Slide ${i+1}: invalid record`);return}
   if(s.authorSignature!==false)errors.push(`Slide ${i+1}: author signature must be absent`);
   if(s.decorativeNumber!==false)errors.push(`Slide ${i+1}: decorative number must be absent`);
   if(!Object.hasOwn(profile.candidates.palettes,s.palette))errors.push(`Slide ${i+1}: palette outside candidate family`);
   if(!profile.candidates.layouts.includes(s.layout))errors.push(`Slide ${i+1}: layout outside candidate family`);
  });
  if(draft.slides.length>1&&draft.slides.every(s=>s?.layout==="typographic-pause"))warnings.push("All slides are typographic pauses; review visual variety");
 }
 if(profile.status!=="approved")warnings.push("Exact brand tokens are not approved");
 return {status:errors.length?"FAIL":"REVIEW_REQUIRED",errors,warnings};
}
