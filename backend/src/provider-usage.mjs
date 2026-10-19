/** Deployment-wide token ledger. Only allowlisted aggregate fields cross this boundary. */
import {mkdir,readFile,open,rename} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {compassDataPath} from './data-root.mjs';
import {logEvent} from './application-log-store.mjs';

// USD per million tokens; docs/nebius/05_TOKEN_FACTORY_FACTS.md, verified 2026-10-19.
export const MODEL_PRICES=Object.freeze({nebius:Object.freeze({
  'nvidia/Nemotron-3-Ultra-550b-a55b':[1,3],
  'nvidia/nemotron-3-super-120b-a12b':[.3,.9],
  'nvidia/Nemotron-3.5-Super-VL':[.3,.9],
  'nvidia/Nemotron-3_5-Lightning':[.06,.24],
  'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B':[.06,.24],
})});
// Current prices are exact multiples of one nanodollar per token.
const usd=(value)=>Math.round(value*1e9)/1e9;
const roles=new Set(['compass','event-planner','investigator','narrator','assistant']);
const tokens=(value)=>Number.isSafeInteger(value)&&value>=0?value:null;
const modelName=(value)=>typeof value==='string'&&/^[\w./:-]{1,200}$/.test(value)?value:'unknown-model';
const utcDay=(time)=>new Date(time).toISOString().slice(0,10);
const empty=(day)=>({day,calls:0,promptTokens:0,completionTokens:0,knownCostUsd:0,estimatedCostUsd:0,unpricedCalls:0,byRole:[],byModel:[]});
export function dailyBudget(environment=process.env){
  const raw=environment.COMPASS_DAILY_BUDGET_USD;
  const value=raw===undefined||raw.trim?.()===''?0:Number(raw);
  if(!Number.isFinite(value)||value<0)throw new Error('COMPASS_DAILY_BUDGET_USD must be a nonnegative number');
  return value;
}
function totals(rows){
  const total={calls:0,promptTokens:0,completionTokens:0,knownCostUsd:0,estimatedCostUsd:0,unpricedCalls:0};
  for(const row of rows){total.calls+=row.calls;total.promptTokens+=row.promptTokens;total.completionTokens+=row.completionTokens;
    total.unpricedCalls+=row.unpricedCalls ?? (row.estimatedCostUsd===null?row.calls:0);total.knownCostUsd+=row.knownCostUsd ?? row.estimatedCostUsd ?? 0;}
  total.knownCostUsd=usd(total.knownCostUsd);
  total.estimatedCostUsd=total.unpricedCalls?null:total.knownCostUsd;
  return total;
}
function summarize(day,rows){
  const byRole=[...new Set(rows.map((row)=>row.role))].sort().map((role)=>({role,...totals(rows.filter((row)=>row.role===role))}));
  return {...empty(day),...totals(rows),byRole,byModel:rows.map((row)=>({...row}))};
}
/** filePath:null is a deliberately in-memory test seam; production defaults to the data root. */
export function createProviderUsageLedger({filePath=compassDataPath('provider-usage.json'),environment=process.env,now=()=>Date.now(),logger=console}={}){
  const budgetUsd=dailyBudget(environment);let state={version:1,days:[]},loaded=false,dirty=false,chain=Promise.resolve();
  const queue=(fn)=>{const next=chain.catch(()=>{}).then(fn);chain=next.catch(()=>{});return next;};
  async function load(){
    if(loaded)return;
    if(filePath){try{
      const parsed=JSON.parse(await readFile(filePath,'utf8'));
      if(parsed.version!==1||!Array.isArray(parsed.days))throw Error('Invalid usage ledger');
      for(const day of parsed.days){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(day.day)||!Array.isArray(day.rows))throw Error('Invalid usage ledger');
        for(const row of day.rows)if(!['amd','nebius'].includes(row.provider)||!roles.has(row.role)||modelName(row.model)!==row.model||![row.calls,row.promptTokens,row.completionTokens].every((value)=>tokens(value)!==null)||!(row.estimatedCostUsd===null||Number.isFinite(row.estimatedCostUsd)&&row.estimatedCostUsd>=0)||(row.knownCostUsd!==undefined&&(!Number.isFinite(row.knownCostUsd)||row.knownCostUsd<0))||(row.unpricedCalls!==undefined&&(tokens(row.unpricedCalls)===null||row.unpricedCalls>row.calls)))throw Error('Invalid usage ledger');
      }
      // Reconstruct rather than retaining any unexpected keys from a damaged file.
      state={version:1,days:parsed.days.map((day)=>({day:day.day,budgetLogged:day.budgetLogged===true,rows:day.rows.map(({provider,model,role,calls,promptTokens,completionTokens,estimatedCostUsd,knownCostUsd,unpricedCalls})=>({provider,model,role,calls,promptTokens,completionTokens,estimatedCostUsd,knownCostUsd:knownCostUsd ?? estimatedCostUsd ?? 0,unpricedCalls:unpricedCalls ?? (estimatedCostUsd===null?calls:0)}))}))};
    }catch(error){if(error.code!=='ENOENT')throw Object.assign(Error('Usage ledger is unavailable'),{code:'usage-ledger-unavailable'});}}
    loaded=true;
  }
  function prune(){const cutoff=utcDay(now()-119*86400000);const days=state.days.filter((day)=>day.day>=cutoff).sort((a,b)=>a.day.localeCompare(b.day)).slice(-120);if(days.length!==state.days.length){state.days=days;dirty=true;}}
  async function persist(){
    if(!dirty)return;
    if(filePath){
      await mkdir(dirname(filePath),{recursive:true,mode:0o700});
      const temp=`${filePath}.${process.pid}.${randomUUID()}.tmp`,handle=await open(temp,'w',0o600);
      try{await handle.writeFile(JSON.stringify(state)+'\n');await handle.sync();}finally{await handle.close();}
      await rename(temp,filePath);
      const directory=await open(dirname(filePath),'r');try{await directory.sync();}finally{await directory.close();}
    }
    dirty=false;
  }
  function today(){const day=utcDay(now());return state.days.find((row)=>row.day===day);}
  function exhausted(){return budgetUsd>0&&totals(today()?.rows??[]).knownCostUsd>=budgetUsd;}
  async function logExhaustion(row=today()){
    if(!row||row.budgetLogged||budgetUsd<=0||totals(row.rows).knownCostUsd<budgetUsd)return;
    row.budgetLogged=true;dirty=true;await persist();logEvent(logger,'provider_budget_exhausted',{day:row.day,budgetUsd,estimatedCostUsd:totals(row.rows).knownCostUsd});
  }
  return {
    async beforeStart(){return queue(async()=>{await load();prune();await persist();await logExhaustion();if(exhausted())throw Object.assign(Error('Daily provider budget exhausted'),{code:'budget-exhausted'});});},
    async record({provider,model,role='compass',usage}){return queue(async()=>{
      const promptTokens=tokens(usage?.prompt_tokens),completionTokens=tokens(usage?.completion_tokens);
      if(promptTokens===null&&completionTokens===null)return;
      await load();prune();const day=utcDay(now());let bucket=today();if(!bucket){bucket={day,budgetLogged:false,rows:[]};state.days.push(bucket);}
      provider=['amd','nebius'].includes(provider)?provider:'amd';model=modelName(model);role=roles.has(role)?role:'compass';
      let row=bucket.rows.find((row)=>row.provider===provider&&row.model===model&&row.role===role);
      const prices=MODEL_PRICES[provider];const price=prices&&Object.hasOwn(prices,model)?prices[model]:null;
      // A partial token report cannot support a complete cost estimate.
      const cost=price&&promptTokens!==null&&completionTokens!==null?(promptTokens*price[0]+completionTokens*price[1])/1e6:null;
      if(!row){row={provider,model,role,calls:0,promptTokens:0,completionTokens:0,estimatedCostUsd:0,knownCostUsd:0,unpricedCalls:0};bucket.rows.push(row);}
      row.calls++;row.promptTokens+=promptTokens??0;row.completionTokens+=completionTokens??0;
      if(cost===null)row.unpricedCalls++;else row.knownCostUsd=usd(row.knownCostUsd+cost);
      row.estimatedCostUsd=row.unpricedCalls?null:row.knownCostUsd;
      bucket.rows.sort((a,b)=>`${a.provider}/${a.model}/${a.role}`.localeCompare(`${b.provider}/${b.model}/${b.role}`));dirty=true;
      await persist();await logExhaustion(bucket);
    });},
    async snapshot(){return queue(async()=>{await load();prune();const epoch=now(),day=utcDay(epoch),last7Days=[];
      for(let ago=6;ago>=0;ago--){const date=utcDay(epoch-ago*86400000);last7Days.push(summarize(date,state.days.find((row)=>row.day===date)?.rows??[]));}
      const current=summarize(day,state.days.find((row)=>row.day===day)?.rows??[]);
      return {today:current,last7Days,budgetUsd,exhausted:budgetUsd>0&&current.knownCostUsd>=budgetUsd};
    });},
  };
}
let defaultLedger;
export function providerUsageLedger({logger}={}){
  // Node's hermetic test workers must never create production files. Tests inject a
  // scratch file to exercise persistence; the shared default remains memory-only there.
  const filePath=process.env.NODE_TEST_CONTEXT?null:process.env.NODE_ENV==='test'&&process.env.COMPASS_CONTROL_ROOMS_DATA_ROOT?join(process.env.COMPASS_CONTROL_ROOMS_DATA_ROOT,'provider-usage.json'):compassDataPath('provider-usage.json');
  return defaultLedger??=createProviderUsageLedger({filePath,...(logger?{logger}:{})});
}
