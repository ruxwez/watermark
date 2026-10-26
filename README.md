# Watermark

SPA estática para aplicar una misma marca de agua a un lote de imágenes. Svelte 5, Vite, Tailwind CSS y Bits UI. No necesita servidor de aplicación ni envía imágenes a servicios externos.

## Desarrollo

Requiere Node.js 22.12 o superior y pnpm 11.25.0. Con Corepack disponible, ejecuta `corepack enable` para usar la versión fijada en `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

## Producción

```sh
pnpm check
pnpm test
pnpm build
pnpm preview
```

Para ejecutar las pruebas por primera vez: `pnpm exec playwright install chromium` (en Linux puede ser necesario `pnpm exec playwright install --with-deps chromium`). Publica el contenido de `dist/` en cualquier alojamiento estático, incluido GitHub Pages. La base relativa permite servirlo en `/watermark/`. No hay rutas que requieran fallback de servidor.

## Cloudflare con Wrangler

La configuración `wrangler.jsonc` sirve `dist/` mediante Workers Static Assets. No necesita código Worker ni backend; Cloudflare entrega los archivos estáticos y el navegador procesa las imágenes.

```sh
pnpm exec wrangler login
pnpm cf:dev
```

`cf:dev` compila y sirve la aplicación localmente con Wrangler. Para publicar en tu cuenta:

```sh
pnpm deploy
```

Este comando compila y ejecuta `wrangler deploy`. Puedes cambiar `name` en `wrangler.jsonc` para elegir otro nombre de aplicación. El dominio final lo muestra Wrangler al terminar. En la configuración de compilación de Cloudflare puedes usar `pnpm install --frozen-lockfile` como instalación y `pnpm deploy` como comando de despliegue. El bloque `previews` de `wrangler.jsonc` es necesario para que Cloudflare genere las previsualizaciones de cada pull request con `wrangler preview`. No se incluyen workflows de CI.

Los perfiles de IndexedDB pertenecen a cada origen: las configuraciones de localhost no se transfieren al dominio de Cloudflare.

## Uso

1. Arrastra o selecciona una o varias imágenes. Puedes añadir más al mismo lote.
2. Configura texto o logotipo, posición única (cuadrícula o coordenadas) o repetición, tamaño, opacidad, rotación y separación. Todos los archivos usan los mismos ajustes; las miniaturas solo seleccionan la vista previa.
3. Opcionalmente guarda perfiles con nombre. IndexedDB conserva los perfiles, el logotipo y los ajustes actuales al recargar, en el mismo navegador y origen. Las fotos del lote no se persisten. Borrar los datos del sitio elimina las configuraciones.
4. Elige PNG, JPEG o WebP y descarga el lote en un ZIP. Los nombres llevan un índice para evitar colisiones. Los originales no se modifican y se mantiene la resolución.

## Límites del navegador

No hay un límite fijo de cantidad impuesto por la aplicación. La memoria, el tamaño máximo de canvas y el espacio disponible limitan el lote. Las imágenes se procesan una a una, pero el ZIP final se conserva en memoria: para lotes muy grandes conviene dividirlos. Los formatos disponibles dependen del decodificador del navegador (HEIC no está garantizado). Las imágenes animadas se exportan como una imagen fija. La exportación mediante canvas no conserva metadatos EXIF. JPEG aplana la transparencia sobre blanco; si el navegador no puede codificar WebP utiliza PNG y su extensión real.

El tamaño y espaciado son proporcionales al lado menor de cada imagen. La vista previa se reduce por rendimiento; la descarga utiliza las dimensiones originales. Una marca única se mantiene dentro de la imagen en la medida que permite su tamaño y rotación. IndexedDB puede estar restringido en navegación privada y las cuotas dependen del navegador: si falla el guardado se muestra un aviso.
