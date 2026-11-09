import { probeFigmaPage } from './probe.js';

const api = globalThis.browser || globalThis.chrome;
const find = selector => document.querySelector(selector);
const extensionVersion = api.runtime.getManifest().version;
find('#version').textContent = 'v' + extensionVersion;
let lastReport = null;
let busy = false;
async function targetTab() {
  const id=Number(new URLSearchParams(location.search).get('tabId'));
  if(Number.isInteger(id)&&id>0)return api.tabs.get(id);
  const [active]=await api.tabs.query({active:true,currentWindow:true});
  if(active?.url&&/^https:\/\/(www\.)?figma\.com\/(design|file)\//.test(active.url))return active;
  const saved=await api.storage.local.get('lastFigmaTabId');
  if(Number.isInteger(saved.lastFigmaTabId))return api.tabs.get(saved.lastFigmaTabId);
  return active;
}
const labels = {
  'wrong-page': 'Open a Figma file in a browser tab.',
  'no-figma-object': 'The figma object was not found in the main page context.',
  'object-without-readable-selection': 'The figma object was found, but the selection is not available yet.',
  'select-a-layer': 'Select a layer and try again.',
  'plugin-context-detected': 'A plugin context was detected. Access without a plugin is unconfirmed.',
  'selection-readable': 'The selected layer is readable. This does not verify all Dev Mode features.'
};

function row(label, value) {
  const item = document.createElement('div');
  const title = document.createElement('dt'); title.textContent = label;
  const content = document.createElement('dd'); content.textContent = value;
  item.append(title, content); return item;
}
function render(result) {
  if (result.staleState) {
    lastReport = null;
    find('#status').textContent = 'This report was saved by an older build. Click Observe for 20 s to run a new check.';
    find('#summary').replaceChildren();find('#summary').hidden = true;
    find('#details').hidden = true;find('#report').textContent = '';
    find('#download').disabled = true;
    find('#stop').disabled = result.observation?.status !== 'running';
    return;
  }
  const report = result.savedReport || (result.verdict ? result : null);
  if (!report) { find('#status').textContent = 'No results yet. Click Inspect layer.'; return; }
  lastReport = { ...report, exporter:{extensionVersion}, observation: result.observation || report.observation || null };
  const watch = lastReport.observation;
  const selectionCleared = watch?.currentSelection?.count === 0;
  const fullSnapshotMissing = !report.nodes?.length && watch?.samples?.some(sample => sample.nodes?.length);
  const accessProblem = ['plugin-context-detected', 'no-figma-object', 'object-without-readable-selection', 'wrong-page'].includes(report.verdict);
  find('#status').textContent = accessProblem ? labels[report.verdict]
    : watch?.status === 'finishing' ? 'Finishing the last layer snapshot. Click Refresh when it is ready.'
    : watch?.status === 'running' ? 'Observing changes. Switch to the design.'
    : fullSnapshotMissing ? 'Layers were detected, but no full snapshot was captured. Start observing again.'
    : report.nodes?.length && selectionCleared ? 'The last layer snapshot was saved. The selection is now empty.'
    : labels[report.verdict] || 'Check complete';
  const first = report.nodes?.[0];
  const summary = find('#summary'); summary.replaceChildren();
  if (first) {
    summary.append(row('Inspected layer', first.fields.name || first.fields.id || 'Untitled'));
    summary.append(row('Size', Number.isFinite(first.fields.width) && Number.isFinite(first.fields.height) ? `${first.fields.width} × ${first.fields.height}` : 'Unavailable'));
    const hasCss = first.css.status === 'ok' && first.css.value && Object.keys(first.css.value).length > 0;
    summary.append(row('CSS', hasCss ? 'Available' : first.css.status === 'truncated' ? 'Truncated in the report' : first.css.status === 'timeout' ? 'Timed out' : first.css.status === 'ok' ? 'Empty result' : first.css.status === 'error' ? 'Read error' : 'Method unavailable'));
    const namedVariables = first.variables.filter(variable => variable.value?.name).length;
    summary.append(row('Variable names', namedVariables ? `${namedVariables} of ${first.variables.length} checked` : first.variables.length ? 'Unavailable' : 'No bindings found'));
    if (first.variableCoverage?.omitted) summary.append(row('More bindings', `${first.variableCoverage.omitted} not checked`));
    summary.append(row('Component', first.component.value?.componentSet?.name || first.component.value?.name || (first.fields.type === 'INSTANCE' ? 'Unavailable' : first.fields.type === 'COMPONENT' ? first.fields.name : 'The selection is not an instance')));
  }
  if (watch?.samples) {
    summary.append(row('Observation', { running:'Running', finishing:'Finishing snapshot', completed:'Completed', stopped:'Stopped', snapshot:'Snapshot', replaced:'Restarted' }[watch.status] || watch.status));
    summary.append(row('Changes in report', String(Math.max(0, watch.samples.length - 1))));
    summary.append(row('Selection events', String(watch.selectionEventCount || 0)));
    summary.append(row('Live updates', { 'events-and-polling-observed':'Events and polling', 'selection-events-observed':'Selection events', 'polling-observed':'Polling confirmed', 'no-change-observed':'No changes yet' }[watch.updateMechanism] || 'Not checked'));
    summary.append(row('Full snapshots', watch.capturePending ? `${watch.fullCaptureCount || 0}, reading the next snapshot` : String(watch.fullCaptureCount || 0)));
    const latest = watch.currentSelection?.nodes?.[0] || watch.samples.at(-1)?.nodes?.[0];
    if (selectionCleared) summary.append(row('Current selection', 'Cleared'));
    else if (latest) summary.append(row('Current selection', latest.name || latest.id));
  }
  summary.hidden = summary.children.length === 0;
  find('#details').hidden = false;
  find('#report').textContent = JSON.stringify(lastReport, null, 2);
  find('#download').disabled = !!watch?.capturePending;
  find('#stop').disabled = watch?.status !== 'running';
}
async function run(action) {
  if (busy) return;
  busy = true;
  find('#snapshot').disabled = find('#observe').disabled = find('#refresh').disabled = true;
  find('#status').textContent = 'Checking access…';
  try {
    const tab = await targetTab();
    const url = new URL(tab?.url || 'about:blank');
    if (url.protocol !== 'https:' || !['www.figma.com', 'figma.com'].includes(url.hostname) || !/^\/(design|file)\//.test(url.pathname)) throw new Error('Open a Figma design and click the extension icon in that tab.');
    const results = await api.scripting.executeScript({ target:{ tabId:tab.id }, world:'MAIN', func:probeFigmaPage, args:[{ action, durationMs:20000, extensionVersion }] });
    const result = results.find(item => item.frameId === 0);
    if (result?.error) throw new Error(result.error.message || String(result.error));
    if (!result?.result) throw new Error('The browser returned no result. Check support for the MAIN context and try again.');
    render(result.result);
  } catch (error) { find('#status').textContent = error.message || String(error); }
  finally { busy = false; find('#snapshot').disabled = find('#observe').disabled = find('#refresh').disabled = false; }
}
find('#snapshot').addEventListener('click', () => run('snapshot'));
find('#observe').addEventListener('click', () => run('observe'));
find('#refresh').addEventListener('click', () => run('latest'));
find('#stop').addEventListener('click', () => run('stop'));
find('#download').addEventListener('click', () => {
  if (!lastReport) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastReport, null, 2)], { type:'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'pecta-access-report.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
run('latest');
