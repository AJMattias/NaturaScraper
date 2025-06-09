const fs = require('fs');
const path = require('path');
const { firefox } = require('playwright');

const BASE_URL = 'https://www.naturacosmeticos.com.ar';
const categoriaNoPermitidas = 'promociones';

(async () => {
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    locale: 'es-AR'
  });

  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const categorias = await page.$$eval('[id^="swiper-wrapper"] a[href^="/c/"]', links => {
    return links.map(a => ({
      href: a.getAttribute('href'),
      nombre: a.getAttribute('href').split('/').pop().split('?')[0]
    }));
  });

  const productosTotales = [];

  for (const { href, nombre: categoria } of categorias) {
    if (categoria === categoriaNoPermitidas) continue;

    console.log(`\n🔍 Categoría: ${categoria}`);
    await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    let subcategorias = [];
    try {
      subcategorias = await page.$$eval('nav[aria-label*="atajos"] a[href^="/c/"]', subs => {
        return subs.map(sub => {
          const span = sub.querySelector('span.text-sub-2');
          const nombre = span ? span.textContent.trim().split(/\s+/)[0] : null;
          return {
            href: sub.getAttribute('href'),
            nombre: nombre
          };
        });
      });
    } catch (e) {
      subcategorias = [];
    }

    const urlsAScrapear = subcategorias.length > 0 ? subcategorias : [{ href, nombre: null }];

    for (const { href: subHref, nombre: subcategoria } of urlsAScrapear) {
      console.log(`🧭 Explorando subcategoría: ${subcategoria || 'general'}`);
      await page.goto(`${BASE_URL}${subHref}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      let totalEsperado = 0;
      try {
        totalEsperado = await page.$eval('[data-testid="search-total-results"]', el => {
          const match = el.textContent.match(/(\d+)/);
          return match ? parseInt(match[1]) : 0;
        });
        console.log(`📦 Total esperado de productos: ${totalEsperado}`);
      } catch {
        console.warn(`⚠️ No se pudo obtener el total de productos en ${subcategoria || categoria}`);
      }

      while (true) {
        const explorarMas = await page.$('button:text("Explorar más resultados")');
        if (!explorarMas) break;
        try {
          await explorarMas.click();
          await page.waitForTimeout(3000);
        } catch (err) {
          console.warn('⚠️ No se pudo hacer clic en "Explorar más resultados"');
          break;
        }
        const linksCargados = await page.$$eval('.grid [id^="product-card"] a[href*="/p/"]', anchors => anchors.map(a => a.href));
        if (totalEsperado && linksCargados.length >= totalEsperado) break;
      }

      let productLinks = await page.$$eval('.grid [id^="product-card"] a[href*="/p/"]', anchors => anchors.map(a => a.href));

      if (productLinks.length === 0) {
        console.warn(`⚠️ No se encontraron productos visibles en la categoría: ${categoria}`);
        continue;
      }

      const visitados = new Set();

      for (const link of productLinks) {
        if (visitados.has(link)) {
          console.warn('⚠️ Producto duplicado, omitido:', link);
          continue;
        }
        visitados.add(link);

        try {
          console.log(`🛒 Entrando a producto: ${link}`);
          await page.goto(link, { waitUntil: 'domcontentloaded' });

          await page.waitForFunction(() => {
            const h1 = document.querySelector('h1');
            return h1 && h1.innerText.trim().length > 0;
          }, { timeout: 10000 });

          await page.waitForTimeout(1000);

          const data = await page.evaluate(({ categoria, link, subcategoria }) => {
            const getText = (selector) => {
              const el = document.querySelector(selector);
              return el ? el.innerText.trim() : '';
            };

            const nombre = getText('h1');

            let descripcion = '';
            const descElements = document.querySelectorAll('p.MuiTypography-body1');
            if (descElements && descElements.length > 0) {
              descripcion = Array.prototype.map.call(descElements, p => p.innerText.trim())
                .filter(text => text && !text.includes('$'))
                .join('\n');
            }

            const precio = getText('h6.MuiTypography-h6');

            let precioDescuento = '';
            for (let el of document.querySelectorAll('p.MuiTypography-body1')) {
              const text = el.innerText?.trim();
              if (text?.includes('$')) {
                precioDescuento = text;
                break;
              }
            }

            let precioSinImpuestos = null;
            const spans = document.querySelectorAll('span');
            for (let i = 0; i < spans.length; i++) {
              const text = spans[i].innerText?.toLowerCase();
              if (text && text.includes('precio sin impuestos')) {
                precioSinImpuestos = spans[i].innerText.trim();
                break;
              }
            }

            const stock = document.body.innerText.toLowerCase().includes('comprar') ? 'Disponible' : 'Sin stock';

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
              precioDescuento,
              precioSinImpuestos,
              stock,
              categoria,
              subcategoria,
              imagenes,
              link
            };
          }, { categoria, link, subcategoria });

          if (
            data.nombre.toLowerCase().includes('access denied') ||
            !data.nombre ||
            !data.precio
          ) {
            console.warn('⛔ Producto bloqueado o inválido, omitido:', link);
            continue;
          }

          productosTotales.push(data);
          console.log('✔️ Producto OK:', data.nombre);
          console.log('productos totales cantidad: ', productosTotales.length);

          const delay = Math.floor(Math.random() * 5000) + 5000;
          await page.waitForTimeout(delay);

          if (productosTotales.length % 50 === 0) {
            console.log('🕒 Pausa de 1 minuto para evitar bloqueos...');
            await page.waitForTimeout(60000);
          }
        } catch (err) {
          console.error('❌ Error al procesar producto:', link, '\nMotivo:', err.message);
        }
      }
    }
  }

  await browser.close();

  const date = new Date();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const outputPath = path.resolve(__dirname, `productos_natura_${day}-${month}-${year}-${date.now()}.json`);

  fs.writeFileSync(outputPath, JSON.stringify(productosTotales, null, 2), 'utf-8');
  console.log(`\n✅ Scraping finalizado. Se guardaron ${productosTotales.length} productos en ${outputPath}`);
})();
