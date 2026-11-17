// FuelPilot - Relais Tankerkönig (Cloudflare Worker)
// Rôle : appeler l'API Tankerkönig à la place du navigateur pour que la clé API
// ne soit jamais visible dans le code public de FuelPilot.
//
// Key für den Zugriff auf die freie Tankerkönig-Spritpreis-API
// Für eigenen Key bitte hier https://creativecommons.tankerkoenig.de registrieren.
// Le key n'est PAS dans ce fichier : il est stocké comme secret Cloudflare
// (variable d'environnement TANKERKOENIG_API_KEY, via `npx wrangler secret put`).
//
// Respect des conditions Tankerkönig :
// - appels uniquement à la demande (quand un utilisateur calcule un trajet en Allemagne)
// - réponses mises en cache 5 minutes pour limiter la charge sur leur serveur
// - rayon limité à 25 km (maximum autorisé par list.php)

const ALLOWED_ORIGINS = [
  'https://jldaussy.github.io',
  'http://localhost:8000'
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET' || url.pathname !== '/list') {
      return new Response('Not found', { status: 404, headers: cors });
    }

    const lat = parseFloat(url.searchParams.get('lat'));
    const lng = parseFloat(url.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response('{"ok":false,"message":"lat/lng manquants"}', { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    // Hors d'Allemagne : inutile d'interroger Tankerkönig
    if (lat < 47.2 || lat > 55.1 || lng < 5.8 || lng > 15.1) {
      return new Response('{"ok":true,"stations":[]}', { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const rad = Math.min(25, Math.max(1, parseFloat(url.searchParams.get('rad')) || 15));
    // Arrondi des coordonnées (~1 km) pour mutualiser le cache entre utilisateurs
    const latR = lat.toFixed(2);
    const lngR = lng.toFixed(2);

    const cache = caches.default;
    const cacheKey = new Request(`https://cache.fuelpilot.internal/list?lat=${latR}&lng=${lngR}&rad=${rad}`);
    let resp = await cache.match(cacheKey);

    if (!resp) {
      const upstream = `https://creativecommons.tankerkoenig.de/json/list.php?lat=${latR}&lng=${lngR}&rad=${rad}&sort=dist&type=all&apikey=${env.TANKERKOENIG_API_KEY}`;
      const r = await fetch(upstream, { headers: { 'User-Agent': 'FuelPilot (JLDApps) - aquacheckjld@gmail.com' } });
      const body = await r.text();
      resp = new Response(body, {
        status: r.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
      });
      if (r.ok) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    }

    const out = new Response(resp.body, resp);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  }
};
