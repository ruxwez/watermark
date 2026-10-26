<script>
  import { onMount } from 'svelte';
  import { Tabs, Slider, Dialog } from 'bits-ui';
  import { Upload, Download, Plus, X, Droplets, ShieldCheck, Bookmark, Trash2, Check, ArrowUpRight } from 'lucide-svelte';
  import JSZip from 'jszip';
  import { defaults, render, toBlob, loadImage } from './render.js';
  import { readSettings, writeSettings } from './storage.js';
  let config = $state({...defaults}), profiles = $state([]), files = $state([]), selected = $state(0);
  let ready = $state(false), error = $state(''), notice = $state(''), busy = $state(false), progress = $state(0), preview = $state(''), dragging = $state(false), profileName = $state(''), dialog = $state(false);
  let fileInput, logoInput, previewVersion = 0;
  onMount(() => {
    readSettings().then(data => { if(data) { config = {...defaults,...data.config}; profiles = data.profiles || []; } }).catch(() => error = 'No se pudo abrir IndexedDB. Las configuraciones no se guardarán.').finally(() => ready = true);
    return () => files.forEach(f => URL.revokeObjectURL(f.url));
  });
  $effect(() => {
    const value = $state.snapshot({config,profiles});
    if (ready) { const timer = setTimeout(() => writeSettings(value).catch(() => error = 'No se pudo guardar. Comprueba el espacio disponible del navegador.'), 350); return () => clearTimeout(timer); }
  });
  $effect(() => {
    const settings = $state.snapshot(config), current = files[selected];
    const version = ++previewVersion;
    if (!current) { preview = ''; return; }
    const timer = setTimeout(() => render(current.url, settings, 1200).then(canvas => { if (version === previewVersion) preview = canvas.toDataURL(); }).catch(e => error = e.message), 100);
    return () => clearTimeout(timer);
  });
  async function addFiles(list) {
    error = ''; let rejected = 0;
    for (const file of Array.from(list || [])) {
      if (!file.type.startsWith('image/')) { rejected++; continue; }
      const url = URL.createObjectURL(file);
      try { const image = await loadImage(url); files.push({name:file.name,url,width:image.width,height:image.height}); }
      catch { URL.revokeObjectURL(url); rejected++; }
    }
    if(rejected) error = `${rejected} archivo(s) no compatible(s). Usa imágenes PNG, JPEG, WebP o SVG legibles por el navegador.`;
  }
  function remove(index) { URL.revokeObjectURL(files[index].url); files.splice(index,1); selected = Math.min(selected,Math.max(0,files.length-1)); }
  async function logoChanged(event) {
    const input = event.currentTarget; const file = input.files?.[0]; if(!file) return;
    try { const data = await new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); }); await loadImage(data); config.logo = data; }
    catch { error = 'No se pudo leer el logotipo.'; }
    input.value = '';
  }
  async function download() {
    if (!files.length || busy) return;
    busy = true; error = ''; progress = 0;
    const settings = $state.snapshot(config), batch = [...files];
    try {
      if(settings.type === 'image' && !settings.logo) throw new Error('Añade una imagen para usarla como marca de agua.');
      if(settings.type === 'text' && !settings.text.trim()) throw new Error('Escribe el texto de la marca de agua.');
      const zip = new JSZip();
      for(let i=0;i<batch.length;i++) {
        const canvas = await render(batch[i].url,settings);
        const blob = await toBlob(canvas,settings);
        const ext = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[blob.type] || 'png';
        zip.file(`${String(i+1).padStart(3,'0')}-${batch[i].name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'_')}-watermark.${ext}`,blob);
        canvas.width = canvas.height = 1;
        progress = Math.round((i+1)/batch.length*90);
        await new Promise(resolve => setTimeout(resolve,0));
      }
      const blob = await zip.generateAsync({type:'blob',compression:'STORE'}, meta => progress = 90 + Math.round(meta.percent/10));
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url; a.download='watermark.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url),60000);
      notice = `${batch.length} imágenes preparadas en watermark.zip`;
    } catch(e) { error = e.message || 'No se pudo generar el ZIP. Prueba con un lote más pequeño.'; } finally { busy = false; }
  }
  function saveProfile() { if (!profileName.trim()) return; profiles.push({id:crypto.randomUUID(),name:profileName.trim(),config:$state.snapshot(config)}); profileName=''; dialog=false; notice='Configuración guardada en este navegador.'; }
</script>

<svelte:head><title>Watermark · Tu firma, en todas</title></svelte:head>
<div class="app-shell">
  <header><a class="brand" href="./"><span class="brand-icon"><Droplets size={21}/></span>watermark<span class="brand-dot">.</span></a><span class="privacy"><ShieldCheck size={15}/> Tus imágenes se quedan contigo</span><a class="repo" href="https://github.com/ruxwez/watermark" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14}/></a></header>
  <main>
    <div class="intro"><div><div class="eyebrow">UNA FIRMA. TODAS TUS IMÁGENES.</div><h1>Hazlas tuyas<span>.</span></h1><p>Añade tu marca de agua en lote. Simple, privado y desde tu navegador.</p></div><span class="local-badge"><span></span> 100% local</span></div>
    {#if error}<div class="message error" role="alert">{error}<button aria-label="Cerrar error" onclick={() => error=''}><X size={16}/></button></div>{/if}
    {#if notice}<div class="message" role="status">{notice}<button aria-label="Cerrar aviso" onclick={() => notice=''}><X size={16}/></button></div>{/if}
    <div class="workspace">
      <section class="images-panel">
        <div class="panel-heading"><h2><span class="step">01</span> Tus imágenes <span class="count">{files.length}</span></h2>{#if files.length}<button class="text-button" disabled={busy} onclick={() => {files.forEach(f=>URL.revokeObjectURL(f.url));files=[];selected=0;}}>Vaciar lote</button>{/if}</div>
        <input bind:this={fileInput} class="sr-only" type="file" accept="image/*" multiple aria-label="Seleccionar imágenes" onchange={e=>{addFiles(e.currentTarget.files);e.currentTarget.value='';}} disabled={busy}/>
        <button class:dragging class="dropzone" class:compact={files.length>0} disabled={busy} ondragover={e=>{e.preventDefault();dragging=true;}} ondragleave={()=>dragging=false} ondrop={e=>{e.preventDefault();dragging=false;if(!busy)addFiles(e.dataTransfer.files);}} onclick={()=>fileInput.click()}>
          <span class="upload-icon"><Upload size={23}/></span><strong>{files.length ? 'Añadir más imágenes' : 'Arrastra tus imágenes aquí'}</strong><span>o <u>elige archivos</u> de tu dispositivo</span>{#if !files.length}<small>PNG, JPG, WebP y más · Sin un límite fijo de archivos</small>{/if}
        </button>
        {#if files.length}
          <div class="preview-stage"><img src={preview || files[selected]?.url} alt="Vista previa con la configuración de marca de agua"/><span class="preview-label">VISTA PREVIA</span></div>
          <div class="image-info"><span>{files[selected]?.name}</span><span>{files[selected]?.width} × {files[selected]?.height}</span></div>
          <div class="filmstrip">{#each files as file,i (file.url)}<div class="thumb" class:active={selected===i}><button class="thumb-select" aria-label={`Vista previa de ${file.name}`} onclick={()=>selected=i}><img src={file.url} alt={file.name}/></button><button class="remove" disabled={busy} aria-label={`Eliminar ${file.name}`} onclick={()=>remove(i)}><X size={12}/></button></div>{/each}</div>
        {:else}
          <div class="empty-preview"><div class="sample-art"><div class="sun"></div><div class="hill back"></div><div class="hill front"></div><span>tu firma aquí</span></div><h3>Tu próximo lote empieza aquí</h3><p>Sube tus imágenes para ver la marca de agua en tiempo real.</p></div>
        {/if}
        <div class="panel-foot"><ShieldCheck size={15}/><span>Sin subidas, sin cuentas. Los originales permanecen intactos.</span></div>
      </section>
      <aside class="settings-panel" inert={busy || !ready}>
        <div class="panel-heading"><h2><span class="step">02</span> Tu marca de agua</h2></div>
        <Tabs.Root bind:value={config.type}><Tabs.List class="tabs" aria-label="Tipo de marca de agua"><Tabs.Trigger value="text">Texto</Tabs.Trigger><Tabs.Trigger value="image">Imagen</Tabs.Trigger></Tabs.List><Tabs.Content value="text" class="tab-content"><label for="signature">Tu firma</label><input id="signature" type="text" bind:value={config.text} maxlength="200" placeholder="© Tu nombre o marca"/><div class="two-cols"><div><label for="font">Tipografía</label><select id="font" bind:value={config.font}><option value="sans-serif">Sans serif</option><option value="serif">Serif</option><option value="monospace">Monoespaciada</option></select></div><div><label for="color">Color</label><div class="color-input"><input id="color" type="color" bind:value={config.color}/><span>{config.color}</span></div></div></div></Tabs.Content><Tabs.Content value="image" class="tab-content"><label for="logo">Imagen de tu marca</label><input id="logo" bind:this={logoInput} type="file" accept="image/*" onchange={logoChanged}/>{#if config.logo}<div class="logo-preview"><img src={config.logo} alt="Logotipo de la marca de agua"/><button aria-label="Eliminar logotipo" onclick={()=>config.logo=''}><X size={16}/></button></div>{/if}<p class="hint">Un PNG transparente suele dar el mejor resultado.</p></Tabs.Content></Tabs.Root>
        <div class="separator"></div>
        <label for="mode">Distribución</label><select id="mode" bind:value={config.mode}><option value="single">Una posición concreta</option><option value="repeat">Repetida por toda la imagen</option></select>
        {#if config.mode==='single'}<div class="placement"><div><span class="field-label">Posición</span><p class="hint">Elige un punto o ajusta las coordenadas.</p></div><div class="position-grid" role="group" aria-label="Posición de la marca">{#each [0,50,100] as y}{#each [0,50,100] as x}<button class:chosen={config.x===x&&config.y===y} aria-label={`Posición ${x}% horizontal, ${y}% vertical`} aria-pressed={config.x===x&&config.y===y} onclick={()=>{config.x=x;config.y=y;}}><span></span></button>{/each}{/each}</div></div><div class="two-cols"><label class="coordinate">Horizontal %<input type="number" min="0" max="100" value={config.x} oninput={e=>config.x=Math.max(0,Math.min(100,+e.currentTarget.value))}/></label><label class="coordinate">Vertical %<input type="number" min="0" max="100" value={config.y} oninput={e=>config.y=Math.max(0,Math.min(100,+e.currentTarget.value))}/></label></div>{/if}
        {#each [{key:'size',name:'Tamaño',min:3,max:60,unit:'%'},{key:'opacity',name:'Opacidad',min:0,max:100,unit:'%'},{key:'rotation',name:'Rotación',min:-180,max:180,unit:'°'},...(config.mode==='repeat'?[{key:'gap',name:'Separación',min:0,max:100,unit:'%'}]:[])] as item}
          <div class="slider-field"><div><span class="field-label" id={`label-${item.key}`}>{item.name}</span><output>{config[item.key]}{item.unit}</output></div><Slider.Root type="single" min={item.min} max={item.max} step={1} value={config[item.key]} onValueChange={v=>config[item.key]=v} class="slider"><span class="slider-track"><Slider.Range class="slider-range"/></span><Slider.Thumb index={0} class="slider-thumb" aria-labelledby={`label-${item.key}`}/></Slider.Root></div>
        {/each}
        <div class="separator"></div><div class="two-cols"><div><label for="format">Formato de salida</label><select id="format" bind:value={config.format}><option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option></select></div>{#if config.format!=='image/png'}<div><label for="quality">Calidad (%)</label><input id="quality" type="number" min="1" max="100" value={config.quality} oninput={e=>config.quality=Math.max(1,Math.min(100,+e.currentTarget.value))}/></div>{/if}</div>
        <div class="presets"><div class="preset-title"><span><Bookmark size={15}/> Configuraciones</span><Dialog.Root bind:open={dialog}><Dialog.Trigger class="text-button"><Plus size={14}/> Guardar</Dialog.Trigger><Dialog.Portal><Dialog.Overlay class="dialog-overlay"/><Dialog.Content class="dialog-content"><Dialog.Title class="dialog-title">Guardar configuración</Dialog.Title><Dialog.Description class="hint">Guarda todos los ajustes y el logotipo en este navegador.</Dialog.Description><form onsubmit={e=>{e.preventDefault();saveProfile();}}><label for="preset-name">Nombre</label><input id="preset-name" bind:value={profileName} maxlength="80" placeholder="Mi firma habitual" required/><div class="dialog-actions"><Dialog.Close class="secondary">Cancelar</Dialog.Close><button class="primary" type="submit">Guardar</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root></div>{#if profiles.length}<div class="profile-list">{#each profiles as profile (profile.id)}<div><button class="profile-load" onclick={()=>{config={...defaults,...profile.config};notice=`Configuración «${profile.name}» aplicada.`;}}>{profile.name}</button><button aria-label={`Eliminar configuración ${profile.name}`} onclick={()=>profiles=profiles.filter(p=>p.id!==profile.id)}><Trash2 size={14}/></button></div>{/each}</div>{:else}<p class="hint">Guarda tus ajustes favoritos para el próximo lote.</p>{/if}<small><Check size={12}/> Los ajustes actuales se recuerdan automáticamente.</small></div>
      </aside>
    </div>
    <div class="export-bar"><div><strong>{files.length ? `${files.length} ${files.length===1?'imagen lista':'imágenes listas'}` : 'Todo listo para empezar'}</strong><p>Una configuración para todo el lote · Resolución original</p></div><button class="primary download" disabled={!files.length||busy||!ready} onclick={download}><Download size={18}/>{busy?`Preparando ZIP… ${progress}%`:'Descargar ZIP'}{#if !busy}<span>↗</span>{/if}</button></div>
    {#if busy}<progress class="export-progress" max="100" value={progress} aria-label="Progreso de exportación"></progress>{/if}
    <footer><span>Hecho para proteger lo que creas.</span><span>Sin servidor. Sin perder el control.</span></footer>
  </main>
</div>
