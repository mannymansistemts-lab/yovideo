// trends.js - Versión completa y corregida para nicho: catálogos, belleza y calzado
// REEMPLAZA: pon tu API key de YouTube aquí (o carga desde Netlify functions)
const API_KEY = (typeof process !== 'undefined' && process.env && process.env.YT_API_KEY) ? process.env.YT_API_KEY : 'AIzaSyDAQVkMZ_l73dK7pt9gaccYPn5L0vA3PGw';
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

// Config
const MAX_SEARCH = 12;
const MAX_VIDEO_DETAILS = 12;

// Utiles DOM
const $ = id => document.getElementById(id);
const safeText = t => (t == null ? '' : String(t));

// Normalizar texto para hashtags/keys
function normalizeToken(s) {
  if (!s && s !== 0) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // quitar acentos
    .replace(/[^\w\s#-]/g, '') // dejar letras,numeros,espacios,#,-
    .trim();
}

function makeHash(text) {
  if (!text) return '';
  const t = String(text).replace(/^#/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
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

// Buscar videos por query (brand + campaign)
async function searchVideos(query, country='MX', maxResults=MAX_SEARCH) {
  const q = encodeURIComponent(query || '');
  const url = `${YT_BASE}/search?part=snippet&type=video&maxResults=${maxResults}&q=${q}&relevanceLanguage=es&regionCode=${country}&key=${API_KEY}`;
  return fetchJson(url);
}

// Obtener detalles (snippet, statistics) de varios videoIds (coma-separados)
async function getVideosDetails(idsCsv) {
  if (!idsCsv) return { items: [] };
  const url = `${YT_BASE}/videos?part=snippet,statistics&id=${idsCsv}&maxResults=${MAX_VIDEO_DETAILS}&key=${API_KEY}`;
  return fetchJson(url);
}

// Lista de palabras de nicho (whitelist) y blacklist para filtrar tokens
const NICHO_PALABRAS = [
  "catalogo","catálogo","catalogos","catálogos","belleza","cosmetico","cosmético","cosmeticos","cosméticos",
  "avon","jafra","yanbal","esika","ésika","cyzone","arabela","stanhome","fuller","calzado","moda","zapato","zapatos",
  "venta","ventas","emprendedora","emprendimiento","promocion","promoción","oferta","ofertas","campaña","campana"
];
const TOKEN_BLACKLIST = [
  // palabras que suelen venir de música/viral y no interesan
  "whatsup","4nonblondes","whats","lyrics","lyric","lyricvideo","meme","challenge","official","video","audio",
  "minecraft","esports","fifa","rap","remix","cover"
];

// Extraer tags y publishedHours de snippets y descripciones
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
      // fallback simple si el entorno no soporta \p{}
      const found2 = desc.match(/#[A-Za-z0-9_]+/g) || [];
      found2.forEach(h => tags.push(normalizeToken(h)));
    }
    // también extraer tokens del título y canal
    if (sn.title) {
      const words = sn.title.split(/\s+/).map(w => normalizeToken(w));
      words.forEach(w => w && tags.push(w));
    }
    if (sn.channelTitle) {
      tags.push(normalizeToken(sn.channelTitle));
    }
    // published hour UTC -> ajustar a MX (UTC-6)
    if (sn.publishedAt) {
      const date = new Date(sn.publishedAt);
      const hourMX = (date.getUTCHours() - 6 + 24) % 24;
      publishedHours.push(hourMX);
    }
  }
  return { tags, publishedHours };
}

// Contar frecuencia y retornar ordenado (desc)
function freqSorted(arr) {
  const map = {};
  arr.forEach(x => { if (x) map[x] = (map[x] || 0) + 1; });
  return Object.keys(map).sort((a,b)=> map[b]-map[a]);
}

// Filtrar tokens para que se ajusten al nicho (whitelist OR contain brand words) y quitar blacklist
function filterTokensForNiche(tokens, brand) {
  const b = (brand || '').toLowerCase();
  const out = [];
  for (const t of tokens) {
    if (!t) continue;
    const tClean = t.replace(/^#/, '');
    // eliminar tokens muy cortos o numericos irrelevantes
    if (tClean.length <= 1 || /^\d+$/.test(tClean)) continue;
    // quitar blacklist
    if (TOKEN_BLACKLIST.some(bb => tClean.includes(bb))) continue;
    // si token contiene la marca o está en NICHO_PALABRAS -> aceptar
    if (b && tClean.includes(b)) {
      out.push(tClean);
      continue;
    }
    if (NICHO_PALABRAS.some(n => tClean.includes(n))) {
      out.push(tClean);
      continue;
    }
    // tokens genericos que podrían ser útiles (venta, oferta, promocion...)
    if (["oferta","ofertas","promocion","promoción","venta","ventas","catalogo","catálogo","belleza","calzado","moda"].includes(tClean)) {
      out.push(tClean);
      continue;
    }
    // si no pasa, lo descartamos
  }
  return out;
}

// Generar sugerencias: title, description, hashtags, tags, bestHours
function generateSuggestions({brand, campaign, summary, country, topTokens, topHours}) {
  const year = (new Date()).getFullYear();
  const brandClean = (brand || 'Marca').replace(/\s+/g,' ').trim();
  const campaignClean = (campaign || '').trim();
  // Titles
  const title1 = `${brandClean}${campaignClean ? ' ' + campaignClean : ''} ${year} | Ofertas y Novedades`.trim();
  const title2 = `${brandClean}${campaignClean ? ' ' + campaignClean : ''} — Catálogo ${year} (Lo más nuevo)`.trim();
  // Description
  const desc = `${summary ? summary + '\n\n' : ''}Descubre las mejores ofertas y lanzamientos de ${brandClean}${campaignClean ? ' ' + campaignClean : ''} ${year}. Ideal para vendedoras y clientes en ${country || 'México'}. Suscríbete para más catálogos y novedades.`;
  // Hashtags: priorizar tokens filtrados y añadir fijos relevantes
  const resultHashes = [];
  const fixed = ['#vendemasporcatalogo', '#catalogosdigitales', '#catalogosdebeleza', '#emprendedorasMexico'];
  // push fixed but limit later
  fixed.forEach(h=> { if (!resultHashes.includes(h)) resultHashes.push(h); });

  const MAX_HASH = 7;
  for (const t of topTokens) {
    if (resultHashes.length >= MAX_HASH) break;
    const h = makeHash(t);
    if (!resultHashes.includes(h) && h.length>1) resultHashes.push(h);
  }

  // asegurar básicos relacionados con la marca
  const basics = [
    makeHash(`catalogo ${brandClean}`),
    makeHash(`${brandClean} ${year}`),
    makeHash(`${brandClean} mexico`)
  ];
  for (const b of basics) {
    if (resultHashes.length < MAX_HASH && b && !resultHashes.includes(b)) resultHashes.push(b);
  }

  // Studio tags
  const studioTags = [];
  studioTags.push(`${brandClean}${campaignClean ? ' ' + campaignClean : ''}`.trim());
  studioTags.push(`${brandClean} ${year}`.trim());
  for (const t of topTokens.slice(0, 12)) {
    const tClean = t.replace(/^#/, '');
    if (tClean && !studioTags.includes(tClean)) studioTags.push(tClean);
  }

  // best hours top 3
  const bestHours = (topHours || []).slice(0,3).map(h => Number(h));

  return {
    titles: [title1, title2],
    description: desc,
    hashtags: resultHashes.map(h => h.replace(/#catalogosdebeleza/i, '#catalogosdebelleza')), // pequeño fix orto
    tags: studioTags,
    bestHours
  };
}

// Render en DOM: tendencias
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

// Render resultado
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

// Función principal
async function runGenerator({brand, campaign, summary, country='MX'}) {
  clearError();
  setStatus('buscando en YouTube...');
  try {
    const q = `${brand || ''} ${campaign || ''}`.trim() || '';
    let searchJson = null;
    try {
      // Si query vacía, pedimos los videos más populares directamente
      if (q) {
        searchJson = await searchVideos(q, country, MAX_SEARCH);
      }
    } catch (e) {
      console.warn('searchVideos falló:', e);
      searchJson = null;
    }

    let items = (searchJson && searchJson.items) ? searchJson.items : [];

    // si no hay items o query vacía -> pedir mostPopular (videos endpoint)
    if (!items.length) {
      setStatus('sin resultados por query, pidiendo top populares...');
      const popularUrl = `${YT_BASE}/videos?part=snippet&chart=mostPopular&regionCode=${country}&maxResults=${Math.min(MAX_VIDEO_DETAILS,12)}&key=${API_KEY}`;
      const pop = await fetchJson(popularUrl);
      items = pop.items || [];
    }

    // renderizar títulos en tendencias
    const trendTitles = (items || []).map(it => {
      const sn = it.snippet || {};
      return sn.title || sn.description || 'Video';
    });
    renderTendencias(trendTitles);

    // Extraer IDs de los resultados (search vs videos endpoints tienen estructuras distintas)
    let ids = '';
    const extractedIds = [];
    for (const it of items) {
      // Search result: it.id.videoId
      if (it.id && it.id.videoId) {
        extractedIds.push(it.id.videoId);
        continue;
      }
      // videos endpoint: it.id es el id
      if (it.id && typeof it.id === 'string') {
        extractedIds.push(it.id);
        continue;
      }
      // en algunos casos snippet.resourceId.videoId (playlist videos) - ignorar
      if (it.snippet && it.snippet.resourceId && it.snippet.resourceId.videoId) {
        extractedIds.push(it.snippet.resourceId.videoId);
      }
    }
    ids = extractedIds.filter(Boolean).slice(0, MAX_VIDEO_DETAILS).join(',');

    // detalles
    const details = await getVideosDetails(ids);
    const videoItems = details.items || [];

    // extraer tokens y horas
    const { tags: rawTags, publishedHours } = extractTagsAndHours(videoItems);

    // filtrar tokens por nicho y marca
    const filtered = filterTokensForNiche(rawTags, brand || '');
    const sortedTokens = freqSorted(filtered);

    // generar sugerencias
    const suggestions = generateSuggestions({
      brand, campaign, summary, country,
      topTokens: sortedTokens,
      topHours: freqSorted(publishedHours)
    });

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
      topTokens: ['catalogo','ofertas','belleza'],
      topHours: [11,19]
    });
    renderResultado(fallback);
    return fallback;
  }
}

// Integración con UI (index.html espera ids: titulo, campaign, descripcion, generarBtn, resultado, tendencias, status, err)
function initUI() {
  // asignar listener al boton
  const btn = $('generarBtn') || null;
  if (btn) {
    btn.addEventListener('click', async () => {
      const brand = $('titulo') ? $('titulo').value.trim() : '';
      const campaign = $('campaign') ? $('campaign').value.trim() : '';
      const summary = $('descripcion') ? $('descripcion').value.trim() : '';
      await runGenerator({ brand, campaign, summary, country: 'MX' });
    });
  } else {
    // si tu HTML usa inline onclick "generarSEO()", la exponemos
    window.generarSEO = async function() {
      const brand = $('titulo') ? $('titulo').value.trim() : '';
      const campaign = $('campaign') ? $('campaign').value.trim() : '';
      const summary = $('descripcion') ? $('descripcion').value.trim() : '';
      await runGenerator({ brand, campaign, summary, country: 'MX' });
    };
  }

  // añadir botón copiar resultado si existe contenedor
  const out = $('resultado');
  if (out) {
    const copyBtnId = 'copyResultadoBtn';
    if (!$('copyResultadoBtn')) {
      const btnCopy = document.createElement('button');
      btnCopy.id = copyBtnId;
      btnCopy.textContent = 'Copiar resultado';
      btnCopy.style.marginTop = '8px';
      btnCopy.addEventListener('click', () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(out.textContent || '').then(()=> {
            setStatus('Resultado copiado al portapapeles');
            setTimeout(()=> setStatus('listo'), 1800);
          });
        }
      });
      out.parentNode.insertBefore(btnCopy, out.nextSibling);
    }
  }
}

// Auto init
document.addEventListener('DOMContentLoaded', () => {
  if (API_KEY === 'YOUR_API_KEY_HERE' || !API_KEY) {
    showError('API key no configurada en trends.js. Reemplaza API_KEY en el archivo o usa Netlify env var YT_API_KEY.');
    renderTendencias(['Configura tu API key en trends.js para ver tendencias reales.']);
  } else {
    clearError();
    // Si hay clave, correr una carga inicial de populares (sin marca)
    runGenerator({ brand: '', campaign: '', summary: '', country: 'MX' }).catch(e=>console.warn(e));
  }
  initUI();
});
