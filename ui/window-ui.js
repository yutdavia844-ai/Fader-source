'use strict';
function initWindowUI(){
  const menu=make('div','choice-menu'),tip=make('div','control-tip');
  menu.setAttribute('popover','manual');menu.setAttribute('role','listbox');
  tip.setAttribute('popover','manual');tip.setAttribute('role','tooltip');
  let owner=null,select=null,candidate=0,tipOwner=null,tipTimer=0;
  const layer=el=>el.closest('dialog[open]')||document.body;
  function hideTip(){
    clearTimeout(tipTimer);
    if(tip.matches(':popover-open'))tip.hidePopover();
    if(tipOwner?.dataset.hoverTip){
      if(!tipOwner.hasAttribute('title'))tipOwner.title=tipOwner.dataset.hoverTip;
      delete tipOwner.dataset.hoverTip;
    }
    tipOwner=null;
  }
  function hideMenu(){
    if(menu.matches(':popover-open'))menu.hidePopover();
    if(owner)owner.setAttribute('aria-expanded','false');
    owner=null;select=null;
  }
  function placeMenu(){
    if(!owner)return;
    const a=owner.getBoundingClientRect(),margin=8;
    if(!a.width){hideMenu();return;}
    const r=menu.getBoundingClientRect();
    menu.style.left=Math.max(margin,Math.min(innerWidth-r.width-margin,a.right-r.width))+'px';
    menu.style.top=(a.bottom+6+r.height<=innerHeight-margin?a.bottom+6:Math.max(margin,a.top-r.height-6))+'px';
  }
  function mark(index){
    if(index<0||index>=menu.children.length)return;
    candidate=index;Array.from(menu.children).forEach((b,i)=>b.classList.toggle('cursor-option',i===index));
  }
  function choose(index){
    if(!select||select.options[index]?.disabled)return;
    const field=select;hideMenu();
    if(field.selectedIndex!==index){field.selectedIndex=index;field.dispatchEvent(new Event('change',{bubbles:true}));}
    document.activeElement?.blur?.();
  }
  function openMenu(field,button){
    const close=owner===button;hideMenu();hideTip();
    if(close||field.disabled)return;
    select=field;owner=button;
    menu.replaceChildren();menu.setAttribute('aria-label',button.getAttribute('aria-label'));
    Array.from(field.options).forEach((opt,i)=>{
      const b=make('button','choice-option');b.type='button';b.setAttribute('role','option');b.disabled=opt.disabled;
      b.setAttribute('aria-selected',String(i===field.selectedIndex));
      if(field.closest('.source-filter')||field.id==='service-name')b.append(sourceIcon(opt.value));
      b.append(make('span','choice-name',opt.text),make('span','choice-tick',i===field.selectedIndex?'✓':''));
      b.onpointerenter=()=>mark(i);b.onclick=()=>choose(i);menu.append(b);
    });
    layer(button).append(menu);menu.showPopover();mark(field.selectedIndex);placeMenu();
    button.setAttribute('aria-expanded','true');
  }
  for(const field of document.querySelectorAll('select')){
    const wrap=field.closest('.source-filter')||make('span','picker-wrap');
    if(!wrap.contains(field)){field.before(wrap);wrap.append(field);}
    const label=field.getAttribute('aria-label')||field.labels?.[0]?.firstChild?.textContent?.trim()||'Choose option';
    const trigger=make('button','picker-trigger');trigger.type='button';trigger.setAttribute('aria-label',label);
    trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    field.tabIndex=-1;field.setAttribute('aria-hidden','true');wrap.append(trigger);
    trigger.onclick=e=>{e.preventDefault();openMenu(field,trigger);};
    trigger.onkeydown=e=>{if(!owner&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();openMenu(field,trigger);}};
  }
  document.addEventListener('pointerdown',e=>{
    hideTip();if(owner&&!menu.contains(e.target)&&!owner.contains(e.target))hideMenu();
  },true);
  const quietFocus=()=>{
    document.body.classList.add('quiet-focus');
    requestAnimationFrame(()=>{const el=document.activeElement;if(el?.matches('button,select,input[type=checkbox],input[type=range]'))el.blur();});
  };
  document.addEventListener('keydown',e=>{
    hideTip();
    if(e.key==='Escape')quietFocus();
    if(owner){
      if(e.key==='Escape'){hideMenu();}
      else if(e.key==='ArrowDown'||e.key==='ArrowUp'){mark((candidate+menu.children.length+(e.key==='ArrowDown'?1:-1))%menu.children.length);menu.children[candidate]?.scrollIntoView({block:'nearest'});}
      else if(e.key==='Enter'||e.key===' '){choose(candidate);}
      else return;
      e.stopImmediatePropagation();e.preventDefault();
    }else if(['ArrowUp','ArrowDown','Tab'].includes(e.key))document.body.classList.remove('quiet-focus');
  },true);
  document.addEventListener('close',()=>{hideMenu();hideTip();quietFocus();},true);
  document.addEventListener('pointerover',e=>{
    if(owner||e.pointerType==='touch'||menu.contains(e.target))return;
    const el=e.target.closest('[title],[data-hover-tip],button[aria-label]');
    if(el===tipOwner)return;
    hideTip();if(!el||el.closest('#window-grip'))return;
    const txt=el.getAttribute('title')||el.getAttribute('aria-label');if(!txt)return;
    tipOwner=el;if(el.title){el.dataset.hoverTip=el.title;el.removeAttribute('title');}
    tipTimer=setTimeout(()=>{
      if(tipOwner!==el||!el.isConnected||!el.matches(':hover'))return;
      tip.textContent=txt;layer(el).append(tip);tip.showPopover();
      const a=el.getBoundingClientRect(),r=tip.getBoundingClientRect();
      tip.style.left=Math.max(7,Math.min(innerWidth-r.width-7,a.left+(a.width-r.width)/2))+'px';
      tip.style.top=(a.bottom+r.height+14<innerHeight?a.bottom+7:Math.max(6,a.top-r.height-7))+'px';
    },380);
  },true);
  document.addEventListener('pointerout',e=>{if(tipOwner&&!tipOwner.contains(e.relatedTarget))hideTip();},true);
  window.addEventListener('resize',()=>{hideTip();placeMenu();});
  window.addEventListener('blur',()=>{hideMenu();hideTip();});
  const edge=$('title-edge'),bar=$('window-bar'),grip=$('window-grip');
  let leaveTimer,drag;
  const reveal=()=>{clearTimeout(leaveTimer);edge.classList.add('revealed');bar.inert=false;};
  const conceal=()=>{clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>{edge.classList.remove('revealed');bar.inert=true;},230);};
  bar.inert=true;edge.onpointerenter=reveal;edge.onpointerleave=conceal;
  window.addEventListener('blur',conceal);
  const updateMax=()=>{const max=outerWidth>=screen.availWidth-2&&outerHeight>=screen.availHeight-2;$('win-max').classList.toggle('restore',max);$('win-max').setAttribute('aria-label',max?'Restore window':'Maximize');};
  window.addEventListener('resize',updateMax);updateMax();
  for(const [id,name] of [['win-min','minimize'],['win-max','maximize'],['win-close','close']]){
    $(id).onclick=()=>{hideTip();bridge('window',{name}).catch(()=>notify('Window action unavailable'));};
  }
  grip.ondblclick=()=>$('win-max').click();
  grip.onpointerdown=e=>{if(e.button===0)drag=[e.screenX,e.screenY];};
  grip.onpointermove=e=>{if(drag&&e.buttons===1&&Math.hypot(e.screenX-drag[0],e.screenY-drag[1])>3){drag=null;bridge('window',{name:'drag'}).catch(()=>{});}};
  window.addEventListener('pointerup',()=>drag=null);
}

;(()=>{
  const P=[['Coral','#ff734d','#ff8c6c'],['Violet','#a78bfa','#c4b5fd'],['Ocean','#38bdf8','#7dd3fc'],['Lime','#a3e635','#bef264'],['Rose','#fb7185','#fda4af'],['White','#f4f4f5','#ffffff']];
  const dlg=document.getElementById('settings');if(!dlg)return;
  const set=i=>{const p=P[i]||P[0],r=document.documentElement.style;r.setProperty('--accent',p[1]);r.setProperty('--soft',p[2]);
    try{localStorage.setItem('fader-accent',i)}catch{}
    document.querySelectorAll('#accent-row i').forEach((s,j)=>s.classList.toggle('on',j===i))};
  const row=document.createElement('div');row.className='setting swatches';row.id='accent-row';
  row.innerHTML='<span>Accent color</span><span class="sw-list">'+P.map((p,i)=>`<i title="${p[0]}" style="background:${p[1]}" data-i="${i}"></i>`).join('')+'</span>';
  const anchor=dlg.querySelector('#remember');const lab=anchor&&anchor.closest('label');
  lab?lab.after(row):dlg.append(row);
  row.onclick=e=>{const i=e.target.dataset&&e.target.dataset.i;if(i!==undefined)set(+i)};
  let s=0;try{s=+localStorage.getItem('fader-accent')||0}catch{}set(s);
})();

;(()=>{
  const body=document.body;let on=false,tall=false;
  const slot=()=>document.getElementById('video-slot');
  const wantTall=()=>{const s=slot();return !!s&&!s.hidden};
  const send=name=>bridge('window',{name});
  const fail=()=>{if(typeof notify==='function')notify('Mini player needs the updated Fader build')};
  const svg='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><rect x="12" y="12" width="7" height="5" rx="1.2" fill="currentColor" stroke="none"/></svg>';
  const toggle=async force=>{
    const next=force===undefined?!on:force;if(next===on)return;
    const t=next&&wantTall();
    try{await send(next?(t?'mini-tall':'mini'):'restore');on=next;tall=t;body.classList.toggle('mini',on);body.classList.toggle('mini-tall',tall)}catch{fail()}
  };
  const open=document.createElement('button');open.className='icon';open.id='mini-open';open.title='Mini player (Ctrl+Shift+M)';open.setAttribute('aria-label','Mini player');open.innerHTML=svg;
  const util=document.querySelector('footer .utility');util?util.prepend(open):document.querySelector('footer')?.append(open);
  const back=document.createElement('button');back.className='icon';back.id='mini-close';back.title='Back to full player';back.setAttribute('aria-label','Back to full player');back.innerHTML=svg;
  const foot=document.querySelector('footer');foot&&foot.append(back);
  open.onclick=()=>toggle(true);back.onclick=()=>toggle(false);
  window.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='m'){e.preventDefault();toggle()}});
  foot&&foot.addEventListener('pointerdown',e=>{if(on&&e.button===0&&!e.target.closest('button,input,select,a'))send('drag').catch(()=>{})});
  const s=slot();s&&new MutationObserver(()=>{if(on&&wantTall()!==tall){tall=wantTall();send(tall?'mini-tall':'mini').catch(()=>{});body.classList.toggle('mini-tall',tall)}}).observe(s,{attributes:true,attributeFilter:['hidden']});
})();


;(()=>{
  const gear=document.getElementById('settings-open'),dlg=document.getElementById('settings');if(!gear||!dlg)return;
  const g=q=>dlg.querySelector(q),el=(h,c)=>{const d=document.createElement('div');if(c)d.className=c;d.innerHTML=h;return d};
  const R=(t,d,ctl)=>{const r=el(`<div><b>${t}</b><small>${d||''}</small></div>`,'rrow');ctl&&r.append(ctl);r.dataset.t=(t+' '+(d||'')).toLowerCase();return r};
  const go=(t,d,btn)=>{const r=R(t,d,el('&rsaquo;','rs-go'));r.classList.add('click');r.onclick=()=>{hide();btn&&btn.click()};return r};
  const FONTS=[['Nunito Sans','"Nunito Sans"'],['Segoe UI','"Segoe UI"'],['System','system-ui']];
  const setFont=i=>{document.documentElement.style.setProperty('--ui-font',FONTS[i][1]);try{localStorage.setItem('fader-font',i)}catch{}
    document.querySelectorAll('.rs-font button').forEach((b,j)=>b.classList.toggle('on',j===i))};
  const chips=el('','chips rs-font');FONTS.forEach((f,i)=>{const b=document.createElement('button');b.textContent=f[0];b.onclick=()=>setFont(i);chips.append(b)});
  const accent=g('#accent-row');if(accent){accent.className='rrow';accent.children[0].innerHTML='<b>Accent color</b><small>Highlights, glows and buttons</small>';accent.dataset.t='accent color theme highlights'}
  const sc=g('.shortcuts');if(sc&&!sc.querySelector('.mini-key')){const p=document.createElement('p');p.className='mini-key';p.innerHTML='Mini player <kbd>Ctrl Shift M</kbd>';sc.append(p)}
  const block=el('','rrow rs-block');block.dataset.t='shortcuts keys keyboard hotkeys';sc&&block.append(sc);
  const TONES=[['Black','#090909'],['Graphite','#131315'],['Midnight','#0a0d15'],['Warm','#120e0c']];
  const DT={tone:0,glow:14,r:12};let TH=Object.assign({},DT);try{Object.assign(TH,JSON.parse(localStorage.getItem('fader-theme')||'{}'))}catch{}
  const applyTheme=()=>{const s=document.documentElement.style;s.setProperty('--bg',TONES[TH.tone][1]);s.setProperty('--glow',TH.glow);s.setProperty('--r',TH.r);
    try{localStorage.setItem('fader-theme',JSON.stringify(TH))}catch{}document.querySelectorAll('.rs-tone button').forEach((b,j)=>b.classList.toggle('on',j===TH.tone))};
  const tones=el('','chips rs-tone');TONES.forEach((t,i)=>{const b=document.createElement('button');b.innerHTML=`<i style="background:${t[1]}"></i>${t[0]}`;b.onclick=()=>{TH.tone=i;applyTheme()};tones.append(b)});
  const slider=(min,max,key)=>{const i=document.createElement('input');i.type='range';i.min=min;i.max=max;i.value=TH[key];
    const paint=()=>i.style.setProperty('--fill',(i.value-min)/(max-min)*100+'%');i.oninput=()=>{TH[key]=+i.value;paint();applyTheme()};paint();i.sync=()=>{i.value=TH[key];paint()};return i};
  const glow=slider(0,40,'glow'),round=slider(0,24,'r');
  const resetRow=go('Reset appearance','Back to the default theme',null);resetRow.onclick=()=>{TH=Object.assign({},DT);glow.sync();round.sync();applyTheme()};
  const ICON={Interface:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',Theme:'<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/>',Playback:'<path d="M8 5v14l11-7z"/>',Library:'<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',System:'<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',Shortcuts:'<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7 14h10"/>',About:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'};
  const pages=[
    {name:'Interface',rows:[R('Interface font','Typeface used across the app',chips),R('Disable animations','Reduces CPU and GPU use, but no smooth motion',g('#motion'))]},
    {name:'Theme',rows:[accent,R('Background','Base tone of the app',tones),R('Glow','How strong the accent light is at the top',glow),R('Roundness','Corner radius of tracks, cards and the player',round),resetRow]},
    {name:'Playback',rows:[R('Sleep timer','Stop playback automatically',g('#sleep-timer')),R('Remember position','Resume the last track where you left off',g('#remember'))]},
    {name:'Library',rows:[go('Imported tracks','Manage files you imported',g('#manage-imports')),go('Search services','Choose where online search looks',g('#connections-open'))]},
    {name:'System',rows:[R('Close to tray','Keep playing in the tray when you close the window',g('#tray-pref'))]},
    {name:'Shortcuts',rows:[block]},
    {name:'About',rows:[R('Fader','A fast, local-first music player.'),R('Mini player','Press Ctrl+Shift+M anywhere in the app.')]}
  ];
  const su=g('#sleep-until');if(su){const t=pages[1].rows[0].firstChild;t.append(su)}
  const ov=el(`<div class="rs-win"><aside class="rs-side"><label class="rs-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input placeholder="Search settings..." aria-label="Search settings"></label><nav class="rs-nav"></nav><div class="rs-foot"><i></i><div><b>Fader</b><small>Local music player</small></div></div></aside><main class="rs-main"></main><button class="rs-x" aria-label="Close settings">&times;<small>ESC</small></button></div>`);
  ov.id='rs';ov.hidden=true;document.body.append(ov);
  const nav=ov.querySelector('.rs-nav'),main=ov.querySelector('.rs-main'),inp=ov.querySelector('input');let cur='Interface';
  pages.forEach(p=>{p.el=el(`<h2>${p.name}</h2>`,'rs-page');p.rows.filter(Boolean).forEach(r=>p.el.append(r));main.append(p.el);
    const b=document.createElement('button');b.innerHTML=`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[p.name]||''}</svg><span>${p.name}</span>`;b.onclick=()=>{inp.value='';cur=p.name;apply()};nav.append(b);p.btn=b});
  function apply(){const q=inp.value.trim().toLowerCase();
    pages.forEach(p=>{let any=false;p.el.querySelectorAll('.rrow').forEach(r=>{const m=!q||(r.dataset.t||'').includes(q);r.hidden=!m;any=any||m});
      p.el.hidden=q?!any:p.name!==cur;p.btn.classList.toggle('on',!q&&p.name===cur);if(!p.el.hidden){p.el.style.animation='none';p.el.offsetWidth;p.el.style.animation=''}})}
  function show(){ov.hidden=false;apply();inp.focus()}
  function hide(){ov.hidden=true}
  inp.oninput=apply;ov.addEventListener('mousedown',e=>{if(e.target===ov)hide()});ov.querySelector('.rs-x').onclick=hide;
  gear.addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();ov.hidden?show():hide()},true);
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!ov.hidden){e.preventDefault();e.stopImmediatePropagation();hide()}},true);
  applyTheme();let f=0;try{f=+localStorage.getItem('fader-font')||0}catch{}setFont(f);
})();

;(()=>{
  const img=document.querySelector('#nav-home img');if(!img)return;
  const w=document.createElement('span');w.className='brand-logo';
  w.innerHTML='<svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true"><defs><linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--soft)"/><stop offset="1" style="stop-color:var(--accent)"/></linearGradient></defs><g fill="url(#brand-g)" transform="translate(4.2 0) skewX(-13)"><rect x="6" y="12" width="5" height="15" rx="1.6"/><rect x="15" y="4" width="5" height="28" rx="1.6"/><rect x="24" y="8" width="5" height="20" rx="1.6"/></g></svg>';
  img.replaceWith(w);
})();

/* ===== Auto accent from cover + effect presets + draggable Up next ===== */
;(()=>{
  const ready=fn=>{const go=()=>{if(typeof player!=='undefined'&&typeof settings!=='undefined'&&typeof queue!=='undefined')fn();else setTimeout(go,200)};addEventListener('load',go)};
  const $=id=>document.getElementById(id);
  ready(()=>{
    /* ---- 1) accent from cover ---- */
    let auto=true;try{auto=localStorage.getItem('fader-auto')!=='0'}catch{}
    let token=0;const root=document.documentElement.style;
    const dom=src=>new Promise(res=>{const im=new Image();im.crossOrigin='anonymous';
      im.onload=()=>{try{const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,32,32);
        const d=x.getImageData(0,0,32,32).data,B=Array.from({length:12},()=>({w:0,h:0,s:0}));
        for(let i=0;i<d.length;i+=4){const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,dd=mx-mn;
          if(dd<.08||l<.15||l>.88)continue;const s=dd/(1-Math.abs(2*l-1));let h=mx===r?((g-b)/dd)%6:mx===g?(b-r)/dd+2:(r-g)/dd+4;h=(h*60+360)%360;
          const w=s*(1-Math.abs(l-.5)),k=Math.floor(h/30)%12;B[k].w+=w;B[k].h+=h*w;B[k].s+=s*w}
        const best=B.reduce((a,b)=>b.w>a.w?b:a);res(best.w<.8?'gray':{h:best.h/best.w,s:Math.min(1,best.s/best.w)})}catch{res(null)}};
      im.onerror=()=>res(null);im.src=src});
    const manual=()=>{const on=document.querySelector('#accent-row .sw-list i.on');on?on.click():(root.removeProperty('--accent'),root.removeProperty('--soft'))};
    const sync=async()=>{
      if(!auto)return;const art=$('now-cover')?.dataset.art,my=++token;if(!art)return manual();
      const c=await dom(art);if(my!==token||!auto||c===null)return;
      if(c==='gray'){root.setProperty('--accent','hsl(0 0% 94%)');root.setProperty('--soft','hsl(0 0% 100%)');return}
      const s=Math.round(Math.max(.6,c.s)*100);root.setProperty('--accent',`hsl(${Math.round(c.h)} ${s}% 62%)`);root.setProperty('--soft',`hsl(${Math.round(c.h)} ${s}% 73%)`)};
    const cover=$('now-cover');cover&&new MutationObserver(sync).observe(cover,{attributes:true,attributeFilter:['data-art','data-id']});
    const th=[...document.querySelectorAll('#rs .rs-page')].find(p=>p.querySelector('h2')?.textContent==='Theme');
    if(th){const cb=document.createElement('input');cb.type='checkbox';cb.checked=auto;
      const r=document.createElement('div');r.className='rrow';r.dataset.t='accent from cover automatic album art color';
      r.innerHTML='<div><b>Accent from cover</b><small>Match the app color to the track that is playing</small></div>';r.append(cb);
      const acc=th.querySelector('#accent-row');acc?acc.after(r):th.append(r);
      cb.onchange=()=>{auto=cb.checked;try{localStorage.setItem('fader-auto',auto?'1':'0')}catch{}auto?sync():(token++,manual())}}
    sync();

    /* ---- 2) effect presets ---- */
    const PR=[['Slowed + Reverb',{speed:.85,reverb:45,echo:8,drive:0,eq:[3,2,0,-1,-2]}],['Nightcore',{speed:1.25,reverb:0,echo:0,drive:0,eq:[0,0,0,1,2]}],
      ['Bass boost',{speed:1,reverb:0,echo:0,drive:12,eq:[8,5,1,-1,0]}],['Vocal boost',{speed:1,reverb:5,echo:0,drive:0,eq:[-3,-1,3,4,2]}],
      ['Lo-fi',{speed:.95,reverb:12,echo:0,drive:28,eq:[2,0,-2,-5,-8]}],['Clean',{speed:1,reverb:0,echo:0,drive:0,eq:[0,0,0,0,0],flat:true}]];
    const tabs=document.querySelector('#effects .fx-tabs');
    if(tabs){const row=document.createElement('div');row.className='fx-presets';row.innerHTML='<h3>Presets</h3><div class="fx-chips"></div>';
      PR.forEach(([name,p])=>{const b=document.createElement('button');b.className='fx-chip';b.textContent=name;
        b.onclick=()=>{settings.linked=true;if(typeof updateRate==='function')updateRate('speed',p.speed);
          Object.assign(settings,{eq:[...p.eq],preset:p.flat?'Flat':'Custom',drive:p.drive,reverb:p.reverb,echo:p.echo,bypass:false});
          player.apply();syncEffects();save('audio',settings);
          row.querySelectorAll('.fx-chip').forEach(c=>c.classList.toggle('on',c===b&&!p.flat))};
        row.querySelector('.fx-chips').append(b)});
      tabs.before(row)}

    /* ---- 5) draggable Up next ---- */
    const panel=document.createElement('aside');panel.id='upnext';panel.setAttribute('aria-label','Up next');
    panel.innerHTML='<div class="un-head"><span>Up next</span><small id="un-count"></small></div><ul class="un-list" id="un-list"></ul>';
    document.body.append(panel);
    const list=$('un-list');let last='',drag=null;
    const move=(id,target,after)=>{const a=queue.indexOf(id);if(a<0)return;queue.splice(a,1);let b=queue.indexOf(target);if(b<0)b=queue.length;queue.splice(after?b+1:b,0,id);if(player.plan)player.plan()};
    const marks=()=>list.querySelectorAll('.drop-a,.drop-b,.dragging').forEach(n=>n.classList.remove('drop-a','drop-b','dragging'));
    const render=()=>{
      last=queue.join('|')+'#'+player.id;const items=queue.map(id=>[id,trackById(id)]).filter(x=>x[1]);
      $('un-count').textContent=items.length?items.length+' tracks':'';list.replaceChildren();
      if(!items.length){const e=document.createElement('li');e.className='un-empty';e.textContent='Nothing queued yet. Play a playlist or an album to fill this.';list.append(e);return}
      const cur=items.findIndex(x=>x[0]===player.id);
      items.forEach(([id,t],i)=>{const li=document.createElement('li');li.className='un-row'+(id===player.id?' now':i<cur?' past':'');li.draggable=true;li.dataset.id=id;li.style.animationDelay=Math.min(i,12)*22+'ms';
        li.innerHTML='<span class="un-grip" aria-hidden="true">&#8942;&#8942;</span><i class="un-art"></i><div class="un-t"><b></b><small></small></div><button class="un-x" title="Remove from queue" aria-label="Remove from queue">&times;</button>';
        if(t.art)li.querySelector('.un-art').style.backgroundImage='url('+JSON.stringify(t.art)+')';
        li.querySelector('b').textContent=t.title||'';li.querySelector('small').textContent=t.artist||'';
        if(id===player.id)li.querySelector('.un-x').hidden=true;
        li.onclick=e=>{if(e.target.closest('.un-x')){queue=queue.filter(x=>x!==id);render();return}if(id!==player.id)player.play(id)};
        list.append(li)});
      list.querySelector('.now')?.scrollIntoView({block:'nearest'})};
    list.ondragstart=e=>{const r=e.target.closest('.un-row');if(!r)return;drag=r.dataset.id;r.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',drag)};
    list.ondragover=e=>{if(!drag)return;e.preventDefault();list.querySelectorAll('.drop-a,.drop-b').forEach(n=>n.classList.remove('drop-a','drop-b'));
      const r=e.target.closest('.un-row');if(r&&r.dataset.id!==drag){const b=r.getBoundingClientRect();r.classList.add(e.clientY>b.top+b.height/2?'drop-a':'drop-b')}};
    list.ondrop=e=>{e.preventDefault();const r=e.target.closest('.un-row');if(r&&drag&&r.dataset.id!==drag){const b=r.getBoundingClientRect();move(drag,r.dataset.id,e.clientY>b.top+b.height/2)}};
    list.ondragend=()=>{drag=null;marks();render()};
    const toggle=force=>{const o=force===undefined?!panel.classList.contains('open'):force;panel.classList.toggle('open',o);btn.classList.toggle('on',o);if(o)render()};
    const btn=document.createElement('button');btn.className='icon';btn.id='upnext-btn';btn.title='Up next (Q)';btn.setAttribute('aria-label','Up next');
    btn.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h11M4 12h11M4 17h7"/><path d="m17 14 4 3-4 3z" fill="currentColor" stroke="none"/></svg>';
    btn.onclick=()=>toggle();const util=document.querySelector('footer .utility');util?util.prepend(btn):document.querySelector('footer')?.append(btn);
    addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.key.toLowerCase()!=='q'||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;toggle()});
    addEventListener('keydown',e=>{if(e.key==='Escape')toggle(false)});
    setInterval(()=>{if(!panel.classList.contains('open')||drag)return;if(queue.join('|')+'#'+player.id!==last)render()},500);
  });
})();

/* ===== Playlist play button reflects playback ===== */
;(()=>{
  const go=()=>{
    const btn=document.getElementById('pl-play');
    if(!btn||typeof player==='undefined'||typeof buttonIcon!=='function'||typeof currentPlaylist!=='function'||typeof playPause!=='function'){setTimeout(go,200);return}
    let sig='';
    const mine=()=>{const p=currentPlaylist();return !!p&&queuePlaylistID===p.id&&queue.includes(player.id)};
    const sync=()=>{
      const m=mine(),on=m&&(player.playing||player.loading),s=[m,on].join();if(s===sig)return;sig=s;
      buttonIcon(btn,on?'pause':'play',on?'Pause playlist':m?'Resume playlist':'Play playlist');
      btn.classList.toggle('is-playing',on)};
    btn.addEventListener('click',e=>{if(!mine())return;e.preventDefault();e.stopImmediatePropagation();playPause();setTimeout(sync,60)},true);
    setInterval(sync,250);sync();
  };
  addEventListener('load',go);
})();

/* ===== Artist page (built from everything the app already knows) ===== */
;(()=>{
  const go=()=>{
    if(typeof player==='undefined'||typeof playList!=='function'||typeof historyStore==='undefined'||typeof playlists==='undefined'||typeof remoteTracks==='undefined'||typeof listTracks!=='function'){setTimeout(go,250);return}
    const norm=s=>String(s||'').toLowerCase().trim();
    const split=s=>String(s||'').split(/\s*(?:,|&|;|\bfeat\.?\s|\bft\.?\s|\sx\s)\s*/i).map(norm).filter(Boolean);
    const prov=t=>t.provider||'Library';
    const mk=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e};
    const fmt=s=>s?`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`:'';
    const st={name:'',src:'All',album:''};
    const pool=()=>{const m=new Map(),add=t=>{if(t&&t.id&&!m.has(t.id))m.set(t.id,t)};
      tracks.forEach(add);remoteTracks.forEach(add);Object.values(historyStore).forEach(e=>add(e.track));playlists.forEach(p=>listTracks(p).forEach(add));return [...m.values()]};
    const ov=mk('div');ov.id='artist';ov.hidden=true;
    ov.innerHTML='<div class="ar-win"><button class="ar-x" aria-label="Close">&times;</button><div class="ar-scroll"></div></div>';
    document.body.append(ov);const box=ov.querySelector('.ar-scroll');
    const hide=()=>{ov.hidden=true};
    ov.addEventListener('mousedown',e=>{if(e.target===ov)hide()});ov.querySelector('.ar-x').onclick=hide;
    const playFrom=(list,id)=>{indexRemote(list);playList(list,id)};
    function render(){
      const key=norm(st.name),all=pool().filter(t=>split(t.artist).includes(key));
      const counts={All:all.length};all.forEach(t=>counts[prov(t)]=(counts[prov(t)]||0)+1);
      if(st.src!=='All'&&!counts[st.src])st.src='All';
      let view=st.src==='All'?all:all.filter(t=>prov(t)===st.src);
      const albums=new Map();view.forEach(t=>{if(t.album&&norm(t.album)!==norm(prov(t)))(albums.get(t.album)||albums.set(t.album,[]).get(t.album)).push(t)});
      if(st.album&&!albums.has(st.album))st.album='';
      const shown=st.album?albums.get(st.album):view;
      const plays=t=>historyStore[t.id]?.plays||0,secs=t=>historyStore[t.id]?.seconds||0;
      const total=all.reduce((n,t)=>n+plays(t),0);
      box.replaceChildren();
      const head=mk('div','ar-head'),av=mk('div','ar-avatar'),art=all.find(t=>t.art)?.art;
      if(art)av.style.backgroundImage='url('+JSON.stringify(art)+')';else av.textContent=(st.name[0]||'?').toUpperCase();
      const info=mk('div','ar-info');info.append(mk('small','','ARTIST'),mk('h2','',st.name),
        mk('p','',`${all.length} tracks · ${Object.keys(counts).length-1} source${Object.keys(counts).length>2?'s':''} · ${total} plays`));
      const act=mk('div','ar-actions'),pl=mk('button','ar-play','\u25B6 Play'),sh=mk('button','ar-ghost','Shuffle');
      pl.onclick=()=>{if(shown.length)playFrom(shown,shown[0].id)};
      sh.onclick=()=>{if(!shown.length)return;prefs.shuffle=true;savePrefs();playFrom(shown,shown[Math.floor(Math.random()*shown.length)].id);syncTransport()};
      act.append(pl,sh);info.append(act);head.append(av,info);box.append(head);
      const chips=mk('div','ar-chips');
      ['All','YouTube','SoundCloud','Spotify','Audius','Library'].filter(k=>counts[k]).forEach(k=>{
        const b=mk('button','ar-chip'+(k===st.src?' on':''),`${k==='All'?'All sources':k} · ${counts[k]}`);b.onclick=()=>{st.src=k;st.album='';render()};chips.append(b)});
      box.append(chips);
      const sec=(title,node,note)=>{const s=mk('section','ar-sec'),h=mk('h3','',title);if(note)h.append(mk('small','',note));s.append(h,node);box.append(s)};
      const top=[...view].filter(t=>plays(t)>0).sort((a,b)=>plays(b)-plays(a)||secs(b)-secs(a)).slice(0,5);
      const row=(t,i)=>{const r=mk('div','ar-row'),n=mk('span','ar-n',String(i+1).padStart(2,'0')),a=mk('i','ar-art'),m=mk('div','ar-meta');
        if(t.art)a.style.backgroundImage='url('+JSON.stringify(t.art)+')';
        m.append(mk('b','',t.title||''),mk('small','',[prov(t),t.album&&norm(t.album)!==norm(prov(t))?t.album:''].filter(Boolean).join(' · ')));
        r.append(n,a,m,mk('span','ar-d',plays(t)?plays(t)+' plays':fmt(t.duration)));r.onclick=()=>playFrom(shown,t.id);return r};
      const topBox=mk('div','ar-list');top.length?top.forEach((t,i)=>{const r=row(t,i);r.onclick=()=>playFrom(top,t.id);topBox.append(r)}):topBox.append(mk('p','ar-empty','Nothing played yet. Plays you make in Fader show up here.'));
      sec('Most played',topBox);
      if(albums.size){const g=mk('div','ar-grid');albums.forEach((list,name)=>{const c=mk('button','ar-card'+(name===st.album?' on':'')),a=mk('i','ar-cover'),t0=list.find(t=>t.art);
        if(t0)a.style.backgroundImage='url('+JSON.stringify(t0.art)+')';c.append(a,mk('b','',name),mk('small','',list.length+' tracks'));
        c.onclick=()=>{st.album=st.album===name?'':name;render()};g.append(c)});sec('Albums',g,st.album?'click again to clear':'')}
      const pls=playlists.filter(p=>listTracks(p).some(x=>split(x.artist).includes(key)));
      if(pls.length){const g=mk('div','ar-grid');pls.forEach(p=>{const c=mk('button','ar-card'),a=mk('i','ar-cover');if(p.cover)a.style.backgroundImage='url('+JSON.stringify(p.cover)+')';
        c.append(a,mk('b','',p.name),mk('small','',p.items.length+' tracks'));c.onclick=()=>{hide();openPlaylist(p.id)};g.append(c)});sec('In your playlists',g)}
      const list=mk('div','ar-list');shown.forEach((t,i)=>list.append(row(t,i)));
      sec(st.album||'All tracks',list,shown.length+' tracks')}
    window.openArtist=name=>{st.name=name;st.src='All';st.album='';render();ov.hidden=false;box.scrollTop=0};
    document.addEventListener('click',e=>{const el=e.target.closest('.track-name small,#now-artist,#detail-artist');if(!el)return;
      const name=el.textContent.trim();if(!name)return;e.preventDefault();e.stopImmediatePropagation();window.openArtist(name)},true);
    addEventListener('keydown',e=>{if(e.key==='Escape'&&!ov.hidden){e.preventDefault();e.stopImmediatePropagation();hide()}},true);
  };
  addEventListener('load',go);
})();
