export function releaseNotesForVersion(changelog,version){
  const lines=changelog.replace(/\r\n?/g,'\n').split('\n'),start=lines.findIndex(line=>line.trim()===`## ${version}`);
  if(start<0)throw Error(`Add release notes for ${version} to CHANGELOG.md`);
  let end=lines.findIndex((line,index)=>index>start&&/^##\s/.test(line));if(end<0)end=lines.length;
  const notes=lines.slice(start+1,end).join('\n').trim();
  if(!notes)throw Error(`Release notes for ${version} are empty`);
  return notes+'\n';
}
