<script>
  import { onMount } from 'svelte';
  import { Tabs, Slider, Dialog } from 'bits-ui';
  import { Upload, Download, Plus, X, Bookmark, Trash2, Check, ArrowUpRight, ChevronLeft, ChevronRight, Eye, RotateCcw, Move, ImagePlus, Type, Image as ImageIcon } from 'lucide-svelte';
  import JSZip from 'jszip';
  import { defaults, render, toBlob, loadImage } from './render.js';
  import { readSettings, writeSettings } from './storage.js';
  const swatches = ['#ffffff', '#000000', '#7f7f7f', '#e8c547', '#d6453d'];
  const darkSwatches = ['#000000', '#7f7f7f', '#d6453d'];
  const formats = [{value:'image/png',name:'PNG',ext:'png'},{value:'image/jpeg',name:'JPG',ext:'jpg'},{value:'image/webp',name:'WebP',ext:'webp'}];
  const fonts = [{value:'sans-serif',name:'Sans'},{value:'serif',name:'Serif'},{value:'monospace',name:'Mono'}];
  let config = $state({...defaults}), profiles = $state([]), files = $state([]), selected = $state(0);
  let ready = $state(false), error = $state(''), notice = $state(''), busy = $state(false), progress = $state(0), profileName = $state(''), dialog = $state(false);
  let dropping = $state(false), comparing = $state(false), moving = $state(false), rendered = $state(false), layout = $state(null);
  let previewCanvas = $state(), fileInput, logoInput, previewVersion = 0, dragDepth = 0, noticeTimer, cached = {url:'',image:null};
  const current = $derived(files[selected]);
  const formatName = $derived(formats.find(f => f.value === config.format)?.name || 'PNG');
  onMount(() => {
    readSettings().then(data => { if(data) { config = {...defaults,...data.config}; profiles = data.profiles || []; } }).catch(() => error = 'No se pudo abrir IndexedDB. Las configuraciones no se guardarán.').finally(() => ready = true);
    return () => files.forEach(f => URL.revokeObjectURL(f.url));
  });
  $effect(() => {
    const value = $state.snapshot({config,profiles});
    if (ready) { const timer = setTimeout(() => writeSettings(value).catch(() => error = 'No se pudo guardar. Comprueba el espacio disponible del navegador.'), 350); return () => clearTimeout(timer); }
  });
  $effect(() => {
    const settings = $state.snapshot(config), file = current;
    const version = ++previewVersion;
    if (!file) { rendered = false; layout = null; return; }
    const timer = setTimeout(async () => {
      try {
        if (cached.url !== file.url) cached = {url:file.url,image:await loadImage(file.url)};
        const canvas = await render(cached.image, settings, 1200);
        if (version !== previewVersion || !previewCanvas) return;
        previewCanvas.width = canvas.width; previewCanvas.height = canvas.height;
        previewCanvas.getContext('2d').drawImage(canvas,0,0);
        layout = canvas.layout || null; rendered = true;
      } catch(e) { error = e.message; }
    }, moving ? 0 : 60);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    if (!notice) return;
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice = '', 4000);
  });
  async function addFiles(list) {
    error = ''; let rejected = 0, added = 0;
    const start = files.length;
    for (const file of Array.from(list || [])) {
      if (!file.type.startsWith('image/')) { rejected++; continue; }
      const url = URL.createObjectURL(file);
      try { const image = await loadImage(url); files.push({name:file.name || `imagen-${files.length+1}.png`,url,width:image.width,height:image.height}); added++; }
      catch { URL.revokeObjectURL(url); rejected++; }
    }
    if (added && start === 0) selected = 0;
    if (rejected) error = `${rejected} archivo(s) no compatible(s). Usa imágenes PNG, JPEG, WebP o SVG legibles por el navegador.`;
  }
  function remove(index) { URL.revokeObjectURL(files[index].url); files.splice(index,1); if (index < selected || selected >= files.length) selected = Math.max(0,selected-1); }
  function clearAll() { files.forEach(f=>URL.revokeObjectURL(f.url)); files=[]; selected=0; }
  function step(delta) { if (files.length) selected = (selected + delta + files.length) % files.length; }
  async function setLogo(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { error = 'El logotipo debe ser una imagen.'; return; }
    try { const data = await new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); }); await loadImage(data); config.logo = data; }
    catch { error = 'No se pudo leer el logotipo.'; }
  }
  function moveMark(event) {
    if (!layout || !previewCanvas) return;
    const r = previewCanvas.getBoundingClientRect(), w = previewCanvas.width, h = previewCanvas.height;
    const scale = Math.min(r.width / w, r.height / h);
    const px = (event.clientX - r.left - (r.width - w * scale) / 2) / scale, py = (event.clientY - r.top - (r.height - h * scale) / 2) / scale;
    const fx = w - 2 * layout.padX, fy = h - 2 * layout.padY;
    config.x = Math.round(Math.max(0, Math.min(100, fx > 0 ? (px - layout.padX) / fx * 100 : 50)));
    config.y = Math.round(Math.max(0, Math.min(100, fy > 0 ? (py - layout.padY) / fy * 100 : 50)));
  }
  function stagePointerDown(event) {
    if (config.mode !== 'single' || comparing || event.button) return;
    event.currentTarget.setPointerCapture(event.pointerId); moving = true; moveMark(event);
  }
  function checkSettings(settings) {
    if (settings.type === 'image' && !settings.logo) throw new Error('Añade una imagen para usarla como marca de agua.');
    if (settings.type === 'text' && !settings.text.trim()) throw new Error('Escribe el texto de la marca de agua.');
  }
  function fileName(file, index, ext, numbered) { return `${numbered ? String(index+1).padStart(3,'0') + '-' : ''}${file.name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'_')}-watermark.${ext}`; }
  function save(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),60000); }
  async function exportImage(file, index, settings, numbered) {
    const canvas = await render(file.url,settings);
    const blob = await toBlob(canvas,settings);
    canvas.width = canvas.height = 1;
    return {blob, name: fileName(file, index, formats.find(f => f.value === blob.type)?.ext || 'png', numbered)};
  }
  async function downloadOne(index) {
    if (busy || !files[index]) return;
    busy = true; error = '';
    try { const settings = $state.snapshot(config); checkSettings(settings); const out = await exportImage(files[index], index, settings, false); save(out.blob, out.name); notice = `Descargada ${out.name}`; }
    catch(e) { error = e.message || 'No se pudo exportar la imagen.'; } finally { busy = false; }
  }
  async function download() {
    if (!files.length || busy) return;
    if (files.length === 1) return downloadOne(0);
    busy = true; error = ''; progress = 0;
    const settings = $state.snapshot(config), batch = [...files];
    try {
      checkSettings(settings);
      const zip = new JSZip();
      for(let i=0;i<batch.length;i++) {
        const out = await exportImage(batch[i], i, settings, true);
        zip.file(out.name,out.blob);
        progress = Math.round((i+1)/batch.length*90);
        await new Promise(resolve => setTimeout(resolve,0));
      }
      const blob = await zip.generateAsync({type:'blob',compression:'STORE'}, meta => progress = 90 + Math.round(meta.percent/10));
      save(blob, 'watermark.zip');
      notice = `${batch.length} imágenes preparadas en watermark.zip`;
    } catch(e) { error = e.message || 'No se pudo generar el ZIP. Prueba con un lote más pequeño.'; } finally { busy = false; }
  }
  function saveProfile() { if (!profileName.trim()) return; profiles.push({id:crypto.randomUUID(),name:profileName.trim(),config:$state.snapshot(config)}); profileName=''; dialog=false; notice='Configuración guardada en este navegador.'; }
  function resetConfig() { config = {...defaults, logo: config.logo, type: config.type}; notice = 'Ajustes restablecidos.'; }
  const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  function windowKey(event) {
    if (dialog || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.('input,select,textarea,[role=slider],[role=tab],[contenteditable]')) return;
    if (event.key === 'ArrowLeft') { step(-1); event.preventDefault(); }
    if (event.key === 'ArrowRight') { step(1); event.preventDefault(); }
  }
</script>

{#snippet slider(key, name, min, max, unit)}
  <div class="slider-field">
    <div><span class="field-label" id={`label-${key}`}>{name}</span><button class="value" title="Doble clic para restablecer" ondblclick={()=>config[key]=defaults[key]}>{config[key]}{unit}</button></div>
    <Slider.Root type="single" {min} {max} step={1} value={config[key]} onValueChange={v=>config[key]=v} class="slider"><span class="slider-track"><Slider.Range class="slider-range"/></span><Slider.Thumb index={0} class="slider-thumb" aria-labelledby={`label-${key}`}/></Slider.Root>
  </div>
{/snippet}

<svelte:head><title>Watermark · Marca de agua en lote</title></svelte:head>
<svelte:window
  onkeydown={windowKey}
  onpaste={e => { const list = e.clipboardData?.files; if (list?.length && !busy && !e.target.closest?.('input,textarea')) { e.preventDefault(); addFiles(list); } }}
  ondragenter={e => { if (!hasFiles(e) || busy) return; dragDepth++; dropping = true; }}
  ondragleave={e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth-1); if (!dragDepth) dropping = false; }}
  ondragover={e => { if (hasFiles(e)) e.preventDefault(); }}
  ondrop={e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; dropping = false; if (!busy) addFiles(e.dataTransfer.files); }}
/>
<div class="backdrop" aria-hidden="true"></div>
{#if dropping}<div class="drop-overlay" aria-hidden="true"><div><ImagePlus size={26}/><strong>Suelta para añadir</strong><span class="mono">las imágenes no salen de tu navegador</span></div></div>{/if}
<div class="toasts">
  {#if error}<div class="message error" role="alert"><span class="dot"></span><span>{error}</span><button aria-label="Cerrar error" onclick={() => error=''}><X size={15}/></button></div>{/if}
  {#if notice}<div class="message" role="status"><span class="dot"></span><span>{notice}</span><button aria-label="Cerrar aviso" onclick={() => notice=''}><X size={15}/></button></div>{/if}
</div>
<div class="app-shell">
  <header>
    <a class="brand" href="./" aria-label="watermark, inicio">
      <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 15.5 9 8.5l3 5 3-5 3 7" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      watermark
    </a>
    <span class="chip"><span class="dot"></span>Procesado 100% local</span>
    <nav>
      <a href="https://ruxwez.dev" target="_blank" rel="noreferrer">ruxwez.dev <ArrowUpRight size={13}/></a>
      <a href="https://github.com/ruxwez/watermark" target="_blank" rel="noreferrer" aria-label="Código en GitHub"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg><span>GitHub</span></a>
    </nav>
  </header>
  <main>
    {#if !files.length}
      <section class="intro">
        <span class="eyebrow">Herramienta · Open source</span>
        <h1>Marca de agua en lote,<br/><span>sin subir nada.</span></h1>
        <p>Arrastra tus fotos, ajusta la firma una vez y descárgalas todas a resolución original. Todo pasa en tu navegador.</p>
      </section>
    {/if}
    <input bind:this={fileInput} class="sr-only" type="file" accept="image/*" multiple aria-label="Seleccionar imágenes" onchange={e=>{addFiles(e.currentTarget.files);e.currentTarget.value='';}} disabled={busy}/>
    <div class="workspace" class:empty={!files.length}>
      <section class="card stage-card">
        {#if files.length}
          <div class="card-head">
            <h2><span class="mono">{String(selected+1).padStart(2,'0')}<span class="of">/{String(files.length).padStart(2,'0')}</span></span><span class="name" title={current?.name}>{current?.name}</span></h2>
            <div class="toolbar">
              <button class="tool" aria-label="Ver original" title="Mantén pulsado para ver el original" aria-pressed={comparing} onpointerdown={()=>comparing=true} onpointerup={()=>comparing=false} onpointerleave={()=>comparing=false} onkeydown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();comparing=true;}}} onkeyup={()=>comparing=false} onblur={()=>comparing=false}><Eye size={15}/><span>Original</span></button>
              <button class="tool" aria-label="Descargar esta imagen" title="Descargar solo esta imagen" disabled={busy} onclick={()=>downloadOne(selected)}><Download size={15}/><span>Solo esta</span></button>
            </div>
          </div>
          <div class="preview-stage" class:movable={config.mode==='single'&&!comparing} class:moving onpointerdown={stagePointerDown} onpointermove={e=>{if(moving)moveMark(e);}} onpointerup={()=>moving=false} onpointercancel={()=>moving=false} role="presentation">
            <canvas bind:this={previewCanvas} class:hidden={comparing||!rendered} aria-label="Vista previa con la marca de agua"></canvas>
            {#if comparing||!rendered}<img src={current?.url} alt="Imagen original"/>{/if}
            <span class="stage-tag mono">{comparing ? 'original' : 'vista previa'} · {current?.width}×{current?.height}</span>
            {#if config.mode==='single'&&!comparing}<span class="drag-hint"><Move size={13}/> Arrastra para mover la marca</span>{/if}
            {#if files.length>1}
              <button class="nav prev" aria-label="Imagen anterior" onpointerdown={e=>e.stopPropagation()} onclick={()=>step(-1)}><ChevronLeft size={18}/></button>
              <button class="nav next" aria-label="Imagen siguiente" onpointerdown={e=>e.stopPropagation()} onclick={()=>step(1)}><ChevronRight size={18}/></button>
            {/if}
          </div>
          <div class="filmstrip">
            {#each files as file,i (file.url)}<div class="thumb" class:active={selected===i}><button class="thumb-select" aria-label={`Vista previa de ${file.name}`} aria-current={selected===i} onclick={()=>selected=i}><img src={file.url} alt={file.name}/></button><button class="remove" disabled={busy} aria-label={`Eliminar ${file.name}`} title="Quitar del lote" onclick={()=>remove(i)}><X size={11}/></button></div>{/each}
            <button class="thumb add" disabled={busy} aria-label="Añadir más imágenes" title="Añadir más imágenes" onclick={()=>fileInput.click()}><Plus size={18}/></button>
          </div>
          <div class="card-foot"><span class="mono"><kbd>←</kbd><kbd>→</kbd> cambiar · <kbd>Ctrl</kbd><kbd>V</kbd> pegar · arrastra archivos donde quieras</span><button class="link danger" disabled={busy} onclick={clearAll}><Trash2 size={13}/> Vaciar lote</button></div>
        {:else}
          <button class="dropzone" disabled={busy} onclick={()=>fileInput.click()}>
            <span class="drop-icon"><Upload size={22}/></span>
            <strong>Arrastra tus imágenes aquí</strong>
            <span>o haz clic para elegirlas. También puedes pegarlas con <kbd>Ctrl</kbd><kbd>V</kbd>.</span>
            <span class="formats mono">PNG · JPG · WebP · SVG — sin límite de archivos</span>
          </button>
        {/if}
      </section>
      <aside class="card settings" inert={busy || !ready}>
        <div class="card-head"><h2>Ajustes</h2><button class="link" onclick={resetConfig} title="Volver a los ajustes iniciales"><RotateCcw size={13}/> Restablecer</button></div>
        <section class="group">
          <h3><span>01</span>Contenido</h3>
          <Tabs.Root bind:value={config.type}>
            <Tabs.List class="tabs" aria-label="Tipo de marca de agua"><Tabs.Trigger value="text"><Type size={14}/> Texto</Tabs.Trigger><Tabs.Trigger value="image"><ImageIcon size={14}/> Imagen</Tabs.Trigger></Tabs.List>
            <Tabs.Content value="text" class="tab-content">
              <label for="signature">Tu firma</label><input id="signature" type="text" bind:value={config.text} maxlength="200" placeholder="© Tu nombre o marca"/>
              <span class="field-label spaced">Tipografía</span>
              <div class="segmented" role="radiogroup" aria-label="Tipografía">{#each fonts as font}<label class:on={config.font===font.value} style:font-family={font.value}><input class="sr-only" type="radio" name="font" value={font.value} bind:group={config.font}/>{font.name}</label>{/each}</div>
              <span class="field-label spaced">Color</span>
              <div class="swatches" role="group" aria-label="Color">
                {#each swatches as swatch}<button class="swatch" class:on={config.color.toLowerCase()===swatch} style:background={swatch} style:color={darkSwatches.includes(swatch) ? '#fff' : '#111'} aria-label={`Color ${swatch}`} aria-pressed={config.color.toLowerCase()===swatch} onclick={()=>config.color=swatch}>{#if config.color.toLowerCase()===swatch}<Check size={13}/>{/if}</button>{/each}
                <label class="swatch custom" class:on={!swatches.includes(config.color.toLowerCase())} title="Color personalizado" style:background={swatches.includes(config.color.toLowerCase()) ? '' : config.color}><input id="color" class="sr-only" type="color" aria-label="Color personalizado" bind:value={config.color}/><Plus size={13}/></label>
                <span class="color-code mono">{config.color}</span>
              </div>
            </Tabs.Content>
            <Tabs.Content value="image" class="tab-content">
              <span class="field-label">Imagen de tu marca</span>
              <input bind:this={logoInput} class="sr-only" type="file" accept="image/*" aria-label="Imagen de tu marca" onchange={e=>{setLogo(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/>
              {#if config.logo}
                <div class="logo-preview"><img src={config.logo} alt="Logotipo de la marca de agua"/><div><button class="ghost small" onclick={()=>logoInput.click()}>Cambiar</button><button class="tool icon" aria-label="Eliminar logotipo" onclick={()=>config.logo=''}><Trash2 size={14}/></button></div></div>
              {:else}
                <button class="logo-drop" ondragover={e=>e.preventDefault()} ondrop={e=>{e.preventDefault();e.stopPropagation();dragDepth=0;dropping=false;setLogo(e.dataTransfer.files?.[0]);}} onclick={()=>logoInput.click()}><ImagePlus size={18}/><strong>Elegir logotipo</strong><span>o arrástralo aquí</span></button>
              {/if}
              <p class="hint">Un PNG con fondo transparente da el mejor resultado.</p>
            </Tabs.Content>
          </Tabs.Root>
        </section>
        <section class="group">
          <h3><span>02</span>Posición</h3>
          <div class="segmented" role="radiogroup" aria-label="Distribución"><label class:on={config.mode==='single'}><input class="sr-only" type="radio" name="mode" value="single" bind:group={config.mode}/>Una posición</label><label class:on={config.mode==='repeat'}><input class="sr-only" type="radio" name="mode" value="repeat" bind:group={config.mode}/>Mosaico</label></div>
          {#if config.mode==='single'}
            <div class="placement">
              <div class="position-grid" role="group" aria-label="Posición de la marca">{#each [0,50,100] as y}{#each [0,50,100] as x}<button class:chosen={config.x===x&&config.y===y} aria-label={`Posición ${x}% horizontal, ${y}% vertical`} aria-pressed={config.x===x&&config.y===y} onclick={()=>{config.x=x;config.y=y;}}><span></span></button>{/each}{/each}</div>
              <div class="placement-side"><p class="hint">Elige un punto o arrastra la marca sobre la vista previa.</p><div class="two-cols"><label class="coordinate">X %<input type="number" min="0" max="100" aria-label="Horizontal %" value={config.x} oninput={e=>config.x=Math.max(0,Math.min(100,+e.currentTarget.value))}/></label><label class="coordinate">Y %<input type="number" min="0" max="100" aria-label="Vertical %" value={config.y} oninput={e=>config.y=Math.max(0,Math.min(100,+e.currentTarget.value))}/></label></div></div>
            </div>
          {:else}
            {@render slider('gap','Separación',0,100,'%')}
          {/if}
        </section>
        <section class="group">
          <h3><span>03</span>Estilo</h3>
          {@render slider('size','Tamaño',3,60,'%')}
          {@render slider('opacity','Opacidad',0,100,'%')}
          {@render slider('rotation','Rotación',-180,180,'°')}
        </section>
        <section class="group">
          <h3><span>04</span>Exportación</h3>
          <div class="segmented" role="radiogroup" aria-label="Formato de salida">{#each formats as format}<label class:on={config.format===format.value}><input class="sr-only" type="radio" name="format" value={format.value} bind:group={config.format}/>{format.name}</label>{/each}</div>
          {#if config.format!=='image/png'}{@render slider('quality','Calidad',1,100,'%')}{/if}
        </section>
        <section class="group presets">
          <div class="preset-title"><h3><span><Bookmark size={12}/></span>Mis configuraciones</h3><Dialog.Root bind:open={dialog}><Dialog.Trigger class="link"><Plus size={13}/> Guardar</Dialog.Trigger><Dialog.Portal><Dialog.Overlay class="dialog-overlay"/><Dialog.Content class="dialog-content"><Dialog.Title class="dialog-title">Guardar configuración</Dialog.Title><Dialog.Description class="hint">Se guardan todos los ajustes y el logotipo en este navegador.</Dialog.Description><form onsubmit={e=>{e.preventDefault();saveProfile();}}><label for="preset-name">Nombre</label><input id="preset-name" bind:value={profileName} maxlength="80" placeholder="Mi firma habitual" required/><div class="dialog-actions"><Dialog.Close class="ghost">Cancelar</Dialog.Close><button class="primary" type="submit">Guardar</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root></div>
          {#if profiles.length}<div class="profile-list">{#each profiles as profile (profile.id)}<div><button class="profile-load" title="Aplicar esta configuración" onclick={()=>{config={...defaults,...profile.config};notice=`Configuración «${profile.name}» aplicada.`;}}>{profile.name}</button><button aria-label={`Eliminar configuración ${profile.name}`} onclick={()=>profiles=profiles.filter(p=>p.id!==profile.id)}><Trash2 size={13}/></button></div>{/each}</div>{:else}<p class="hint">Guarda tus ajustes para reutilizarlos en el próximo lote. Los actuales se recuerdan solos.</p>{/if}
        </section>
      </aside>
    </div>
    <div class="export-bar" class:idle={!files.length}>
      <div class="export-info"><strong>{files.length ? `${files.length} ${files.length===1?'imagen lista':'imágenes listas'}` : 'Sin imágenes todavía'}</strong><span class="mono">{formatName.toLowerCase()} · resolución original{files.length>1?' · zip':''}</span></div>
      <button class="primary download" disabled={!files.length||busy||!ready} onclick={download} style:--progress={`${busy?progress:0}%`}>{#if busy}<span class="spinner"></span>{files.length>1?`Preparando ZIP… ${progress}%`:'Preparando…'}{:else}<Download size={17}/>{files.length>1?'Descargar ZIP':'Descargar imagen'}{/if}</button>
    </div>
    {#if busy}<progress class="sr-only" max="100" value={progress} aria-label="Progreso de exportación"></progress>{/if}
  </main>
  <footer><span>Hecho por <a href="https://ruxwez.dev" target="_blank" rel="noreferrer">Jose G.</a></span><span class="mono">sin servidor · sin cuentas · GPL-3.0</span></footer>
</div>
