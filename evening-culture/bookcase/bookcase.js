'use strict';
(() => {
 const catalog=JSON.parse(document.getElementById('catalog').textContent);
 const items=catalog.items, recs=catalog.recommendations, themes=catalog.themes;
 const byId=new Map(items.map(x=>[x.id,x]));
 const recIds=new Set(recs.map(x=>x.id));
 const key='eveningCultureBookcase_v1';
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state={pinned:[],kept:[],display:{}},storageAvailable=true,toastTimer;
 try {
  const saved=JSON.parse(localStorage.getItem(key)||'null');
  if(saved&&typeof saved==='object'){
   const validIds=Array.isArray(saved.pinned)?[...new Set(saved.pinned.filter(id=>byId.has(id)))]:[];
   state.pinned=themes.flatMap(t=>validIds.filter(id=>byId.get(id).theme===t.id).slice(0,5));
   state.kept=Array.isArray(saved.kept)?[...new Set(saved.kept.filter(id=>recIds.has(id)))]:[];
   const display=saved.display&&typeof saved.display==='object'?saved.display:{};
   themes.forEach(t=>{
    const ids=Array.isArray(display[t.id])?[...new Set(display[t.id].filter(id=>byId.get(id)?.theme===t.id))]:[];
    if(ids.length===5&&state.pinned.filter(id=>byId.get(id).theme===t.id).every(id=>ids.includes(id)))state.display[t.id]=ids;
   });
  }
 } catch { /* Invalid saved data is replaced by a fresh display. */ }
 function announce(message){$('toast').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').textContent=''},3500)}
 function save(){try{localStorage.setItem(key,JSON.stringify(state));storageAvailable=true;$('storage-status').textContent=''}catch{storageAvailable=false;$('storage-status').textContent='Your browser cannot save this display. Export it before closing the page.'}}
 function shuffle(a){const result=[...a];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result}
 function selectShelf(theme,refresh=false){
  const pool=items.filter(x=>x.theme===theme.id), pinned=state.pinned.filter(id=>byId.get(id).theme===theme.id);
  const old=state.display[theme.id]||[];
  if(!refresh&&old.length===5)return old;
  const selected=[...pinned];
  const pick=candidates=>{if(candidates.length){const unused=candidates.filter(x=>!old.includes(x.id));selected.push(shuffle(unused.length?unused:candidates)[0].id)}};
  shuffle([...new Set(pool.map(x=>x.kind))]).forEach(kind=>{if(selected.length<5&&!selected.some(id=>byId.get(id).kind===kind))pick(pool.filter(x=>x.kind===kind&&!selected.includes(x.id)))});
  while(selected.length<5)pick(pool.filter(x=>!selected.includes(x.id)));
  // If possible, a refreshed shelf must actually change even with pinned works.
  if(refresh&&pool.length>5&&selected.every(id=>old.includes(id))&&pinned.length<5){
   const outside=pool.filter(x=>!selected.includes(x.id));
   const replace=selected.findIndex(id=>!pinned.includes(id));
   if(outside.length&&replace>=0)selected[replace]=shuffle(outside)[0].id;
  }
  return selected;
 }
 const pinSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 3h8l-1 6 3 4v2H6v-2l3-4-1-6Z"/><path d="M12 15v7"/></svg>';
 function pinButton(x){const pinned=state.pinned.includes(x.id);return `<button class="pin" type="button" data-pin="${esc(x.id)}" aria-pressed="${pinned}" aria-label="${pinned?'Unpin':'Keep'} ${esc(x.title)} ${pinned?'from':'on'} display" title="${pinned?'Unpin from display':'Keep on display'}">${pinSvg}</button>`}
 function image(x,lazy=true){return `<img src="${esc(x.image)}" alt="${esc(x.kind==='Art'?x.creator+' — '+x.title:x.kind==='Music'?x.creator+' album cover':x.title+(x.kind==='Film'?' film poster':' book cover'))}" ${lazy?'loading="lazy"':''} decoding="async">`}
 function cover(x){return `<div class="cover-slot ${esc(x.kind)}" data-cover="${esc(x.id)}"><a class="cover-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" aria-label="Explore ${esc(x.title)} (opens in a new tab)">${image(x)}</a></div>`}
 function caption(x){return `<div class="work-caption" data-caption="${esc(x.id)}"><div class="work-meta"><span>${esc(x.kind)}${x.kind==='Film'?' · '+esc(x.year):''}</span>${pinButton(x)}</div><h3><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.displayTitle||x.title)}</a></h3><p class="creator">${esc(x.displayCreator||x.creator)}</p><p class="work-note">${esc(x.note)}</p>${x.rating?'<span class="rated" aria-label="Rated five stars">★★★★★</span>':''}</div>`}
 function renderShelves(){
  $('shelves').innerHTML=themes.map(t=>{
   const works=state.display[t.id].map(id=>byId.get(id));
   return `<section class="shelf-section" aria-labelledby="heading-${t.id}"><div class="shelf-heading"><div><span class="number">${esc(t.number)} /</span><h2 id="heading-${t.id}">${esc(t.title)}</h2><p class="subtitle">${esc(t.subtitle)}</p></div><p class="interpretation">${esc(t.text)}</p></div><div class="shelf-grid" data-shelf="${t.id}"><div class="shelf-stage">${works.map(cover).join('')}</div><div class="shelf-captions">${works.map(caption).join('')}</div></div></section>`;
  }).join('');
  layoutShelves();updateHint();
 }
 // Pair cover and caption on small screens; keep one continuous shelf on desktop.
 const mobile=matchMedia('(max-width:570px)');
 function layoutShelves(){
  document.querySelectorAll('[data-shelf]').forEach(grid=>{
   if(mobile.matches){
    if(grid.querySelector('.shelf-pair'))return;
    const covers=[...grid.querySelectorAll('.cover-slot')],captions=[...grid.querySelectorAll('.work-caption')];grid.replaceChildren();
    covers.forEach((c,i)=>{const pair=document.createElement('div');pair.className='shelf-pair';pair.append(c,captions[i]);grid.append(pair)});
   }else{
    if(grid.querySelector('.shelf-stage'))return;
    const stage=document.createElement('div'),captions=document.createElement('div');stage.className='shelf-stage';captions.className='shelf-captions';
    grid.querySelectorAll('.shelf-pair').forEach(pair=>{stage.append(pair.querySelector('.cover-slot'));captions.append(pair.querySelector('.work-caption'))});grid.replaceChildren(stage,captions);
   }
  });
 }
 mobile.addEventListener('change',layoutShelves);
 function updateHint(){$('display-hint').textContent=state.pinned.length?`${state.pinned.length} kept on display`:'30 works on display · pin a work to keep it'}
 function renderRecommendations(){
  $('recommendations').innerHTML=recs.map(x=>{const kept=state.kept.includes(x.id);return `<article class="recommendation ${esc(x.kind)}"><a class="rec-image" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" aria-label="Explore ${esc(x.title)} (opens in a new tab)">${image(x)}</a><span class="label">${esc(x.kind)}</span><h3><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.displayTitle||x.title)}</a></h3><p class="creator">${esc(x.displayCreator||x.creator)}</p><p class="bridge">${esc(x.bridge)}</p><p class="rec-note">${esc(x.note)}</p><button class="keep" type="button" data-keep="${esc(x.id)}" aria-pressed="${kept}" aria-label="${kept?'Remove':'Keep'} ${esc(x.title)} ${kept?'from':'for'} later"><span aria-hidden="true">${kept?'✓':'+'}</span><span>${kept?'Kept for later':'Keep for later'}</span></button></article>`}).join('');
  $('kept-count').textContent=state.kept.length?`${state.kept.length} ${state.kept.length===1?'discovery':'discoveries'} kept for later.`:'';
 }
 function renderLibrary(){
  const query=$('search').value.toLocaleLowerCase().trim();
  const filtered=items.filter(x=>`${x.title} ${x.creator} ${x.kind} ${themes.find(t=>t.id===x.theme).title}`.toLocaleLowerCase().includes(query)).sort((a,b)=>a.title.localeCompare(b.title));
  $('library-count').textContent=`${filtered.length} of ${items.length} works`;
  $('library-grid').innerHTML=filtered.map(x=>`<article class="library-item"><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${image(x).replace('<img ','<img class="library-image" ')}</a><div><h3><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.displayTitle||x.title)}</a></h3><p class="creator">${esc(x.displayCreator||x.creator)}</p><p class="label">${esc(x.kind)}${x.rating?' · ★★★★★':''}</p></div>${pinButton(x)}</article>`).join('')||'<p class="library-footnote">No works match this search.</p>';
 }
 function updatePins(){document.querySelectorAll('[data-pin]').forEach(button=>{const x=byId.get(button.dataset.pin),pinned=state.pinned.includes(x.id);button.setAttribute('aria-pressed',String(pinned));button.setAttribute('aria-label',`${pinned?'Unpin':'Keep'} ${x.title} ${pinned?'from':'on'} display`);button.title=pinned?'Unpin from display':'Keep on display'});updateHint()}
 document.addEventListener('click',event=>{
  const pin=event.target.closest('[data-pin]');
  if(pin){
   const id=pin.dataset.pin,x=byId.get(id),pinned=state.pinned.includes(id);
   if(pinned){state.pinned=state.pinned.filter(n=>n!==id);announce(`${x.title} unpinned.`)}
   else{
    if(state.pinned.filter(n=>byId.get(n).theme===x.theme).length>=5){announce('This shelf has five pinned works. Unpin one to make room.');return}
    state.pinned.push(id);
    if(!state.display[x.theme].includes(id)){
     const replace=state.display[x.theme].findIndex(n=>!state.pinned.includes(n));state.display[x.theme][replace]=id;renderShelves();
    }
    announce(`${x.title} kept on display.`);
   }
   updatePins();save();
   const current=[...document.querySelectorAll('[data-pin]')].find(b=>b.dataset.pin===id&&(pin.closest('.library-item')?b.closest('.library-item'):b.closest('.work-caption')));current?.focus({preventScroll:true});
  }
  const keep=event.target.closest('[data-keep]');
  if(keep){const id=keep.dataset.keep,kept=state.kept.includes(id);state.kept=kept?state.kept.filter(n=>n!==id):[...state.kept,id];renderRecommendations();save();document.querySelector(`[data-keep="${id}"]`)?.focus({preventScroll:true});announce(kept?'Removed from your discoveries.':'Kept for later.')}
 });
 $('refresh').addEventListener('click',()=>{themes.forEach(t=>{state.display[t.id]=selectShelf(t,true)});renderShelves();save();announce('The shelves have been refreshed. Pinned works remain on display.')});
 $('search').addEventListener('input',renderLibrary);
 $('library').addEventListener('toggle',()=>{if($('library').open&&!$('library-grid').children.length)renderLibrary()});
 $('export').addEventListener('click',()=>{
  const exportData={version:1,exportedAt:new Date().toISOString(),pinned:state.pinned,kept:state.kept,display:state.display,pinnedWorks:state.pinned.map(id=>byId.get(id)),discoveries:recs.filter(x=>state.kept.includes(x.id))};
  const blob=new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='paolos-bookcase.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Your display and discoveries have been exported.');
 });
 themes.forEach(t=>{state.display[t.id]=selectShelf(t)});renderShelves();renderRecommendations();save();
})();
