import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
const directory='/private/tmp/freddo-edge-deploy';await mkdir(directory,{recursive:true});
for(const name of ['freddo-ingest','freddo-ops','freddo-maintenance','freddo-backup']){
 await build({entryPoints:[`supabase/functions/${name}/index.ts`],outfile:`${directory}/${name}.ts`,bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['npm:*','image-in-browser'],plugins:[{name:'pinned-image-import',setup(build){build.onResolve({filter:/^image-in-browser$/},()=>({path:'npm:image-in-browser@3.6.0',external:true}));}}]});
}
console.log(`Dashboard deployment files written to ${directory}`);
