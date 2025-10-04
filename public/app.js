async function api(path, opts={}) {
  const res = await fetch(path, opts);
  if(res.headers.get('content-type')?.includes('application/json')) return res.json();
  return res.text();
}

async function loadServers(){
  const r = await api('/api/servers');
  if(!r.ok) { if(r.error==='Unauthorized') location.href='/login.html'; return; }
  const list = document.getElementById('serversList');
  list.innerHTML = '';
  for(const s of r.servers){
    const el = document.createElement('div');
    el.innerHTML = `<b>${s.name}</b> [${s.lang}] - ${s.status} 
      <button data-id="${s.id}" class="start">Start</button>
      <button data-id="${s.id}" class="stop">Stop</button>
      <button data-id="${s.id}" class="logs">Logs</button>`;
    list.appendChild(el);
  }
}

document.addEventListener('click', async (e)=>{
  if(e.target.id === 'createServerBtn') document.getElementById('modal').classList.remove('hidden');
  if(e.target.id === 'cancelModal') document.getElementById('modal').classList.add('hidden');
  if(e.target.matches('.start')){
    const id = e.target.dataset.id;
    await api(`/api/servers/${id}/start`, {method:'POST'});
    await loadServers();
  }
  if(e.target.matches('.stop')){
    const id = e.target.dataset.id;
    await api(`/api/servers/${id}/stop`, {method:'POST'});
    await loadServers();
  }
  if(e.target.matches('.logs')){
    const id = e.target.dataset.id;
    const r = await api(`/api/servers/${id}/logs`);
    if(r.ok) alert(r.log.slice(-5000)); // mostra último trecho
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
  const r = await api('/api/servers', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  if(r.ok) {
    document.getElementById('modal').classList.add('hidden');
    await loadServers();
  } else alert(r.error || 'erro');
});

document.getElementById('logout')?.addEventListener('click', async ()=>{
  await api('/api/logout', {method:'POST'});
  location.href = '/login.html';
});

loadServers();

