// ✅ trends.js — versión optimizada para catálogos de cosméticos y calzado

// 🔑 Reemplaza con tu API real de YouTube Data v3
const API_KEY = 'AIzaSyDAQVkMZ_l73dK7pt9gaccYPn5L0vA3PGw';
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

// Configuración general
const MAX_SEARCH = 12;
const MAX_VIDEO_DETAILS = 12;

// Utilidades DOM
const $ = id => document.getElementById(id);
const safeText = t => (t == null ? '' : String(t));

// Normalizar texto
function normalizeToken(s) {
  return s
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s#-]/g, '')
    .trim();
}

function makeHash(text) {
  if (!text) return '';
  const t = text
    .replace(/^#/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/gi, '')
    .trim()
    .replace(/\s+/g, '');
  return t ? '#' + t : '';
}

// Helpers UI
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

// 1️⃣ Buscar videos por marca/campaña
async function searchVideos(query, country = 'MX', maxResults = MAX_SEARCH) {
  const q = encodeURIComponent(query);
  const url = `${YT_BASE}/search?part=snippet&type=video&maxResults=${maxResults}&q=${q}&relevanceLanguage=es&regionCode=${country}&key=${API_KEY}`;
  return fetchJson(url);
}

// 2️⃣ Obtener detalles
async function getVideosDetails(idsCsv) {
  if (!idsCsv) return { items: [] };
  const url = `${YT_BASE}/videos?part=snippet,statistics&id=${idsCsv}&key=${API_KEY}`;
  return fetchJson(url);
}

// 3️⃣ Extraer tags y hashtags desde YouTube
function extractTagsAndHours(videoItems) {
  const tags = [];
  const publishedHours = [];

  for (const v of videoItems || []) {
    const sn = v.snippet || {};

    (sn.tags || []).forEach(t => tags.push(normalizeToken(t)));

    const desc = sn.description || '';
    const found = desc.match(/#[A-Za-z0-9_áéíóúñÁÉÍÓÚ]+/g) || [];
    found.forEach(h => tags.push(normalizeToken(h)));

    if (sn.publishedAt) {
      const date = new Date(sn.publishedAt);
      const hourMX = (date.getUTCHours() - 6 + 24) % 24;
      publishedHours.push(hourMX);
    }
  }

  return { tags, publishedHours };
}

// 4️⃣ Contar frecuencia
function freqSorted(arr) {
  const map = {};
  arr.forEach(x => { if (x) map[x] = (map[x] || 0) + 1; });
  return Object.keys(map).sort((a, b) => map[b] - map[a]);
}

// 5️⃣ Generar sugerencias SEO
function generateSuggestions({ brand, campaign, summary, country, topTokens, topHours }) {
  const year = new Date().getFullYear();
  const brandClean = brand || 'Catálogo';
  const campaignClean = campaign || '';

  const title1 = `${brandClean} ${campaignClean} ${year} | Ofertas y Novedades`;
  const title2 = `${brandClean} ${campaignClean} — Catálogo ${year} (Lo más nuevo)`;

  const desc =
`${summary ? summary + '\n\n' : ''}
Descubre las mejores ofertas y lanzamientos del catálogo ${brandClean} ${campaignClean} ${year}. Ideal para emprendedoras, vendedoras y amantes de los cosméticos y calzado en ${country || 'México'}. Suscríbete para más catálogos y novedades.`.trim();

  // Hashtags fijos de tu nicho
  const fixedHashtags = [
    "#CatalogosDigitales",
    "#VentasPorCatalogo",
    "#CosmeticosMexico",
    "#Calzado2025",
    "#EmprendedorasLatinas",
    "#BellezaYEstilo",
    "#OfertasCatalogo"
  ];

  // Limpiar y mezclar hashtags
  const hashtagsLimpios = [];
  for (const t of topTokens) {
    const h = makeHash(t);
    if (h.length > 2 && !hashtagsLimpios.includes(h) && !fixedHashtags.includes(h)) {
      hashtagsLimpios.push(h);
    }
  }

  const finalHashtags = [...fixedHashtags, ...hashtagsLimpios].slice(0, 10);

  // Etiquetas Studio
  const studioTags = [
    `${brandClean} ${campaignClean}`,
    `${brandClean} ${year}`,
    "catálogos digitales",
    "cosméticos",
    "calzado",
    "emprendedoras México",
    "ventas por catálogo"
  ];

  const bestHours = (topHours || []).slice(0, 3).map(h => Number(h));

  return {
    titles: [title1, title2],
    description: desc,
    hashtags: finalHashtags,
    tags: studioTags,
    bestHours
  };
}

// 6️⃣ Mostrar tendencias
function renderTendencias(list) {
  const ul = $('tendencias');
  if (!ul) return;
  ul.innerHTML = '';
  if (!list || !list.length) {
    ul.innerHTML = '<li>No hay tendencias disponibles</li>';
    return;
  }
  for (const t of list.slice(0, 12)) {
    const li = document.createElement('li');
    li.textContent = safeText(t);
    ul.appendChild(li);
  }
}

// 7️⃣ Mostrar resultado
function renderResultado(sugg) {
  const out = $('resultado');
  if (!out) return;

  const title = sugg.titles?.[0] || '';
  const title2 = sugg.titles?.[1] || '';
  const desc = sugg.description || '';
  const hashtags = (sugg.hashtags || []).join(' ');
  const tags = (sugg.tags || []).join(', ');
  const hours = (sugg.bestHours || []).map(h => `${h}:00-${(h + 1) % 24}:00`).join(', ');

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

// 8️⃣ Función principal
async function runGenerator({ brand, campaign, summary, country = 'MX' }) {
  clearError();
  setStatus('Buscando videos en YouTube...');
  try {
    const q = `${brand} ${campaign}`.trim();
    let searchJson = await searchVideos(q || 'catálogos digitales', country, MAX_SEARCH);
    let items = (searchJson && searchJson.items) ? searchJson.items : [];

    if (!items.length) {
      setStatus('Sin resultados, mostrando más populares...');
      const popularUrl = `${YT_BASE}/videos?part=snippet&chart=mostPopular&regionCode=${country}&maxResults=${MAX_VIDEO_DETAILS}&key=${API_KEY}`;
      const pop = await fetchJson(popularUrl);
      items = pop.items || [];
    }

    const trendTitles = (items || []).map(it => it.snippet?.title || 'Video');
    renderTendencias(trendTitles);

    const ids = items.map(i => i.id?.videoId || i.id).filter(Boolean).join(',');
    const details = await getVideosDetails(ids);
    const videoItems = details.items || [];

    const { tags: rawTags, publishedHours } = extractTagsAndHours(videoItems);
    const sortedTokens = freqSorted(rawTags);

    const suggestions = generateSuggestions({
      brand, campaign, summary, country,
      topTokens: sortedTokens,
      topHours: freqSorted(publishedHours)
    });

    renderResultado(suggestions);
    setStatus('Listo ✅');
    return suggestions;
  } catch (err) {
    showError('Error al generar sugerencias: ' + (err.message || err));
    setStatus('Error ⚠️');
  }
}

// 9️⃣ Inicializar UI
function initUI() {
  const btn = $('generarBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      const brand = $('titulo')?.value.trim() || '';
      const summary = $('descripcion')?.value.trim() || '';
      await runGenerator({ brand, campaign: '', summary, country: 'MX' });
    });
  } else {
    window.generarSEO = async function () {
      const brand = $('titulo')?.value.trim() || '';
      const summary = $('descripcion')?.value.trim() || '';
      await runGenerator({ brand, campaign: '', summary, country: 'MX' });
    };
  }
}

// 🔄 Auto init
document.addEventListener('DOMContentLoaded', () => {
  if (API_KEY === 'TU_API_KEY_AQUI' || !API_KEY) {
    showError('⚠️ API key no configurada. Reemplaza TU_API_KEY_AQUI en trends.js');
  }
  initUI();
  if (API_KEY && API_KEY !== 'TU_API_KEY_AQUI') {
    runGenerator({ brand: '', campaign: '', summary: '', country: 'MX' }).catch(e => console.warn(e));
  } else {
    renderTendencias(['Agrega tu API key para ver tendencias reales.']);
  }
});
