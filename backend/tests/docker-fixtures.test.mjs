import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, dirname, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
test('every runtime fixture URL is included at its runtime path by Docker COPY',()=>{
  const docker=readFileSync(resolve(root,'Dockerfile'),'utf8');
  const copies=[...docker.matchAll(/^COPY(?: --[^\s]+)* ([^\s]+) ([^\s]+)$/gm)].map(([,source,destination])=>({source:resolve(root,source),destination:resolve(root,destination)}));
  let count=0;
  function scan(directory) {
    for(const entry of readdirSync(directory,{withFileTypes:true})) {
      const file=resolve(directory,entry.name);
      if(entry.isDirectory()) {scan(file);continue;}
      if(!file.endsWith('.mjs'))continue;
      const code=readFileSync(file,'utf8');
      for(const [,path] of code.matchAll(/new URL\(\s*['"]([^'"]*fixtures\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) {
        count++;
        const fixture=resolve(dirname(file),path);
        assert.ok(existsSync(fixture),`Missing fixture: ${path}`);
        assert.ok(copies.some(({source,destination})=>{
          const suffix=relative(source,fixture);
          return !suffix.startsWith(`..${sep}`)&&suffix!=='..'&&resolve(destination,suffix)===fixture;
        }),`Dockerfile must copy ${relative(root,fixture)} to the same path`);
      }
    }
  }
  scan(resolve(root,'backend/src'));
  assert.ok(count>=6,'fixture discovery must cover runtime consumers');
});
