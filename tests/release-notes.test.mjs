import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {releaseNotesForVersion} from '../scripts/release-notes.mjs';
test('published release notes contain only the requested version',()=>{
 const source='# История\r\n\r\n## 0.3.17\r\n\r\n- Новая функция.\r\n\r\n## 0.3.16\r\n\r\n- Предыдущая функция.\r\n';
 assert.equal(releaseNotesForVersion(source,'0.3.17'),'- Новая функция.\n');assert.equal(releaseNotesForVersion(source,'0.3.16'),'- Предыдущая функция.\n');
 assert.throws(()=>releaseNotesForVersion(source,'0.3.18'),/CHANGELOG/);assert.throws(()=>releaseNotesForVersion('## 0.3.17\n\n## 0.3.16\nOld','0.3.17'),/empty/);
});
test('the current build has a nonempty description ready for GitHub Release',async()=>{
 const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 const notes=releaseNotesForVersion(await readFile(new URL('../CHANGELOG.md',import.meta.url),'utf8'),version);assert.ok(notes.trim());
});
