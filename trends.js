// trends.js - completo y listo
// REEMPLAZA: pon tu API key de YouTube aquí (o pon la variable desde Netlify functions)
const API_KEY = 'AIzaSyDAQVkMZ_l73dK7pt9gaccYPn5L0vA3PGw'; // <- reemplaza esto
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

// Config
const MAX_SEARCH = 12;
const MAX_VIDEO_DETAILS = 12;

// Utilidades
const $ = id => document.getElementById(id);
const safeText = t => (t == null ? '' : String(t));

// Normalizar texto para hashtags/keys
function normalizeToken(s) {
  return s.toString()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w\s#-]/g, '')
    .trim();
}

function makeHash(text) {
  if (!text) return '';
  const t = text.replace(/^#/, '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/gi,'').trim().replace(/\s+/g,'');
  return t ? '#' + t : '';
}

// DOM helpers
function setStatus(msg) {
  const s = $('status');
  if (s) s.textContent = 'Estado: ' + msg;
}
function showError(msg) {
  const e = $('err');
  if (e) { e.style.display = 'block'; e.textContent = msg; }
  console.error(msg);
}
function clearError() {
  const e = $('err');
  if (e) { e.style.display = 'none'; e.textContent = ''; }
}

// Fetch helpers
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  return r.json();
}

// 1) Buscar videos por query (brand + campaign)
async function searchVideos(query, country='MX', maxResults=MAX_SEARCH) {
  const q = encodeURIComponent(query);
  const url = `${YT_BASE}/search?part=snippet&type=video&maxResults=${maxResults}&q=${q}&relevanceLanguage=es&regionCode=${country}&key=${API_KEY}`;
  return fetchJson(url);
}

// 2) Obtener detalles (snippet, statistics) de varios videoIds (coma-separados)
async function getVideosDetails(idsCsv) {
  if (!idsCsv) return { items: [] };
  const url = `${YT_BASE}/videos?part=snippet,statistics&id=${idsCsv}&key=${API_KEY}`;
  return fetchJson(url);
}

// 3) Extraer tags y hashtags desde snippets y descripciones
function extractTagsAndHours(videoItems) {
  const tags = [];
  const publishedHours = [];
  for (const v of videoItems || []) {
    const sn = v.snippet || {};
    // snippet.tags
    (sn.tags || []).forEach(t => tags.push(normalizeToken(t)));
    // hashtags en description (#algo)
    const desc = sn.description || '';
    try {
      const found = desc.match(/#[\p{L}\p{N}_]+/gu) || [];
      found.forEach(h => tags.push(normalizeToken(h)));
    } catch (e) {
      // Si no soporta \p{}, fallback simple:
      const found2 = desc.match(/#[A-Za-z0-9_]+/g) || [];
      found2.forEach(h => tags.push(normalizeToken(h)));
    }
    // published hour UTC -> ajustar a MX (UTC-6 fijo para simplicidad)
    if (sn.publishedAt) {
      const date = new Date(sn.publishedAt);
      const hourMX = (date.getUTCHours() - 6 + 24) % 24;
      publishedHours.push(hourMX);
    }
  }
  return { tags, publishedHours };
}

// 4) Contar frecuencia y retornar ordenado
function freqSorted(arr) {
  const map = {};
  arr.forEach(x => { if (x) map[x] = (map[x] || 0) + 1; });
  return Object.keys(map).sort((a,b)=> map[b]-map[a]);
}

// 5) Generar sugerencias: title, description, hashtags, tags, bestHours
function generateSuggestions({brand, campaign, summary, country, topTokens, topHours}) {
  const year = (new Date()).getFullYear();
  const brandClean = brand || 'Marca';
  const campaignClean = campaign || '';
  // Title suggestions (dos variantes)
  const title1 = `${brandClean} ${campaignClean} ${year} | Ofertas y Novedades`;
  const title2 = `${brandClean} ${campaignClean} — Catálogo ${year} (Lo más nuevo)`;
  // Description template
  const desc = `${summary ? summary + '\n\n' : ''}Descubre las mejores ofertas y lanzamientos de ${brandClean} en este catálogo ${campaignClean} ${year}. Ideal para vendedoras y clientes en ${country || 'LATAM'}.`;
  // Hashtags: usar topTokens (limpiar y convertir a #)
  const resultHashes = [];
  const fixedA = '#vendemasporcatalogo';
  const fixedB = '#catalogosvirtualeslatam';
  resultHashes.push(fixedA);
  const maxPer = 7;
  for (const t of topTokens) {
    if (resultHashes.length >= maxPer) break;
    const h = t.startsWith('#') ? t : makeHash(t);
    if (!resultHashes.includes(h) && h !== fixedA && h.length>1) resultHashes.push(h);
  }
  // asegurar básicos
  const basics = [makeHash(`catalogo ${brandClean}`), makeHash(`${brandClean} ${year}`), makeHash(`${brandClean} mexico`)];
  for (const b of basics) {
    if (resultHashes.length < maxPer && b && !resultHashes.includes(b)) resultHashes.push(b);
  }

  // Studio tags (etiquetas) - mezcla de topTokens y palabras clave
  const studioTags = [];
  studioTags.push(`${brandClean} ${campaignClean}`.trim());
  studioTags.push(`${brandClean} ${year}`.trim());
  topTokens.slice(0, 12).forEach(t => {
    const tClean = t.replace(/^#/, '');
    if (tClean && !studioTags.includes(tClean)) studioTags.push(tClean);
  });

  // best hours (tomar top 3)
  const bestHours = (topHours || []).slice(0,3).map(h => Number(h));

  return {
    titles: [title1, title2],
    description: desc,
    hashtags: resultHashes,
    tags: studioTags,
    bestHours
  };
}

// 6) Renderizar en DOM
function renderTendencias(list) {
  const ul = $('tendencias');
  if (!ul) return;
  ul.innerHTML = '';
  if (!list || !list.length) {
    ul.innerHTML = '<li>No hay tendencias</li>';
    return;
  }
  for (const t of list.slice(0,12)) {
    const li = document.createElement('li');
    li.textContent = safeText(t);
    ul.appendChild(li);
  }
}

function renderResultado(sugg) {
  const out = $('resultado');
  if (!out) return;
  const title = sugg.titles && sugg.titles[0] ? sugg.titles[0] : '';
  const title2 = sugg.titles && sugg.titles[1] ? sugg.titles[1] : '';
  const desc = sugg.description || '';
  const hashtags = (sugg.hashtags || []).join(' ');
  const tags = (sugg.tags || []).join(', ');
  const hours = (sugg.bestHours || []).map(h => `${h}:00-${(h+1)%24}:00`).join(', ');

  out.textContent = `
📢 TITULO SUGERIDO:
${title}

📝 DESCRIPCIÓN SUGERIDA:
${desc}

🔥 HASHTAGS:
${hashtags}

🏷️ ETIQUETAS (YouTube Studio):
${tags}

⏰ MEJORES HORARIOS (MX):
${hours}

💡 Alternativa de título:
${title2}
  `.trim();
}

// 7) Función principal: unir todo
async function runGenerator({brand, campaign, summary, country='MX'}) {
  clearError();
  setStatus('buscando en YouTube...');
  try {
    const q = `${brand} ${campaign}`.trim();
    let searchJson = null;
    try {
      searchJson = await searchVideos(q || 'most popular', country, MAX_SEARCH);
    } catch (e) {
      console.warn('searchVideos falló:', e);
      searchJson = null;
    }

    let items = (searchJson && searchJson.items) ? searchJson.items : [];

    // si no hay items, pedir mostPopular
    if (!items.length) {
      setStatus('sin resultados, pidiendo más populares...');
      const popularUrl = `${YT_BASE}/videos?part=snippet&chart=mostPopular&regionCode=${country}&maxResults=${Math.min(MAX_VIDEO_DETAILS,12)}&key=${API_KEY}`;
      const pop = await fetchJson(popularUrl);
      items = pop.items || [];
    }

    // mostrar títulos en lista de tendencias
    const trendTitles = (items || []).map(it => (it.snippet && it.snippet.title) ? it.snippet.title : (it.snippet ? it.snippet.description : 'Video'));
    renderTendencias(trendTitles);

    // obtener ids para pedir detalles (si search returned ids in item.id.videoId)
    const ids = (items.map(i => (i.id && i.id.videoId) ? i.id.videoId : i.id).filter(Boolean)).join(',');
    // si items desde videos endpoint ya tienen id.videoId o id
    const details = await getVideosDetails(ids || (items.map(i => i.id).filter(Boolean).join(',')));
    const videoItems = details.items || [];

    // extraer tags y horas
    const { tags: rawTags, publishedHours } = extractTagsAndHours(videoItems);

    // ordenar tokens por frecuencia
    const sortedTokens = freqSorted(rawTags);

    // generar sugerencias
    const suggestions = generateSuggestions({
      brand, campaign, summary, country,
      topTokens: sortedTokens,
      topHours: freqSorted(publishedHours)
    });

    // render resultado
    renderResultado(suggestions);
    setStatus('listo');
    return suggestions;
  } catch (err) {
    setStatus('error');
    showError('Error al generar sugerencias: ' + (err.message || err));
    // fallback simple
    const fallback = generateSuggestions({
      brand,
      campaign,
      summary,
      country,
      topTokens: [],
      topHours: [19,20]
    });
    renderResultado(fallback);
    return fallback;
  }
}

// 8) Integración con UI (asume index.html con ids: titulo, descripcion, resultado, tendencias)
function initUI() {
  const btn = $('generarBtn') || null;
  // If your index.html uses inline onclick, this will still work:
  // We'll attach listener to existing button if available (#generarBtn) otherwise fallback to window function.
  if (btn) {
    btn.addEventListener('click', async () => {
      const brand = $('titulo') ? $('titulo').value.trim() : '';
      const summary = $('descripcion') ? $('descripcion').value.trim() : '';
      const campaign = ''; // si quieres, crea input para campaign
      await runGenerator({ brand, campaign, summary, country: 'MX' });
    });
  } else {
    // If button uses inline onclick "generarSEO()", provide that global function
    window.generarSEO = async function() {
      const brand = $('titulo') ? $('titulo').value.trim() : '';
      const summary = $('descripcion') ? $('descripcion').value.trim() : '';
      await runGenerator({ brand, campaign: '', summary, country: 'MX' });
    };
  }
}

// Auto init
document.addEventListener('DOMContentLoaded', () => {
  if (API_KEY === 'YOUR_API_KEY_HERE' || !API_KEY) {
    showError('API key no configurada en trends.js. Reemplaza API_KEY en el archivo.');
    // still init UI so fallback works
  } else {
    clearError();
  }
  initUI();
  // también cargar tendencias iniciales (top populares) si clave está presente
  if (API_KEY && API_KEY !== 'YOUR_API_KEY_HERE') {
    runGenerator({ brand: '', campaign: '', summary: '', country: 'MX' }).catch(e=>console.warn(e));
  } else {
    // mostrar mensaje en lista
    renderTendencias(['Configura tu API key en trends.js para ver tendencias reales.']);
  }
});

