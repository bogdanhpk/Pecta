import {readFile,mkdir,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
const execute=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('A stable three-part version is required');
await mkdir(path.join(root,'releases'),{recursive:true});const sums=[];
for(const browser of ['chrome','firefox']){
  const manifest=JSON.parse(await readFile(path.join(root,'dist',browser,'manifest.json'),'utf8'));
  if(manifest.version!==version)throw Error('Run npm run build before packaging');
  const name=`pecta-mode-${version}-${browser}.zip`,destination=path.join(root,'releases',name);
  await rm(destination,{force:true});
  await execute('zip',['-q','-r',destination,browser],{cwd:path.join(root,'dist')});
  const hash=createHash('sha256').update(await readFile(destination)).digest('hex');sums.push(`${hash}  ${name}`);
  console.log(`Packaged releases/${name}`);
}
await writeFile(path.join(root,'releases/SHA256SUMS.txt'),sums.join('\n')+'\n');
