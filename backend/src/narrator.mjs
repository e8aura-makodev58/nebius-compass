/** Narration receives observable facts only. It cannot classify or mutate the incident. */
import { callChatTurn, roleDefaults, readProviderApiKey, safeModelMetadata } from './model-provider.mjs';
import { createObservableDTO } from './investigation-dto.mjs';
import { FIX_CATALOG } from './fix-catalog.mjs';
import { templateNarrative } from './investigation-records.mjs';
import { reportPolicy } from './report-policy.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';
const instruction = 'Write one short synthetic operator report from the supplied observable facts only. Return JSON {"narrative":"..."}. No causes, diagnoses, procedures, fixes, personnel skill claims, instructions, hazards not in the facts, or numbers except the supplied equipment name. Describe only the public symptom in plain language. Never change equipment, class, priority or staffing.';
export function validateNarrative(narrative, observable) {
  if (typeof narrative!=='string' || !narrative.trim() || narrative.length>600) return false;
  try { assertNoResponderSkill(narrative); } catch { return false; }
  if (/\b(?:caus\w*|diagnos\w*|skill\w*|expert\w*|probabilit\w*|effectiveness|success\s+rate|best\s+(?:responder|technician))\b/i.test(narrative)) return false;
  if (Object.values(FIX_CATALOG).flat().some((fix)=>narrative.toLowerCase().includes(fix.title.toLowerCase()))) return false;
  if (/\d/.test(narrative.toLowerCase().split(observable.equipmentName.toLowerCase()).join(''))) return false;
  const flags=reportPolicy(narrative);
  return !flags.hazard.length && !flags.injection.length && !flags.input;
}
export async function narrateIssue(state, issue, options={}) {
  const observable=createObservableDTO(state,issue,options.asOf ?? state.simulationState.simulationTime);
  const fallback=(reason)=>({narrative:templateNarrative(issue,{noisy:options.noisy===true}),narrativeSource:'template',reason,model:null});
  if (options.mode==='force-failure' || options.mode==='fixture') return fallback(options.mode==='fixture'?'fixture-template':'forced-failure');
  const provider=options.provider ?? 'nebius', defaults=roleDefaults(provider,'narrator');
  const now=options.now ?? (()=>performance.now()), started=now(), timeout=Math.min(options.timeoutMs ?? defaults.timeoutMs,30000);
  let timer;
  try {
    const turn=await Promise.race([
      Promise.resolve().then(()=>(options.callTurn ?? callChatTurn)({...options,role:'narrator',provider,modelId:options.modelId ?? defaults.modelId,reasoningEffort:options.reasoningEffort ?? defaults.reasoningEffort,
        apiKey:options.apiKey ?? readProviderApiKey(provider),fetchImpl:options.fetchImpl ?? fetch,timeoutMs:timeout,systemInstruction:instruction,userContent:JSON.stringify(observable),jsonSchemaName:'observable_report',jsonSchema:{type:'object',required:['narrative'],properties:{narrative:{type:'string',maxLength:600}},additionalProperties:false}})),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('deadline')),timeout);}),
    ]);
    const output=JSON.parse(turn.content);
    if (turn.error || turn.toolCalls?.length || now()-started>=timeout || !output || Object.keys(output).join()!=='narrative' || !validateNarrative(output.narrative,observable)) return fallback('validation-failed');
    return {narrative:output.narrative,narrativeSource:'simulated',reason:null,model:safeModelMetadata({...turn,latencyMs:Math.max(0,now()-started)})};
  } catch(error) { return fallback(error.code==='budget-exhausted'?'budget-exhausted':'provider-error'); }
  finally { clearTimeout(timer); }
}
