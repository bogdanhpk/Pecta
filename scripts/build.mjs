import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const defaultIcon=Object.fromEntries([16,32,48,128].map(size=>[size,`assets/action/unavailable-${size}.png`]));
const manifest = {
  manifest_version: 3,
  name: 'Pecta Mode',
  version,
  description: 'Свойства слоя, CSS, токены и компоненты прямо в открытой Figma.',
  permissions: ['activeTab', 'scripting', 'storage', 'clipboardWrite'],
  host_permissions: ['https://www.figma.com/*','https://figma.com/*','https://api.github.com/*'],
  icons:defaultIcon,
  action: { default_title: 'Pecta Mode — откройте доступный макет Figma', default_popup: 'launcher.html',default_icon:defaultIcon },
  content_scripts:[{matches:['https://www.figma.com/*','https://figma.com/*'],js:['availability.js'],run_at:'document_idle',all_frames:false}],
  options_ui: { page:'popup.html', open_in_tab:true },
  web_accessible_resources: [{resources:['popup.html','updates.html','about.html'],matches:['https://www.figma.com/*','https://figma.com/*']}]
};

const updateService=await readFile(path.join(root,'src/updates.js'),'utf8');
const background=await readFile(path.join(root,'src/background.js'),'utf8');
const reader = (await readFile(path.join(root,'src/probe.js'),'utf8')).replace('export async function','async function');
const componentReader=(await readFile(path.join(root,'src/component-reader.js'),'utf8')).replace('export async function','async function');
const selectionReader=(await readFile(path.join(root,'src/selection-reader.js'),'utf8')).replace(/^export /gm,'');
const bridge = (await readFile(path.join(root,'src/mode-bridge.js'),'utf8')).replace(/^import .*;\n/gm,'').replace('  // @pecta:embed-reader',reader).replace('  // @pecta:embed-component-reader',componentReader).replace('  // @pecta:embed-selection-reader',selectionReader);
const units = (await readFile(path.join(root,'src/units.js'),'utf8')).replace(/^export /gm,'');
const helpers = (await readFile(path.join(root,'src/format.js'),'utf8')).replace(/^import .*;\n/gm,'').replaceAll('export function','function');
const highlighter = (await readFile(path.join(root,'src/css-highlight.js'),'utf8')).replace('export function','function');
const typographyData=(await readFile(path.join(root,'src/typography.js'),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const typographyUI=(await readFile(path.join(root,'src/typography-ui.js'),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const layerData = (await readFile(path.join(root,'src/layer-properties.js'),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const layerUI = (await readFile(path.join(root,'src/layer-properties-ui.js'),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const componentUI=(await readFile(path.join(root,'src/component-info-ui.js'),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const resourcesUI=(await readFile(path.join(root,'src/selection-resources-ui.js'),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const ui = (await readFile(path.join(root,'src/inspector-ui.js'),'utf8')).replace('export async function','async function');
const styles = await readFile(path.join(root,'src/inspector.css'),'utf8');
const icons = await readFile(path.join(root,'src/assets/icons.json'),'utf8');
const interFont = (await readFile(path.join(root,'src/assets/fonts/InterVariable.woff2'))).toString('base64');
const bundle = `(() => {\n${units}\n${helpers}\n${highlighter}\n${typographyData}\n${layerData}\n${typographyUI}\n${layerUI}\n${componentUI}\n${resourcesUI}\n${ui}\nvoid mountInspector(globalThis.__PECTA_MODE_LAUNCH__,${JSON.stringify(styles)},${icons},${JSON.stringify(interFont)}).catch(error=>console.error('Pecta panel:',error));\n})();\n`;

for (const browser of ['chrome', 'firefox']) {
  const destination = path.join(root, 'dist', browser);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(path.join(root, 'src'), destination, { recursive: true });
  for (const file of ['inspector-ui.js','inspector.css','mode-bridge.js','format.js','css-highlight.js','units.js','layer-properties.js','layer-properties-ui.js','component-reader.js','component-info-ui.js','typography.js','typography-ui.js','selection-reader.js','selection-resources-ui.js']) await rm(path.join(destination,file));
  await rm(path.join(destination,'updates.js'));
  await writeFile(path.join(destination,'background.js'),`${updateService}\n${background}`);
  await writeFile(path.join(destination,'mode-entry.js'),bridge);
  await writeFile(path.join(destination,'inspector-ui.bundle.js'),bundle);
  const targetManifest = browser === 'chrome'
    ? { ...manifest, minimum_chrome_version: '111',background:{service_worker:'background.js'} }
    : { ...manifest, background:{scripts:['background.js']},browser_specific_settings: { gecko: { id: 'access-probe@pecta.local', strict_min_version: '128.0' } } };
  await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(targetManifest, null, 2) + '\n');
  console.log(`Built dist/${browser}`);
}
