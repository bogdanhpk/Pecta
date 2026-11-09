// Used in GitHub Actions with its repository-scoped GITHUB_TOKEN.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {releaseNotesForVersion} from './release-notes.mjs';
import {execFileSync} from 'node:child_process';
const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid stable version');
const tag=`v${version}`,repository=process.env.GITHUB_REPOSITORY||'bogdanhpk/Pecta';
if(!/^[\w.-]+\/[\w.-]+$/.test(repository))throw Error('Invalid repository');
if(process.env.GITHUB_REF_TYPE==='tag'&&process.env.GITHUB_REF_NAME!==tag)throw Error('Tag and package.json version differ');
const gh=args=>execFileSync('gh',[...args,'--repo',repository],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let release;
try{release=JSON.parse(gh(['release','view',tag,'--json','isDraft,tagName']));}
catch(error){if(!String(error.stderr).includes('release not found')&&!String(error.stderr).includes('Not Found'))throw error;}
if(release&&!release.isDraft){console.log(`${tag} is already published; no files changed.`);process.exit(0);}
const notes=releaseNotesForVersion(await readFile(new URL('../CHANGELOG.md',import.meta.url),'utf8'),version);
const temporary=await mkdtemp(path.join(tmpdir(),'pecta-release-')),notesFile=path.join(temporary,'notes.md');
try{
 await writeFile(notesFile,notes);
 if(!release){
  const args=['release','create',tag,'--draft','--title',`Pecta Mode ${version}`,'--notes-file',notesFile];
  if(process.env.GITHUB_SHA)args.push('--target',process.env.GITHUB_SHA);
  console.log(gh(args));
 }else console.log(gh(['release','edit',tag,'--notes-file',notesFile]));
 const assets=[`releases/pecta-mode-${version}-chrome.zip`,`releases/pecta-mode-${version}-firefox.zip`,'releases/SHA256SUMS.txt'];
 console.log(gh(['release','upload',tag,...assets,'--clobber']));
 console.log(gh(['release','edit',tag,'--draft=false','--latest']));
 console.log(`Published https://github.com/${repository}/releases/tag/${tag}`);
}finally{await rm(temporary,{recursive:true,force:true});}
