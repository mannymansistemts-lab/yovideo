// functions/trends.js
// Netlify function (Node 18+). Usa YOUTUBE_API_KEY desde Environment Variables.

export async function handler(event, context) {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    const YT_KEY = process.env.YOUTUBE_API_KEY;
    if (!YT_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing YOUTUBE_API_KEY in env' }) };
    }

    const params = event.queryStringParameters || {};
    const brand = (params.brand || '').trim();
    const campaign = (params.campaign || '').trim();
    const summary = (params.summary || '').trim();
    const country = (params.country || 'MX').trim();
    const maxVideos = parseInt(params.max || '12', 10);

    if (!brand) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'brand query param required' }) };
    }

    // search
    const q = encodeURIComponent(`${brand} ${campaign}`.trim());
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxVideos}&q=${q}&relevanceLanguage=es&regionCode=${country}&key=${YT_KEY}`;
    const searchResp = await fetch(searchUrl);
    const searchJson = await searchResp.json();
    const items = searchJson.items || [];
    const videoIds = items.map(i => i.id?.videoId).filter(Boolean).join(',');
    let ytTags = [];
    const publishedHours = [];

    if (videoIds) {
      const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${YT_KEY}`;
      const videosResp = await fetch(videosUrl);
      const videosJson = await videosResp.json();
      for (const v of (videosJson.items || [])) {
        const tags = v.snippet.tags || [];
        ytTags = ytTags.concat(tags.map(t => t.toLowerCase()));
        const desc = v.snippet.description || '';
        const found = (desc.match(/#[\p{L}\p{N}_]+/gu) || []).map(h => h.toLowerCase());
        ytTags = ytTags.concat(found);
        if (v.snippet.publishedAt) {
          const date = new Date(v.snippet.publishedAt);
          const hourMX = (date.getUTCHours() - 6 + 24) % 24;
          publishedHours.push(hourMX);
        }
      }
    }

    const normalize = s => s.toString().toLowerCase().replace(/[^\w#\sáéíóúüñ\-]/g, '').trim();
    const freq = {};
    ytTags.map(t => normalize(t)).filter(Boolean).forEach(t => { freq[t] = (freq[t] || 0) + 1; });
    const sorted = Object.keys(freq).sort((a,b) => freq[b] - freq[a]);

    const makeHash = txt => {
      const t = txt.replace(/^#/, '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/gi,'').trim().replace(/\s+/g,'');
      return '#' + t;
    };

    const fixedA = '#vendemasporcatalogo';
    const fixedB = '#catalogosvirtualeslatam';
    const maxPerChannel = 7;
    const resultA = [fixedA];
    const resultB = [fixedB];

    for (const t of sorted) {
      if (resultA.length >= maxPerChannel && resultB.length >= maxPerChannel) break;
      const h = t.startsWith('#') ? t : makeHash(t);
      if (!resultA.includes(h) && !resultB.includes(h) && h !== fixedA && h !== fixedB) {
        if (resultA.length <= resultB.length && resultA.length < maxPerChannel) resultA.push(h);
        else if (resultB.length < maxPerChannel) resultB.push(h);
      }
    }

    const year = new Date().getFullYear();
    const basics = [
      makeHash(`catalogo ${brand}`),
      makeHash(`${brand} ${campaign}`),
      makeHash(`${brand} ${year}`),
      makeHash(`${brand} mexico`)
    ];
    for (const b of basics) {
      if (resultA.length < maxPerChannel && !resultA.includes(b)) resultA.push(b);
      if (resultB.length < maxPerChannel && !resultB.includes(b) && !resultA.includes(b)) resultB.push(b);
    }

    const studioTags = [
      `catalogo ${brand} ${campaign} ${year}`.trim(),
      `${brand} ${year}`.trim(),
      `${brand} mexico`,
      `ofertas ${brand}`,
    ];
    if (summary) {
      summary.split(',').map(s => s.trim()).filter(Boolean).forEach(k => studioTags.push(`${k} ${brand}`));
    }

    let bestHours = [];
    if (publishedHours.length) {
      const countH = {};
      publishedHours.forEach(h => countH[h] = (countH[h] || 0) + 1);
      const sortedH = Object.keys(countH).sort((a,b) => countH[b] - countH[a]);
      bestHours = sortedH.slice(0,3).map(h => parseInt(h,10));
    } else {
      bestHours = [19,20];
    }

    const titleA = `${brand} ${campaign} ${year} | Ofertas y Novedades - Vende Más`;
    const titleB = `${brand} ${campaign} ${year} | Catálogo Virtual LATAM`;

    const descriptionA = `${summary ? summary + '\n\n' : ''}Descubre lo nuevo de ${brand} ${campaign} ${year}. Ideal para vendedores por catálogo. 📲 Descarga la app y comparte. ${fixedA}`;
    const descriptionB = `${summary ? summary + '\n\n' : ''}Explora el catálogo virtual de ${brand} ${campaign} ${year} para toda LATAM. ${fixedB}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        brand, campaign, summary, country,
        channelA: { name: 'Vende Más por Catálogo', title: titleA, description: descriptionA, hashtags: resultA.slice(0, maxPerChannel) },
        channelB: { name: 'Catálogos Virtuales LATAM', title: titleB, description: descriptionB, hashtags: resultB.slice(0, maxPerChannel) },
        tags: studioTags,
        bestHours, sampleCount: items.length
      })
    };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err.message || String(err) }) };
  }
}
