// Coalesce new queue signals while a slow desktop engine invocation is active.
// A signal received during a drain must never be silently lost.
export function createCoalescedDrain(processBatch){
 if(typeof processBatch!=='function')throw Error('invalid_drain_handler');
 let active=null,requested=false;
 async function signal(){
  requested=true;
  if(active)return active;
  const running=(async()=>{
   while(requested){
    requested=false;
    await processBatch();
   }
  })();
  active=running;
  try{await running;}
  finally{
   if(active===running)active=null;
   // Schedule a fresh drain after any signal in the final microtask window.
   if(requested)queueMicrotask(()=>{void signal();});
  }
 }
 return signal;
}
