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
  'wrong-page': 'Откройте файл Figma во вкладке браузера.',
  'no-figma-object': 'В основном контексте объект figma не найден.',
  'object-without-readable-selection': 'Объект найден, но выделение пока недоступно.',
  'select-a-layer': 'Выберите слой и повторите проверку.',
  'plugin-context-detected': 'Найден контекст плагина. Проверка без плагина не подтверждена.',
  'selection-readable': 'Выделенный слой читается. Это ещё не проверка всех функций Dev Mode.'
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
    find('#status').textContent = 'Сохранён отчёт старой сборки. Нажмите «Наблюдать 20 с» для новой проверки.';
    find('#summary').replaceChildren();find('#summary').hidden = true;
    find('#details').hidden = true;find('#report').textContent = '';
    find('#download').disabled = true;
    find('#stop').disabled = result.observation?.status !== 'running';
    return;
  }
  const report = result.savedReport || (result.verdict ? result : null);
  if (!report) { find('#status').textContent = 'Результатов пока нет. Нажмите «Проверить слой».'; return; }
  lastReport = { ...report, exporter:{extensionVersion}, observation: result.observation || report.observation || null };
  const watch = lastReport.observation;
  const selectionCleared = watch?.currentSelection?.count === 0;
  const fullSnapshotMissing = !report.nodes?.length && watch?.samples?.some(sample => sample.nodes?.length);
  const accessProblem = ['plugin-context-detected', 'no-figma-object', 'object-without-readable-selection', 'wrong-page'].includes(report.verdict);
  find('#status').textContent = accessProblem ? labels[report.verdict]
    : watch?.status === 'finishing' ? 'Дочитываем свойства последнего слоя. Затем нажмите «Обновить».'
    : watch?.status === 'running' ? 'Наблюдение включено. Переключитесь на макет.'
    : fullSnapshotMissing ? 'Слои обнаружены, но полный снимок не получен. Запустите наблюдение заново.'
    : report.nodes?.length && selectionCleared ? 'Данные последнего слоя сохранены. Сейчас выделение снято.'
    : labels[report.verdict] || 'Проверка завершена';
  const first = report.nodes?.[0];
  const summary = find('#summary'); summary.replaceChildren();
  if (first) {
    summary.append(row('Проверенный слой', first.fields.name || first.fields.id || 'Без имени'));
    summary.append(row('Размер', Number.isFinite(first.fields.width) && Number.isFinite(first.fields.height) ? `${first.fields.width} × ${first.fields.height}` : 'Не прочитан'));
    const hasCss = first.css.status === 'ok' && first.css.value && Object.keys(first.css.value).length > 0;
    summary.append(row('CSS', hasCss ? 'Получен' : first.css.status === 'truncated' ? 'Сокращён в отчёте' : first.css.status === 'timeout' ? 'Не получен за отведённое время' : first.css.status === 'ok' ? 'Пустой результат' : first.css.status === 'error' ? 'Ошибка чтения' : 'Метод недоступен'));
    const namedVariables = first.variables.filter(variable => variable.value?.name).length;
    summary.append(row('Имена переменных', namedVariables ? `${namedVariables} из ${first.variables.length} проверенных` : first.variables.length ? 'Не прочитаны' : 'Привязок не обнаружено'));
    if (first.variableCoverage?.omitted) summary.append(row('Ещё привязок', `${first.variableCoverage.omitted} не проверено`));
    summary.append(row('Компонент', first.component.value?.componentSet?.name || first.component.value?.name || (first.fields.type === 'INSTANCE' ? 'Не прочитан' : first.fields.type === 'COMPONENT' ? first.fields.name : 'Выбран не экземпляр')));
  }
  if (watch?.samples) {
    summary.append(row('Наблюдение', { running:'Идёт', finishing:'Дочитываем снимок', completed:'Завершено', stopped:'Остановлено', snapshot:'Снимок', replaced:'Перезапущено' }[watch.status] || watch.status));
    summary.append(row('Изменений в отчёте', String(Math.max(0, watch.samples.length - 1))));
    summary.append(row('Событий выделения', String(watch.selectionEventCount || 0)));
    summary.append(row('Обновление данных', { 'events-and-polling-observed':'События и опрос', 'selection-events-observed':'События выделения', 'polling-observed':'Опрос подтверждён', 'no-change-observed':'Изменений ещё нет' }[watch.updateMechanism] || 'Не проверено'));
    summary.append(row('Полных снимков', watch.capturePending ? `${watch.fullCaptureCount || 0}, читаем следующий` : String(watch.fullCaptureCount || 0)));
    const latest = watch.currentSelection?.nodes?.[0] || watch.samples.at(-1)?.nodes?.[0];
    if (selectionCleared) summary.append(row('Текущее выделение', 'Снято'));
    else if (latest) summary.append(row('Текущее выделение', latest.name || latest.id));
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
  find('#status').textContent = 'Проверяем доступ…';
  try {
    const tab = await targetTab();
    const url = new URL(tab?.url || 'about:blank');
    if (url.protocol !== 'https:' || !['www.figma.com', 'figma.com'].includes(url.hostname) || !/^\/(design|file)\//.test(url.pathname)) throw new Error('Откройте макет Figma и нажмите значок расширения в этой вкладке.');
    const results = await api.scripting.executeScript({ target:{ tabId:tab.id }, world:'MAIN', func:probeFigmaPage, args:[{ action, durationMs:20000, extensionVersion }] });
    const result = results.find(item => item.frameId === 0);
    if (result?.error) throw new Error(result.error.message || String(result.error));
    if (!result?.result) throw new Error('Браузер не вернул результат. Проверьте поддержку MAIN context и повторите попытку.');
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
