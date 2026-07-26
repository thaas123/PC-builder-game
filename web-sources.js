(() => {
  const style = document.createElement('style');
  style.textContent = `
    .source-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.source-status{font-size:.72rem;color:var(--muted)}
    .source-results{display:grid;gap:5px;margin-top:8px;font-size:.75rem;color:var(--muted)}.source-ok{color:var(--good)}.source-bad{color:var(--bad)}
    .part-art img{width:100%;height:100%;object-fit:contain;background:#fff;border-radius:8px}.part-card{min-height:70px}.part-card .source-line{margin-top:4px;color:#6f88a3}
    .compat-source{display:inline-block;margin-left:6px;padding:1px 5px;border:1px solid var(--line);border-radius:99px;font-size:.65rem;color:var(--muted)}
    .compact-label{margin-top:9px}.advanced-loader summary{cursor:pointer;font-weight:700}.web-sync-button[disabled]{opacity:.65;cursor:wait}
  `;
  document.head.appendChild(style);

  const CACHE_KEY = 'silicon-web-parts-v2';
  const CACHE_AGE = 24 * 60 * 60 * 1000;
  const HF_DATASET = 'Doshiba/pcpartpicker-parts-dataset';
  const categoryMap = {
    cpu:'cpu','video-card':'gpu','motherboard':'motherboard','memory':'ram','case':'case',
    'power-supply':'psu','internal-hard-drive':'storage','cpu-cooler':'cooler','case-fan':'fans'
  };

  const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
  const number = value => {
    const m = clean(value).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
  };
  const specValue = (specs, ...names) => {
    if (!specs || typeof specs !== 'object') return '';
    const entries = Object.entries(specs);
    for (const name of names) {
      const hit = entries.find(([k]) => k.toLowerCase() === name.toLowerCase()) || entries.find(([k]) => k.toLowerCase().includes(name.toLowerCase()));
      if (hit) return Array.isArray(hit[1]) ? hit[1].join(', ') : clean(hit[1]);
    }
    return '';
  };
  const first = (...values) => values.find(v => clean(v)) || '';
  const normalizeForm = value => {
    const v = clean(value).toUpperCase().replace(/MICRO[ -]?ATX/,'MATX').replace(/MINI[ -]?ITX/,'ITX').replace(/E[ -]?ATX/,'EATX');
    if (v.includes('EATX')) return 'EATX'; if (v.includes('MATX')) return 'mATX'; if (v.includes('ITX')) return 'ITX'; if (v.includes('ATX')) return 'ATX'; return '';
  };
  const normalizeSocket = value => clean(value).toUpperCase().replace(/SOCKET\s*/,'').replace(/\s+/g,'');
  const normalizeRamType = value => (clean(value).toUpperCase().match(/DDR[3-6]/) || [])[0] || '';
  const normalizeInterface = value => clean(value).toUpperCase().replace(/\s+/g,' ');
  const slug = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);

  function compactSpecs(specs) {
    if (!specs || typeof specs !== 'object') return '';
    return Object.entries(specs).slice(0,5).map(([k,v]) => `${k}: ${Array.isArray(v)?v.join(', '):v}`).join(' • ');
  }

  function normalizeRow(row, index) {
    const raw = row?.row || row;
    if (!raw) return null;
    const type = categoryMap[raw.category];
    if (!type || !raw.name) return null;
    const s = raw.specs || {};
    const p = {
      id:`web-${type}-${raw.source_id || slug(raw.name)}-${index}`,
      type,
      name:clean(raw.name), brand:clean(raw.brand) || clean(raw.name).split(' ')[0],
      price:0, power:0, source:'PCPartPicker dataset', sourceUrl:raw.url || '', image:raw.image_url || '', rawSpecs:s,
      spec:compactSpecs(s) || 'Web catalog part'
    };
    if (type === 'cpu') {
      p.socket = normalizeSocket(specValue(s,'Socket'));
      p.power = number(first(specValue(s,'TDP'),specValue(s,'Thermal Design Power')));
      p.coolerNeed = p.power ? Math.max(95,Math.round(p.power*1.45)) : 0;
      p.cores = number(specValue(s,'Core Count','Cores'));
      p.score = Math.max(70, Math.round((p.cores || 4)*14 + number(specValue(s,'Performance Core Clock','Core Clock'))*8));
    }
    if (type === 'gpu') {
      p.length = number(specValue(s,'Length'));
      p.power = number(first(specValue(s,'TDP'),specValue(s,'Power Consumption')));
      p.vram = number(first(specValue(s,'Memory'),specValue(s,'VRAM')));
      p.slotWidth = number(specValue(s,'Total Slot Width','Slot Width'));
      p.score = Math.max(70, Math.round(80 + (p.vram || 4)*7 + (p.power || 100)/3));
    }
    if (type === 'motherboard') {
      p.socket = normalizeSocket(specValue(s,'Socket / CPU','Socket'));
      p.ramType = normalizeRamType(first(specValue(s,'Memory Type'),specValue(s,'Memory Speed')));
      p.form = normalizeForm(specValue(s,'Form Factor'));
      p.ramSlots = number(specValue(s,'Memory Slots'));
      p.maxRam = number(specValue(s,'Maximum Memory','Max Memory'));
      p.m2Slots = number(first(specValue(s,'M.2 Slots'),specValue(s,'M.2')));
      p.sataPorts = number(first(specValue(s,'SATA 6.0 Gb/s'),specValue(s,'SATA Ports')));
      p.power = 45;
    }
    if (type === 'ram') {
      p.ramType = normalizeRamType(first(specValue(s,'Speed'),specValue(s,'Type')));
      p.capacity = number(first(specValue(s,'Modules'),specValue(s,'Capacity')));
      const modules = clean(specValue(s,'Modules')).match(/(\d+)\s*x\s*(\d+)/i);
      if (modules) { p.sticks=Number(modules[1]); p.capacity=Number(modules[1])*Number(modules[2]); }
      p.speed = number(specValue(s,'Speed'));
      p.power = Math.max(4,(p.sticks || 2)*3);
      p.score = Math.max(75,Math.round(70+(p.speed||3200)/100));
    }
    if (type === 'case') {
      const formText = first(specValue(s,'Type'),specValue(s,'Motherboard Form Factor'));
      const maxForm = normalizeForm(formText);
      const hierarchy = {ITX:['ITX'],mATX:['mATX','ITX'],ATX:['ATX','mATX','ITX'],EATX:['EATX','ATX','mATX','ITX']};
      p.forms = hierarchy[maxForm] || ['ATX','mATX','ITX'];
      p.gpuMax = number(first(specValue(s,'Maximum Video Card Length'),specValue(s,'Video Card Length')));
      p.coolerMax = number(first(specValue(s,'CPU Cooler Height'),specValue(s,'Maximum CPU Cooler Height')));
      p.psuMax = number(first(specValue(s,'Power Supply Length'),specValue(s,'Maximum PSU Length')));
    }
    if (type === 'psu') {
      p.wattage = number(specValue(s,'Wattage'));
      p.efficiency = clean(specValue(s,'Efficiency Rating'));
      p.modular = clean(specValue(s,'Modular'));
      p.form = normalizeForm(first(specValue(s,'Type'), 'ATX')) || 'ATX';
    }
    if (type === 'storage') {
      p.capacity = number(specValue(s,'Capacity')) * (/TB/i.test(specValue(s,'Capacity')) ? 1000 : 1);
      p.storageType = clean(specValue(s,'Type'));
      p.interface = normalizeInterface(specValue(s,'Interface'));
      p.formFactor = clean(specValue(s,'Form Factor'));
      p.power = 8;
      p.score = /NVME|M\.2/i.test(p.interface+' '+p.formFactor) ? 125 : /SSD/i.test(p.storageType) ? 100 : 55;
    }
    if (type === 'cooler') {
      p.height = number(specValue(s,'Height'));
      p.radiatorSize = number(first(specValue(s,'Radiator Size'),specValue(s,'Water Cooled')));
      p.sockets = clean(first(specValue(s,'CPU Socket'),specValue(s,'Socket'))).toUpperCase();
      p.capacity = p.radiatorSize >= 360 ? 320 : p.radiatorSize >= 280 ? 270 : p.radiatorSize >= 240 ? 230 : 180;
      p.power = p.radiatorSize ? 12 : 5;
    }
    if (type === 'fans') {
      p.count = number(first(specValue(s,'Pack Quantity'),specValue(s,'Quantity'))) || 1;
      p.fanSize = number(first(specValue(s,'Size'),specValue(s,'Fan Size')));
      p.airflow = number(specValue(s,'Airflow'));
      p.cooling = Math.max(12,Math.round((p.airflow || 35)*p.count/3));
      p.power = p.count*3;
    }
    return p;
  }

  function mergeParts(incoming) {
    const map = new Map(parts.map(p => [`${p.type}|${slug(p.name)}`,p]));
    for (const p of incoming) {
      const key = `${p.type}|${slug(p.name)}`;
      const existing = map.get(key);
      if (existing) Object.assign(existing, Object.fromEntries(Object.entries(p).filter(([,v]) => v !== '' && v !== 0 && v != null)));
      else { parts.push(p); map.set(key,p); }
    }
  }

  async function loadDataset(limit) {
    const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(HF_DATASET)}&config=default&split=train&offset=0&length=${limit}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Hugging Face returned ${r.status}`);
    const data = await r.json();
    return (data.rows || []).map(normalizeRow).filter(Boolean);
  }

  async function wikimediaImage(name) {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&limit=1&format=json&origin=*`;
    const sr = await fetch(searchUrl); if (!sr.ok) return '';
    const sd = await sr.json(); const id = sd.search?.[0]?.id; if (!id) return '';
    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=claims&format=json&origin=*`;
    const er = await fetch(entityUrl); if (!er.ok) return '';
    const ed = await er.json();
    const filename = ed.entities?.[id]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    return filename ? `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=320` : '';
  }

  async function addWikimediaFallbacks(items) {
    const targets = items.filter(p => !p.image).slice(0,12);
    await Promise.all(targets.map(async p => { try { p.image = await wikimediaImage(p.name); if (p.image) p.imageSource='Wikimedia Commons'; } catch {} }));
    return targets.filter(p => p.image).length;
  }

  function strongerIssues() {
    const e=[],w=[]; const b=build;
    const cpu=b.cpu, mb=b.motherboard, ram=b.ram, cs=b.case, gpu=b.gpu, psu=b.psu, cooler=b.cooler, storage=b.storage, fans=b.fans;
    const known=(...v)=>v.every(x=>x!==''&&x!==0&&x!=null);
    if (cpu&&mb&&known(cpu.socket,mb.socket)&&cpu.socket!==mb.socket) e.push(`CPU socket ${cpu.socket} does not match motherboard socket ${mb.socket}.`);
    if (ram&&mb&&known(ram.ramType,mb.ramType)&&ram.ramType!==mb.ramType) e.push(`${ram.ramType} RAM does not fit this ${mb.ramType} motherboard.`);
    if (ram&&mb&&ram.sticks&&mb.ramSlots&&ram.sticks>mb.ramSlots) e.push(`${ram.sticks} RAM sticks need more than the motherboard's ${mb.ramSlots} slots.`);
    if (ram&&mb&&ram.capacity&&mb.maxRam&&ram.capacity>mb.maxRam) e.push(`${ram.capacity} GB RAM exceeds the motherboard maximum of ${mb.maxRam} GB.`);
    if (cs&&mb&&mb.form&&Array.isArray(cs.forms)&&!cs.forms.includes(mb.form)) e.push(`${mb.form} motherboard does not fit this case.`);
    if (cs&&gpu&&cs.gpuMax&&gpu.length&&gpu.length>cs.gpuMax) e.push(`GPU length ${gpu.length} mm exceeds the case limit of ${cs.gpuMax} mm.`);
    if (cs&&cooler&&cs.coolerMax&&cooler.height&&cooler.height>cs.coolerMax) e.push(`Cooler height ${cooler.height} mm exceeds the case limit of ${cs.coolerMax} mm.`);
    if (cpu&&cooler&&cooler.sockets&&cpu.socket&&!cooler.sockets.includes(cpu.socket)) e.push(`CPU cooler does not list support for socket ${cpu.socket}.`);
    if (cpu&&cooler&&cpu.coolerNeed&&cooler.capacity&&cooler.capacity<cpu.coolerNeed) e.push(`CPU cooler is undersized (${cooler.capacity} W capacity vs about ${cpu.coolerNeed} W recommended).`);
    const draw=powerDraw(); if(psu&&psu.wattage&&psu.wattage<draw*1.25) e.push(`PSU is too small: ${psu.wattage} W installed, about ${Math.ceil(draw*1.25)} W recommended.`);
    if(storage&&mb&&/NVME|M\.2/.test(storage.interface+' '+storage.formFactor)&&mb.m2Slots===0) e.push('This M.2/NVMe drive needs an M.2 slot, but the motherboard reports none.');
    if(storage&&mb&&/SATA/.test(storage.interface)&&mb.sataPorts===0) e.push('This SATA drive needs a SATA port, but the motherboard reports none.');
    if(!fans) w.push('No case fans installed; temperatures may be higher.');
    if(cpu&&mb&&!cpu.socket) w.push('CPU socket data is missing, so that match could not be verified.');
    if(gpu&&cs&&!gpu.length) w.push('GPU length is missing, so case clearance could not be verified.');
    if(psu&&!psu.wattage) w.push('PSU wattage is missing, so power compatibility could not be verified.');
    return {e,w};
  }
  issues = strongerIssues;

  renderParts = function() {
    const q=$('#search').value.trim().toLowerCase();
    const list=parts.filter(p=>p.type===active&&(!q||`${p.name} ${p.brand} ${p.spec}`.toLowerCase().includes(q)));
    $('#parts').innerHTML='';
    list.forEach(p=>{
      const el=document.createElement('article'); el.className='part-card'+(selected?.id===p.id?' selected':''); el.draggable=true; el.dataset.id=p.id;
      const art=p.image?`<img src="${p.image}" alt="${p.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.textContent='${labels[p.type]}'">`:labels[p.type];
      const source=p.source?`<small class="source-line">Source: ${p.source}${p.imageSource?' + '+p.imageSource:''}</small>`:'';
      const price=p.price?money(p.price):'<span title="No verified USD price">Specs</span>';
      el.innerHTML=`<div class="part-art">${art}</div><div><strong>${p.name}</strong><small>${p.brand||'Generic'} • ${p.spec||''}</small>${source}</div><div class="price">${price}</div>`;
      el.addEventListener('dragstart',ev=>{selected=p;ev.dataTransfer.setData('text/plain',p.id)});
      el.onclick=()=>{selected=p;renderParts();$('#tip').textContent=`Selected ${p.name}. Tap the ${labels[p.type]} slot to install it.`};
      $('#parts').appendChild(el);
    });
    $('#partCount').textContent=`${parts.length} parts`;
  };

  async function syncWebParts() {
    const btn=$('#syncWebPartsBtn'), status=$('#webSourceStatus'), out=$('#webSourceResults');
    const limit=Number($('#webPartLimit').value)||100;
    btn.disabled=true; btn.textContent='Loading web sources…'; status.textContent='Syncing'; out.innerHTML='';
    try {
      const incoming=await loadDataset(limit);
      out.innerHTML += `<div class="source-ok">✓ Hugging Face / PCPartPicker dataset: ${incoming.length} parts</div>`;
      const wikiCount=await addWikimediaFallbacks(incoming);
      out.innerHTML += `<div class="source-ok">✓ Wikidata/Wikimedia: ${wikiCount} fallback images</div>`;
      mergeParts(incoming);
      localStorage.setItem(CACHE_KEY,JSON.stringify({time:Date.now(),parts:incoming}));
      renderParts(); updateAll();
      status.textContent=`${incoming.length} web parts loaded`;
      $('#tip').textContent='Web parts loaded. Compatibility is checked using normalized sockets, RAM type, size, cooling, storage interfaces, and PSU wattage.';
    } catch(err) {
      out.innerHTML=`<div class="source-bad">✕ Web sync failed: ${err.message}</div>`; status.textContent='Sync failed';
    } finally { btn.disabled=false; btn.textContent='Get parts, specs, and images from the web'; }
  }

  function restoreWebCache() {
    try {
      const cache=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(cache?.parts?.length && Date.now()-cache.time<CACHE_AGE){mergeParts(cache.parts);$('#webSourceStatus').textContent=`${cache.parts.length} cached web parts`;renderParts();}
    } catch {}
  }

  $('#syncWebPartsBtn')?.addEventListener('click',syncWebParts);
  restoreWebCache();
})();
