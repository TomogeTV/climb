/* CLIMB : fonctions communes à l'app et au carnet */
(function(){
  const C = window.CLIMB_CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
  });

  /* ---------- Thème (clair par défaut, choix manuel gardé sur l'appareil) ---------- */
  function currentTheme(){ return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function setTheme(t){
    t = t === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try{ localStorage.setItem('climb_theme', t); }catch(e){}
    document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themeSet === t));
  }
  const themeSwitchHTML = () => `<div class="seg themeseg" role="group" aria-label="Apparence">
      <button type="button" data-theme-set="light" aria-pressed="${currentTheme() === 'light'}" aria-label="Mode clair" title="Mode clair"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg></button>
      <button type="button" data-theme-set="dark" aria-pressed="${currentTheme() === 'dark'}" aria-label="Mode sombre" title="Mode sombre"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/></svg></button>
    </div>`;

  /* ---------- Sports ---------- */
  const SPORTS = {
    muscu:    { label: 'Muscu',     icon: '🏋️', verb: 'Séance de muscu' },
    course:   { label: 'Course',    icon: '🏃', verb: 'Course' },
    rando:    { label: 'Randonnée', icon: '🥾', verb: 'Randonnée' },
    escalade: { label: 'Escalade',  icon: '🧗', verb: 'Escalade' },
    autre:    { label: 'Autre',     icon: '✨', verb: 'Activité' }
  };
  const GRADES = ['3','4a','4b','4c','5a','5b','5c','6a','6a+','6b','6b+','6c','6c+','7a','7a+','7b','7b+','7c','7c+','8a','8a+','8b','8b+','8c','8c+','9a'];
  const ASCENT_STYLES = { vue: 'À vue', flash: 'Flash', encha: 'Enchaîné après travail', moul: 'En moulinette', essai: 'Essai, non réussi' };

  /* Dépense nette estimée (kcal au-dessus du repos).
     Course : ~0,95 kcal/kg/km, 100 m de D+ comptés comme 1 km d'effort.
     Autres : (MET − 1) × poids × heures, MET du Compendium des activités physiques :
     randonnée 6 (7 avec un gros sac), escalade en salle ~6, falaise ou grande voie ~8, muscu 4, autre 4. */
  function activityKcal(a, weight){
    const w = +weight || 70, h = (+a.duration_min || 0) / 60, d = a.details || {};
    if (a.sport === 'course'){
      const km = +a.distance_km || 0;
      if (!km) return Math.round((8 - 1) * w * h); // sans distance : course modérée, ~8 MET
      return Math.round(0.95 * w * (km + (+a.elevation_m || 0) / 100));
    }
    const met = a.sport === 'rando' ? (d.sac === 'lourd' ? 7 : 6)
      : a.sport === 'escalade' ? (d.lieu === 'salle' ? 6 : 8)
      : a.sport === 'muscu' ? 4 : 4;
    return Math.round((met - 1) * w * h);
  }

  /* ---------- Programmes de muscu proposés à l'inscription ---------- */
  const X = (id, name, sets, reps, rest, extra) => Object.assign({id, name, sets, reps, rest}, extra || {});
  const TEMPLATES = {
    ppl4: { label: 'Push / Pull, 4 séances', desc: 'Pecs, dos, épaules et bras, 4 jours par semaine.',
      plan: [{m:'J1',c:false},{m:'J2',c:false},{m:'',c:false},{m:'J3',c:false},{m:'J4',c:false},{m:'',c:false},{m:'',c:false}],
      program: {
        J1:{n:'Push A', d:'pecs', ex:[X('j1-couche','Développé couché barre',4,'8-10',150), X('j1-incline-bas','Développé incliné bas',4,'8-10',120), X('j1-militaire','Développé militaire',3,'8-10',120), X('j1-dips','Dips',3,'8-12',90,{bw:true}), X('j1-butterfly','Butterfly',3,'10-12',60), X('j1-elev','Élévations latérales',3,'12-15',0,{link:true}), X('j1-corde','Corde triceps poulie',3,'10-12',60), X('j1-gainage','Gainage planche ou machine',3,'40s',30,{time:true})]},
        J2:{n:'Pull A', d:'dos largeur', ex:[X('j2-tractions','Tractions ou tirage vertical lourd',4,'5-8',150,{bw:true}), X('j2-tirage-serre','Tirage vertical prise serrée',3,'8-10',90), X('j2-rowing-appuye','Rowing poitrine appuyée',3,'8-10',120), X('j2-facepull','Face pull',3,'10-12',0,{link:true}), X('j2-curl-barre','Curl barre',4,'8-10',60), X('j2-marteau','Curl marteau',4,'10',60), X('j2-poignet','Curl poignet',2,'15',0,{link:true}), X('j2-poignet-rev','Curl poignet reverse',2,'15',45)]},
        J3:{n:'Push B', d:'épaules', ex:[X('j3-dm-halteres','Développé militaire haltères',4,'8-10',120), X('j3-incline-haut','Développé incliné haut',4,'8-10',120), X('j3-elev','Élévations latérales',4,'12-15',60), X('j3-front','Barre au front',3,'8-10',60), X('j3-reverse','Butterfly reverse',3,'12-15',0,{link:true}), X('j3-poulie','Barre triceps poulie',3,'10-12',60), X('j3-gainage','Gainage planche ou machine',3,'40s',30,{time:true})]},
        J4:{n:'Pull B', d:'dos épaisseur', ex:[X('j4-convergente','Rowing machine convergente assis',4,'6-8',150), X('j4-uni','Rowing unilatéral haltère',3,'8-10',90), X('j4-horizontal','Tirage horizontal poulie',3,'10-12',90), X('j4-facepull','Face pull',3,'12-15',0,{link:true}), X('j4-shrugs','Shrugs haltères',3,'10-12',60), X('j4-curl-incline','Curl incliné',3,'8-10',60), X('j4-inverse','Curl inversé',2,'12-15',45)]}
      }},
    fb3: { label: 'Full body, 3 séances', desc: 'Tout le corps, jambes comprises, lundi, mercredi et vendredi.',
      plan: [{m:'F1',c:false},{m:'',c:false},{m:'F2',c:false},{m:'',c:false},{m:'F1',c:false},{m:'',c:false},{m:'',c:false}],
      program: {
        F1:{n:'Full body A', d:'tout le corps', ex:[X('fb-squat','Squat goblet ou presse à cuisses',3,'8-10',150), X('fb-couche-halt','Développé couché haltères',3,'8-10',120), X('fb-tirage','Tirage vertical',3,'8-10',120), X('fb-sdt-roumain','Soulevé de terre roumain haltères',3,'8-10',120), X('fb-elev','Élévations latérales',3,'12-15',0,{link:true}), X('fb-curl','Curl haltères',3,'10-12',60), X('fb-gainage','Gainage planche',3,'40s',30,{time:true})]},
        F2:{n:'Full body B', d:'tout le corps', ex:[X('fb-bulgare','Fentes bulgares (par jambe)',3,'8-10',120), X('fb-militaire','Développé militaire haltères',3,'8-10',120), X('fb-rowing','Rowing poitrine appuyée',3,'8-10',120), X('fb-legcurl','Leg curl machine',3,'10-12',90), X('fb-facepull','Face pull',3,'12-15',0,{link:true}), X('fb-triceps','Extension triceps poulie',3,'10-12',60), X('fb-mollets','Mollets debout',3,'12-15',60)]}
      }}
  };

  /* ---------- Petits utilitaires ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n, d = 0) => { const x = Number(n); return (isFinite(x) ? x : 0).toLocaleString('fr-FR', {minimumFractionDigits:d, maximumFractionDigits:d}); };
  const num = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : NaN; };
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const today = () => iso(new Date());
  function download(filename, data, type){
    const blob = data instanceof Blob ? data : new Blob([data], {type: type || 'application/octet-stream'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function errText(e){
    const m = (e && (e.message || e.error_description || e.msg)) || '';
    if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Confirme d\'abord ton adresse grâce à l\'email reçu.';
    if (/already registered|already been registered/i.test(m)) return 'Un compte existe déjà avec cet email. Connecte-toi.';
    if (/Password should be at least|weak/i.test(m)) return 'Mot de passe trop faible : au moins 8 caractères, avec lettres et chiffres.';
    if (/rate limit|too many/i.test(m)) return 'Trop de tentatives. Patiente quelques minutes.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Pas de connexion internet. Réessaie dès que le réseau revient.';
    return m || 'Une erreur est survenue. Réessaie.';
  }

  window.CLIMB = { sb, C, SPORTS, GRADES, ASCENT_STYLES, TEMPLATES, activityKcal, currentTheme, setTheme, themeSwitchHTML, esc, fmt, num, iso, today, download, errText };
})();
