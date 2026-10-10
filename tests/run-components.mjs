import {build} from 'esbuild';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const temp=await mkdtemp(join(tmpdir(),'apex-tests-'));
try {
  const file=join(temp,'components.cjs');
  await build({entryPoints:['tests/components.test.tsx'],outfile:file,bundle:true,platform:'node',format:'cjs',
    loader:{'.gs':'text'}});
  const result=spawnSync(process.execPath,['--test','--test-force-exit',file],{stdio:'inherit'});
  process.exitCode=result.status??1;
} finally {await rm(temp,{recursive:true,force:true});}
