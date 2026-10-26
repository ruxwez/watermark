export const defaults = { type: 'text', text: '© Tu firma', logo: '', mode: 'single', x: 90, y: 90, size: 12, opacity: 45, rotation: -25, gap: 60, color: '#ffffff', font: 'sans-serif', format: 'image/png', quality: 92 };
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se puede leer esta imagen. Prueba con PNG, JPEG o WebP.'));
    image.src = src;
  });
}
export async function render(source, config, maxSize) {
  const img = await loadImage(source);
  const scale = maxSize ? Math.min(1, maxSize / Math.max(img.width, img.height)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No hay memoria disponible para procesar la imagen.');
  if (config.format === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const unit = Math.min(canvas.width, canvas.height);
  const width = unit * config.size / 100;
  let logo, w, h;
  if (config.type === 'image') {
    if (!config.logo) return canvas;
    logo = await loadImage(config.logo); w = width * 2; h = w * logo.height / logo.width;
    const fit = Math.min(1, unit * .8 / h); w *= fit; h *= fit;
  } else {
    if (!config.text.trim()) return canvas;
    ctx.font = `600 ${Math.max(1, width * .32)}px ${config.font}`;
    w = ctx.measureText(config.text).width; h = width * .4;
    const fit = Math.min(1, unit * .85 / Math.max(w, h));
    if (fit < 1) { ctx.font = `600 ${Math.max(1, width * .32 * fit)}px ${config.font}`; w *= fit; h *= fit; }
  }
  ctx.globalAlpha = config.opacity / 100;
  ctx.fillStyle = config.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const angle = config.rotation * Math.PI / 180;
  const bw = Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle));
  const bh = Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle));
  function stamp(x, y) { ctx.save(); ctx.translate(x,y); ctx.rotate(angle); if (logo) ctx.drawImage(logo,-w/2,-h/2,w,h); else ctx.fillText(config.text,0,0); ctx.restore(); }
  if (config.mode === 'repeat') {
    const gap = unit * config.gap / 100;
    const dx = Math.max(unit * .05, bw + gap), dy = Math.max(unit * .05, bh + gap);
    let row = 0;
    for (let y = -bh; y < canvas.height + bh; y += dy) {
      for (let x = -bw + (row % 2) * dx / 2; x < canvas.width + bw; x += dx) stamp(x,y);
      row++;
    }
  } else {
    const padX = Math.min(canvas.width / 2, bw / 2 + unit * .025);
    const padY = Math.min(canvas.height / 2, bh / 2 + unit * .025);
    stamp(padX + (canvas.width - 2 * padX) * config.x / 100, padY + (canvas.height - 2 * padY) * config.y / 100);
  }
  return canvas;
}
export function toBlob(canvas, config) {
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('La imagen supera los límites del navegador.')), config.format, config.quality / 100));
}
