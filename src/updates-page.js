import {renderReleaseNotes} from './release-notes.js';
const api=globalThis.browser||globalThis.chrome;
const manifest=api.runtime.getManifest(),firefox=!!manifest.browser_specific_settings?.gecko;
const status=document.querySelector('#status'),download=document.querySelector('#download'),check=document.querySelector('#check'),release=document.querySelector('#release');
document.querySelector('#installed').textContent=`Installed: ${manifest.version}`;
release.href='https://github.com/bogdanhpk/Pecta/releases';
const notesSection=document.querySelector('#release-notes'),notesBody=document.querySelector('#release-notes-body'),notesTitle=document.querySelector('#release-notes-title'),notesTruncated=document.querySelector('#release-notes-truncated'),notesLink=document.querySelector('#release-notes-link');
const instructions=firefox?[
  'Download and unzip the Firefox build.',
  'Replace the contents of the installed extension folder with the files from the firefox folder in the archive.',
  'Open about:debugging#/runtime/this-firefox and click Reload for Pecta Mode. For a first installation, load manifest.json as a temporary add-on.',
  'Reload the Figma tab.'
]:[
  'Download and unzip the Chrome build.',
  'Replace the contents of the installed extension folder with the files from the chrome folder in the archive. Keep the same folder path.',
  'Open chrome://extensions and click Reload for Pecta Mode.',
  'Reload the Figma tab.'
];
for(const text of instructions){const item=document.createElement('li');item.textContent=text;document.querySelector('#instructions').append(item);}
document.querySelector('#installation-note').textContent=firefox?'This build is installed as a temporary add-on and works until Firefox restarts.':'To update an unpacked extension, replace the files in its folder.';
function render(result){
  download.hidden=true;notesSection.hidden=true;notesBody.replaceChildren();notesTruncated.hidden=true;
  const messages={available:`Version ${result.latestVersion} is available.`,current:`Pecta ${result.currentVersion} is up to date.`,unreleased:'No releases have been published yet.', 'missing-build':'A new release is available, but the build for your browser is not ready yet.'};
  status.textContent=messages[result.status]||(result.reason==='rate-limit'?'GitHub is limiting requests. Check again later.':'Could not check for updates. Check your connection and try again.');
  if(result.status==='available'&&result.downloadUrl){download.href=result.downloadUrl;download.textContent=`Download ${result.latestVersion} for ${firefox?'Firefox':'Chrome'}`;download.hidden=false;}
  if(result.releaseUrl)release.href=result.releaseUrl;
  if(['available','missing-build'].includes(result.status)){
    notesTitle.textContent=`What’s new in ${result.latestVersion}`;
    const truncated=renderReleaseNotes(notesBody,result.releaseNotes||'');
    if(!notesBody.childElementCount){const empty=document.createElement('p');empty.className='hint';empty.textContent='No release notes have been added for this version.';notesBody.append(empty);}
    notesTruncated.hidden=!(result.releaseNotesTruncated||truncated);
    notesLink.href=result.releaseUrl;notesSection.hidden=false;
  }
}
async function refresh(force){
  check.disabled=true;download.hidden=true;notesSection.hidden=true;status.textContent='Checking for updates…';
  try{render(await api.runtime.sendMessage({type:'pecta:updates-check',force}));}
  catch{status.textContent='Could not check for updates. Reload the page and try again.';}
  finally{check.disabled=false;}
}
check.onclick=()=>void refresh(true);
void refresh(true);
