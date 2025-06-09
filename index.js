// const fs = require('fs');
// const path = require('path');
// const { chromium, firefox } = require('playwright');

// const BASE_URL = 'https://www.naturacosmeticos.com.ar';
// const CATEGORIAS = [
//   'promociones',
//   'perfumeria',
//   'regalo',
//   'cuidados-diarios',
//   'maquillaje',
//   'cabello',
//   'rostro'
// ];

// async function scrapeCategoria(browserType, categoria) {
//   const browser = await browserType.launch({ headless: true });

//   const context = await browser.newContext({
//     userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
//     locale: 'es-AR'
//   });

//   const page = await context.newPage();
//   const url = `${BASE_URL}/c/${categoria}`;

//   try {
//     await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
//   } catch (error) {
//     console.error(`❌ Error al cargar ${categoria} con ${browserType.name()}:`, error.message);
//     await browser.close();
//     return [];
//   }

//   const productos = await page.$$eval('[id^="product-card"]', (cards, categoria) => {
//     return cards.map(card => {
//       const nombre = card.querySelector('h4')?.innerText?.trim() || '';
//       const descripcion = card.querySelector('h3')?.innerText?.trim() || '';
//       const precio_descontado = card.querySelector('#product-price-por')?.innerText?.trim() || '';
//       const precio = card.querySelector('#product-price-de')?.innerText?.trim() || null;
//       const stock = card.querySelector('[data-testid="btn-add-to-cart"]')?.innerText?.toLowerCase().includes('agregar') ? 'Disponible' : 'Sin stock';
//       const imagen = card.querySelector('img')?.src || '';

//       const producto = {
//         nombre,
//         descripcion,
//         precio,
//         stock,
//         categoria,
//         imagenes: imagen ? [imagen] : []
//       };

//       if (precio_descontado) {
//         producto.precio_descontado = precio_descontado;
//       }

//       return producto;
//     });
//   }, categoria); // <- se pasa como segundo parámetro

//   await browser.close();
//   return productos;
// }

// (async () => {
//   let productosTotales = [];

//   for (const categoria of CATEGORIAS) {
//     console.log(`🔍 Extrayendo productos de categoría: ${categoria}`);
//     let productos = await scrapeCategoria(chromium, categoria);

//     if (!productos.length) {
//       console.log(`🔁 Reintentando ${categoria} con Firefox...`);
//       productos = await scrapeCategoria(firefox, categoria);
//     }

//     productosTotales.push(...productos);
//   }

//   const outputPath = path.resolve(__dirname, 'productos_natura.json');
//   fs.writeFileSync(outputPath, JSON.stringify(productosTotales, null, 2), 'utf-8');
//   console.log(`✅ Se guardaron ${productosTotales.length} productos en ${outputPath}`);
// })();

const fs = require('fs');
const path = require('path');
const { firefox } = require('playwright');

const BASE_URL = 'https://www.naturacosmeticos.com.ar';
const TIMEOUT = 3000;

(async () => {
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    locale: 'es-AR'
  });
  const page = await context.newPage();

  // 1. Ir a la home y esperar el nav de categorías
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(TIMEOUT);

  // 2. Obtener categorías del nav principal
  const categorias = await page.$$eval('.swiper-slide a[href^="/c/"]', links =>
    links.map(link => ({
      href: link.getAttribute('href'),
      nombre: link.innerText.trim().toLowerCase().replace(/\s+/g, '-')
    }))
  );

  console.log('categorias: ', categorias)
  const productosTotales = [];

  for (const { href, nombre: categoria } of categorias) {
    // 🔧 Saltear categoría promo (descomentar para pruebas)
    if (categoria === 'promo') continue; 
    //const categoriasPermitidas = ['perfumeria', 'maquillaje', 'rostro', 'cuidados-diarios'];
    //if (!categoriasPermitidas.includes(categoria)) continue;
    console.log(`\n🔍 Categoría: ${categoria}`);
    await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(TIMEOUT);

    let hayMas = true;

    while (hayMas) {
      //v1 no funciona en categoria perfumeria
      // Esperar a que se carguen los product-cards reales
      //await page.waitForSelector('[id^="product-card"]', { timeout: 10000 });

      await page.waitForSelector('[id^="product-card"]', {
      timeout: 15000
      }).catch(() => null);

      // Verificamos si hay productos luego de esperar
      const cards = await page.$$('[id^="product-card"]');
      console.log('cards lenght: ', cards.length)
      if (cards.length === 0) {
        console.warn(`⚠️ No se encontraron productos visibles en la categoría: ${categoria}`);
        hayMas = false;
        break;
      }
      await page.waitForTimeout(TIMEOUT);

      // Obtener todos los productos visibles (links únicos)
      //const productLinks = await page.$$eval('[id^="product-card"] a[href*="/p/"]', anchors =>
      const productLinks = await page.$$eval('.grid [id^="product-card"] a[href*="/p/"]', anchors =>

        anchors.map(a => a.href).filter((v, i, a) => a.indexOf(v) === i)
      );

      for (const link of productLinks) {
        console.log(`🛒 Entrando a producto: ${link}`);
        await page.goto(link, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(TIMEOUT);

        // const data = await page.evaluate(({categoria, link}) => {
        //   const nombre = document.querySelector('h1')?.innerText?.trim() || '';
        //   const descripcion = document.querySelector('[data-testid="product-subtitle"]')?.innerText?.trim() || '';
        //   const precio = document.querySelector('[data-testid="product-price"]')?.innerText?.trim() || '';
        //   const precioDescuento = document.querySelector('[data-testid="price-from"]')?.innerText?.trim() || null;
        //   const precioSinImpuestos = document.querySelector('[data-testid="product-price-without-taxes"]')?.innerText?.trim() || null;
        //   const stock = document.querySelector('[data-testid="btn-add-to-cart"]')?.innerText?.toLowerCase().includes('agregar') ? 'Disponible' : 'Sin stock';
        //   const imagenes = Array.from(document.querySelectorAll('[data-testid="thumb-image"] img'))
        //     .map(img => img.src)
        //     .slice(0, 3);

        //     return {
        //     nombre,
        //     descripcion,
        //     precio,
        //     precioDescuento,
        //     precioSinImpuestos,
        //     stock,
        //     categoria,
        //     imagenes,
        //     link
        //   };
        // }, {categoria, link});

        console.log(`🛒 Entrando a producto: ${link}`);
        await page.goto(link, { waitUntil: 'domcontentloaded' });

        // 🔁 Esperar a que el producto cargue de verdad
        await page.waitForFunction(() => {
          const h1 = document.querySelector('h1');
          return h1 && h1.innerText.trim().length > 0;
        }, { timeout: 3000 });

        await page.waitForTimeout(3000);
        
        const data = await page.evaluate(({ categoria, link }) => {
        const getText = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.innerText.trim() : '';
        };

        const nombre = getText('h1');

        // ✅ Descripción: solo <p> que NO contienen precios
        let descripcion = '';
        const descElements = document.querySelectorAll('p.MuiTypography-body1');
        if (descElements && descElements.length > 0) {
          descripcion = Array.prototype.map.call(descElements, p => p.innerText.trim())
            .filter(text => text && !text.includes('$'))
            .join('\n');
        }

        // ✅ Precio actual con descuento (h6)
        const precio = getText('h6.MuiTypography-h6');

        // ✅ Precio original sin descuento (primer <p> con $)
        let precioSinDescuento = '';
        for (let el of document.querySelectorAll('p.MuiTypography-body1')) {
          const text = el.innerText?.trim();
          if (text?.includes('$')) {
            precioSinDescuento = text;
            break;
          }
        }

        // ✅ Precio sin impuestos
        let precioSinImpuestos = null;
        const spans = document.querySelectorAll('span');
        for (let i = 0; i < spans.length; i++) {
          const text = spans[i].innerText?.toLowerCase();
          if (text && text.includes('precio sin impuestos')) {
            precioSinImpuestos = spans[i].innerText.trim();
            break;
          }
        }

        // ✅ Stock
        const stock = document.body.innerText.toLowerCase().includes('comprar') ? 'Disponible' : 'Sin stock';

        // ✅ Imágenes del producto
        let imagenes = [];
        const imgElements = document.querySelectorAll('img');
        if (imgElements && imgElements.length > 0) {
          imagenes = Array.prototype.map.call(imgElements, img => img.src)
            .filter(src => src.includes('/on/demandware.static/'))
            .slice(0, 3);
        }

        return {
          nombre,
          descripcion,
          precio,
          precioSinDescuento,
          precioSinImpuestos,
          stock,
          categoria,
          imagenes,
          link
        };
      }, { categoria, link });


        console.log('producto: ', data)
        productosTotales.push(data);
        console.log('productos totales cantidad: ', productosTotales.length)
        try {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(3000); // dejar que cargue un poco más
        } catch (err) {
          console.warn('⚠️ No se pudo volver a la categoría. Saltando a la siguiente...');
          break; // salir del bucle de productos de esa categoría
        }
      }

      // Intentar hacer clic en "Explorar más resultados"
      const botonMas = await page.$('button:has-text("Explorar más resultados")');
      if (botonMas) {
        console.log('➡️ Explorando más resultados...');
        await botonMas.click();
        await page.waitForTimeout(TIMEOUT);
      } else {
        hayMas = false;
      }
    }
  }

  await browser.close();

  // Guardar los productos en JSON
  const date = new Date()
  const day = date.getDay()
  const month = date.getMonth()
  const year = date.getFullYear()
  const outputPath = path.resolve(__dirname, `productos_natura_${day}-${month}-${year}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(productosTotales, null, 2), 'utf-8');
  console.log(`\n✅ Scraping finalizado. Se guardaron ${productosTotales.length} productos en ${outputPath}`);
})();
