/** Reproducible synthetic workflow seed; no recorded model responses or live calls. */
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scenarioState, memoryInvestigationStore } from '../src/investigation-eval.mjs';
import { createInvestigationService } from '../src/investigation-service.mjs';
import { generateDemoHistory } from '../../scripts/generate-demo-history.mjs';
import { buildInvestigationAnalytics } from '../src/investigation-analytics.mjs';
const repository=fileURLToPath(new URL('../../',import.meta.url));
export async function createInvestigationDataset(out=join(repository,'backend/seed/investigation-lifecycle.json')) {
  const {scenarios}=JSON.parse(await readFile(new URL('../../fixtures/investigation/scenarios.json',import.meta.url)));
  const scenario=scenarios[0],store=memoryInvestigationStore(scenarioState(scenario));
  const service=createInvestigationService(store,{rankingOptions:{mode:'fixture'},investigatorOptions:{mode:'fixture',now:()=>0}});
  const {reportId}=await service.submit(scenario.input);await service.runNext();
  const report=await service.getReport(reportId);
  const confirmed=await service.confirm(reportId,{...scenario.expected.interpretation,expectedRevision:report.revision});await service.runNext();
  const ready=await service.getInvestigation(confirmed.investigationId);
  await service.decide(ready.id,{expectedRevision:ready.revision,responderId:ready.responders[0].responderId,fixId:ready.fixes[0].fixId,confirmedPrerequisites:[]},'approve');
  const abstained=await service.submit({narrative:'   '});
  const escalated=await service.submit({equipmentId:'EQ-46',narrative:'Station 46 has smoke near the transfer endpoint.'});
  const initial=await store.snapshot();
  // Disclosed synthetic operator actions have pinned audit timestamps for reproducibility.
  for(const event of initial.operationalEvents)event.createdAtRealTime=event.simulationTimestamp;
  await mkdir(join(repository,'.cache'),{recursive:true});
  const directory=await mkdtemp(join(repository,'.cache/investigation-dataset-'));
  try {
    const from=join(directory,'from.json');await writeFile(from,JSON.stringify(initial));
    const generation=await generateDemoHistory({from,out,until:'2026-10-01T12:00:00.000Z',retentionDays:0,investigationShare:1});
    const state=JSON.parse(await readFile(out));
    return {label:'synthetic',out,bytes:generation.bytes,fetchCalls:generation.fetchCalls,credentialReads:generation.credentialReads,
      sampleIds:{approved:ready.id,abstained:abstained.investigationId,escalated:escalated.investigationId},
      byOutcome:buildInvestigationAnalytics(state).byOutcome};
  } finally {await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await createInvestigationDataset(process.argv[2]),null,2));
