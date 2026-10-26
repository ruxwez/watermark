import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#6b8764"/></svg>');
const fixture = name => ({name,mimeType:'image/svg+xml',buffer:svg});
test('bulk export, repeated text, IndexedDB profiles and original dimensions', async ({page}) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Seleccionar imágenes').setInputFiles([fixture('foto.svg'),fixture('foto.svg')]);
  await expect(page.getByText('2 imágenes listas')).toBeVisible();
  await page.getByLabel('Tu firma',{exact:true}).fill('Mi estudio');
  await page.getByRole('radiogroup',{name:'Distribución'}).getByText('Mosaico').click();
  await page.getByRole('slider',{name:'Opacidad'}).focus();
  await page.keyboard.press('End');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('Estudio');
  await page.getByRole('dialog').getByRole('button',{name:'Guardar',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Descargar ZIP'}).click();
  const download=await downloadPromise;
  const path=await download.path();
  const fs=await import('node:fs/promises');
  const zip=await JSZip.loadAsync(await fs.readFile(path));
  expect(Object.keys(zip.files)).toHaveLength(2);
  for(const entry of Object.values(zip.files)) {
    const png=await entry.async('nodebuffer');
    expect(png.readUInt32BE(16)).toBe(640);expect(png.readUInt32BE(20)).toBe(480);
    const changed=await page.evaluate(async base64=>{
      const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const data=ctx.getImageData(0,0,640,480).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i]>150)count++;return count;
    },png.toString('base64'));
    expect(changed).toBeGreaterThan(100);
  }
  await page.waitForTimeout(600);await page.reload();
  await expect(page.getByLabel('Tu firma',{exact:true})).toHaveValue('Mi estudio');
  await expect(page.getByRole('radio',{name:'Mosaico'})).toBeChecked();
  await expect(page.getByRole('button',{name:'Estudio',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});
test('logo survives reload, mobile layout, and invalid files are reported',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.getByRole('tab',{name:'Imagen',exact:true}).click();
  await page.getByLabel('Imagen de tu marca').setInputFiles(fixture('logo.svg'));
  await expect(page.getByAltText('Logotipo de la marca de agua')).toBeVisible();
  await page.waitForTimeout(600);await page.reload();
  await expect(page.getByAltText('Logotipo de la marca de agua')).toBeVisible();
  await page.getByLabel('Seleccionar imágenes').setInputFiles([fixture('foto.svg'),{name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')}]);
  await expect(page.getByRole('alert')).toContainText('1 archivo(s)');
  await expect(page.getByText('1 imagen lista',{exact:true})).toBeVisible();
  const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar imagen'}).click();expect((await dl).suggestedFilename()).toBe('foto-watermark.png');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('drag to place the mark and keyboard navigation',async({page})=>{
  await page.goto('/');
  await page.getByLabel('Seleccionar imágenes').setInputFiles([fixture('uno.svg'),fixture('dos.svg')]);
  const counter=page.getByRole('heading',{level:2}).first();
  await expect(counter).toContainText('01/02');
  const box=await page.locator('.preview-stage').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+5,box.y+box.height/2+5,{steps:3});await page.mouse.up();
  await expect(page.getByLabel('Horizontal %')).not.toHaveValue('90');
  await expect(page.getByLabel('Vertical %')).not.toHaveValue('90');
  await page.keyboard.press('ArrowRight');
  await expect(counter).toContainText('02/02');
  await expect(counter).toContainText('dos.svg');
});
