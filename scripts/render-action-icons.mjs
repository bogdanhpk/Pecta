// Optional asset generation; normal builds use the checked-in PNGs.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=new URL('../src/assets/action/',import.meta.url);
await mkdir(directory,{recursive:true});
const icons=JSON.parse(await readFile(new URL('../src/assets/icons.json',import.meta.url),'utf8'));
const path=icons['stack-simple'].children[0].attrs.d;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
try{
  const page=await browser.newPage();
  for(const [state,color] of [['ready','#5B8DEF'],['unavailable','#96969E']]){
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 280 280"><path fill="${color}" d="${path}"/></svg>`;
    await writeFile(new URL(`${state}.svg`,directory),svg+'\n');
    for(const size of [16,32,48,128]){
      const data=await page.evaluate(async({svg,size})=>{
        const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(svg);await image.decode();
        const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
        canvas.getContext('2d').drawImage(image,0,0,size,size);return canvas.toDataURL('image/png').split(',')[1];
      },{svg,size});
      await writeFile(new URL(`${state}-${size}.png`,directory),Buffer.from(data,'base64'));
    }
  }
}finally{await browser.close();}
console.log('Rendered ready / unavailable toolbar icons');
