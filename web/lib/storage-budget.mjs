// Conservative reservations for optional work, not a replacement for Firebase's usage meter.
export async function reserveStorageBudget(database,{reads=0,writes=0,kind="discovery"}={}) {
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const ref=database.doc(`snaglySystem/storage-budget-${day}`);
  return database.runTransaction(async tx=>{
    const doc=await tx.get(ref),used=doc.data()||{reads:0,writes:0};
    if((used.reads||0)+reads>30000 || (used.writes||0)+writes>24000)
      return {allowed:false,reason:"Optional background work paused to leave database allowance for browsing and saving. It resumes after the daily reset."};
    tx.set(ref,{reads:(used.reads||0)+reads,writes:(used.writes||0)+writes,lastKind:kind,updatedAt:new Date().toISOString()});
    return {allowed:true,reads,writes};
  },{maxAttempts:3});
}
