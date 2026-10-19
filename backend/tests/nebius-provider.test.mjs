import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { callChatTurn, callChatCompletion, readNebiusApiKey, nebiusBaseUrl, NEBIUS_DEFAULT_BASE_URL, roleDefaults, safeModelMetadata, NEBIUS_ROLE_DEFAULTS } from '../src/model-provider.mjs';
import { providerControlsFor, readProviderControlSettings } from '../src/provider-controls.mjs';
import { createProviderSettingsService } from '../src/provider-settings.mjs';
import { requestAgentRecommendation } from '../src/agent.mjs';
import { requestEventProposal } from '../src/event-planner.mjs';
import { requestFixRanking } from '../src/fix-ranking.mjs';
import { requestStaffingRanking } from '../src/staffing-ranking.mjs';
import { buildFixPacket } from '../src/fix-evidence.mjs';
import { createLiveSeed } from '../seed/live-simulation.mjs';
const tool = { type: 'function', function: { name: 'search_cases', parameters: { type: 'object', additionalProperties: false, required: ['limit'], properties: { limit: { type: 'integer', minimum: 1, maximum: 10 } } } } };
const capabilities = { toolCalling: 'native', thinking: 'omit', jsonMode: true };
const base = { provider: 'nebius', modelId: 'synthetic-nvidia-test-model', apiKey: 'synthetic-nebius-key', timeoutMs: 1000, systemInstruction: 'Read only', userContent: '{}', capabilities };
const response = (message, extra = {}) => ({ ok: true, headers: { get: name => name === 'x-request-id' ? 'req-synthetic' : null }, json: async () => ({ model: base.modelId, usage: { prompt_tokens: 12, completion_tokens: 7 }, choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], ...extra }) });
async function directory(t) { const dir = await mkdtemp(join(tmpdir(), 'compass-nebius-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

test('Nebius URL and key-file bootstrap fail closed and never guess a model', async t => {
  const dir = await directory(t), file = join(dir, 'key'); await writeFile(file, 'synthetic-file-key\n');
  assert.equal(nebiusBaseUrl({}), NEBIUS_DEFAULT_BASE_URL);
  assert.equal(nebiusBaseUrl({ NEBIUS_TOKEN_FACTORY_BASE_URL: 'https://example.test/v1/' }), 'https://example.test/v1');
  assert.equal(readNebiusApiKey({ NEBIUS_TOKEN_FACTORY_API_KEY_FILE: file }), 'synthetic-file-key');
  assert.equal(readNebiusApiKey({ NEBIUS_TOKEN_FACTORY_API_KEY: ' direct ', NEBIUS_TOKEN_FACTORY_API_KEY_FILE: file }), 'direct');
  assert.equal(readNebiusApiKey({ NEBIUS_TOKEN_FACTORY_API_KEY_FILE: join(dir,'missing') }), '');
  assert.equal(roleDefaults('nebius','compass',{}).modelId, NEBIUS_ROLE_DEFAULTS.compass.modelId);
  for (const role of ['event-planner','investigator','narrator']) assert.equal(roleDefaults('nebius',role,{}).modelId, NEBIUS_ROLE_DEFAULTS[role].modelId);
  let called = false;
  await assert.rejects(callChatTurn({ ...base, modelId: '', fetchImpl: async () => { called = true; } }), { code: 'model-not-configured' });
  await assert.rejects(callChatTurn({ ...base, apiKey: '', fetchImpl: async () => { called = true; } }), /NEBIUS_TOKEN_FACTORY_API_KEY/);
  assert.equal(called,false);
});
test('native Nebius turn validates arguments, auth, usage, request id and monotonic latency', async () => {
  let clock = 100, body;
  const turn = await callChatTurn({ ...base, tools: [tool], now: () => clock, fetchImpl: async (url, init) => {
    assert.equal(url, `${NEBIUS_DEFAULT_BASE_URL}/chat/completions`);
    assert.equal(init.headers.authorization, 'Bearer synthetic-nebius-key');
    body = JSON.parse(init.body); clock += 25;
    return response({ content: null, reasoning: 'do not retain this', tool_calls: [{ id: 'call-a', type: 'function', function: { name: 'search_cases', arguments: '{"limit":3}' } }] });
  }, controls: { run: async (_deadline, attempt) => attempt() } });
  assert.equal(body.response_format, undefined); assert.deepEqual(body.tools, [tool]);
  assert.equal(body.max_tokens,4096); assert.equal(body.reasoning_effort,undefined);
  assert.deepEqual(turn.toolCalls,[{ id: 'call-a', name: 'search_cases', arguments: { limit: 3 } }]);
  assert.deepEqual(turn.usage,{ promptTokens: 12, completionTokens: 7 }); assert.equal(turn.latencyMs,25);
  assert.equal(turn.providerRequestId,'req-synthetic'); assert.equal(turn.finishReason,'tool_calls');
  assert.equal(JSON.stringify(turn).includes('do not retain'),false);
});
test('JSON next-action protocol normalizes tool and final responses without native tools', async () => {
  for (const action of [{ action:'tool',id:'call-a',name:'search_cases',arguments:{limit:2} }, { action:'final',content:{ decision:'ABSTAIN' } }]) {
    const turn = await callChatTurn({ ...base, capabilities: { ...capabilities, toolCalling:'json-protocol' }, tools:[tool], fetchImpl: async (_url,init) => {
      const body=JSON.parse(init.body); assert.equal(body.tools,undefined); assert.match(body.messages[0].content,/search_cases/);
      return response({ content:JSON.stringify(action) });
    } });
    assert.equal(turn.error,undefined);
    if(action.action==='tool') assert.deepEqual(turn.toolCalls[0].arguments,{limit:2});
    else assert.deepEqual(JSON.parse(turn.content),{decision:'ABSTAIN'});
  }
});
test('malformed JSON, unknown tools, schema violations and duplicate calls return bounded errors', async () => {
  for (const call of [
    {id:'a',type:'function',function:{name:'invented',arguments:'{}'}},
    {id:'a',type:'function',function:{name:'search_cases',arguments:'{bad'}},
    {id:'a',type:'function',function:{name:'search_cases',arguments:'{"limit":11}'}},
    {id:'a',type:'function',function:{name:'search_cases',arguments:'{"limit":1,"private":true}'}},
    {id:'a',type:'function',function:{name:'search_cases',arguments:'{"limit":"1"}'}},
  ]) {
    const turn=await callChatTurn({...base,tools:[tool],fetchImpl:async()=>response({content:null,tool_calls:[call]})});
    assert.equal(turn.error.code,'invalid-tool-call');assert.deepEqual(turn.toolCalls,[]);
    assert.equal(JSON.stringify(turn).includes('private'),false);
  }
  const turn=await callChatTurn({...base,tools:[tool],capabilities:{...capabilities,toolCalling:'json-protocol'},fetchImpl:async()=>response({content:'not json'})});
  assert.equal(turn.error.code,'invalid-tool-call');
});
test('per-model thinking mapping omits unknown/default controls and maps verified modes', async () => {
  for (const [thinking, effort, expected] of [['omit','default',{}],['chat_template_kwargs.enable_thinking','off',{chat_template_kwargs:{enable_thinking:false}}],['reasoning_effort','on',{reasoning_effort:'high'}]]) {
    await callChatTurn({...base,reasoningEffort:effort,capabilities:{...capabilities,thinking,reasoningValues:{on:'high',off:'none'}},fetchImpl:async(_url,init)=>{
      const body=JSON.parse(init.body);for(const [key,value] of Object.entries(expected))assert.deepEqual(body[key],value);
      if(thinking==='omit'){assert.equal(body.reasoning_effort,undefined);assert.equal(body.chat_template_kwargs,undefined);}
      return response({content:'{}'});
    }});
  }
  await assert.rejects(callChatTurn({...base,reasoningEffort:'on',fetchImpl:async()=>{throw Error('must not call');}}),/not verified/);
});
test('legacy JSON completion retains return shape and reports only bounded metadata', async () => {
  let metadata;
  const value=await callChatCompletion({...base,onMetadata:row=>{metadata=row;},fetchImpl:async()=>response({content:'{"ok":true}',reasoning:'private trace'})});
  assert.deepEqual(value,{ok:true});assert.equal(metadata.usage.promptTokens,12);
  assert.deepEqual(safeModelMetadata({usage:{promptTokens:-1,completionTokens:NaN},latencyMs:-1,prompt:'secret'}),{usage:{}});
});
test('controls isolate providers on the same transport, with independent environment budgets', async () => {
  const fetchImpl=async()=>{};
  const env={AMD_TOKEN_FACTORY_APP_RPM:'7',NEBIUS_TOKEN_FACTORY_APP_RPM:'20',NEBIUS_TOKEN_FACTORY_BREAKER_THRESHOLD:'1'};
  const amd=providerControlsFor(fetchImpl,env,'amd'),nebius=providerControlsFor(fetchImpl,env,'nebius');
  assert.notEqual(amd,nebius);assert.equal(amd.config.rpm,7);assert.equal(nebius.config.rpm,20);
  assert.equal(readProviderControlSettings({},'nebius').concurrency,2);
  await assert.rejects(nebius.run(performance.now()+1000,async()=>{throw Object.assign(Error('down'),{serviceFailure:true});}));
  assert.equal(nebius.snapshot().state,'open');assert.equal(amd.snapshot().state,'closed');
  assert.equal(await amd.run(performance.now()+1000,async()=>42),42);
});
test('fresh settings default to unconfigured Nebius, with independently persisted roles and provider catalogs', async t => {
  const filePath=join(await directory(t),'settings.json');
  const environment={NEBIUS_TOKEN_FACTORY_REASONING_EFFORT:'default',NEBIUS_TOKEN_FACTORY_EVENT_PLANNER_REASONING_EFFORT:'default',NEBIUS_TOKEN_FACTORY_INVESTIGATOR_REASONING_EFFORT:'default',NEBIUS_TOKEN_FACTORY_NARRATOR_REASONING_EFFORT:'default',NEBIUS_TOKEN_FACTORY_MODEL:'synthetic-ranker',NEBIUS_TOKEN_FACTORY_INVESTIGATOR_MODEL:'synthetic-investigator',NEBIUS_TOKEN_FACTORY_NARRATOR_MODEL:'synthetic-narrator',NEBIUS_TOKEN_FACTORY_EVENT_PLANNER_MODEL:'synthetic-planner'};
  const service=createProviderSettingsService({filePath,environment,apiKeys:{amd:'amd-key',nebius:'nebius-key'},fetchImpl:async(url)=>({ok:true,json:async()=>({data:[{id:url.includes('nebius')?'synthetic-ranker':'MiMo-V2.6-Flash'}]})})});
  const snapshot=await service.snapshot();assert.equal(snapshot.provider,'nebius');assert.equal(Object.keys(snapshot.roles).length,5);
  assert.equal((await service.requestOptions('investigator')).modelId,'synthetic-investigator');
  assert.equal((await service.requestOptions('investigator')).timeoutMs,120000);
  await service.refreshModels('amd');
  assert.equal((await service.requestOptions('investigator')).modelId,'synthetic-investigator','AMD discovery must not invalidate Nebius');
  await service.update({provider:'nebius',role:'narrator',modelId:'synthetic-narrator-updated',reasoningEffort:'default',timeoutMs:22000});
  const reloaded=createProviderSettingsService({filePath,environment:{},apiKeys:{}});
  assert.equal((await reloaded.requestOptions('narrator')).modelId,'synthetic-narrator-updated');
  assert.equal((await reloaded.requestOptions('narrator')).timeoutMs,22000);
  assert.equal((await reloaded.requestOptions('compass')).modelId,'synthetic-ranker');
  await service.updateCredential({provider:'nebius',apiKey:'saved-secret'});
  const view=await service.snapshot();assert.equal(JSON.stringify(view).includes('saved-secret'),false);
  assert.equal((await stat(join(filePath,'..','provider-credentials.json'))).mode & 0o777,0o600);
  assert.equal((await service.requestOptions()).apiKey,'saved-secret');
  const bytes=await readFile(filePath,'utf8');assert.equal(bytes.includes('saved-secret'),false);
});
test('saved AMD settings and credentials load byte-unchanged while fresh Nebius fails closed', async t => {
  const dir=await directory(t),filePath=join(dir,'settings.json');
  const bytes=JSON.stringify({provider:'amd',models:{amd:{modelId:'saved-amd',reasoningEffort:'low'}}});await writeFile(filePath,bytes);
  const service=createProviderSettingsService({filePath,apiKeys:{amd:'old-key'},environment:{}});
  assert.equal((await service.requestOptions()).provider,'amd');assert.equal((await service.requestOptions()).modelId,'saved-amd');assert.equal(await readFile(filePath,'utf8'),bytes);
  const fresh=createProviderSettingsService({filePath:join(dir,'fresh.json'),apiKeys:{},environment:{}});
  assert.equal((await fresh.snapshot()).provider,'nebius');
  for(const role of ['compass','event-planner','investigator','narrator'])assert.equal((await fresh.requestOptions(role)).modelId,NEBIUS_ROLE_DEFAULTS[role].modelId);
  const options={mode:'live',provider:'nebius',modelId:'',apiKey:'fake',fetchImpl:async()=>{throw Error('unexpected network');}};
  assert.equal((await requestAgentRecommendation({},options)).reason,'model-not-configured');
  assert.equal((await requestEventProposal({},options)).reason,'model-not-configured');
});
test('existing live ranking uses stubbed global fetch and retains Nebius metadata without an injected transport', async t => {
  const state=createLiveSeed(),issue=state.issues.find(row=>row.symptom),packet=buildFixPacket(state,issue.id);
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async(url)=>{assert.match(url,/tokenfactory.nebius.com/);return response({content:JSON.stringify({schemaVersion:'1.0',rankedFixes:packet.candidates.map((row,i)=>({fixId:row.fixId,rank:i+1,rationale:'Observed evidence supports this procedure.'}))})});};
  const result=await requestFixRanking(packet,{mode:'live',provider:'nebius',modelId:base.modelId,reasoningEffort:'default',apiKey:'fake'});
  assert.equal(result.status,'ok');assert.equal(result.modelInfo.provider,'nebius');assert.equal(result.modelInfo.usage.promptTokens,12);
  assert.ok(result.modelInfo.latencyMs>=0);
  assert.equal((await requestStaffingRanking({candidates:[]},{mode:'live',provider:'nebius',modelId:'',apiKey:'fake'})).reason,'model-not-configured');
});

test('settings reject an empty confirmed catalog and snapshots cannot mutate provider pins', async t => {
  const filePath=join(await directory(t),'settings.json');
  const service=createProviderSettingsService({filePath,apiKeys:{nebius:'fake'},environment:{NEBIUS_TOKEN_FACTORY_MODEL:'test-model'},fetchImpl:async()=>({ok:true,json:async()=>({data:[]})})});
  const view=await service.snapshot();view.modelsByProvider.nebius.compass.modelId='tampered';
  assert.equal((await service.requestOptions()).modelId,'test-model');
  await service.refreshModels();
  assert.equal((await service.requestOptions()).modelId,'');
  await assert.rejects(service.update({provider:'nebius',role:'compass',modelId:'invented',reasoningEffort:'default'}),/not available/);
});

test('recommendation persistence keeps Nebius source and bounded usage metadata', async () => {
  const {createFixRecommendationService}=await import('../src/fix-recommendation-service.mjs');
  const state=createLiveSeed();const store={snapshot:async()=>structuredClone(state),mutate:async(_label,fn)=>({result:await fn(state)})};
  const service=createFixRecommendationService(store,{requestRanking:async packet=>({status:'ok',modelInfo:{provider:'nebius',modelId:'synthetic',mode:'live',latencyMs:12,usage:{promptTokens:4,completionTokens:3},prompt:'private content'},result:{schemaVersion:'1.0',rankedFixes:packet.candidates.map((row,i)=>({fixId:row.fixId,rank:i+1,rationale:'Observed evidence supports this action.'}))}})});
  await service.recommend('ISS-104');const record=state.issues.find(row=>row.id==='ISS-104').fixRecommendation;
  assert.equal(record.source,'NEBIUS_MODEL');assert.deepEqual(record.modelInfo.usage,{promptTokens:4,completionTokens:3});
  assert.equal(record.modelInfo.prompt,undefined);
});

test('verified N0 role defaults map native tools and thinking through the capability table', async () => {
  for(const role of ['compass','event-planner','investigator','narrator']) {
    const defaults=roleDefaults('nebius',role,{});
    await callChatTurn({provider:'nebius',...defaults,apiKey:'fake',tools:[tool],fetchImpl:async(_url,init)=>{
      const body=JSON.parse(init.body);
      assert.deepEqual(body.chat_template_kwargs,role === 'investigator' ? undefined : {enable_thinking:false});
      assert.equal(body.reasoning_effort,undefined);assert.equal(body.tool_choice,'auto');assert.deepEqual(body.tools,[tool]);assert.equal(body.max_tokens,4096);
      return response({content:'{}',reasoning_content:'never retain this'});
    }});
  }
  assert.equal(roleDefaults('nebius','compass',{NEBIUS_TOKEN_FACTORY_MODEL:''}).modelId,NEBIUS_ROLE_DEFAULTS.compass.modelId);
});

test('simultaneous provider credential saves persist both keys and survive reload', async t => {
  const filePath=join(await directory(t),'settings.json');
  const service=createProviderSettingsService({filePath,environment:{},apiKeys:{}});
  await Promise.all([service.updateCredential({provider:'amd',apiKey:'synthetic-amd-key'}),service.updateCredential({provider:'nebius',apiKey:'synthetic-nebius-key'})]);
  const saved=JSON.parse(await readFile(join(filePath,'..','provider-credentials.json'),'utf8'));
  assert.deepEqual(saved,{amd:'synthetic-amd-key',nebius:'synthetic-nebius-key'});
  const reloaded=createProviderSettingsService({filePath,environment:{},apiKeys:{}});
  const snapshot=await reloaded.snapshot();assert.equal(snapshot.providers.every(row=>row.credentialConfigured),true);
  assert.equal(JSON.stringify(snapshot).includes('synthetic-nebius-key'),false);
  await Promise.all([service.removeCredential('amd'),service.updateCredential({provider:'nebius',apiKey:'replacement'})]);
  assert.deepEqual(JSON.parse(await readFile(join(filePath,'..','provider-credentials.json'),'utf8')),{nebius:'replacement'});
});
