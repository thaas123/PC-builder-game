(() => {
  const style = document.createElement('style');
  style.textContent = `
    .source-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.source-status{font-size:.72rem;color:var(--muted)}
    .source-results{display:grid;gap:5px;margin-top:8px;font-size:.75rem;color:var(--muted)}.source-ok{color:var(--good)}.source-bad{color:var(--bad)}
    .part-art img{width:100%;height:100%;object-fit:contain;background:#fff;border-radius:8px}.part-card{min-height:70px}.part-card .source-line{margin-top:4px;color:#6f88a3}
    .compact-label{margin-top:9px}.advanced-loader summary{cursor:pointer;font-weight:700}.web-sync-button[disabled]{opacity:.65;cursor:wait}
  `;
  document.head.appendChild(style);

  const CACHE_KEY = 'silicon-web-parts-v4';
  const CACHE_AGE = 24 * 60 * 60 * 1000;
  const HF_DATASET = 'Doshiba/pcpartpicker-parts-dataset';
  const WEB_CATEGORIES = ['cpu','cpu-cooler','motherboard','memory','internal-hard-drive','video-card','power-supply','case'];
  const categoryMap = {
    cpu:'cpu','video-card':'gpu','motherboard':'motherboard','memory':'ram','case':'case',
    'power-supply':'psu','internal-hard-drive':'storage','cpu-cooler':'cooler'
  };

  const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
  const number = value => {
    const m = clean(value).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
  };
  const specValue = (specs,...names) => {
    if (!specs || typeof specs !== 'object') return '';
    const entries = Object.entries(specs);
    for (const name of names) {
      const exact = entries.find(([k]) => k.toLowerCase() === name.toLowerCase());
      const partial = entries.find(([k]) => k.toLowerCase().includes(name.toLowerCase()));
      const hit = exact || partial;
      if (hit) return Array.isArray(hit[1]) ? hit[1].join(', ') : clean(hit[1]);
    }
    return '';
  };
  const first = (...values) => values.find(v => clean(v)) || '';
  const normalizeSocket = value => clean(value).toUpperCase().replace(/SOCKET\s*/,'').replace(/\s+/g,'');
  const normalizeRamType = value => (clean(value).toUpperCase().match(/DDR[3-6]/) || [])[0] || '';
  const normalizeInterface = value => clean(value).toUpperCase().replace(/\s+/g,' ');
  const slug = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));

  function normalizeForm(value) {
    const v = clean(value).toUpperCase().replace(/MICRO[ -]?ATX/,'MATX').replace(/MINI[ -]?ITX/,'ITX').replace(/E[ -]?ATX/,'EATX');
    if (v.includes('EATX')) return 'EATX';
    if (v.includes('MATX')) return 'mATX';
    if (v.includes('ITX')) return 'ITX';
    if (v.includes('ATX')) return 'ATX';
    return '';
  }

  function inferCpuSocket(name,architecture='') {
    const n = `${name} ${architecture}`.toUpperCase();
    const ryzen = n.match(/RYZEN\s+[3579]\s+(\d{4,5})/);
    if (ryzen) {
      const model = Number(ryzen[1]);
      if (model >= 7000) return 'AM5';
      if (model >= 1000) return 'AM4';
    }
    if (/THREADRIPPER\s+PRO/.test(n)) return 'SWRX8';
    if (/THREADRIPPER/.test(n)) return /7000|9000/.test(n) ? 'STR5' : 'STRX4';
    if (/CORE\s+ULTRA\s+[3579]\s+2\d\d/.test(n)) return 'LGA1851';
    const intel = n.match(/I[3579]-?(\d{4,5})/);
    if (intel) {
      const digits = intel[1];
      const gen = digits.length === 5 ? Number(digits.slice(0,2)) : Number(digits.slice(0,1));
      if (gen >= 12 && gen <= 14) return 'LGA1700';
      if (gen === 10 || gen === 11) return 'LGA1200';
      if (gen >= 6 && gen <= 9) return 'LGA1151';
      if (gen === 4 || gen === 5) return 'LGA1150';
      if (gen === 2 || gen === 3) return 'LGA1155';
    }
    return '';
  }

  function compactSpecs(specs) {
    if (!specs || typeof specs !== 'object') return '';
    return Object.entries(specs).slice(0,6).map(([k,v]) => `${k}: ${Array.isArray(v)?v.join(', '):v}`).join(' • ');
  }

  function normalizeRow(row,index) {
    const raw = row?.row || row;
    if (!raw) return null;
    const type = categoryMap[raw.category];
    if (!type || !raw.name) return null;
    const s = raw.specs || {};
    const p = {
      id:`web-${type}-${raw.source_id || slug(raw.name)}-${index}`,
      type,
      name:clean(raw.name),
      brand:clean(raw.brand) || clean(raw.name).split(' ')[0],
      price:number(first(raw.price,raw.price_usd)),
      power:0,
      source:'PCPartPicker dataset',
      sourceUrl:raw.url || '',
      image:first(raw.image_url,raw.image,raw.thumbnail),
      rawSpecs:s,
      spec:compactSpecs(s) || 'Web catalog part'
    };

    if (type === 'cpu') {
      p.socket = normalizeSocket(specValue(s,'Socket')) || inferCpuSocket(p.name,specValue(s,'Microarchitecture'));
      p.power = number(first(specValue(s,'TDP'),specValue(s,'Thermal Design Power')));
      p.coolerNeed = p.power ? Math.max(95,Math.round(p.power*1.45)) : 0;
      p.cores = number(specValue(s,'Core Count','Cores'));
      p.score = Math.max(70,Math.round((p.cores || 4)*14 + number(specValue(s,'Performance Core Clock','Core Clock'))*8));
    }

    if (type === 'gpu') {
      p.length = number(first(specValue(s,'Length'),specValue(s,'Card Length')));
      p.height = number(first(specValue(s,'Height'),specValue(s,'Card Height')));
      p.thickness = number(first(specValue(s,'Thickness'),specValue(s,'Card Thickness')));
      p.slotWidth = number(first(specValue(s,'Total Slot Width'),specValue(s,'Slot Width')));
      if (!p.slotWidth && p.thickness) p.slotWidth = Math.ceil(p.thickness/20.32*2)/2;
      p.power = number(first(specValue(s,'TDP'),specValue(s,'Power Consumption'),specValue(s,'Board Power')));
      p.vram = number(first(specValue(s,'Memory'),specValue(s,'VRAM')));
      p.score = Math.max(70,Math.round(80 + (p.vram || 4)*7 + (p.power || 100)/3));
    }

    if (type === 'motherboard') {
      p.socket = normalizeSocket(specValue(s,'Socket / CPU','Socket'));
      p.ramType = normalizeRamType(first(specValue(s,'Memory Type'),specValue(s,'Memory Speed')));
      p.form = normalizeForm(specValue(s,'Form Factor'));
      p.ramSlots = number(specValue(s,'Memory Slots'));
      p.maxRam = number(specValue(s,'Maximum Memory','Max Memory'));
      p.m2Slots = number(first(specValue(s,'M.2 Slots'),specValue(s,'M.2')));
      p.sataPorts = number(first(specValue(s,'SATA 6.0 Gb/s'),specValue(s,'SATA Ports')));
      p.expansionSlots = number(first(specValue(s,'PCIe x16 Slots'),specValue(s,'Expansion Slots')));
      p.cpuToPcieClearance = number(first(specValue(s,'CPU to PCIe Clearance'),specValue(s,'Socket to PCIe Distance')));
      p.power = 45;
    }

    if (type === 'ram') {
      p.ramType = normalizeRamType(first(specValue(s,'Speed'),specValue(s,'Type')));
      p.capacity = number(first(specValue(s,'Modules'),specValue(s,'Capacity')));
      const modules = clean(specValue(s,'Modules')).match(/(\d+)\s*x\s*(\d+)/i);
      if (modules) {
        p.sticks = Number(modules[1]);
        p.capacity = Number(modules[1])*Number(modules[2]);
      }
      p.height = number(first(specValue(s,'Height'),specValue(s,'Module Height')));
      p.speed = number(specValue(s,'Speed'));
      p.power = Math.max(4,(p.sticks || 2)*3);
      p.score = Math.max(75,Math.round(70+(p.speed||3200)/100));
    }

    if (type === 'case') {
      const maxForm = normalizeForm(first(specValue(s,'Type'),specValue(s,'Motherboard Form Factor')));
      const hierarchy = {ITX:['ITX'],mATX:['mATX','ITX'],ATX:['ATX','mATX','ITX'],EATX:['EATX','ATX','mATX','ITX']};
      p.forms = hierarchy[maxForm] || ['ATX','mATX','ITX'];
      p.gpuMax = number(first(specValue(s,'Maximum Video Card Length'),specValue(s,'Video Card Length'),specValue(s,'GPU Clearance')));
      p.gpuHeightMax = number(first(specValue(s,'Maximum Video Card Height'),specValue(s,'GPU Height Clearance')));
      p.gpuThicknessMax = number(first(specValue(s,'Maximum Video Card Thickness'),specValue(s,'GPU Thickness Clearance')));
      p.coolerMax = number(first(specValue(s,'CPU Cooler Height'),specValue(s,'Maximum CPU Cooler Height')));
      p.psuMax = number(first(specValue(s,'Power Supply Length'),specValue(s,'Maximum PSU Length')));
      p.expansionSlots = number(first(specValue(s,'Expansion Slots'),specValue(s,'Full-Height Expansion Slots')));
      p.maxRadiator = number(first(specValue(s,'Radiator Support'),specValue(s,'Maximum Radiator Size')));
    }

    if (type === 'psu') {
      p.wattage = number(specValue(s,'Wattage'));
      p.efficiency = clean(specValue(s,'Efficiency Rating'));
      p.modular = clean(specValue(s,'Modular'));
      p.length = number(first(specValue(s,'Length'),specValue(s,'PSU Length')));
      p.form = normalizeForm(first(specValue(s,'Type'),'ATX')) || 'ATX';
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
      p.height = number(first(specValue(s,'Height'),specValue(s,'Cooler Height')));
      p.width = number(first(specValue(s,'Width'),specValue(s,'Cooler Width')));
      p.depth = number(first(specValue(s,'Depth'),specValue(s,'Cooler Depth')));
      p.ramClearance = number(first(specValue(s,'RAM Clearance'),specValue(s,'Memory Clearance')));
      p.gpuClearance = number(first(specValue(s,'GPU Clearance'),specValue(s,'PCIe Clearance')));
      p.radiatorSize = number(first(specValue(s,'Radiator Size'),specValue(s,'Water Cooled')));
      p.sockets = clean(first(specValue(s,'CPU Socket'),specValue(s,'Socket'))).toUpperCase();
      p.capacity = p.radiatorSize >= 360 ? 320 : p.radiatorSize >= 280 ? 270 : p.radiatorSize >= 240 ? 230 : 180;
      p.power = p.radiatorSize ? 12 : 5;
    }

    return p;
  }

  function mergeParts(incoming) {
    const map = new Map(parts.map(p => [`${p.type}|${slug(p.name)}`,p]));
    for (const p of incoming) {
      const key = `${p.type}|${slug(p.name)}`;
      const existing = map.get(key);
      if (existing) Object.assign(existing,Object.fromEntries(Object.entries(p).filter(([,v]) => v !== '' && v !== 0 && v != null)));
      else {
        parts.push(p);
        map.set(key,p);
      }
    }
  }

  async function fetchJson(url,retries=2) {
    let lastError;
    for (let attempt=0;attempt<=retries;attempt++) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt < retries) await sleep(350*(attempt+1));
      }
    }
    throw lastError;
  }

  async function loadCategory(category,target) {
    const rows=[];
    const batchSize=50;
    for (let offset=0;rows.length<target;offset+=batchSize) {
      const length=Math.min(batchSize,target-rows.length);
      const where=`"category"='${category}'`;
      const url=`https://datasets-server.huggingface.co/filter?dataset=${encodeURIComponent(HF_DATASET)}&config=default&split=train&where=${encodeURIComponent(where)}&offset=${offset}&length=${length}`;
      const data=await fetchJson(url,2);
      const batch=data.rows || [];
      rows.push(...batch);
      if (batch.length<length) break;
      await sleep(80);
    }
    return rows;
  }

  async function loadDataset(limit,onProgress) {
    const each=Math.ceil(limit/WEB_CATEGORIES.length);
    const rows=[];
    const failed=[];
    for (let i=0;i<WEB_CATEGORIES.length;i++) {
      const category=WEB_CATEGORIES[i];
      try {
        const categoryRows=await loadCategory(category,each+8);
        rows.push(...categoryRows);
      } catch (error) {
        failed.push(`${category} (${error.message})`);
      }
      onProgress?.(i+1,WEB_CATEGORIES.length,rows.length);
    }
    const normalized=rows.map((row,index)=>normalizeRow(row,index)).filter(Boolean);
    const unique=[];
    const seen=new Set();
    for (const part of normalized) {
      const key=`${part.type}|${slug(part.name)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(part);
      }
      if (unique.length>=limit) break;
    }
    if (!unique.length) throw new Error(`No web parts returned${failed.length?`; ${failed.join(', ')}`:''}`);
    unique.failedCategories=failed;
    return unique;
  }

  async function commonsImage(name) {
    const query=`${name} computer hardware`;
    const url=`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=320&format=json&origin=*`;
    const data=await fetchJson(url,1);
    const pages=Object.values(data.query?.pages || {});
    const image=pages.find(page => page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url);
    return image?.imageinfo?.[0]?.thumburl || image?.imageinfo?.[0]?.url || '';
  }

  function generatedPlaceholder(part) {
    const label=(labels[part.type] || part.type || 'PART').toUpperCase();
    const initials=clean(part.brand || part.name).slice(0,3).toUpperCase();
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"><rect width="320" height="220" rx="22" fill="#111b29"/><rect x="28" y="28" width="264" height="164" rx="18" fill="#1e3045" stroke="#32e6fa" stroke-width="5"/><text x="160" y="104" fill="#32e6fa" font-family="Arial,sans-serif" font-size="42" font-weight="700" text-anchor="middle">${initials}</text><text x="160" y="145" fill="#dffcff" font-family="Arial,sans-serif" font-size="22" text-anchor="middle">${label}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  async function addImageFallbacks(items,onProgress) {
    const targets=items.filter(part => !part.image);
    let cursor=0;
    let actual=0;
    const workers=Array.from({length:4},async()=>{
      while (cursor<targets.length) {
        const index=cursor++;
        const part=targets[index];
        try {
          const image=await commonsImage(part.name);
          if (image) {
            part.image=image;
            part.imageSource='Wikimedia Commons';
            actual++;
          }
        } catch {}
        if (!part.image) {
          part.image=generatedPlaceholder(part);
          part.imageSource='Generated fallback';
        }
        onProgress?.(index+1,targets.length,actual);
        await sleep(60);
      }
    });
    await Promise.all(workers);
    return {actual,placeholders:targets.length-actual};
  }

  function strongerIssues() {
    const e=[],w=[];
    const {cpu,motherboard:mb,ram,case:cs,gpu,psu,cooler,storage,fans}=build;
    const known=(...values)=>values.every(value=>value!==''&&value!==0&&value!=null);

    if (cpu&&mb&&known(cpu.socket,mb.socket)&&cpu.socket!==mb.socket) e.push(`CPU socket ${cpu.socket} does not match motherboard socket ${mb.socket}.`);
    if (ram&&mb&&known(ram.ramType,mb.ramType)&&ram.ramType!==mb.ramType) e.push(`${ram.ramType} RAM does not fit this ${mb.ramType} motherboard.`);
    if (ram&&mb&&ram.sticks&&mb.ramSlots&&ram.sticks>mb.ramSlots) e.push(`${ram.sticks} RAM sticks need more than the motherboard's ${mb.ramSlots} physical slots.`);
    if (ram&&mb&&ram.capacity&&mb.maxRam&&ram.capacity>mb.maxRam) e.push(`${ram.capacity} GB RAM exceeds the motherboard maximum of ${mb.maxRam} GB.`);
    if (ram&&cooler&&ram.height&&cooler.ramClearance&&ram.height>cooler.ramClearance) e.push(`RAM is ${ram.height} mm tall, but the CPU cooler allows ${cooler.ramClearance} mm.`);
    if (ram&&cooler&&!cooler.radiatorSize&&ram.height>=45&&!cooler.ramClearance) w.push('Tall RAM and a large air cooler may overlap; the cooler does not publish RAM-clearance data.');

    if (cs&&mb&&mb.form&&Array.isArray(cs.forms)&&!cs.forms.includes(mb.form)) e.push(`${mb.form} motherboard does not fit this case.`);
    if (cs&&gpu&&cs.gpuMax&&gpu.length&&gpu.length>cs.gpuMax) e.push(`GPU length ${gpu.length} mm exceeds the case limit of ${cs.gpuMax} mm.`);
    if (cs&&gpu&&cs.gpuHeightMax&&gpu.height&&gpu.height>cs.gpuHeightMax) e.push(`GPU height ${gpu.height} mm exceeds the case limit of ${cs.gpuHeightMax} mm.`);
    if (cs&&gpu&&cs.gpuThicknessMax&&gpu.thickness&&gpu.thickness>cs.gpuThicknessMax) e.push(`GPU thickness ${gpu.thickness} mm exceeds the case limit of ${cs.gpuThicknessMax} mm.`);
    if (cs&&gpu&&cs.expansionSlots&&gpu.slotWidth&&gpu.slotWidth>cs.expansionSlots) e.push(`GPU uses ${gpu.slotWidth} slots, but the case has only ${cs.expansionSlots} expansion slots.`);

    if (cs&&cooler&&cs.coolerMax&&cooler.height&&cooler.height>cs.coolerMax) e.push(`Cooler height ${cooler.height} mm exceeds the case limit of ${cs.coolerMax} mm.`);
    if (cs&&cooler&&cooler.radiatorSize&&cs.maxRadiator&&cooler.radiatorSize>cs.maxRadiator) e.push(`${cooler.radiatorSize} mm radiator exceeds the case radiator limit of ${cs.maxRadiator} mm.`);
    if (cpu&&cooler&&cooler.sockets&&cpu.socket&&!cooler.sockets.includes(cpu.socket)) e.push(`CPU cooler does not list support for socket ${cpu.socket}.`);
    if (cpu&&cooler&&cpu.coolerNeed&&cooler.capacity&&cooler.capacity<cpu.coolerNeed) e.push(`CPU cooler is undersized (${cooler.capacity} W capacity vs about ${cpu.coolerNeed} W recommended).`);

    if (gpu&&cooler&&mb) {
      if (cooler.gpuClearance&&gpu.height&&gpu.height>cooler.gpuClearance) e.push(`GPU height ${gpu.height} mm exceeds the cooler's published PCIe/GPU clearance of ${cooler.gpuClearance} mm.`);
      const compactBoard=['ITX','mATX'].includes(mb.form);
      const hugeAirCooler=!cooler.radiatorSize&&((cooler.width&&cooler.width>=135)||(cooler.depth&&cooler.depth>=130)||(cooler.height&&cooler.height>=160));
      const hugeGpu=(gpu.slotWidth&&gpu.slotWidth>=3)||(gpu.height&&gpu.height>=140);
      if (compactBoard&&hugeAirCooler&&hugeGpu&&!cooler.gpuClearance) w.push('Large air cooler + tall/thick GPU on a compact motherboard may physically overlap; exact socket-to-PCIe clearance is unavailable.');
    }

    if (cs&&gpu&&cooler&&cooler.radiatorSize&&cs.gpuMax&&gpu.length) {
      const estimatedFrontRadiatorLoss=55;
      if (gpu.length<=cs.gpuMax&&gpu.length>cs.gpuMax-estimatedFrontRadiatorLoss) w.push('This GPU fits the empty case, but a front-mounted radiator and fans may reduce GPU length clearance by roughly 55 mm.');
    }

    if (cs&&psu&&cs.psuMax&&psu.length&&psu.length>cs.psuMax) e.push(`PSU length ${psu.length} mm exceeds the case limit of ${cs.psuMax} mm.`);
    const draw=powerDraw();
    if (psu&&psu.wattage&&psu.wattage<draw*1.25) e.push(`PSU is too small: ${psu.wattage} W installed, about ${Math.ceil(draw*1.25)} W recommended.`);

    if (storage&&mb&&/NVME|M\.2/.test(storage.interface+' '+storage.formFactor)&&mb.m2Slots===0) e.push('This M.2/NVMe drive needs an M.2 slot, but the motherboard reports none.');
    if (storage&&mb&&/SATA/.test(storage.interface)&&mb.sataPorts===0) e.push('This SATA drive needs a SATA port, but the motherboard reports none.');
    if (!fans) w.push('No case fans installed; temperatures may be higher.');
    if (cpu&&mb&&!cpu.socket) w.push('CPU socket data is missing, so that match could not be verified.');
    if (gpu&&cs&&!gpu.length) w.push('GPU length is missing, so case clearance could not be verified.');
    if (psu&&!psu.wattage) w.push('PSU wattage is missing, so power compatibility could not be verified.');
    return {e,w};
  }
  issues=strongerIssues;

  renderParts=function() {
    const q=$('#search').value.trim().toLowerCase();
    const list=parts.filter(part=>part.type===active&&(!q||`${part.name} ${part.brand} ${part.spec}`.toLowerCase().includes(q)));
    $('#parts').innerHTML='';
    list.forEach(part=>{
      const el=document.createElement('article');
      el.className='part-card'+(selected?.id===part.id?' selected':'');
      el.draggable=true;
      el.dataset.id=part.id;
      const art=part.image?`<img src="${part.image}" alt="${part.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${generatedPlaceholder(part)}'">`:labels[part.type];
      const source=part.source?`<small class="source-line">Source: ${part.source}${part.imageSource?' + '+part.imageSource:''}</small>`:'';
      const price=part.price?money(part.price):'<span title="No verified USD price">Specs</span>';
      el.innerHTML=`<div class="part-art">${art}</div><div><strong>${part.name}</strong><small>${part.brand||'Generic'} • ${part.spec||''}</small>${source}</div><div class="price">${price}</div>`;
      el.addEventListener('dragstart',event=>{selected=part;event.dataTransfer.setData('text/plain',part.id)});
      el.onclick=()=>{selected=part;renderParts();$('#tip').textContent=`Selected ${part.name}. Tap the ${labels[part.type]} slot to install it.`};
      $('#parts').appendChild(el);
    });
    $('#partCount').textContent=`${parts.length} parts`;
  };

  let syncing=false;
  async function syncWebParts(auto=false) {
    if (syncing) return;
    syncing=true;
    const btn=$('#syncWebPartsBtn');
    const status=$('#webSourceStatus');
    const out=$('#webSourceResults');
    const limit=Number($('#webPartLimit').value)||100;
    btn.disabled=true;
    btn.textContent='Loading web sources…';
    status.textContent='Syncing';
    out.innerHTML='';
    try {
      const incoming=await loadDataset(limit,(done,total,count)=>{
        status.textContent=`Parts ${done}/${total} categories • ${count} rows`;
      });
      out.innerHTML+=`<div class="source-ok">✓ PC parts dataset: ${incoming.length} unique parts</div>`;
      if (incoming.failedCategories?.length) out.innerHTML+=`<div class="source-bad">Some categories failed: ${incoming.failedCategories.join(', ')}</div>`;
      const images=await addImageFallbacks(incoming,(done,total,actual)=>{
        status.textContent=`Images ${done}/${total} • ${actual} real fallbacks`;
      });
      out.innerHTML+=`<div class="source-ok">✓ Images: ${images.actual} Wikimedia fallbacks, ${images.placeholders} generated placeholders</div>`;
      mergeParts(incoming);
      localStorage.setItem(CACHE_KEY,JSON.stringify({time:Date.now(),parts:incoming}));
      renderParts();
      updateAll();
      status.textContent=`${incoming.length} web parts loaded`;
      $('#tip').textContent='Web catalog loaded. Compatibility now checks RAM-stick space, RAM/cooler clearance, GPU length/height/thickness, expansion slots, radiator space, PSU length, sockets, power, and storage connections.';
    } catch (error) {
      out.innerHTML=`<div class="source-bad">✕ Web sync failed: ${error.message}</div>`;
      status.textContent='Sync failed';
      if (auto) $('#tip').textContent='The built-in catalog loaded, but the live catalog could not be reached. Tap the web catalog button to retry.';
    } finally {
      syncing=false;
      btn.disabled=false;
      btn.textContent='Refresh parts, specs, and images from the web';
    }
  }

  function restoreWebCache() {
    try {
      const cache=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if (cache?.parts?.length&&Date.now()-cache.time<CACHE_AGE) {
        mergeParts(cache.parts);
        $('#webSourceStatus').textContent=`${cache.parts.length} cached web parts`;
        renderParts();
        return true;
      }
    } catch {}
    return false;
  }

  $('#syncWebPartsBtn')?.addEventListener('click',()=>syncWebParts(false));
  const restored=restoreWebCache();
  if (!restored) setTimeout(()=>syncWebParts(true),250);
})();
