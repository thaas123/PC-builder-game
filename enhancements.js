(() => {
  const PRICE_CACHE_KEY='silicon-price-fallbacks-v1';
  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const numericPrice=value=>{
    if(typeof value==='number') return value>0&&value<10000?value:0;
    const text=clean(value).replace(/,/g,'');
    const match=text.match(/(?:USD|US\$|\$)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:USD|US\$)/i);
    const n=Number(match?.[1]||match?.[2]||0);
    return n>0&&n<10000?n:0;
  };

  function findPriceDeep(value,depth=0){
    if(!value||depth>4) return 0;
    if(Array.isArray(value)){
      for(const item of value){const found=findPriceDeep(item,depth+1);if(found)return found;}
      return 0;
    }
    if(typeof value!=='object') return numericPrice(value);
    const priority=['price','price_usd','current_price','lowest_price','list_price','msrp','retail_price','amount'];
    const entries=Object.entries(value);
    for(const key of priority){
      const hit=entries.find(([k])=>k.toLowerCase().replace(/[^a-z0-9]+/g,'_')===key);
      if(hit){const found=numericPrice(hit[1])||findPriceDeep(hit[1],depth+1);if(found)return found;}
    }
    for(const [key,item] of entries){
      if(/price|msrp|retail|cost/i.test(key)){const found=numericPrice(item)||findPriceDeep(item,depth+1);if(found)return found;}
    }
    return 0;
  }

  function estimatePrice(part){
    const n=(part.name||'').toUpperCase();
    if(part.type==='cpu'){
      if(/THREADRIPPER|XEON/.test(n)) return Math.max(799,(part.cores||16)*85);
      return Math.max(79,Math.round(((part.cores||6)*22+(part.power||65)*.55+(part.score||100)*.7)/10)*10-1);
    }
    if(part.type==='gpu') return Math.max(129,Math.round(((part.vram||8)*28+(part.power||140)*1.15+(part.score||100)*2.1)/10)*10-1);
    if(part.type==='motherboard') return Math.max(79,Math.round((95+(part.ramSlots||2)*12+(part.m2Slots||1)*20+(/X|Z|E/.test(n)?90:0))/10)*10-1);
    if(part.type==='ram') return Math.max(24,Math.round(((part.capacity||16)*2.1+(part.speed||3200)/160)/5)*5-1);
    if(part.type==='case') return Math.max(49,Math.round((65+(part.gpuMax||300)*.18+(part.expansionSlots||4)*6)/10)*10-1);
    if(part.type==='psu') return Math.max(39,Math.round(((part.wattage||550)*.12+(/PLATINUM|TITANIUM/.test(n)?70:/GOLD/.test(n)?35:10))/10)*10-1);
    if(part.type==='storage') return Math.max(24,Math.round(((part.capacity||1000)/1000*58+(/NVME|M\.2/.test((part.interface||'')+' '+(part.formFactor||''))?25:0))/5)*5-1);
    if(part.type==='cooler') return Math.max(24,Math.round(((part.radiatorSize||0)*.32+(part.height||120)*.18+(part.capacity||150)*.2)/5)*5-1);
    if(part.type==='fans') return Math.max(12,(part.count||1)*14-1);
    return 49;
  }

  function recoverPrices(){
    let changed=0,actual=0,estimated=0;
    for(const part of parts){
      if(Number(part.price)>0) continue;
      const found=findPriceDeep(part.rawSpecs)||findPriceDeep(part.raw)||findPriceDeep(part);
      if(found){part.price=Math.round(found*100)/100;part.priceKind='Dataset price';actual++;changed++;}
      else{
        part.price=estimatePrice(part);
        part.priceKind='Estimated market price';
        part.priceEstimated=true;
        estimated++;changed++;
      }
    }
    try{localStorage.setItem(PRICE_CACHE_KEY,JSON.stringify(parts.filter(p=>p.price).map(p=>({id:p.id,price:p.price,priceKind:p.priceKind,priceEstimated:!!p.priceEstimated}))));}catch{}
    return{changed,actual,estimated};
  }

  function restorePrices(){
    try{
      const saved=JSON.parse(localStorage.getItem(PRICE_CACHE_KEY)||'[]');
      const map=new Map(saved.map(x=>[x.id,x]));
      for(const part of parts){const hit=map.get(part.id);if(hit&&!part.price)Object.assign(part,hit);}
    }catch{}
  }

  function fallbackImage(part){
    if(typeof generatedPlaceholder==='function') return generatedPlaceholder(part);
    const label=encodeURIComponent((part.brand||part.type||'PC').slice(0,8).toUpperCase());
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="100%" height="100%" rx="24" fill="#142238"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#32e6fa" font-family="Arial" font-size="34" font-weight="700">${label}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  const css=document.createElement('style');
  css.textContent=`
    .dropzone{position:absolute;overflow:hidden}.case-shell.dropzone{position:relative}
    .installed-part-image{position:absolute;inset:4%;width:92%;height:92%;object-fit:contain;pointer-events:none;z-index:1;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5))}
    .dropzone>span,.dropzone>.empty-label{position:relative;z-index:3;background:rgba(7,13,22,.65);padding:2px 5px;border-radius:5px;max-width:96%;overflow:hidden;text-overflow:ellipsis}
    .motherboard>.installed-part-image{inset:1%;width:98%;height:98%;object-fit:fill;opacity:.72}.socket>.installed-part-image{opacity:1;object-fit:contain}
    .pcie>.installed-part-image{inset:-35% 1%;width:98%;height:170%;object-fit:contain}.psu>.installed-part-image{object-fit:contain}.cooler>.installed-part-image{inset:-12%;width:124%;height:124%}
    .ram-bank.visual-ram{display:flex;align-items:stretch;justify-content:center;gap:2px;padding:3px}.ram-bank.visual-ram .installed-part-image{position:relative;inset:auto;width:auto;min-width:8px;max-width:24%;height:100%;object-fit:fill;flex:1}
    .case-fans.visual-fans{display:flex;gap:2px}.case-fans.visual-fans .installed-part-image{position:relative;inset:auto;width:25%;height:100%;flex:1;object-fit:contain}
    .case-shell.case-image{background-size:cover;background-position:center;background-blend-mode:soft-light}
    .price-note{display:block;font-size:.62rem;color:var(--muted);font-weight:500;margin-top:2px}.price-note.estimate{color:var(--warn)}
  `;
  document.head.appendChild(css);

  function imageFor(part){return part?.image||fallbackImage(part);}
  function addImages(zone,part,count=1){
    zone.querySelectorAll(':scope > .installed-part-image').forEach(el=>el.remove());
    zone.classList.remove('visual-ram','visual-fans');
    if(!part)return;
    if(part.type==='ram')zone.classList.add('visual-ram');
    if(part.type==='fans')zone.classList.add('visual-fans');
    const max=part.type==='ram'?Math.min(4,Math.max(1,part.sticks||(/4\s*[x×]/i.test(part.name)?4:/2\s*[x×]/i.test(part.name)?2:1))):part.type==='fans'?Math.min(4,Math.max(1,part.count||1)):count;
    for(let i=0;i<max;i++){
      const img=document.createElement('img');img.className='installed-part-image';img.src=imageFor(part);img.alt='';img.onerror=()=>{img.onerror=null;img.src=fallbackImage(part)};zone.insertBefore(img,zone.firstChild);
    }
  }

  function renderInstalledVisuals(){
    document.querySelectorAll('.dropzone[data-slot]').forEach(zone=>{
      const type=zone.dataset.slot,part=build[type];
      if(type==='case'){
        zone.classList.toggle('case-image',!!part);
        zone.style.backgroundImage=part?`linear-gradient(145deg,rgba(34,45,59,.55),rgba(11,17,27,.82)),url("${imageFor(part)}")`:'';
        zone.querySelectorAll(':scope > .installed-part-image').forEach(el=>el.remove());
      }else addImages(zone,part);
    });
  }

  function decoratePrices(){
    document.querySelectorAll('#parts .part-card').forEach(card=>{
      const part=parts.find(p=>p.id===card.dataset.id);const box=card.querySelector('.price');if(!part||!box)return;
      box.innerHTML=`${money(part.price||0)}<small class="price-note${part.priceEstimated?' estimate':''}">${part.priceKind||'Listed price'}</small>`;
    });
  }

  const originalUpdateAll=updateAll;
  updateAll=function(){originalUpdateAll();renderInstalledVisuals();};
  const originalRenderParts=renderParts;
  renderParts=function(){recoverPrices();originalRenderParts();decoratePrices();};

  restorePrices();
  recoverPrices();
  renderParts();
  updateAll();

  const observer=new MutationObserver(()=>{
    const result=recoverPrices();
    if(result.changed){originalRenderParts();decoratePrices();}
    renderInstalledVisuals();
  });
  const status=document.querySelector('#webSourceStatus');
  if(status)observer.observe(status,{childList:true,subtree:true,characterData:true});
})();
