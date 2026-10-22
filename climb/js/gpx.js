/* Lecture des fichiers GPX (montres, Garmin, export Strava…) et dessin des tracés */
(function(){
  const R = 6371.0088;
  const rad = (d) => d * Math.PI / 180;
  function dist(a, b){
    const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat/2)**2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function parse(text){
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Fichier GPX illisible.');
    let nodes = [...doc.getElementsByTagName('trkpt')];
    if (!nodes.length) nodes = [...doc.getElementsByTagName('rtept')];
    if (nodes.length < 2) throw new Error('Aucun tracé trouvé dans ce fichier.');
    const pts = nodes.map(n => {
      const ele = n.getElementsByTagName('ele')[0], time = n.getElementsByTagName('time')[0];
      return [parseFloat(n.getAttribute('lat')), parseFloat(n.getAttribute('lon')), ele ? parseFloat(ele.textContent) : null, time ? Date.parse(time.textContent) : null];
    }).filter(p => isFinite(p[0]) && isFinite(p[1]));
    let km = 0; for (let i = 1; i < pts.length; i++) km += dist(pts[i-1], pts[i]);
    // Dénivelé : altitude lissée (moyenne glissante) et seuil de 3 m pour ignorer le bruit du GPS
    const eles = pts.map(p => p[2]);
    let gain = null;
    if (eles.filter(e => e != null).length > pts.length * 0.8){
      const sm = eles.map((e, i) => { let s = 0, n = 0; for (let k = Math.max(0, i-2); k <= Math.min(eles.length-1, i+2); k++) if (eles[k] != null){ s += eles[k]; n++; } return n ? s/n : null; });
      gain = 0; let ref = sm.find(e => e != null);
      for (const e of sm){ if (e == null) continue; if (e - ref >= 3){ gain += e - ref; ref = e; } else if (ref - e >= 3) ref = e; }
    }
    const times = pts.map(p => p[3]).filter(t => t != null && isFinite(t));
    const start = times.length ? new Date(times[0]) : null;
    const durationMin = times.length > 1 ? Math.round((times[times.length-1] - times[0]) / 60000) : null;
    const nameNode = doc.querySelector('trk > name') || doc.querySelector('metadata > name');
    return { track: simplify(pts), distanceKm: Math.round(km * 100) / 100, elevationGain: gain == null ? null : Math.round(gain), durationMin, start, name: nameNode ? nameNode.textContent.trim() : '' };
  }
  function simplify(pts, max = 600){
    const step = Math.max(1, Math.ceil(pts.length / max));
    const out = [];
    for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
    if (out[out.length-1] !== pts[pts.length-1]) out.push(pts[pts.length-1]);
    return out.map(p => p[2] != null ? [+p[0].toFixed(5), +p[1].toFixed(5), Math.round(p[2])] : [+p[0].toFixed(5), +p[1].toFixed(5)]);
  }
  // Tracé en SVG (léger, sans fond de carte) pour le fil d'actualité
  function svg(track, w = 320, h = 140, stroke = 'currentColor'){
    if (!Array.isArray(track) || track.length < 2) return '';
    const lat0 = track.reduce((s,p) => s + p[0], 0) / track.length, k = Math.cos(rad(lat0));
    const xs = track.map(p => p[1] * k), ys = track.map(p => -p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const s = Math.min((w - 16) / ((maxX - minX) || 1e-9), (h - 16) / ((maxY - minY) || 1e-9));
    const ox = (w - (maxX - minX) * s) / 2, oy = (h - (maxY - minY) * s) / 2;
    const pts = xs.map((x, i) => `${(ox + (x - minX) * s).toFixed(1)},${(oy + (ys[i] - minY) * s).toFixed(1)}`);
    const [sx, sy] = pts[0].split(','), [ex, ey] = pts[pts.length-1].split(',');
    return `<svg class="trace" viewBox="0 0 ${w} ${h}" role="img" aria-label="Tracé de l'activité"><polyline points="${pts.join(' ')}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${sx}" cy="${sy}" r="4.5" fill="var(--ok)"/><circle cx="${ex}" cy="${ey}" r="4.5" fill="var(--warn)"/></svg>`;
  }
  // Profil d'altitude
  function profile(track, w = 320, h = 90){
    if (!Array.isArray(track) || track.length < 2 || track.some(p => p[2] == null)) return '';
    const d = [0]; for (let i = 1; i < track.length; i++) d.push(d[i-1] + dist(track[i-1], track[i]));
    const e = track.map(p => p[2]), mn = Math.min(...e), mx = Math.max(...e), tot = d[d.length-1] || 1;
    const X = (v) => (v / tot * (w - 4) + 2).toFixed(1), Y = (v) => (h - 14 - (v - mn) / ((mx - mn) || 1) * (h - 24)).toFixed(1);
    const line = d.map((v, i) => `${X(v)},${Y(e[i])}`).join(' ');
    return `<svg class="elev" viewBox="0 0 ${w} ${h}" role="img" aria-label="Profil d'altitude"><polygon points="2,${h-14} ${line} ${w-2},${h-14}" fill="var(--prot)" opacity=".18"/><polyline points="${line}" fill="none" stroke="var(--prot)" stroke-width="2"/><text x="2" y="${h-2}" font-size="10" fill="var(--muted)">${Math.round(mn)} m</text><text x="${w-2}" y="10" text-anchor="end" font-size="10" fill="var(--muted)">${Math.round(mx)} m</text></svg>`;
  }
  window.GPX = { parse, svg, profile, dist };
})();
