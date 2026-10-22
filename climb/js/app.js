/* CLIMB : application principale (comptes, fil, activités, groupes, profil) */
(function(){
  const { sb, SPORTS, GRADES, ASCENT_STYLES, TEMPLATES, activityKcal, esc, fmt, num, iso, today, errText, setTheme, themeSwitchHTML, download } = window.CLIMB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const main = $('#main');
  const S = { user: null, profile: null, weight: null, groups: null, people: {}, rt: 0, map: null };
  const PAGE = 15;
  const COLORS = ['#1F6FE0', '#12398A', '#3E8BFF', '#4256B8', '#0E8A8A', '#B3392B', '#C47A12', '#7A3FB0'];

  /* ---------- Utilitaires d'affichage ---------- */
  function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2800); }
  function go(h){ if (location.hash === h) route(); else location.hash = h; }
  const pdDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m-1, d); };
  function monday(d = new Date()){ const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); }
  function monthStart(){ const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); }
  function ago(ts){
    const d = new Date(ts), now = new Date(), s = (now - d) / 1000;
    if (s < 60) return 'à l\'instant';
    if (s < 3600) return `il y a ${Math.floor(s/60)} min`;
    if (d.toDateString() === now.toDateString()) return `aujourd'hui à ${d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}`;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return `hier à ${d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}`;
    return d.toLocaleDateString('fr-FR', {weekday:'short', day:'numeric', month:'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric'});
  }
  const durTxt = (m) => { m = Math.round(+m || 0); if (!m) return '–'; const h = Math.floor(m/60), r = m % 60; return h ? `${h} h ${String(r).padStart(2,'0')}` : `${r} min`; };
  const paceTxt = (min, km) => { if (!min || !km) return '–'; const p = min / km, mm = Math.floor(p), ss = Math.round((p - mm) * 60); return `${mm}:${String(ss === 60 ? 0 : ss).padStart(2,'0')} /km`; };
  const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const avatar = (p, cls = '') => `<span class="av ${cls}" style="--av:${esc((p && p.avatar_color) || '#1F6FE0')}" aria-hidden="true">${esc(initials(p && p.display_name))}</span>`;
  const person = (id) => S.people[id] || { id, display_name: 'Membre', avatar_color: '#55657F' };
  const inviteLink = (code) => `${location.origin}${location.pathname}#/rejoindre/${code}`;
  function setNav(r){
    const tab = ({fil:'fil', activite:'fil', membre:'fil', groupes:'groupes', groupe:'groupes', rejoindre:'groupes', nouvelle:'nouvelle', moi:'moi'})[r];
    const show = !!S.user && !!S.profile && S.profile.onboarded && !['bienvenue','nouveau-mot-de-passe'].includes(r);
    $('#nav').hidden = !show;
    $$('#nav [data-go]').forEach(b => { if (b.dataset.go === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }
  async function loadPeople(ids){
    const need = [...new Set(ids)].filter(id => id && !S.people[id]);
    if (!need.length) return;
    const { data } = await sb.from('profiles').select('id,display_name,avatar_color,city').in('id', need);
    (data || []).forEach(p => { S.people[p.id] = p; });
  }
  const pendingInvite = () => { try{ return localStorage.getItem('climb_invite'); }catch(e){ return null; } };
  const clearInvite = () => { try{ localStorage.removeItem('climb_invite'); }catch(e){} };
  const inviteCode = (s) => { s = String(s || '').trim(); const m = s.match(/rejoindre\/([A-Za-z0-9]+)/); return m ? m[1] : s.replace(/[^A-Za-z0-9]/g, ''); };

  /* ---------- Session ---------- */
  async function loadMe(){
    const uid = S.user.id;
    const [{ data: prof }, { data: cp }] = await Promise.all([
      sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
      sb.from('carnet_profile').select('data').eq('user_id', uid).maybeSingle()
    ]);
    S.profile = prof || { id: uid, display_name: '', avatar_color: '#1F6FE0', sports: [], onboarded: false };
    S.people[uid] = S.profile;
    S.weight = cp && cp.data ? (+cp.data.poids || null) : null;
    await loadGroups();
  }
  async function loadGroups(){
    const { data, error } = await sb.from('group_members').select('role, groups(id,name,description,invite_code,created_by)').eq('user_id', S.user.id);
    if (error) throw error;
    S.groups = (data || []).filter(r => r.groups).map(r => Object.assign({ role: r.role }, r.groups)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  /* ---------- Routeur ---------- */
  async function route(){
    const tok = ++S.rt;
    const [r = '', a, b] = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    if (S.map){ S.map.remove(); S.map = null; }
    main.onclick = main.oninput = main.onchange = main.onsubmit = null;
    if (!S.user){
      if (r === 'rejoindre' && a){ try{ localStorage.setItem('climb_invite', a); }catch(e){} }
      if (!['connexion','inscription','mot-de-passe'].includes(r)) return go('#/connexion');
    } else {
      if (!S.profile){
        main.innerHTML = '<div class="loading">Chargement…</div>';
        try{ await loadMe(); }catch(e){ main.innerHTML = `<div class="empty-card"><p>${esc(errText(e))}</p><button class="btn" onclick="location.reload()">Réessayer</button></div>`; return; }
        if (tok !== S.rt) return;
      }
      if (!S.profile.onboarded && !['bienvenue','nouveau-mot-de-passe','rejoindre'].includes(r)) return go('#/bienvenue/1');
      if (['','connexion','inscription','mot-de-passe'].includes(r)){ const inv = pendingInvite(); return go(inv ? '#/rejoindre/' + inv : '#/fil'); }
    }
    setNav(r);
    window.scrollTo(0, 0);
    const view = {
      connexion: () => viewAuth('login'), inscription: () => viewAuth('signup'), 'mot-de-passe': () => viewAuth('reset'),
      'nouveau-mot-de-passe': viewNewPassword, bienvenue: () => viewOnboarding(+a || 1, tok),
      fil: () => viewFeed(tok), nouvelle: () => viewEdit(null, a, tok),
      activite: () => b === 'modifier' ? viewEdit(a, null, tok) : viewActivity(a, tok),
      groupes: () => viewGroups(tok), groupe: () => viewGroup(a, b || 'fil', tok), rejoindre: () => viewJoin(a, tok),
      moi: () => viewMe(tok), membre: () => viewMember(a, tok)
    }[r];
    if (!view) return go('#/fil');
    try{ await view(); }
    catch(e){ console.error(e); if (tok === S.rt) main.innerHTML = `<div class="empty-card"><h2>Oups</h2><p>${esc(errText(e))}</p><button class="btn" data-reload>Réessayer</button></div>`; }
  }
  const live = (tok) => tok === S.rt;

  /* ---------- Connexion et inscription ---------- */
  const hero = (sub) => `<div class="brand"><svg viewBox="0 0 120 40" aria-hidden="true"><path d="M2 38 L30 10 L44 24 L62 4 L90 34 L104 22 L118 38" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></svg><h1>CLIMB</h1><p>${sub}</p></div>`;
  function viewAuth(mode){
    const f = {
      login: `<h2>Connexion</h2>
        <label class="lbl" for="aEmail">Email</label><input id="aEmail" class="field" type="email" autocomplete="email" required>
        <label class="lbl" for="aPass">Mot de passe</label><input id="aPass" class="field" type="password" autocomplete="current-password" required>
        <button class="btn block" type="submit">Se connecter</button>
        <p class="alt"><a href="#/mot-de-passe">Mot de passe oublié</a></p>
        <p class="alt">Pas encore de compte ? <a href="#/inscription">Crée-le en une minute</a></p>`,
      signup: `<h2>Créer ton compte</h2>
        <label class="lbl" for="aName">Prénom ou pseudo</label><input id="aName" class="field" autocomplete="given-name" maxlength="60" required>
        <label class="lbl" for="aEmail">Email</label><input id="aEmail" class="field" type="email" autocomplete="email" required>
        <label class="lbl" for="aPass">Mot de passe (8 caractères minimum)</label><input id="aPass" class="field" type="password" autocomplete="new-password" minlength="8" required>
        <label class="check small"><input type="checkbox" id="aOk" required> J'accepte que CLIMB conserve mes données pour faire fonctionner l'app. Mes données de santé (poids, mesures, repas, sommeil) restent visibles par moi seul.</label>
        <button class="btn block" type="submit">Créer mon compte</button>
        <p class="alt">Déjà inscrit ? <a href="#/connexion">Connecte-toi</a></p>`,
      reset: `<h2>Mot de passe oublié</h2><p class="small muted">Indique ton email : tu recevras un lien pour choisir un nouveau mot de passe.</p>
        <label class="lbl" for="aEmail">Email</label><input id="aEmail" class="field" type="email" autocomplete="email" required>
        <button class="btn block" type="submit">Envoyer le lien</button>
        <p class="alt"><a href="#/connexion">Retour à la connexion</a></p>`
    }[mode];
    const inv = pendingInvite();
    main.innerHTML = `<div class="auth">${hero('Ton partenaire sportif : muscu, course, rando, escalade.')}
      ${inv ? '<p class="note">Tu as été invité dans un groupe : connecte-toi ou crée ton compte pour le rejoindre.</p>' : ''}
      <form class="card form" id="authForm" novalidate>${f}<p class="err" id="aErr" role="alert"></p></form></div>`;
    $('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#authForm button[type=submit]'), err = $('#aErr'); err.textContent = '';
      const email = $('#aEmail').value.trim(), pass = $('#aPass') && $('#aPass').value;
      if (!/^\S+@\S+\.\S+$/.test(email)){ err.textContent = 'Indique une adresse email valide.'; return; }
      btn.disabled = true;
      try{
        const redirectTo = location.origin + location.pathname;
        if (mode === 'login'){
          const { data, error } = await sb.auth.signInWithPassword({ email, password: pass }); if (error) throw error;
          S.user = data.user; S.profile = null; route();
        } else if (mode === 'signup'){
          const name = $('#aName').value.trim();
          if (!name){ throw new Error('Indique ton prénom ou un pseudo.'); }
          if (!pass || pass.length < 8) throw new Error('Mot de passe trop court : 8 caractères minimum.');
          if (!$('#aOk').checked) throw new Error('Coche la case pour accepter la conservation de tes données.');
          const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: redirectTo, data: { display_name: name } } });
          if (error) throw error;
          if (data.session){ S.user = data.user; S.profile = null; const inv = pendingInvite(); go(inv ? '#/rejoindre/' + inv : '#/bienvenue/1'); }
          else main.innerHTML = `<div class="auth">${hero('Plus qu\'une étape.')}<div class="card"><h2>Vérifie ta boîte mail</h2><p>Un email de confirmation a été envoyé à <b>${esc(email)}</b>. Clique sur le lien qu'il contient pour activer ton compte. Pense à regarder dans les indésirables.</p><p class="alt"><a href="#/connexion">Retour à la connexion</a></p></div></div>`;
        } else {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo }); if (error) throw error;
          $('#authForm').innerHTML = `<h2>Email envoyé</h2><p>Si un compte existe pour <b>${esc(email)}</b>, tu vas recevoir un lien pour choisir un nouveau mot de passe.</p><p class="alt"><a href="#/connexion">Retour à la connexion</a></p>`;
        }
      }catch(ex){ err.textContent = errText(ex); }
      finally{ if (btn.isConnected) btn.disabled = false; }
    });
  }
  function viewNewPassword(){
    main.innerHTML = `<div class="auth">${hero('Nouveau mot de passe')}<form class="card form" id="npForm">
      <label class="lbl" for="np1">Nouveau mot de passe</label><input id="np1" class="field" type="password" autocomplete="new-password" minlength="8" required>
      <label class="lbl" for="np2">Confirme-le</label><input id="np2" class="field" type="password" autocomplete="new-password" minlength="8" required>
      <button class="btn block" type="submit">Enregistrer</button><p class="err" id="npErr" role="alert"></p></form></div>`;
    $('#npForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const a = $('#np1').value, b = $('#np2').value, err = $('#npErr');
      if (a.length < 8){ err.textContent = '8 caractères minimum.'; return; }
      if (a !== b){ err.textContent = 'Les deux mots de passe sont différents.'; return; }
      const { error } = await sb.auth.updateUser({ password: a });
      if (error){ err.textContent = errText(error); return; }
      toast('Mot de passe mis à jour.'); go('#/fil');
    });
  }

  /* ---------- Accueil d'un nouvel utilisateur ---------- */
  async function viewOnboarding(step, tok){
    const p = S.profile, steps = `<div class="steps" aria-label="Étape ${step} sur 3">${[1,2,3].map(i => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>`;
    if (step === 1){
      main.innerHTML = `<div class="onb">${steps}<h1>Bienvenue sur CLIMB</h1><p class="muted">Présente-toi en quelques secondes. Ces informations sont visibles par les membres de tes groupes.</p>
        <form class="card form" id="o1">
          <label class="lbl" for="oName">Prénom ou pseudo</label><input id="oName" class="field" maxlength="60" value="${esc(p.display_name)}" required>
          <label class="lbl" for="oCity">Ville (facultatif)</label><input id="oCity" class="field" maxlength="60" value="${esc(p.city || '')}">
          <span class="lbl">Tes sports</span><div class="chips" id="oSports">${Object.entries(SPORTS).filter(([k]) => k !== 'autre').map(([k, s]) => `<button type="button" class="chip" data-sport="${k}" aria-pressed="${(p.sports || []).includes(k)}">${s.icon} ${s.label}</button>`).join('')}</div>
          <span class="lbl">Ta couleur</span><div class="colors" id="oColor">${COLORS.map(c => `<button type="button" class="color" style="--c:${c}" data-color="${c}" aria-pressed="${p.avatar_color === c}" aria-label="Couleur ${c}"></button>`).join('')}</div>
          <button class="btn block" type="submit">Continuer</button><p class="err" id="oErr" role="alert"></p></form></div>`;
      $('#oSports').addEventListener('click', (e) => { const b = e.target.closest('[data-sport]'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); });
      $('#oColor').addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (!b) return; $$('#oColor [data-color]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
      $('#o1').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('#oName').value.trim(); if (!name){ $('#oErr').textContent = 'Indique ton prénom ou un pseudo.'; return; }
        const sports = $$('#oSports [aria-pressed="true"]').map(b => b.dataset.sport);
        const color = ($('#oColor [aria-pressed="true"]') || {}).dataset?.color || p.avatar_color;
        const upd = { display_name: name, city: $('#oCity').value.trim(), sports, avatar_color: color };
        const { error } = await sb.from('profiles').update(upd).eq('id', S.user.id);
        if (error){ $('#oErr').textContent = errText(error); return; }
        Object.assign(S.profile, upd); go('#/bienvenue/2');
      });
    } else if (step === 2){
      const muscu = (p.sports || []).includes('muscu');
      main.innerHTML = `<div class="onb">${steps}<h1>Ton carnet privé</h1><p class="muted">Ces données servent à calculer tes besoins en calories et en protéines. <b>Elles ne sont visibles que par toi</b>, jamais par tes groupes. Tu peux passer cette étape.</p>
        <form class="card form" id="o2">
          <div class="grid2">
            <div><label class="lbl" for="cSexe">Sexe</label><select id="cSexe" class="field"><option value="h">Homme</option><option value="f">Femme</option></select></div>
            <div><label class="lbl" for="cAge">Âge</label><input id="cAge" class="field num" type="number" inputmode="numeric" min="14" max="90"></div>
            <div><label class="lbl" for="cTaille">Taille (cm)</label><input id="cTaille" class="field num" type="number" inputmode="numeric" min="120" max="230"></div>
            <div><label class="lbl" for="cPoids">Poids (kg)</label><input id="cPoids" class="field num" type="number" inputmode="decimal" step="0.1" min="30" max="250"></div>
          </div>
          <label class="lbl" for="cGoal">Objectif</label>
          <select id="cGoal" class="field"><option value="lean">Prendre du muscle sans prendre de gras</option><option value="standard">Prise de masse classique</option><option value="maint">Garder la forme (calories d'entretien)</option></select>
          ${muscu ? `<span class="lbl">Ton programme de muscu</span><div class="tpls">${Object.entries(TEMPLATES).map(([k, t], i) => `<label class="tpl"><input type="radio" name="tpl" value="${k}" ${i === 0 ? 'checked' : ''}><span><b>${esc(t.label)}</b><span class="small muted">${esc(t.desc)}</span></span></label>`).join('')}<label class="tpl"><input type="radio" name="tpl" value=""><span><b>Je construirai le mien</b><span class="small muted">Tu pourras créer tes séances dans le carnet.</span></span></label></div>` : ''}
          <button class="btn block" type="submit">Continuer</button>
          <button class="linkbtn" type="button" id="o2skip">Passer cette étape</button><p class="err" id="o2Err" role="alert"></p></form></div>`;
      $('#o2skip').onclick = () => go('#/bienvenue/3');
      $('#o2').addEventListener('submit', async (e) => {
        e.preventDefault();
        const age = num($('#cAge').value), taille = num($('#cTaille').value), poids = num($('#cPoids').value);
        if (!(age >= 14 && age <= 90) || !(taille >= 120 && taille <= 230) || !(poids >= 30 && poids <= 250)){ $('#o2Err').textContent = 'Renseigne un âge, une taille et un poids réalistes, ou passe cette étape.'; return; }
        const goal = $('#cGoal').value, tplKey = ($('input[name=tpl]:checked') || {}).value;
        const data = { sexe: $('#cSexe').value, age, taille, poids, goal: goal === 'standard' ? 'standard' : 'lean', surplusPct: goal === 'standard' ? 10 : goal === 'maint' ? 0 : 5, adj: 0 };
        const t = tplKey ? TEMPLATES[tplKey] : null;
        data.program = t ? JSON.parse(JSON.stringify(t.program)) : {};
        data.plan = t ? JSON.parse(JSON.stringify(t.plan)) : Array.from({length: 7}, () => ({m:'', c:false}));
        if ((p.sports || []).includes('course')){
          // Courses placées sur les jours sans muscu, bien réparties
          const free = data.plan.map((x, i) => x.m ? -1 : i).filter(i => i >= 0);
          const pick = free.length <= 3 ? free : [free[0], free[Math.floor(free.length / 2)], free[free.length - 1]];
          pick.forEach(i => { data.plan[i].c = true; });
        }
        data.shareGroups = true; data.climb = 1;
        const { error } = await sb.from('carnet_profile').upsert({ user_id: S.user.id, data, updated_at: new Date().toISOString() });
        if (error){ $('#o2Err').textContent = errText(error); return; }
        S.weight = poids; go('#/bienvenue/3');
      });
    } else {
      const inv = pendingInvite();
      let invHTML = '';
      if (inv){
        const { data } = await sb.rpc('group_preview', { p_code: inv });
        if (!live(tok)) return;
        const g = data && data[0];
        invHTML = g ? `<div class="card invite"><span class="small muted">Tu as été invité dans</span><h2>${esc(g.name)}</h2><p class="small muted">${g.members} membre${g.members > 1 ? 's' : ''}</p><button class="btn block" id="oJoin" data-code="${esc(inv)}">Rejoindre ce groupe</button></div>` : '';
        if (!g) clearInvite();
      }
      main.innerHTML = `<div class="onb">${steps}<h1>Tes groupes</h1><p class="muted">CLIMB est plus motivant à plusieurs : collègues, amis, club ou association. Dans un groupe, chacun voit les activités des autres, leur donne des bravos et participe aux classements.</p>
        ${invHTML}
        <form class="card form" id="o3join"><label class="lbl" for="oCode">Tu as un lien ou un code d'invitation ?</label><div class="row"><input id="oCode" class="field" placeholder="Colle le lien ou le code"><button class="btn" type="submit" style="flex:0 0 auto">Rejoindre</button></div></form>
        <form class="card form" id="o3new"><label class="lbl" for="oGroup">Ou crée ton groupe</label><div class="row"><input id="oGroup" class="field" maxlength="60" placeholder="Ex. Collègues, Club escalade"><button class="btn" type="submit" style="flex:0 0 auto">Créer</button></div></form>
        <button class="btn ghost block" id="oDone">${S.groups && S.groups.length ? 'Terminer' : 'Plus tard, découvrir l\'app'}</button><p class="err" id="o3Err" role="alert"></p></div>`;
      const finish = async (dest) => {
        const { error } = await sb.from('profiles').update({ onboarded: true }).eq('id', S.user.id);
        if (error){ $('#o3Err').textContent = errText(error); return; }
        S.profile.onboarded = true; go(dest || '#/fil');
      };
      $('#oDone').onclick = () => finish();
      const join = async (code) => {
        const { data, error } = await sb.rpc('join_group', { p_code: inviteCode(code) });
        if (error){ $('#o3Err').textContent = errText(error); return; }
        clearInvite(); await loadGroups(); toast('Bienvenue dans le groupe !'); finish('#/groupe/' + data);
      };
      if ($('#oJoin')) $('#oJoin').onclick = (e) => join(e.target.dataset.code);
      $('#o3join').addEventListener('submit', (e) => { e.preventDefault(); if ($('#oCode').value.trim()) join($('#oCode').value); });
      $('#o3new').addEventListener('submit', async (e) => {
        e.preventDefault(); const name = $('#oGroup').value.trim(); if (name.length < 2){ $('#o3Err').textContent = 'Donne un nom à ton groupe.'; return; }
        const { data, error } = await sb.rpc('create_group', { p_name: name, p_description: '' });
        if (error){ $('#o3Err').textContent = errText(error); return; }
        await loadGroups(); toast('Groupe créé : invite tes amis avec le lien.'); finish('#/groupe/' + data.id + '/membres');
      });
    }
  }

  /* ---------- Cartes d'activité ---------- */
  function statsOf(a){
    const d = a.details || {}, out = [];
    if (a.sport === 'course'){ out.push(['Distance', a.distance_km ? fmt(a.distance_km, 2) + ' km' : '–'], ['Allure', paceTxt(a.duration_min, a.distance_km)], ['Durée', durTxt(a.duration_min)]); if (a.elevation_m) out.push(['D+', fmt(a.elevation_m) + ' m']); }
    else if (a.sport === 'rando'){ out.push(['Distance', a.distance_km ? fmt(a.distance_km, 1) + ' km' : '–'], ['D+', a.elevation_m ? fmt(a.elevation_m) + ' m' : '–'], ['Durée', durTxt(a.duration_min)]); }
    else if (a.sport === 'escalade'){
      const routes = (d.routes || []), ok = routes.filter(r => r.style !== 'essai');
      const best = ok.map(r => GRADES.indexOf(r.grade)).filter(i => i >= 0).sort((x, y) => y - x)[0];
      out.push(['Durée', durTxt(a.duration_min)], [d.type === 'bloc' ? 'Blocs réussis' : 'Voies réussies', routes.length ? String(ok.length) : '–'], ['Max', best != null ? GRADES[best] : '–']);
    } else if (a.sport === 'muscu'){ out.push(['Durée', durTxt(a.duration_min)], ['Séries', d.sets ? String(d.sets) : '–'], ['Tonnage', d.volume ? fmt(d.volume) + ' kg' : '–']); }
    else { out.push(['Durée', durTxt(a.duration_min)]); if (a.distance_km) out.push(['Distance', fmt(a.distance_km, 1) + ' km']); }
    return out;
  }
  function subline(a){
    const d = a.details || {};
    if (a.sport === 'escalade') return [d.lieu ? ({salle:'En salle', falaise:'En falaise', gv:'Grande voie'})[d.lieu] : '', d.type === 'bloc' ? 'bloc' : d.type === 'voie' ? 'voie' : '', d.site || ''].filter(Boolean).join(' · ');
    if (a.sport === 'rando' && d.sac === 'lourd') return 'Avec un gros sac';
    if (a.sport === 'muscu' && Array.isArray(d.exercises)) return d.exercises.slice(0, 3).map(x => x.name).join(', ') + (d.exercises.length > 3 ? '…' : '');
    return '';
  }
  function actCard(a, k){
    const p = person(a.user_id), s = SPORTS[a.sport] || SPORTS.autre, mine = a.user_id === S.user.id, sub = subline(a);
    return `<article class="act card" data-id="${a.id}">
      <header class="act-h"><a href="#/membre/${a.user_id}" class="act-who">${avatar(p)}<span><b>${esc(p.display_name || 'Membre')}</b><span class="small muted">${esc(ago(a.started_at))}${a.visibility === 'private' ? ' · 🔒 privé' : ''}</span></span></a><span class="sp-ic" title="${esc(s.label)}">${s.icon}</span></header>
      <a class="act-t" href="#/activite/${a.id}"><h3>${esc(a.title || s.verb)}</h3>${sub ? `<p class="small muted">${esc(sub)}</p>` : ''}</a>
      <div class="act-stats">${statsOf(a).map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>
      ${a.track ? `<a href="#/activite/${a.id}" class="act-map">${GPX.svg(a.track, 320, 140, 'var(--kcal)')}</a>` : ''}
      <footer class="act-f"><button class="kudo" data-kudo="${a.id}" aria-pressed="${k.mine.has(a.id)}" ${mine ? 'disabled title="Tu ne peux pas te féliciter toi-même"' : ''} aria-label="Bravo">👏 <span>${k.count[a.id] || 0}</span></button><a class="cmt" href="#/activite/${a.id}">💬 ${k.cmts[a.id] || 0}</a></footer>
    </article>`;
  }
  async function socialFor(acts){
    const ids = acts.map(a => a.id), out = { count: {}, mine: new Set(), cmts: {} };
    if (!ids.length) return out;
    const [{ data: ku }, { data: cm }] = await Promise.all([
      sb.from('kudos').select('activity_id,user_id').in('activity_id', ids),
      sb.from('comments').select('activity_id').in('activity_id', ids)
    ]);
    (ku || []).forEach(x => { out.count[x.activity_id] = (out.count[x.activity_id] || 0) + 1; if (x.user_id === S.user.id) out.mine.add(x.activity_id); });
    (cm || []).forEach(x => { out.cmts[x.activity_id] = (out.cmts[x.activity_id] || 0) + 1; });
    return out;
  }
  const ACT_COLS = 'id,user_id,sport,title,notes,date,started_at,duration_min,distance_km,elevation_m,kcal,details,track,visibility,source';
  async function renderActs(el, acts, append){
    await loadPeople(acts.map(a => a.user_id));
    const k = await socialFor(acts);
    const html = acts.map(a => actCard(a, k)).join('');
    if (append) el.insertAdjacentHTML('beforeend', html); else el.innerHTML = html;
  }
  async function toggleKudo(btn){
    const id = btn.dataset.kudo, on = btn.getAttribute('aria-pressed') === 'true', n = $('span', btn);
    btn.setAttribute('aria-pressed', !on); n.textContent = Math.max(0, +n.textContent + (on ? -1 : 1));
    const q = on ? sb.from('kudos').delete().eq('activity_id', id).eq('user_id', S.user.id) : sb.from('kudos').insert({ activity_id: id });
    const { error } = await q;
    if (error){ btn.setAttribute('aria-pressed', on); n.textContent = Math.max(0, +n.textContent + (on ? 1 : -1)); toast(errText(error)); }
  }

  /* ---------- Fil d'actualité ---------- */
  async function viewFeed(tok){
    main.innerHTML = `<div class="top"><h1>Fil</h1></div><div id="week" class="weekcard card"></div><div id="feed"><div class="loading">Chargement du fil…</div></div><div id="more"></div>`;
    const from = monday();
    const [{ data: mine }, { data: acts, error }] = await Promise.all([
      sb.from('activities').select('sport,duration_min,distance_km,elevation_m').eq('user_id', S.user.id).gte('date', from),
      sb.from('activities').select(ACT_COLS).order('started_at', { ascending: false }).range(0, PAGE - 1)
    ]);
    if (!live(tok)) return;
    if (error) throw error;
    const w = (mine || []).reduce((t, a) => ({ n: t.n + 1, m: t.m + (+a.duration_min || 0), km: t.km + (+a.distance_km || 0), d: t.d + (+a.elevation_m || 0) }), { n: 0, m: 0, km: 0, d: 0 });
    $('#week').innerHTML = `<div class="small muted">Ta semaine</div><div class="wk-stats"><div><b>${w.n}</b><span>activité${w.n > 1 ? 's' : ''}</span></div><div><b>${w.m ? durTxt(w.m) : "0 h"}</b><span>de sport</span></div><div><b>${fmt(w.km, 1)}</b><span>km</span></div><div><b>${fmt(w.d)}</b><span>m de D+</span></div></div>`;
    const feed = $('#feed');
    if (!acts.length){
      feed.innerHTML = `<div class="empty-card card"><h2>Ton fil est vide pour l'instant</h2><p>${S.groups.length ? 'Enregistre ta première activité, et celles de tes groupes apparaîtront ici.' : 'Rejoins ou crée un groupe pour suivre les activités de tes collègues et amis, puis enregistre ta première activité.'}</p><div class="row"><a class="btn" href="#/nouvelle">Ajouter une activité</a>${S.groups.length ? '' : '<a class="btn ghost" href="#/groupes">Mes groupes</a>'}</div></div>`;
      return;
    }
    await renderActs(feed, acts);
    if (!live(tok)) return;
    let offset = acts.length;
    const moreBtn = () => { $('#more').innerHTML = offset % PAGE === 0 ? '<button class="btn ghost block" id="moreBtn">Voir plus</button>' : ''; };
    moreBtn();
    $('#more').onclick = async (e) => {
      if (e.target.id !== 'moreBtn') return; e.target.disabled = true;
      const { data } = await sb.from('activities').select(ACT_COLS).order('started_at', { ascending: false }).range(offset, offset + PAGE - 1);
      if (!live(tok)) return;
      await renderActs(feed, data || [], true); offset += (data || []).length; if (!(data || []).length) offset = -1; moreBtn();
    };
  }

  /* ---------- Détail d'une activité ---------- */
  async function viewActivity(id, tok){
    const { data: a, error } = await sb.from('activities').select(ACT_COLS).eq('id', id).maybeSingle();
    if (!live(tok)) return;
    if (error) throw error;
    if (!a){ main.innerHTML = `<div class="empty-card card"><h2>Activité introuvable</h2><p>Elle a peut-être été supprimée ou rendue privée.</p><a class="btn" href="#/fil">Retour au fil</a></div>`; return; }
    const [{ data: ku }, { data: cm }] = await Promise.all([
      sb.from('kudos').select('user_id,created_at').eq('activity_id', id),
      sb.from('comments').select('id,user_id,body,created_at').eq('activity_id', id).order('created_at')
    ]);
    await loadPeople([a.user_id, ...(ku || []).map(x => x.user_id), ...(cm || []).map(x => x.user_id)]);
    if (!live(tok)) return;
    const p = person(a.user_id), s = SPORTS[a.sport] || SPORTS.autre, mine = a.user_id === S.user.id, d = a.details || {};
    const iKudo = (ku || []).some(x => x.user_id === S.user.id);
    let det = '';
    if (a.sport === 'muscu' && Array.isArray(d.exercises) && d.exercises.length)
      det = `<h2>Exercices</h2><div class="card list">${d.exercises.map(x => `<div class="li"><b>${esc(x.name)}</b><span class="small muted num">${esc(x.summary || '')}</span></div>`).join('')}</div>${d.records && d.records.length ? `<p class="note">🏆 Record${d.records.length > 1 ? 's' : ''} : ${d.records.map(esc).join(', ')}</p>` : ''}`;
    if (a.sport === 'escalade' && Array.isArray(d.routes) && d.routes.length)
      det = `<h2>${d.type === 'bloc' ? 'Blocs' : 'Voies'}</h2><div class="card list">${d.routes.map((r, i) => `<div class="li"><b>${i + 1}. ${esc(r.grade || '?')}</b><span class="small muted">${esc(ASCENT_STYLES[r.style] || '')}${r.name ? ' · ' + esc(r.name) : ''}</span></div>`).join('')}</div>`;
    main.innerHTML = `<div class="top"><a class="iconbtn" href="javascript:history.back()" aria-label="Retour">‹</a><span class="small muted">${esc(s.label)}</span><span style="width:40px"></span></div>
      <article class="detail">
        <header class="act-h"><a href="#/membre/${a.user_id}" class="act-who">${avatar(p, 'lg')}<span><b>${esc(p.display_name)}</b><span class="small muted">${new Date(a.started_at).toLocaleString('fr-FR', {weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'})}${a.visibility === 'private' ? ' · 🔒 privé' : ''}</span></span></a><span class="sp-ic">${s.icon}</span></header>
        <h1 class="dtitle">${esc(a.title || s.verb)}</h1>${subline(a) ? `<p class="muted">${esc(subline(a))}</p>` : ''}
        <div class="act-stats big">${statsOf(a).map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}${mine && a.kcal ? `<div><span>Dépense estimée</span><b>${fmt(a.kcal)} kcal</b></div>` : ''}</div>
        ${a.track ? `<div id="map" class="map" role="img" aria-label="Carte du parcours"></div>${GPX.profile(a.track)}` : ''}
        ${a.notes ? `<p class="notes">${esc(a.notes).replace(/\n/g, '<br>')}</p>` : ''}
        ${det}
        ${mine ? `<div class="row owner"><a class="btn ghost" href="#/activite/${a.id}/modifier">${a.source === 'carnet' ? 'Modifier les infos' : 'Modifier'}</a><button class="btn ghost danger" id="delAct">Supprimer</button></div>${a.source === 'carnet' ? '<p class="small muted">Publiée depuis ton carnet : les séries se modifient dans le carnet.</p>' : ''}` : ''}
        <div class="social"><button class="kudo big" data-kudo="${a.id}" aria-pressed="${iKudo}" ${mine ? 'disabled' : ''} aria-label="Bravo">👏 <span>${(ku || []).length}</span></button>
          <span class="small muted">${(ku || []).length ? 'Bravo de ' + (ku || []).map(x => esc(person(x.user_id).display_name)).join(', ') : mine ? 'Pas encore de bravo' : 'Sois le premier à féliciter'}</span></div>
        <h2 id="c">Commentaires</h2>
        <div class="comments">${(cm || []).map(c => `<div class="cm">${avatar(person(c.user_id), 'sm')}<div><b>${esc(person(c.user_id).display_name)}</b> <span class="small muted">${esc(ago(c.created_at))}</span><p>${esc(c.body).replace(/\n/g, '<br>')}</p>${c.user_id === S.user.id || mine ? `<button class="linkbtn small" data-delcm="${c.id}">Supprimer</button>` : ''}</div></div>`).join('') || '<p class="small muted">Aucun commentaire.</p>'}</div>
        <form class="cmform" id="cmForm"><textarea id="cmBody" class="field" maxlength="1000" placeholder="Écris un commentaire" rows="2" aria-label="Commentaire"></textarea><button class="btn" type="submit">Envoyer</button></form>
      </article>`;
    if (a.track && window.L){
      S.map = L.map('map', { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(S.map);
      const ll = a.track.map(t => [t[0], t[1]]), line = L.polyline(ll, { color: getComputedStyle(document.documentElement).getPropertyValue('--prot').trim() || '#1F6FE0', weight: 4 }).addTo(S.map);
      L.circleMarker(ll[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#1F9D55', fillOpacity: 1 }).addTo(S.map);
      L.circleMarker(ll[ll.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#B3392B', fillOpacity: 1 }).addTo(S.map);
      S.map.fitBounds(line.getBounds(), { padding: [16, 16] });
    }
    $('#cmForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const body = $('#cmBody').value.trim(); if (!body) return;
      const btn = $('#cmForm button'); btn.disabled = true;
      const { error } = await sb.from('comments').insert({ activity_id: a.id, body });
      btn.disabled = false;
      if (error){ toast(errText(error)); return; }
      route();
    });
    if (mine) $('#delAct').onclick = async (e) => {
      const b = e.target; if (!b.dataset.confirm){ b.dataset.confirm = '1'; b.textContent = 'Confirmer la suppression'; return; }
      const { error } = await sb.from('activities').delete().eq('id', a.id);
      if (error){ toast(errText(error)); return; }
      toast('Activité supprimée.'); go('#/fil');
    };
  }

  /* ---------- Ajouter ou modifier une activité ---------- */
  async function viewEdit(id, sportParam, tok){
    let F;
    if (id){
      const { data, error } = await sb.from('activities').select(ACT_COLS).eq('id', id).eq('user_id', S.user.id).maybeSingle();
      if (!live(tok)) return;
      if (error) throw error;
      if (!data){ main.innerHTML = `<div class="empty-card card"><h2>Activité introuvable</h2><a class="btn" href="#/fil">Retour</a></div>`; return; }
      const st = new Date(data.started_at);
      F = Object.assign({}, data, { details: Object.assign({}, data.details), time: st.toTimeString().slice(0, 5), h: Math.floor((data.duration_min || 0) / 60), m: (data.duration_min || 0) % 60 });
    } else {
      const sp = SPORTS[sportParam] ? sportParam : ((S.profile.sports || []).find(x => x !== 'muscu') || 'course');
      const now = new Date();
      F = { sport: sp, title: '', notes: '', date: today(), time: now.toTimeString().slice(0, 5), h: '', m: '', distance_km: '', elevation_m: '', details: {}, track: null, visibility: 'groups' };
    }
    const fromCarnet = F.source === 'carnet';
    const sportChips = () => Object.entries(SPORTS).map(([k, s]) => `<button type="button" class="chip" data-setsport="${k}" aria-pressed="${F.sport === k}" ${fromCarnet ? 'disabled' : ''}>${s.icon} ${s.label}</button>`).join('');
    const seg = (key, opts) => `<div class="seg wide" role="group">${opts.map(([v, l]) => `<button type="button" data-seg="${key}" data-v="${v}" aria-pressed="${(F.details[key] || opts[0][0]) === v}">${l}</button>`).join('')}</div>`;
    const routeRows = () => (F.details.routes || []).map((r, i) => `<div class="route" data-i="${i}"><select class="field" data-route="grade" aria-label="Cotation">${GRADES.map(g => `<option ${g === r.grade ? 'selected' : ''}>${g}</option>`).join('')}</select><select class="field" data-route="style" aria-label="Style">${Object.entries(ASCENT_STYLES).map(([k, l]) => `<option value="${k}" ${k === r.style ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="del" data-delroute="${i}" aria-label="Retirer">×</button></div>`).join('');
    function sportBlock(){
      const s = F.sport, gpxOk = ['course','rando','autre','escalade'].includes(s) && !fromCarnet;
      let h = '';
      if (s === 'muscu' && !fromCarnet) h += `<div class="note">Pour noter tes séries une par une avec les charges conseillées, utilise le carnet : la séance sera publiée ici automatiquement. <a class="btn ghost" href="carnet.html#muscu">Ouvrir le carnet</a><br><span class="small muted">Tu peux aussi enregistrer une séance rapide ci-dessous.</span></div>`;
      if (gpxOk) h += `<div class="gpx"><label class="btn ghost" for="gpxIn">${F.track ? 'Remplacer le fichier GPX' : 'Importer un fichier GPX'}</label><input id="gpxIn" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden>${F.track ? `<button type="button" class="linkbtn" id="gpxDel">Retirer le tracé</button>${GPX.svg(F.track, 320, 120, 'var(--kcal)')}` : '<p class="small muted">Depuis ta montre, Garmin Connect, Strava ou une app de rando : distance, dénivelé, durée et tracé sont remplis tout seuls.</p>'}</div>`;
      if (['course','rando','autre'].includes(s) || (s === 'escalade' && F.details.lieu === 'gv'))
        h += `<div class="grid2"><div><label class="lbl" for="fKm">Distance (km)</label><input id="fKm" class="field num" type="number" inputmode="decimal" step="0.01" min="0" data-f="distance_km" value="${F.distance_km ?? ''}"></div><div><label class="lbl" for="fDp">Dénivelé positif (m)</label><input id="fDp" class="field num" type="number" inputmode="numeric" min="0" data-f="elevation_m" value="${F.elevation_m ?? ''}"></div></div>`;
      if (s === 'rando') h += `<span class="lbl">Sac</span>${seg('sac', [['leger','Léger'],['lourd','Gros sac (plus de 10 kg)']])}`;
      if (s === 'escalade'){
        h += `<span class="lbl">Où ?</span>${seg('lieu', [['salle','En salle'],['falaise','Falaise'],['gv','Grande voie']])}
          <span class="lbl">Type</span>${seg('type', [['voie','Voies'],['bloc','Blocs']])}
          <label class="lbl" for="fSite">Salle, site ou falaise (facultatif)</label><input id="fSite" class="field" maxlength="80" data-d="site" value="${esc(F.details.site || '')}">
          <span class="lbl">${(F.details.type || 'voie') === 'bloc' ? 'Blocs' : 'Voies'} grimpés</span><div id="routes">${routeRows()}</div><button type="button" class="btn ghost" id="addRoute">Ajouter ${(F.details.type || 'voie') === 'bloc' ? 'un bloc' : 'une voie'}</button>`;
      }
      return h;
    }
    function render(){
      main.innerHTML = `<div class="top"><a class="iconbtn" href="javascript:history.back()" aria-label="Retour">‹</a><h1 class="h1s">${id ? 'Modifier' : 'Nouvelle activité'}</h1><span style="width:40px"></span></div>
        <form class="form" id="actForm" novalidate>
          <div class="chips">${sportChips()}</div>
          <div class="card form">${sportBlock()}
            <label class="lbl" for="fTitle">Titre</label><input id="fTitle" class="field" maxlength="120" data-f="title" value="${esc(F.title)}" placeholder="${esc(defaultTitle())}">
            <div class="grid2"><div><label class="lbl" for="fDate">Date</label><input id="fDate" class="field" type="date" data-f="date" value="${F.date}" max="${today()}"></div><div><label class="lbl" for="fTime">Heure de départ</label><input id="fTime" class="field" type="time" data-f="time" value="${F.time}"></div></div>
            <span class="lbl">Durée</span><div class="row dur"><input class="field num" type="number" inputmode="numeric" min="0" max="47" data-f="h" value="${F.h}" aria-label="Heures"><span>h</span><input class="field num" type="number" inputmode="numeric" min="0" max="59" data-f="m" value="${F.m}" aria-label="Minutes"><span>min</span></div>
            <label class="lbl" for="fNotes">Notes</label><textarea id="fNotes" class="field" rows="3" maxlength="2000" data-f="notes" placeholder="Sensations, conditions, avec qui…">${esc(F.notes)}</textarea>
            <span class="lbl">Qui peut la voir ?</span><div class="seg wide" role="group"><button type="button" data-vis="groups" aria-pressed="${F.visibility === 'groups'}">Mes groupes</button><button type="button" data-vis="private" aria-pressed="${F.visibility === 'private'}">Moi seulement</button></div>
          </div>
          <button class="btn block" type="submit">${id ? 'Enregistrer' : 'Publier l\'activité'}</button><p class="err" id="fErr" role="alert"></p>
        </form>`;
    }
    function defaultTitle(){
      const hh = +(F.time || '12').slice(0, 2), moment = hh < 11 ? 'du matin' : hh < 14 ? 'du midi' : hh < 18 ? 'de l\'après-midi' : 'du soir';
      if (F.sport === 'escalade') return `Escalade ${({salle:'en salle', falaise:'en falaise', gv:'en grande voie'})[F.details.lieu || 'salle']}`;
      return `${SPORTS[F.sport].verb} ${moment}`;
    }
    render();
    main.oninput = (e) => {
      const t = e.target;
      if (t.dataset.f) F[t.dataset.f] = t.value;
      if (t.dataset.d) F.details[t.dataset.d] = t.value;
    };
    main.onchange = async (e) => {
      const t = e.target;
      if (t.dataset.route){ const i = +t.closest('.route').dataset.i; F.details.routes[i][t.dataset.route] = t.value; }
      if (t.id === 'gpxIn' && t.files[0]){
        try{
          const g = GPX.parse(await t.files[0].text());
          F.track = g.track; F.distance_km = g.distanceKm || F.distance_km; if (g.elevationGain != null) F.elevation_m = g.elevationGain;
          if (g.durationMin){ F.h = Math.floor(g.durationMin / 60); F.m = g.durationMin % 60; }
          if (g.start){ F.date = iso(g.start); F.time = g.start.toTimeString().slice(0, 5); }
          if (!F.title && g.name) F.title = g.name.slice(0, 120);
          render(); toast(`Tracé importé : ${fmt(g.distanceKm, 2)} km${g.elevationGain != null ? ', ' + fmt(g.elevationGain) + ' m de D+' : ''}.`);
        }catch(ex){ toast(ex.message || 'Fichier GPX illisible.'); }
      }
    };
    main.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.setsport){ F.sport = b.dataset.setsport; render(); }
      else if (b.dataset.seg){ F.details[b.dataset.seg] = b.dataset.v; render(); }
      else if (b.dataset.vis){ F.visibility = b.dataset.vis; $$('[data-vis]').forEach(x => x.setAttribute('aria-pressed', x === b)); }
      else if (b.id === 'addRoute'){ (F.details.routes = F.details.routes || []).push({ grade: (F.details.routes.slice(-1)[0] || {}).grade || '5c', style: 'encha' }); render(); }
      else if (b.dataset.delroute != null){ F.details.routes.splice(+b.dataset.delroute, 1); render(); }
      else if (b.id === 'gpxDel'){ F.track = null; render(); }
    };
    main.onsubmit = async (e) => {
      if (e.target.id !== 'actForm') return;
      e.preventDefault();
      const err = $('#fErr'), btn = $('#actForm button[type=submit]');
      const min = (Math.round(num(F.h)) || 0) * 60 + (Math.round(num(F.m)) || 0);
      const km = num(F.distance_km), dp = num(F.elevation_m);
      if (!F.date || F.date > today()){ err.textContent = 'Choisis une date qui n\'est pas dans le futur.'; return; }
      if (!min && !(km > 0)){ err.textContent = 'Indique au moins une durée ou une distance.'; return; }
      const started = new Date(`${F.date}T${F.time || '12:00'}`);
      const details = Object.assign({}, F.details);
      if (F.sport !== 'escalade'){ delete details.routes; delete details.lieu; delete details.type; delete details.site; }
      if (F.sport !== 'rando') delete details.sac;
      if (F.sport === 'escalade'){ details.lieu = details.lieu || 'salle'; details.type = details.type || 'voie'; }
      const row = {
        sport: F.sport, title: (F.title || '').trim() || defaultTitle(), notes: (F.notes || '').trim(), date: F.date, started_at: started.toISOString(),
        duration_min: min || null, distance_km: km > 0 ? Math.round(km * 100) / 100 : null, elevation_m: dp > 0 ? Math.round(dp) : null,
        details, track: F.track || null, visibility: F.visibility
      };
      row.kcal = activityKcal(row, S.weight) || null;
      btn.disabled = true;
      const q = id ? sb.from('activities').update(row).eq('id', id).select('id').single() : sb.from('activities').insert(row).select('id').single();
      const { data, error } = await q;
      btn.disabled = false;
      if (error){ err.textContent = errText(error); return; }
      toast(id ? 'Activité modifiée.' : 'Activité publiée !'); go('#/activite/' + data.id);
    };
  }

  /* ---------- Groupes ---------- */
  async function viewGroups(tok){
    await loadGroups();
    if (!live(tok)) return;
    const ids = S.groups.map(g => g.id);
    const counts = {};
    if (ids.length){ const { data } = await sb.from('group_members').select('group_id').in('group_id', ids); (data || []).forEach(m => { counts[m.group_id] = (counts[m.group_id] || 0) + 1; }); }
    if (!live(tok)) return;
    main.innerHTML = `<div class="top"><h1>Groupes</h1></div>
      ${S.groups.length ? S.groups.map(g => `<a class="card group-row" href="#/groupe/${g.id}"><span class="gic" aria-hidden="true">${esc(initials(g.name))}</span><span><b>${esc(g.name)}</b><span class="small muted">${counts[g.id] || 1} membre${(counts[g.id] || 1) > 1 ? 's' : ''}${g.role === 'admin' ? ' · admin' : ''}</span></span><span class="chev">›</span></a>`).join('') : '<div class="empty-card card"><p>Tu n\'es dans aucun groupe pour l\'instant.</p></div>'}
      <h2>Rejoindre un groupe</h2><form class="card form" id="gJoin"><label class="lbl" for="gCode">Lien ou code d'invitation</label><div class="row"><input id="gCode" class="field" placeholder="Colle le lien reçu"><button class="btn" style="flex:0 0 auto">Rejoindre</button></div></form>
      <h2>Créer un groupe</h2><form class="card form" id="gNew"><label class="lbl" for="gName">Nom</label><input id="gName" class="field" maxlength="60" placeholder="Ex. Collègues, Club escalade" required><label class="lbl" for="gDesc">Description (facultatif)</label><input id="gDesc" class="field" maxlength="300"><button class="btn block">Créer le groupe</button><p class="err" id="gErr" role="alert"></p></form>`;
    $('#gJoin').onsubmit = (e) => { e.preventDefault(); const c = inviteCode($('#gCode').value); if (c) go('#/rejoindre/' + c); };
    $('#gNew').onsubmit = async (e) => {
      e.preventDefault(); const name = $('#gName').value.trim(); if (name.length < 2){ $('#gErr').textContent = 'Donne un nom d\'au moins 2 caractères.'; return; }
      const { data, error } = await sb.rpc('create_group', { p_name: name, p_description: $('#gDesc').value.trim() });
      if (error){ $('#gErr').textContent = errText(error); return; }
      await loadGroups(); toast('Groupe créé : partage le lien d\'invitation.'); go('#/groupe/' + data.id + '/membres');
    };
  }
  async function viewJoin(code, tok){
    const { data, error } = await sb.rpc('group_preview', { p_code: code });
    if (!live(tok)) return;
    if (error) throw error;
    const g = data && data[0];
    if (!g){ clearInvite(); main.innerHTML = `<div class="empty-card card"><h2>Lien d'invitation invalide</h2><p>Il a peut-être été renouvelé par un admin du groupe. Demande-lui un nouveau lien.</p><a class="btn" href="#/groupes">Mes groupes</a></div>`; return; }
    if (g.already_member){ clearInvite(); return go('#/groupe/' + g.id); }
    main.innerHTML = `<div class="onb"><div class="card invite"><span class="small muted">Tu es invité à rejoindre</span><h1>${esc(g.name)}</h1>${g.description ? `<p>${esc(g.description)}</p>` : ''}<p class="small muted">${g.members} membre${g.members > 1 ? 's' : ''}. En rejoignant, tu verras leurs activités et ils verront celles que tu partages avec tes groupes. Ton carnet (poids, repas, mesures) reste privé.</p><button class="btn block" id="jBtn">Rejoindre le groupe</button><a class="linkbtn" href="#/fil">Pas maintenant</a><p class="err" id="jErr" role="alert"></p></div></div>`;
    $('#jBtn').onclick = async () => {
      const { data: gid, error: e2 } = await sb.rpc('join_group', { p_code: code });
      if (e2){ $('#jErr').textContent = errText(e2); return; }
      clearInvite(); await loadGroups();
      if (!S.profile.onboarded){ toast('Bienvenue dans le groupe ! Présente-toi en quelques secondes.'); go('#/bienvenue/1'); return; }
      toast('Bienvenue dans le groupe !'); go('#/groupe/' + gid);
    };
  }
  async function viewGroup(gid, tab, tok){
    const [{ data: g, error }, { data: mem }] = await Promise.all([
      sb.from('groups').select('*').eq('id', gid).maybeSingle(),
      sb.from('group_members').select('user_id,role,joined_at').eq('group_id', gid)
    ]);
    if (!live(tok)) return;
    if (error) throw error;
    if (!g){ main.innerHTML = `<div class="empty-card card"><h2>Groupe introuvable</h2><p>Tu n'en fais peut-être plus partie.</p><a class="btn" href="#/groupes">Mes groupes</a></div>`; return; }
    await loadPeople((mem || []).map(m => m.user_id));
    if (!live(tok)) return;
    const me = (mem || []).find(m => m.user_id === S.user.id), admin = me && me.role === 'admin';
    const tabs = [['fil','Fil'],['classement','Classement'],['membres','Membres']].concat(admin ? [['reglages','Réglages']] : []);
    main.innerHTML = `<div class="top"><a class="iconbtn" href="#/groupes" aria-label="Retour aux groupes">‹</a><span></span><span style="width:40px"></span></div>
      <section class="ghero"><span class="gic lg" aria-hidden="true">${esc(initials(g.name))}</span><h1>${esc(g.name)}</h1>${g.description ? `<p>${esc(g.description)}</p>` : ''}<p class="small">${(mem || []).length} membre${(mem || []).length > 1 ? 's' : ''}</p><button class="btn light" id="gInvite">Inviter des membres</button></section>
      <div class="subnav gtabs" role="group">${tabs.map(([k, l]) => `<button type="button" data-gtab="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div>
      <div id="gBody"><div class="loading">Chargement…</div></div>`;
    $('.gtabs').style.gridTemplateColumns = `repeat(${tabs.length},1fr)`;
    $('.gtabs').onclick = (e) => { const b = e.target.closest('[data-gtab]'); if (b) go(`#/groupe/${gid}/${b.dataset.gtab}`); };
    $('#gInvite').onclick = async () => {
      const link = inviteLink(g.invite_code);
      if (navigator.share){ try{ await navigator.share({ title: `Rejoins ${g.name} sur CLIMB`, text: `Rejoins le groupe « ${g.name} » sur CLIMB :`, url: link }); return; }catch(e){ if (e && e.name === 'AbortError') return; } }
      try{ await navigator.clipboard.writeText(link); toast('Lien d\'invitation copié.'); }catch(e){ prompt('Copie ce lien d\'invitation :', link); }
    };
    const body = $('#gBody');
    if (tab === 'fil'){
      const ids = (mem || []).map(m => m.user_id);
      const { data: acts } = await sb.from('activities').select(ACT_COLS).in('user_id', ids).eq('visibility', 'groups').order('started_at', { ascending: false }).limit(25);
      if (!live(tok)) return;
      if (!(acts || []).length){ body.innerHTML = `<div class="empty-card card"><p>Aucune activité partagée dans ce groupe pour l'instant. Lance-toi !</p><a class="btn" href="#/nouvelle">Ajouter une activité</a></div>`; return; }
      await renderActs(body, acts);
    } else if (tab === 'classement'){
      const per = sessionStorage.getItem('climb_lb_per') || 'semaine', met = sessionStorage.getItem('climb_lb_met') || 'sessions';
      const from = per === 'mois' ? monthStart() : per === 'annee' ? `${new Date().getFullYear()}-01-01` : monday();
      const { data: lb, error: e2 } = await sb.rpc('group_leaderboard', { p_group: gid, p_from: from });
      if (!live(tok)) return;
      if (e2) throw e2;
      const val = { sessions: (r) => r.sessions, minutes: (r) => r.minutes, km: (r) => +r.km, elevation: (r) => r.elevation };
      const show = { sessions: (r) => `${r.sessions} activité${r.sessions > 1 ? 's' : ''}`, minutes: (r) => durTxt(r.minutes), km: (r) => fmt(r.km, 1) + ' km', elevation: (r) => fmt(r.elevation) + ' m' };
      const rows = (lb || []).slice().sort((x, y) => val[met](y) - val[met](x));
      body.innerHTML = `<div class="seg wide" role="group">${[['semaine','Semaine'],['mois','Mois'],['annee','Année']].map(([k, l]) => `<button type="button" data-per="${k}" aria-pressed="${k === per}">${l}</button>`).join('')}</div>
        <div class="seg wide" role="group" style="margin-top:8px">${[['sessions','Activités'],['minutes','Temps'],['km','Km'],['elevation','D+']].map(([k, l]) => `<button type="button" data-met="${k}" aria-pressed="${k === met}">${l}</button>`).join('')}</div>
        <ol class="lb card">${rows.map((r, i) => `<li class="${r.user_id === S.user.id ? 'me' : ''}"><span class="rk">${i + 1}</span>${avatar(r)}<span class="nm">${esc(r.display_name || 'Membre')}</span><b class="num">${show[met](r)}</b></li>`).join('')}</ol>
        <p class="small muted">Seules les activités partagées avec les groupes comptent.</p>`;
      body.onclick = (e) => { const b = e.target.closest('[data-per],[data-met]'); if (!b) return; if (b.dataset.per) sessionStorage.setItem('climb_lb_per', b.dataset.per); else sessionStorage.setItem('climb_lb_met', b.dataset.met); route(); };
    } else if (tab === 'membres'){
      const admins = (mem || []).filter(m => m.role === 'admin').length;
      const list = (mem || []).slice().sort((a, b) => (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1) || person(a.user_id).display_name.localeCompare(person(b.user_id).display_name, 'fr'));
      body.innerHTML = `<div class="card list">${list.map(m => { const p = person(m.user_id), self = m.user_id === S.user.id; return `<div class="li mem">${avatar(p)}<a href="#/membre/${m.user_id}"><b>${esc(p.display_name)}${self ? ' (toi)' : ''}</b><span class="small muted">${m.role === 'admin' ? 'Admin · ' : ''}depuis le ${new Date(m.joined_at).toLocaleDateString('fr-FR', {day:'numeric', month:'short', year:'numeric'})}</span></a>${admin && !self ? `<span class="acts"><button class="linkbtn small" data-role="${m.user_id}" data-to="${m.role === 'admin' ? 'member' : 'admin'}">${m.role === 'admin' ? 'Retirer admin' : 'Nommer admin'}</button><button class="linkbtn small danger" data-kick="${m.user_id}">Exclure</button></span>` : ''}</div>`; }).join('')}</div>
        <div class="card form"><span class="lbl">Lien d'invitation</span><div class="row"><input class="field" readonly value="${esc(inviteLink(g.invite_code))}" aria-label="Lien d'invitation" id="invLink"><button class="btn" id="copyInv" style="flex:0 0 auto">Copier</button></div><p class="small muted">Toute personne qui a ce lien peut rejoindre le groupe après avoir créé son compte.</p></div>
        <button class="btn ghost danger block" id="leave">Quitter le groupe</button><p class="err" id="mErr" role="alert"></p>`;
      $('#copyInv').onclick = async () => { try{ await navigator.clipboard.writeText($('#invLink').value); toast('Lien copié.'); }catch(e){ $('#invLink').select(); } };
      body.onclick = async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.role){ const { error: e3 } = await sb.from('group_members').update({ role: b.dataset.to }).eq('group_id', gid).eq('user_id', b.dataset.role); if (e3) toast(errText(e3)); else route(); }
        if (b.dataset.kick){ if (!b.dataset.confirm){ b.dataset.confirm = '1'; b.textContent = 'Confirmer'; return; } const { error: e3 } = await sb.from('group_members').delete().eq('group_id', gid).eq('user_id', b.dataset.kick); if (e3) toast(errText(e3)); else { toast('Membre exclu.'); route(); } }
        if (b.id === 'leave'){
          if (admin && admins === 1 && (mem || []).length > 1){ $('#mErr').textContent = 'Tu es le seul admin : nomme d\'abord un autre admin avant de partir.'; return; }
          if (!b.dataset.confirm){ b.dataset.confirm = '1'; b.textContent = (mem || []).length === 1 ? 'Confirmer : le groupe sera supprimé' : 'Confirmer le départ'; return; }
          const q = (mem || []).length === 1 ? sb.from('groups').delete().eq('id', gid) : sb.from('group_members').delete().eq('group_id', gid).eq('user_id', S.user.id);
          const { error: e3 } = await q; if (e3){ toast(errText(e3)); return; }
          await loadGroups(); toast('Tu as quitté le groupe.'); go('#/groupes');
        }
      };
    } else if (tab === 'reglages' && admin){
      body.innerHTML = `<form class="card form" id="gEdit"><label class="lbl" for="geName">Nom</label><input id="geName" class="field" maxlength="60" value="${esc(g.name)}"><label class="lbl" for="geDesc">Description</label><textarea id="geDesc" class="field" maxlength="300" rows="3">${esc(g.description)}</textarea><button class="btn block">Enregistrer</button></form>
        <div class="card form"><span class="lbl">Lien d'invitation</span><p class="small muted">Si le lien a circulé trop largement, crée-en un nouveau : l'ancien ne fonctionnera plus.</p><button class="btn ghost block" id="resetCode">Créer un nouveau lien</button></div>
        <button class="btn ghost danger block" id="delGroup">Supprimer le groupe</button><p class="small muted">La suppression retire le groupe pour tout le monde. Les activités des membres ne sont pas supprimées.</p>`;
      $('#gEdit').onsubmit = async (e) => { e.preventDefault(); const name = $('#geName').value.trim(); if (name.length < 2) return toast('Nom trop court.'); const { error: e3 } = await sb.from('groups').update({ name, description: $('#geDesc').value.trim() }).eq('id', gid); if (e3) toast(errText(e3)); else { await loadGroups(); toast('Groupe mis à jour.'); route(); } };
      $('#resetCode').onclick = async () => { const { error: e3 } = await sb.rpc('reset_invite_code', { p_group: gid }); if (e3) toast(errText(e3)); else { toast('Nouveau lien créé.'); go(`#/groupe/${gid}/membres`); } };
      $('#delGroup').onclick = async (e) => { const b = e.target; if (!b.dataset.confirm){ b.dataset.confirm = '1'; b.textContent = `Confirmer la suppression de « ${g.name} »`; return; } const { error: e3 } = await sb.from('groups').delete().eq('id', gid); if (e3) toast(errText(e3)); else { await loadGroups(); toast('Groupe supprimé.'); go('#/groupes'); } };
    }
  }

  /* ---------- Profil d'un membre ---------- */
  async function viewMember(uid, tok){
    if (uid === S.user.id) return go('#/moi');
    await loadPeople([uid]);
    const { data: acts } = await sb.from('activities').select(ACT_COLS).eq('user_id', uid).order('started_at', { ascending: false }).limit(20);
    if (!live(tok)) return;
    const p = S.people[uid];
    if (!p){ main.innerHTML = `<div class="empty-card card"><h2>Profil non disponible</h2><p>Vous n'avez plus de groupe en commun.</p><a class="btn" href="#/fil">Retour</a></div>`; return; }
    main.innerHTML = `<div class="top"><a class="iconbtn" href="javascript:history.back()" aria-label="Retour">‹</a><span></span><span style="width:40px"></span></div>
      <section class="phero">${avatar(p, 'xl')}<h1>${esc(p.display_name)}</h1>${p.city ? `<p class="muted">${esc(p.city)}</p>` : ''}</section>
      <h2>Activités</h2><div id="mActs"></div>`;
    if (!(acts || []).length) $('#mActs').innerHTML = '<p class="small muted">Aucune activité partagée.</p>'; else await renderActs($('#mActs'), acts);
  }

  /* ---------- Mon profil et paramètres ---------- */
  async function viewMe(tok){
    const p = S.profile;
    const { data: acts } = await sb.from('activities').select(ACT_COLS).eq('user_id', S.user.id).gte('date', monthStart()).order('started_at', { ascending: false });
    if (!live(tok)) return;
    const by = {}; (acts || []).forEach(a => { const t = by[a.sport] = by[a.sport] || { n: 0, m: 0, km: 0, d: 0 }; t.n++; t.m += +a.duration_min || 0; t.km += +a.distance_km || 0; t.d += +a.elevation_m || 0; });
    main.innerHTML = `<section class="phero">${avatar(p, 'xl')}<h1>${esc(p.display_name)}</h1><p class="muted">${esc(S.user.email)}</p></section>
      <h2>Ce mois-ci</h2>${Object.keys(by).length ? `<div class="card list">${Object.entries(by).map(([k, t]) => `<div class="li"><b>${SPORTS[k].icon} ${SPORTS[k].label}</b><span class="small muted num">${t.n} × · ${durTxt(t.m)}${t.km ? ' · ' + fmt(t.km, 1) + ' km' : ''}${t.d ? ' · ' + fmt(t.d) + ' m D+' : ''}</span></div>`).join('')}</div>` : '<p class="small muted">Aucune activité ce mois-ci.</p>'}
      <a class="card carnet-link" href="carnet.html"><span class="gic" aria-hidden="true">📓</span><span><b>Mon carnet</b><span class="small muted">Nutrition, séances de muscu, poids et mesures. Privé.</span></span><span class="chev">›</span></a>
      <h2>Mes activités récentes</h2><div id="meActs"></div>
      <h2>Mon profil</h2>
      <form class="card form" id="meForm">
        <label class="lbl" for="mName">Prénom ou pseudo</label><input id="mName" class="field" maxlength="60" value="${esc(p.display_name)}">
        <label class="lbl" for="mCity">Ville</label><input id="mCity" class="field" maxlength="60" value="${esc(p.city || '')}">
        <label class="lbl" for="mBio">Présentation</label><textarea id="mBio" class="field" maxlength="300" rows="2">${esc(p.bio || '')}</textarea>
        <span class="lbl">Mes sports</span><div class="chips" id="mSports">${Object.entries(SPORTS).filter(([k]) => k !== 'autre').map(([k, s]) => `<button type="button" class="chip" data-sport="${k}" aria-pressed="${(p.sports || []).includes(k)}">${s.icon} ${s.label}</button>`).join('')}</div>
        <span class="lbl">Ma couleur</span><div class="colors" id="mColor">${COLORS.map(c => `<button type="button" class="color" style="--c:${c}" data-color="${c}" aria-pressed="${p.avatar_color === c}" aria-label="Couleur ${c}"></button>`).join('')}</div>
        <button class="btn block">Enregistrer</button></form>
      <h2>Apparence</h2><div class="row" style="align-items:center"><span class="small muted" style="flex:1 1 auto">Mode clair ou sombre</span>${themeSwitchHTML()}</div>
      <h2>Mon compte</h2>
      <div class="card form"><button class="btn ghost block" id="exportMe">Télécharger mes données</button><button class="btn ghost block" id="logout">Se déconnecter</button><button class="btn ghost danger block" id="wipe">Supprimer toutes mes données</button><p class="small muted">La suppression efface tes activités, commentaires, bravos, ton carnet et tes groupes, puis te déconnecte. Pour fermer complètement ton compte, écris à l'administrateur de CLIMB.</p><p class="err" id="meErr" role="alert"></p></div>
      <p class="small muted center">CLIMB · Les cartes utilisent © les contributeurs OpenStreetMap.</p>`;
    if ((acts || []).length) await renderActs($('#meActs'), acts.slice(0, 5)); else $('#meActs').innerHTML = '<p class="small muted">Rien pour l\'instant. <a href="#/nouvelle">Ajoute une activité</a>.</p>';
    $('#mSports').onclick = (e) => { const b = e.target.closest('[data-sport]'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); };
    $('#mColor').onclick = (e) => { const b = e.target.closest('[data-color]'); if (b) $$('#mColor [data-color]').forEach(x => x.setAttribute('aria-pressed', x === b)); };
    $('#meForm').onsubmit = async (e) => {
      e.preventDefault(); const name = $('#mName').value.trim(); if (!name) return toast('Indique un prénom ou un pseudo.');
      const upd = { display_name: name, city: $('#mCity').value.trim(), bio: $('#mBio').value.trim(), sports: $$('#mSports [aria-pressed="true"]').map(b => b.dataset.sport), avatar_color: ($('#mColor [aria-pressed="true"]') || {}).dataset?.color || p.avatar_color };
      const { error } = await sb.from('profiles').update(upd).eq('id', S.user.id);
      if (error) return toast(errText(error));
      Object.assign(S.profile, upd); toast('Profil enregistré.'); route();
    };
    $('#logout').onclick = async () => { await sb.auth.signOut(); S.user = null; S.profile = null; S.people = {}; go('#/connexion'); };
    $('#exportMe').onclick = async () => {
      const [a1, c1, cp, cd] = await Promise.all([
        sb.from('activities').select('*').eq('user_id', S.user.id), sb.from('comments').select('*').eq('user_id', S.user.id),
        sb.from('carnet_profile').select('*').eq('user_id', S.user.id), sb.from('carnet_days').select('*').eq('user_id', S.user.id)
      ]);
      download(`climb-mes-donnees-${today()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), profile: S.profile, groups: S.groups, activities: a1.data, comments: c1.data, carnet_profile: cp.data, carnet_days: cd.data }, null, 1), 'application/json');
    };
    $('#wipe').onclick = async (e) => {
      const b = e.target; if (!b.dataset.confirm){ b.dataset.confirm = '1'; b.textContent = 'Confirmer : tout effacer définitivement'; return; }
      b.disabled = true; const uid = S.user.id;
      for (const [t, col] of [['comments','user_id'],['kudos','user_id'],['activities','user_id'],['carnet_days','user_id'],['carnet_profile','user_id'],['group_members','user_id']]){
        const { error } = await sb.from(t).delete().eq(col, uid); if (error){ $('#meErr').textContent = errText(error); b.disabled = false; return; }
      }
      await sb.from('profiles').update({ bio: '', city: '', sports: [], onboarded: false }).eq('id', uid);
      try{ Object.keys(localStorage).filter(k => /^carnet_|^climb_/.test(k)).forEach(k => localStorage.removeItem(k)); }catch(ex){}
      await sb.auth.signOut(); S.user = null; S.profile = null; toast('Tes données ont été effacées.'); go('#/connexion');
    };
  }

  /* ---------- Démarrage ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-theme-set]'); if (t){ setTheme(t.dataset.themeSet); return; }
    const k = e.target.closest('[data-kudo]'); if (k && !k.disabled){ toggleKudo(k); return; }
    const n = e.target.closest('#nav [data-go]'); if (n){ if (n.dataset.go === 'carnet') location.href = 'carnet.html'; else go('#/' + n.dataset.go); return; }
    if (e.target.closest('[data-reload]')) location.reload();
    const dc = e.target.closest('[data-delcm]');
    if (dc){ (async () => { const { error } = await sb.from('comments').delete().eq('id', dc.dataset.delcm); if (error) toast(errText(error)); else route(); })(); }
  });
  async function init(){
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY'){ S.user = session && session.user; setTimeout(() => go('#/nouveau-mot-de-passe'), 0); }
      if (ev === 'SIGNED_OUT' && S.user){ S.user = null; S.profile = null; S.people = {}; setTimeout(() => go('#/connexion'), 0); }
    });
    const raw = location.hash;
    const { data } = await sb.auth.getSession();
    S.user = data.session ? data.session.user : null;
    if (/access_token=|error_description=|type=recovery/.test(raw)){
      const prm = new URLSearchParams(raw.replace(/^#/, ''));
      const dest = prm.get('type') === 'recovery' ? '#/nouveau-mot-de-passe' : '#/fil';
      history.replaceState(null, '', location.pathname + location.search + dest);
      if (prm.get('error_description')) setTimeout(() => toast(prm.get('error_description').replace(/\+/g, ' ')), 300);
      else if (prm.get('type') === 'signup') setTimeout(() => toast('Adresse confirmée, bienvenue !'), 300);
    }
    window.addEventListener('hashchange', route);
    route();
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  init();
  window.CLIMB_APP = { S, route, go };
})();
