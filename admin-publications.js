/* San Cristóbal Car House — interfaz del inventario. */
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=n=>new Intl.NumberFormat('es-AR').format(Number(n)||0);
const money=car=>car.price==null?'Consultar':new Intl.NumberFormat('es-AR',{style:'currency',currency:car.currency||'USD',maximumFractionDigits:0}).format(Number(car.price));
const date=raw=>{if(!raw)return '';const d=new Date(raw);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)};
const icons={
 sold:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg>',
 edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.7-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.9 16.2 4 20Z"/></svg>',
 open:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9M19 13v6H5V5h6"/></svg>',
 share:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 6h8v8M19 6l-9 9M19 14v5H5V5h8"/></svg>',
 more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
 car:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16 5.5 8h13L21 16v4h-3v-2H6v2H3v-4ZM3 16h18M6 13h2m8 0h2"/></svg>'
};
const statusNames={available:'Disponible',reserved:'Reservado',sold:'Vendido'};
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function createInventoryUI({onAction}){
 const $=id=>document.getElementById(id);
 const root=$('inventoryCollection'),empty=$('empty'),summary=$('inventorySummary');
 const search=$('inventorySearch'),filter=$('inventoryFilter');
 const list=$('inventoryListView'),grid=$('inventoryGridView');
 let cars=[],views=null,mode='list';
 function getFiltered(){
  const needle=normalize(search.value.trim());
  return cars.filter(car=>{
   const text=[car.brand,car.model,car.version,car.year,car.kilometers,car.transmission,car.fuel,car.color].map(normalize).join(' ');
   if(needle&&!text.includes(needle))return false;
   if(filter.value==='published'&&!car.published)return false;
   if(filter.value==='hidden'&&car.published)return false;
   if(['available','reserved','sold'].includes(filter.value)&&car.status!==filter.value)return false;
   if(filter.value==='featured'&&!car.featured)return false;
   return true;
  });
 }
 function card(car){
  const status=car.status in statusNames?car.status:'available';
  const name=[car.year,car.brand,car.model,car.version].filter(Boolean).join(' ');
  const detail=[car.kilometers==null?'':fmt(car.kilometers)+' km',car.transmission,car.fuel].filter(Boolean).join(' · ');
  const photo=car.cover_image||car.images?.[0]||'';
  const published=date(car.created_at);
  const visits=views===null?'':'<span class="pub-divider">·</span><span title="Visitas registradas a la ficha de este auto en nuestra web">'+fmt(views.get(String(car.id))||0)+' visitas a la ficha</span>';
  const kind=car.vehicle_category==='zero_km'?'0 KM':'AUTO USADO';
  const statusHTML=car.published
   ?'<span class="publication-status '+status+'">'+statusNames[status]+'</span><span class="pub-divider">·</span><span>Publicado'+(published?' el '+esc(published):'')+'</span>'
   :'<span class="publication-status hidden">Oculta en la web</span><span class="pub-divider">·</span><span>'+statusNames[status]+'</span>';
  const link='/auto.html?id='+encodeURIComponent(car.id);
  const featured=car.featured?'<span class="publication-featured">DESTACADO</span>':'';
  const image=photo?'<img src="'+esc(photo)+'" alt="'+esc(name)+'" loading="lazy">':'<span class="publication-image-placeholder">'+icons.car+'<span>Sin foto</span></span>';
  return '<article class="publication-card" data-vehicle-id="'+esc(car.id)+'">'
    +'<div class="publication-image">'+image+'</div>'
    +'<div class="publication-body"><div class="publication-info">'
    +'<div class="publication-kicker"><span>'+kind+'</span>'+featured+'</div>'
    +'<h3 class="publication-name">'+esc(name)+'</h3>'
    +'<p class="publication-price">'+esc(money(car))+'</p>'
    +'<div class="publication-specs">'+esc(detail)+'</div>'
    +'<div class="publication-details">'+statusHTML+visits+'</div></div>'
    +'<div class="publication-actions">'
    +'<button class="publication-action publication-action-primary" type="button" data-pub-action="sold">'+icons.sold+(car.status==='sold'?'Volver a disponible':'Marcar como vendido')+'</button>'
    +'<button class="publication-action" type="button" data-pub-action="edit">'+icons.edit+'Editar</button>'
    +(car.published?'<a class="publication-action publication-action-open" href="'+link+'" target="_blank" rel="noopener noreferrer">'+icons.open+'Ver en web</a>':'')
    +(car.published?'<button class="publication-action" type="button" data-pub-action="share">'+icons.share+'Compartir</button>':'')
    +'<div class="publication-more-wrapper"><button class="publication-action publication-action-more" type="button" data-pub-action="menu" aria-label="Más opciones para '+esc(name)+'" aria-expanded="false">'+icons.more+'</button>'
    +'<div class="publication-menu" hidden>'
    +'<button type="button" data-pub-action="featured">'+(car.featured?'Quitar destacado':'Marcar como destacado')+'</button>'
    +'<button type="button" data-pub-action="publish">'+(car.published?'Ocultar publicación':'Publicar en la web')+'</button>'
    +'<button type="button" data-pub-action="delete" class="delete">Eliminar publicación</button>'
    +'</div></div></div></div></article>';
 }
 function closeMenus(){
  root.querySelectorAll('.publication-menu:not([hidden])').forEach(menu=>{
   menu.hidden=true;
   const button=menu.parentElement.querySelector('[data-pub-action="menu"]');
   if(button)button.setAttribute('aria-expanded','false');
  });
 }
 function render(){
  const filtered=getFiltered(),total=cars.length;
  const published=cars.filter(c=>c.published).length;
  const featured=cars.filter(c=>c.featured&&c.published&&c.status!=='sold').length;
  $('count').textContent=fmt(total)+' '+(total===1?'unidad cargada':'unidades cargadas')+' · '+fmt(published)+' en la web · '+fmt(featured)+' destacados';
  summary.innerHTML='<span><b>'+fmt(filtered.length)+'</b> '+(filtered.length===1?'publicación encontrada':'publicaciones encontradas')+'</span><span>'+(mode==='list'?'Vista de lista':'Vista de cuadrícula')+'</span>';
  root.classList.toggle('view-list',mode==='list');
  root.classList.toggle('view-grid',mode==='grid');
  list.setAttribute('aria-pressed',String(mode==='list'));
  grid.setAttribute('aria-pressed',String(mode==='grid'));
  root.innerHTML=filtered.map(card).join('');
  empty.style.display=filtered.length?'none':'block';
  empty.innerHTML=total===0?'<strong>Todavía no hay publicaciones</strong><span>Usá el botón «+ Nueva publicación» para cargar el primer auto.</span>':'<strong>No encontramos publicaciones</strong><span>Probá con otra búsqueda o seleccioná otro estado.</span>';
 }
 search.addEventListener('input',render);
 filter.addEventListener('change',render);
 list.addEventListener('click',()=>{mode='list';render()});
 grid.addEventListener('click',()=>{mode='grid';render()});
 root.addEventListener('click',async event=>{
  const control=event.target.closest('[data-pub-action]');
  if(!control||!root.contains(control))return;
  const wrapper=control.closest('[data-vehicle-id]');
  if(!wrapper)return;
  const car=cars.find(c=>String(c.id)===wrapper.dataset.vehicleId);
  if(!car)return;
  const action=control.dataset.pubAction;
  if(action==='menu'){
   const menu=control.parentElement.querySelector('.publication-menu');
   const open=menu.hidden;
   closeMenus();
   menu.hidden=!open;
   control.setAttribute('aria-expanded',String(open));
   return;
  }
  closeMenus();
  if(control.disabled)return;
  control.disabled=true;
  try{await onAction(car,action)}
  catch(error){window.alert(error.message||'No se pudo completar la acción')}
  finally{control.disabled=false}
 });
 document.addEventListener('click',event=>{
  if(!event.target.closest('.publication-more-wrapper'))closeMenus();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenus()});
 return {setData(nextCars,nextViews){cars=Array.isArray(nextCars)?nextCars:[];views=nextViews instanceof Map?nextViews:null;render()},refresh:render};
}
