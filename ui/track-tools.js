'use strict';
function initTrackTools(){
  $('pl-download').onclick=()=>openBatch(currentPlaylist());
  document.addEventListener('dragstart',e=>{if(!e.target.closest('.track[draggable="true"]'))e.preventDefault();},true);
  const menu=make('div','choice-menu context-menu');
  menu.popover='manual';menu.setAttribute('role','menu');
  function close(){if(menu.matches(':popover-open'))menu.hidePopover();}
  function item(label,glyph,action){
    const button=make('button','choice-option');button.type='button';button.setAttribute('role','menuitem');
    button.innerHTML=icon(glyph);button.append(make('span','',label));
    button.onclick=()=>{close();action();};menu.append(button);
  }
  function sep(){menu.append(make('div','menu-sep'));}
  const toQueue=(id,next)=>{queue=queue.filter(x=>x!==id);const at=next?queue.indexOf(player.id)+1:queue.length;queue.splice(Math.max(0,at),0,id);if(player.plan)player.plan();};
  const copy=(text,done)=>navigator.clipboard.writeText(text).then(()=>notify(done)).catch(()=>notify('Could not copy'));
  document.addEventListener('contextmenu',event=>{
    const el=event.target.closest('[data-playlist],#pl-head,.track,.online-line,.top-result,.home-card,.track-match,.now,.record-details');
    if(!el)return;
    const p=el.dataset.playlist?playlists.find(p=>p.id===el.dataset.playlist):el.id==='pl-head'?currentPlaylist():null;
    const id=el.dataset.id||el.dataset.result||el.dataset.track||(el.matches('.now,.record-details')?player.id:null);
    const t=trackById(id)||currentPlaylist()?.items.find(t=>t.id===id);
    if(!p&&!t)return;
    event.preventDefault();close();menu.replaceChildren();
    if(p){
      const all=listTracks(p).filter(Boolean);
      item('Play','play',()=>{if(all.length)playList(all,all[0].id,p.id);else notify('This playlist is empty');});
      item('Shuffle play','shuffle',()=>{if(!all.length)return notify('This playlist is empty');prefs.shuffle=true;savePrefs();playList(all,all[Math.floor(Math.random()*all.length)].id,p.id);syncTransport();});
      item('Add all to queue','plus',()=>{all.forEach(x=>{if(!queue.includes(x.id))queue.push(x.id);});if(player.plan)player.plan();notify('Added '+all.length+' tracks to the queue');});
      sep();
      const pinned=prefs.pinnedPlaylists||[];
      item(pinned.includes(p.id)?'Unpin from sidebar':'Pin to sidebar','pin',()=>{
        prefs.pinnedPlaylists=pinned.includes(p.id)?pinned.filter(id=>id!==p.id):[...pinned,p.id];
        savePrefs();paintPlaylists();
      });
      item('Edit playlist','edit',()=>editPlaylist(p.id));
      item('Add tracks','plus',()=>{openPlaylist(p.id,false);chooseTracks();});
      item('Download playlist…','download',()=>openBatch(p));
      item('Export playlist JSON','save',()=>saveDownload(p));
    }else{
      item('Play now','play',()=>{indexRemote([t]);if(!queue.includes(t.id))toQueue(t.id,true);player.play(t.id);});
      item('Play next','next',()=>{indexRemote([t]);toQueue(t.id,true);notify('Playing next');});
      item('Add to queue','plus',()=>{indexRemote([t]);toQueue(t.id,false);notify('Added to queue');});
      sep();
      item(liked.has(t.id)?'Unlike':'Like','heart',()=>{indexRemote([t]);toggleLike(t.id);});
      item('Add to playlist','plus',()=>pickPlaylist(t));
      item('Download…','download',()=>openAudioExport(t));
      sep();
      const here=view==='playlist'&&!$('search').value.trim()?currentPlaylist():null;
      if(here&&here.items.some(x=>x.id===t.id))item('Remove from this playlist','trash',async()=>{try{await putPlaylist(here,items=>items.filter(x=>x.id!==t.id));notify('Removed from playlist');}catch{notify('Could not save playlist');}});
      if(queue.includes(t.id)&&t.id!==player.id)item('Remove from queue','close',()=>{queue=queue.filter(x=>x!==t.id);if(player.plan)player.plan();notify('Removed from queue');});
      if(t.artist)item('More from '+t.artist,'search',()=>{const q=$('search');q.value=t.artist;q.dispatchEvent(new Event('input',{bubbles:true}));q.focus();});
      item('Copy title','music',()=>copy(t.artist?t.artist+' \u2013 '+t.title:t.title,'Copied'));
      const link=t.url||(String(t.id).startsWith('web:')?String(t.id).slice(4):'');
      if(link)item('Copy link','link',()=>copy(link,'Link copied'));
    }
    (el.closest('dialog[open]')||document.body).append(menu);menu.showPopover();
    const r=menu.getBoundingClientRect();
    menu.style.left=Math.max(6,Math.min(event.clientX,innerWidth-r.width-6))+'px';
    menu.style.top=Math.max(6,Math.min(event.clientY,innerHeight-r.height-6))+'px';
  });
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))close();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.matches(':popover-open')){close();e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('blur',close);window.addEventListener('resize',close);
  document.addEventListener('scroll',e=>{if(!menu.contains(e.target))close();},true);
  document.addEventListener('close',close,true);
  initPlaylistDrag();
}
function initPlaylistDrag(){
  const list=$('track-list');let drag,marked;
  function clearMark(){marked?.classList.remove('drop-before','drop-after');marked=null;}
  function end(){clearMark();drag=null;list.classList.remove('reordering');}
  list.addEventListener('dragstart',e=>{
    const row=e.target.closest('.track[draggable=true]');
    if(!row)return;
    drag={id:row.dataset.id,playlist:currentPlaylist(),order:visibleTracks().map(t=>t.id),sort:playlistSort};
    e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',drag.id);
    e.dataTransfer.setDragImage(row,24,row.clientHeight/2);list.classList.add('reordering');
  });
  function target(e){
    const row=e.target.closest('.track');
    if(!drag||!row||row.dataset.id===drag.id||currentPlaylist()?.id!==drag.playlist.id)return null;
    const rect=row.getBoundingClientRect();return {row,after:e.clientY>rect.top+rect.height/2};
  }
  list.addEventListener('dragover',e=>{
    const hit=target(e);clearMark();if(!hit)return;
    e.preventDefault();e.dataTransfer.dropEffect='move';
    marked=hit.row;marked.classList.add(hit.after?'drop-after':'drop-before');
  });
  list.addEventListener('dragleave',e=>{if(!list.contains(e.relatedTarget))clearMark();});
  list.addEventListener('dragend',end);
  list.addEventListener('drop',async e=>{
    const hit=target(e);if(!hit)return;
    e.preventDefault();e.stopPropagation();
    const {id,playlist,order,sort}=drag,destination=hit.row.dataset.id;
    end();playlistSort='library';
    try{
      await putPlaylist(playlist,items=>{
        const ranks=new Map(order.map((id,i)=>[id,i]));
        const sorted=sort==='library'?items.slice():items.slice().sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));
        const source=sorted.find(t=>t.id===id);
        if(!source||!sorted.some(t=>t.id===destination))return items;
        const rest=sorted.filter(t=>t.id!==id);
        rest.splice(rest.findIndex(t=>t.id===destination)+Number(hit.after),0,source);return rest;
      });
      if(!prefs.shuffle&&queuePlaylistID===playlist.id){
        queue=playlists.find(p=>p.id===playlist.id).items.map(t=>t.id).filter(id=>trackById(id));player.plan();
      }
    }catch{playlistSort=sort;renderList();notify('Could not save playlist order');}
  });
}
