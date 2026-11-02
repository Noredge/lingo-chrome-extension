import { build } from 'vite';
import { rm, mkdir, cp } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for (const name of ['content','background']) await build({configFile:false,publicDir:false,build:{outDir:'dist',emptyOutDir:false,lib:{entry:`src/${name}.ts`,name:'Lingo',formats:[name==='content'?'iife':'es'],fileName:()=>`${name}.js`},minify:false}});
await build({configFile:false,publicDir:false,base:'./',build:{outDir:'dist',emptyOutDir:false,minify:false,rollupOptions:{input:['options.html','popup.html']}}});
await cp('public','dist',{recursive:true});

await cp('LICENSE','dist/LICENSE');
