const scMetadata=new Map();
function soundDetails(row){
  if(!scMetadata.has(row.url)){
    const pending=bridge('publicData',{name:'SoundCloud track',query:row.url}).then(r=>{
      const json=r.value.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);/);
      const sound=json&&JSON.parse(json[1]).find(item=>item.hydratable==='sound')?.data;
      if(!sound)return {};
      return {title:sound.title,artist:sound.user.username,art:(sound.artwork_url||sound.user.avatar_url||'').replace(/-large\./,'-t500x500.'),duration:sound.duration/1000,genre:sound.genre,downloadId:sound.downloadable?String(sound.id):''};
    }).catch(()=>{scMetadata.delete(row.url);return {};});
    scMetadata.set(row.url,pending);
    if(scMetadata.size>120)scMetadata.delete(scMetadata.keys().next().value);
  }
  return scMetadata.get(row.url);
}
async function enrichSoundCloud(rows,isCurrent,refresh){
  let i=0;
  const worker=async()=>{
    while(i<rows.length&&isCurrent()){
      const r=rows[i++],meta=await soundDetails(r);
      if(!isCurrent())return;
      Object.assign(r,meta);
      const t=remoteTracks.get('web:'+r.url);
      if(t){Object.assign(t,meta);if(player.id===t.id)syncTransport();}
      refresh(r);
    }
  };
  await Promise.all(Array.from({length:Math.min(3,rows.length)},worker));
}
async function searchPublic(name,query){
  const read=async(source,matches='')=>(await bridge('publicData',{name:source,query,matches})).value;
  const body=await read(name);
  if(name==='SoundCloud'){
    if(!body.includes('<noscript>'))throw Error('Listing unavailable');
    const rows=[];
    for(const m of body.matchAll(/<h2[^>]*>\s*<a\s+href="(\/[^/"?#]+\/[^/"?#]+)"[^>]*>([^<]+)<\/a>/gi)){
      const text=new DOMParser().parseFromString(m[2],'text/html').body.textContent;
      rows.push({title:text,artist:m[1].split('/')[1],url:'https://soundcloud.com'+m[1]});if(rows.length===10)break;
    }
    return rows;
  }
  if(name==='YouTube'){
    const match=body.match(/(?:var\s+)?ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if(!match)throw Error('Listing unavailable');
    const sections=JSON.parse(match[1]).contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if(!sections)throw Error('Listing unavailable');
    const rows=[];
    for(const item of sections.flatMap(s=>s.itemSectionRenderer?.contents||[])){
      const v=item.videoRenderer,m=item.lockupViewModel;
      if(!v&&m?.contentType!=='LOCKUP_CONTENT_TYPE_VIDEO')continue;
      const meta=m?.metadata?.lockupMetadataViewModel;
      const title=meta?.title?.content||v?.title?.runs?.map(r=>r.text).join('');
      const id=m?.contentId||v?.videoId;
      const artist=meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content||v?.ownerText?.runs?.[0]?.text||'YouTube';
      const durationLabel=v?.lengthText?.simpleText||JSON.stringify(m?.contentImage||{}).match(/"text":"(\d+(?::\d{2})+)"/)?.[1];
      const duration=durationLabel?.split(':').reduce((n,x)=>60*n+Number(x),0)||0;
      if(title&&/^[\w-]{11}$/.test(id))rows.push({title,artist,duration,art:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',url:'https://www.youtube.com/watch?v='+id});
    }
    return rows.slice(0,10);
  }
  const candidates=JSON.parse(body).data;
  if(!Array.isArray(candidates))throw Error('Index unavailable');
  const lookup=candidates.map(t=>({artist_name:t.artist.name,track_name:t.title,release_name:t.album.title}));
  if(!lookup.length)return [];
  const mapped=JSON.parse(await read('Spotify IDs',JSON.stringify(lookup))),rows=[],seen=new Set();
  for(const m of mapped){
    const id=m.spotify_track_ids?.[0];if(!/^[A-Za-z0-9]{22}$/.test(id)||seen.has(id))continue;
    const match=candidates.find(c=>normalized(c.title)===normalized(m.track_name)&&normalized(c.artist.name)===normalized(m.artist_name));
    seen.add(id);rows.push({title:m.track_name,artist:m.artist_name,art:match?.album.cover_medium,duration:match?.duration,url:'https://open.spotify.com/track/'+id});
  }
  return rows;
}
