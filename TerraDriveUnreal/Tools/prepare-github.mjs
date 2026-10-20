import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const textExt=new Set(['.js','.mjs','.json','.html','.css','.md','.cpp','.h','.cs','.uproject','.ini','.ps1','.cmd','.txt','.py']);
const files=[];
function add(rel){const p=path.join(workspace,rel);if(!fs.existsSync(p))return;const stat=fs.statSync(p);if(stat.isDirectory()){for(const n of fs.readdirSync(p))add(path.join(rel,n));return;}const ext=path.extname(rel).toLowerCase();const text=textExt.has(ext)||path.basename(rel)==='.gitignore';files.push({path:rel.replaceAll('\\','/'),size:stat.size,text});}
for(const p of ['README.md','.gitignore','TerraDriveUnreal/.clang-format','TerraDriveUnreal/TerraDrive.uproject','TerraDriveUnreal/Source','TerraDriveUnreal/Config','TerraDriveUnreal/Tools','TerraDriveUnreal/README.md','TerraDriveUnreal/docs','TerraDrive-v1.13/dist','TerraDrive-v1.13/tests','TerraDrive-v1.13/package.json'])add(p);
fs.mkdirSync(path.join(workspace,'TerraDriveUnreal','Saved'),{recursive:true});
fs.writeFileSync(path.join(workspace,'TerraDriveUnreal','Saved','github-files.json'),JSON.stringify(files));
const textPayload=()=>JSON.stringify(files.filter(f=>f.text).map(f=>({path:f.path,mode:'100644',type:'blob',content:fs.readFileSync(path.join(workspace,f.path),'utf8')})));
if(process.argv.includes('--text'))process.stdout.write(textPayload());
else if(process.argv.includes('--text-length'))console.log(textPayload().length);
else if(process.argv.includes('--text-chunk')){const at=process.argv.indexOf('--text-chunk');const offset=Number(process.argv[at+1]);process.stdout.write(JSON.stringify(textPayload().slice(offset,offset+160000)));}
else if(process.argv.includes('--binary-list'))console.log(JSON.stringify(files.filter(f=>!f.text)));
else if(process.argv.includes('--binary-chunk')){const at=process.argv.indexOf('--binary-chunk');const file=files.filter(f=>!f.text)[Number(process.argv[at+1])];const offset=Number(process.argv[at+2]);process.stdout.write(JSON.stringify(fs.readFileSync(path.join(workspace,file.path)).toString('base64').slice(offset,offset+480000)));}
else console.log(JSON.stringify({files:files.length,text:files.filter(f=>f.text).length,binary:files.filter(f=>!f.text).length,bytes:files.reduce((s,f)=>s+f.size,0)}));
