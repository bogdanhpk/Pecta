const api=globalThis.browser||globalThis.chrome;
const manifest=api.runtime.getManifest(),firefox=!!manifest.browser_specific_settings?.gecko;
const status=document.querySelector('#status'),download=document.querySelector('#download'),check=document.querySelector('#check'),release=document.querySelector('#release');
document.querySelector('#installed').textContent=`Установлена ${manifest.version}`;
release.href='https://github.com/bogdanhpk/Pecta/releases';
const instructions=firefox?[
  'Скачайте и распакуйте сборку для Firefox.',
  'Замените содержимое папки установленного расширения файлами из папки firefox в архиве.',
  'Откройте about:debugging#/runtime/this-firefox и нажмите «Перезагрузить» у Pecta Mode. При первой установке выберите «Загрузить временное дополнение» и manifest.json.',
  'Перезагрузите вкладку Figma.'
]:[
  'Скачайте и распакуйте сборку для Chrome.',
  'Замените содержимое папки, из которой установлено расширение, файлами из папки chrome в архиве. Сохраните прежний путь к папке.',
  'Откройте chrome://extensions и нажмите «Перезагрузить» у Pecta Mode.',
  'Перезагрузите вкладку Figma.'
];
for(const text of instructions){const item=document.createElement('li');item.textContent=text;document.querySelector('#instructions').append(item);}
document.querySelector('#installation-note').textContent=firefox?'Эта сборка устанавливается как временное дополнение и действует до перезапуска Firefox.':'Распакованное расширение обновляется через замену файлов в его папке.';
function render(result){
  download.hidden=true;
  const messages={available:`Доступна версия ${result.latestVersion}.`,current:`Установлена актуальная версия ${result.currentVersion}.`,unreleased:'В репозитории пока нет опубликованных сборок.', 'missing-build':'Новый релиз опубликован, сборка для вашего браузера пока недоступна.'};
  status.textContent=messages[result.status]||(result.reason==='rate-limit'?'GitHub временно ограничил запросы. Повторите проверку позже.':'Не удалось проверить обновления. Проверьте подключение и повторите.');
  if(result.status==='available'&&result.downloadUrl){download.href=result.downloadUrl;download.textContent=`Скачать ${result.latestVersion} для ${firefox?'Firefox':'Chrome'}`;download.hidden=false;}
  if(result.releaseUrl)release.href=result.releaseUrl;
}
async function refresh(force){
  check.disabled=true;status.textContent='Проверяем последнюю сборку…';
  try{render(await api.runtime.sendMessage({type:'pecta:updates-check',force}));}
  catch{status.textContent='Не удалось проверить обновления. Перезагрузите страницу и повторите.';}
  finally{check.disabled=false;}
}
check.onclick=()=>void refresh(true);
void refresh(true);
