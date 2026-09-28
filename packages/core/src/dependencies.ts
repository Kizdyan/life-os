export interface Dependency{taskId:string;dependsOnTaskId:string;active:boolean;}
export function blockedTaskIds(deps:Dependency[],completed:Set<string>):Set<string>{
 const blocked=new Set<string>();for(const d of deps)if(d.active&&!completed.has(d.dependsOnTaskId))blocked.add(d.taskId);return blocked;
}
