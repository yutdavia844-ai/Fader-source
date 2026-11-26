const paths={
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  grip:'<path d="M8 6h.01M16 6h.01M8 12h.01M16 12h.01M8 18h.01M16 18h.01" stroke-width="3.6"/>',
  pin:'<path d="m14 3 7 7-3 1-4 4-1 4-8-8 4-1 4-4zM4 20l5-5"/>',
  lyrics:'<path d="M4 5h16M4 10h12M4 15h15M4 20h8"/>',
  expand:'<path d="M3 9V4h5m8 0h5v5m0 6v5h-5M8 20H3v-5"/>',
  shrink:'<path d="m5 9 7 7 7-7"/>',
  translate:'<path d="M2 5h12M8 3v2m4 1c-.8 4.2-4 8.6-8 11m1-9c1 3 3 5.6 6 7m2 6 4.3-11L22 21m-7.5-4h6"/>',
  history:'<path d="M3 10a9 9 0 1 1 1.7 7M3 5v5h5M12 7v5l3.5 2"/>',
  chart:'<rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><rect x="17" y="8" width="4" height="12" rx="1"/>',
  all:'<g fill="currentColor" stroke="none"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></g>',
  soundcloud:'<path d="M1.5 13v2m2-4v6m2-8v9m2-10v10m2-12v12" stroke-width="1.35"/><path d="M11 6a6.7 6.7 0 0 1 10 5.2 3.7 3.7 0 1 1-.6 7.4H11z" fill="currentColor" stroke="none"/>',
  youtube:'<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 4.3c2.4 0 6.2 0 8 .5a3.5 3.5 0 0 1 2.5 2.6c.5 2.4.5 6.9 0 9.2a3.5 3.5 0 0 1-2.5 2.6c-3.1.8-12.9.8-16 0a3.5 3.5 0 0 1-2.5-2.6c-.5-2.3-.5-6.8 0-9.2A3.5 3.5 0 0 1 4 4.8c1.8-.5 5.6-.5 8-.5zm-2.2 4.2v7l6-3.5z"/>',
  spotify:'<circle cx="12" cy="12" r="11" fill="currentColor" stroke="none"/><g stroke="#101113" fill="none"><path d="M5.8 8.8c4.3-1.3 9.1-.9 12.9 1.1" stroke-width="2"/><path d="M6.7 12.2c3.8-1 7.5-.7 10.7 1" stroke-width="1.7"/><path d="M7.6 15.4c3.1-.8 6-.5 8.8.8" stroke-width="1.5"/></g>',
  audius:'<path d="M3 18.8 9.4 7.2l2.4 4.3-4.2 7.3zm7.6 0 4.3-7.7 4.3 7.7zm.2-13.6h4.6l6.6 11.9h-4.5z" stroke="none" fill="currentColor"/>',
  edit:'<path d="m4 16-1 5 5-1L20 8l-4-4zM14 6l4 4"/>',
  folder:'<path d="M3 7h6l2 2h10v10H3zM3 7V5h6l2 2"/>',
  home:'<path d="m3 10 9-7 9 7v10H15v-7H9v7H3z"/>',
  link:'<path d="m10 14 4-4m-6 2-2 2a3.5 3.5 0 0 0 5 5l3-3m-4-8 3-3a3.5 3.5 0 0 1 5 5l-2 2"/>',
  speed:'<path d="M4 18a9 9 0 1 1 16 0M12 14l5-6"/><circle cx="12" cy="14" r="1.2"/>',
  transition:'<path d="M3 6c8 0 10 12 18 12M3 18c8 0 10-12 18-12"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  library:'<rect x="3" y="4" width="4" height="16" rx="1"/><path d="M11 4v16m3-15 4-1 4 15-4 1z"/>',
  heart:'<path d="M20.1 5.8a5.1 5.1 0 0 0-7.2 0l-.9.9-.9-.9a5.1 5.1 0 0 0-7.2 7.2L12 21l8.1-8a5.1 5.1 0 0 0 0-7.2z"/>',
  sliders:'<path d="M5 3v4m0 5v9m7-18v10m0 5v3m7-18v2m0 5v11"/><rect x="2.7" y="7" width="4.6" height="5" rx="1.3"/><rect x="9.7" y="13" width="4.6" height="5" rx="1.3"/><rect x="16.7" y="5" width="4.6" height="5" rx="1.3"/>',
  settings:'<path d="m9 3 1-1h4l.7 2.5 2 .9L19 5l2 3-1.5 2 .2 2 1.8 2-2 3.5-2.6-.4-1.8 1-1 2.5h-4l-1-2.5-1.8-1-2.6.4-2-3.5 1.8-2 .1-2L3 8l2-3 2.3.4 1.7-.9z"/><circle cx="12" cy="11.5" r="3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
  play:'<path d="m7.5 4.5 12 7.5-12 7.5z" fill="currentColor" stroke-linejoin="round"/>',
  pause:'<path d="M8.5 5v14m7-14v14" stroke-width="4"/>',
  next:'<path d="m5 5 10 7-10 7z" fill="currentColor"/><path d="M18 5v14" stroke-width="2.4"/>',
  prev:'<path d="m19 5-10 7 10 7z" fill="currentColor"/><path d="M6 5v14" stroke-width="2.4"/>',
  shuffle:'<path d="M3 6h2c5 0 9 12 14 12h2m-4-4 4 4-4 3M3 18h2c2 0 4-2 6-5m3-5c2-2 3-2 5-2h2m-4-3 4 3-4 4"/>',
  repeat:'<path d="M4 11V9a3 3 0 0 1 3-3h13m-3-3 3 3-3 3m3 4v2a3 3 0 0 1-3 3H4m3 3-3-3 3-3"/>',
  volume:'<path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute:'<path d="M3 9h4l5-4v14l-5-4H3zM16 9l6 6m0-6-6 6"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  sort:'<path d="M3 6h14M3 11h10M3 16h6m10-6v10m-3-3 3 3 3-3"/>',
  power:'<path d="M12 2v10M7 5a8 8 0 1 0 10 0"/>',
  save:'<path d="M5 3h11l4 4v14H4V3zm2 0v6h9V3M8 21v-8h8v8"/>',
  reset:'<path d="M3 10a8.8 8.8 0 1 1 1.1 6M3 4v6h6"/>',
  wave:'<path d="M3 10v4m4-8v12m5-16v20m5-15v10m4-7v4"/>',
  music:'<path d="M8 17V6l12-3v11M8 8l12-3"/><ellipse cx="5.5" cy="18" rx="2.5" ry="2"/><ellipse cx="17.5" cy="15" rx="2.5" ry="2"/>',
  trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'
};
function icon(name){return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';}
function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>{e.innerHTML=icon(e.dataset.icon);if(e.hasAttribute('aria-label'))e.title=e.getAttribute('aria-label');});}
function sourceIcon(name='Library'){
  const mark=document.createElement('span'),key=name.toLowerCase();
  mark.className='source-mark';mark.dataset.service=key;mark.title=name;
  mark.setAttribute('role','img');mark.setAttribute('aria-label',name);
  mark.innerHTML=icon(Object.hasOwn(paths,key)?key:'music');return mark;
}
