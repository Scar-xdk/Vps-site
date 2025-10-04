// app.js - frontend do painel
async function api(path, opts={}) {
  const res = await fetch(path, opts);
  let ct = res.headers.get('content-type') || '';
  if(ct.includes('application/json')) return res.json();
  return res.text();
}

async function ensureAuth(){
  // try a quick call to /api/servers to see se estamos logados
  const r = await api('/api/servers');
  if(!r.ok){
    // não autenticado: mandar pra login
    location.href = '/login.html';
    return false;
  }
  // update user box
  const userBox = document.getElementById('userBox');
  userBox.textContent = r.servers && r.servers.length ? 'Logado' : 'Logado';
  return true;
}

async function loadServers(){
  const r = await api('/api/servers');
  if(!r.ok){ location.href='/login.html'; return; }
  const wrap = document.getElementById('serversList');
  wrap.innerHTML = '';
  if(!r.servers || r.servers.length===0){ wrap.innerHTML = '<div class="small">Você não tem servidores ainda.</div>'; return; }
  for(const s of r.servers){
    const div = document.createElement('div');
    div.className='server';
    div.innerHTML = `<h4>${s.name}</h4>
      <div class="kv">Lang: ${s.lang} — ${s.version||'--'}</div>
      <div class="kv">Status: ${s.status}</div>
      <div style="margin-top:8px" class="row">
        <button class="btn primary start" data-id="${s.id}">Start</button>
        <button class="btn stop" data-id="${s.id}">Stop</button>
        <button class="btn" data-id="${s.id}" class="logs">Logs</button>
      </div>`;
    wrap.appendChild(div);
  }
}

document.addEventListener('click', async (e)=>{
  if(e.target.id === 'createServerBtn') {
    document.getElementById('createCard').style.display = 'block';
    window.scrollTo({top:0,behavior:'smooth'});
  }
  if(e.target.id === 'cancelCreate') {
    document.getElementById('createCard').style.display = 'none';
  }
  if(e.target.id === 'logoutBtn') {
    await api('/api/logout', { method:'POST' });
    location.href = '/login.html';
  }
  if(e.target.matches('.start')) {
    const id = e.target.dataset.id;
    await api(`/api/servers/${id}/start`, { method:'POST' });
    setTimeout(loadServers, 700);
  }
  if(e.target.matches('.stop')) {
    const id = e.target.dataset.id;
    await api(`/api/servers/${id}/stop`, { method:'POST' });
    setTimeout(loadServers, 700);
  }
  if(e.target.matches('.btn') && e.target.textContent.trim() === 'Logs') {
    const id = e.target.dataset.id;
    const r = await api(`/api/servers/${id}/logs`);
    if(r.ok) alert(r.log.slice(-4000));
  }
});

document.getElementById('createForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    name: fd.get('name'),
    lang: fd.get('lang'),
    version: fd.get('version'),
    startCommand: fd.get('startCommand'),
    hasDeps: !!fd.get('hasDeps')
  };
  const res = await api('/api/servers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(res.ok) {
    document.getElementById('createCard').style.display = 'none';
    await loadServers();
  } else alert(res.error || 'Erro ao criar');
});

(async ()=>{
  // se não tiver na página index, não faz nada
  if(location.pathname === '/' || location.pathname.endsWith('/index.html')){
    const ok = await ensureAuth();
    if(ok) loadServers();
  }
})();
