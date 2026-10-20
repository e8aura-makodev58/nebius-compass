#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {writeFileSync} from 'node:fs';
import {dataset,runAskScenario} from './eval/ask-runner.mjs';
import {scoreAskRun} from './eval/ask-score.mjs';
const {values}=parseArgs({options:{mode:{type:'string',default:'fixture'},json:{type:'string'},only:{type:'string'}}});
if(!['fixture','live'].includes(values.mode))throw Error('--mode must be fixture or live');
const scenarios=dataset.scenarios.filter(s=>!values.only||values.only.split(',').includes(s.id));
if(!scenarios.length)throw Error('No matching scenarios');
const results=[];
for(const scenario of scenarios)results.push(await runAskScenario(scenario,{mode:values.mode}));
const score=scoreAskRun(results);
console.log(`Ask Compass synthetic evaluation · ${dataset.version} · ${values.mode}`);
for(const [key,value] of Object.entries(score))if(key!=='rows')console.log(`${key}: ${JSON.stringify(value)}`);
for(const row of score.rows)console.log(`${row.id}: ${row.actual} · ${row.pass?'PASS':'FAIL'} · ${row.providerMode}`);
if(values.json)writeFileSync(values.json,JSON.stringify({mode:values.mode,version:dataset.version,score,results},null,2));
if(values.mode==='fixture'&&score.rows.some(row=>!row.pass))process.exitCode=1;
