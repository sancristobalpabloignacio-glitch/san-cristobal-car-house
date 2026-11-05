/* Gestor de fotos: mezcla imágenes guardadas y nuevos archivos en un orden único. */
const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const $=id=>document.getElementById(id);
const imageTypes=new Set(['image/jpeg','image/png','image/webp']);
const maxSize=25*1024*1024;
const maxPhotos=60;
export function createAdminGallery({onChange=()=>{}}={}){
 const picker=$('files'),dropzone=$('photoDropzone'),browse=$('photoBrowse'),browseMore=$('photoBrowseMore');
 const list=$('photos'),counter=$('photoCount'),errorBox=$('photoError');
 const cover=$('photoCoverPreview'),placeholder=$('photoCoverPlaceholder'),coverButton=$('photoCoverZoom');
 const lightbox=$('photoLightbox'),full=$('photoLightboxImage'),position=$('photoLightboxPosition');
 let entries=[],dragFrom=null,lightboxIndex=0;
 let busy=false;
 function srcOf(entry){return entry?.preview||entry?.url||''}
 function release(entry){if(entry?.preview&&entry.preview.startsWith('blob:'))URL.revokeObjectURL(entry.preview)}
 function report(message){errorBox.textContent=message;errorBox.hidden=!message}
 function repaint(){
  counter.textContent=entries.length+' '+(entries.length===1?'foto':'fotos');
  const first=entries[0];
  if(first){
   cover.src=srcOf(first);
   cover.alt='Fotografía principal de la publicación';
   cover.hidden=false;
   coverButton.hidden=false;
   placeholder.hidden=true;
  }else{
   cover.removeAttribute('src');
   cover.hidden=true;
   coverButton.hidden=true;
   placeholder.hidden=false;
  }
  list.innerHTML=entries.map((entry,i)=>{
   const main=i===0;
   return '<div class="editor-photo-tile'+(main?' is-cover':'')+'" draggable="'+(!busy)+'" data-photo-index="'+i+'">'
    +'<button type="button" class="editor-photo-zoom" data-photo-action="zoom" data-index="'+i+'" aria-label="Ver foto '+(i+1)+' en grande"><img src="'+safe(srcOf(entry))+'" alt="Foto '+(i+1)+'"></button>'
    +'<span class="editor-photo-number">'+String(i+1).padStart(2,'0')+'</span>'
    +(main?'<span class="editor-photo-cover-label">PORTADA</span>':'')
    +(entry.file?'<span class="editor-photo-new-label">NUEVA</span>':'')
    +'<div class="editor-photo-actions">'
    +'<button type="button" class="editor-photo-mini'+(main?' is-primary':'')+'" data-photo-action="cover" data-index="'+i+'" '+(main||busy?'disabled':'')+' title="Hacer portada" aria-label="Elegir foto '+(i+1)+' como portada">★</button>'
    +'<button type="button" class="editor-photo-mini" data-photo-action="left" data-index="'+i+'" '+(i===0||busy?'disabled':'')+' title="Mover a la izquierda" aria-label="Mover foto '+(i+1)+' hacia atrás">←</button>'
    +'<button type="button" class="editor-photo-mini" data-photo-action="right" data-index="'+i+'" '+(i===entries.length-1||busy?'disabled':'')+' title="Mover a la derecha" aria-label="Mover foto '+(i+1)+' hacia adelante">→</button>'
    +'<button type="button" class="editor-photo-mini is-remove" data-photo-action="remove" data-index="'+i+'" '+(busy?'disabled':'')+' title="Quitar foto" aria-label="Quitar foto '+(i+1)+'">×</button>'
    +'</div></div>';
  }).join('');
  browse.disabled=busy;
  if(browseMore)browseMore.disabled=busy;
  dropzone.classList.toggle('has-photos',entries.length>0);
 }
 function setExisting(urls){
  entries.forEach(release);
  entries=(urls||[]).filter(Boolean).map(url=>({url:String(url),file:null,preview:null}));
  dragFrom=null;report('');picker.value='';
  hideLightbox();repaint();
 }
 function addFiles(files){
  if(busy)return;
  report('');
  let rejected=0,oversize=0,extra=0,added=0;
  const selected=Array.from(files||[]);
  for(const file of selected){
   if(!file||!imageTypes.has(file.type)){rejected++;continue}
   if(file.size>maxSize){oversize++;continue}
   if(entries.length>=maxPhotos){extra++;continue}
   if(entries.some(x=>x.file&&x.file.name===file.name&&x.file.size===file.size&&x.file.lastModified===file.lastModified))continue;
   entries.push({url:null,file,preview:URL.createObjectURL(file)});
   added++;
  }
  picker.value='';
  if(rejected||oversize||extra)report([
   rejected?'Se omitieron '+rejected+' archivos que no son JPG, PNG o WebP.':'',
   oversize?'Se omitieron '+oversize+' imágenes de más de 25 MB.':'',
   extra?'Se alcanzó el máximo de 60 imágenes.':''
  ].filter(Boolean).join(' '));
  repaint();
  if(added)onChange();
 }
 function move(from,to){
  if(busy||from===to||from<0||to<0||from>=entries.length||to>=entries.length)return;
  const [entry]=entries.splice(from,1);
  entries.splice(to,0,entry);
  repaint();onChange();
 }
 function remove(index){
  if(busy||index<0||index>=entries.length)return;
  release(entries[index]);
  entries.splice(index,1);
  repaint();onChange();
 }
 function showLightbox(index){
  if(!entries[index])return;
  lightboxIndex=index;
  full.src=srcOf(entries[index]);
  full.alt='Foto '+(index+1)+' de '+entries.length;
  position.textContent=(index+1)+' / '+entries.length;
  lightbox.hidden=false;
 }
 function hideLightbox(){
  lightbox.hidden=true;
  full.removeAttribute('src');
 }
 picker.addEventListener('change',()=>addFiles(picker.files));
 browse.addEventListener('click',()=>{if(!busy)picker.click()});
 if(browseMore)browseMore.addEventListener('click',()=>{if(!busy)picker.click()});
 dropzone.addEventListener('dragover',event=>{
  event.preventDefault();if(!busy){event.dataTransfer.dropEffect='copy';dropzone.classList.add('is-dragover')}
 });
 dropzone.addEventListener('dragleave',event=>{
  if(!dropzone.contains(event.relatedTarget))dropzone.classList.remove('is-dragover');
 });
 dropzone.addEventListener('drop',event=>{
  event.preventDefault();dropzone.classList.remove('is-dragover');addFiles(event.dataTransfer?.files);
 });
 list.addEventListener('click',event=>{
  const action=event.target.closest('[data-photo-action]');
  if(!action||!list.contains(action))return;
  const index=Number(action.dataset.index);
  if(action.dataset.photoAction==='zoom')showLightbox(index);
  if(action.dataset.photoAction==='cover')move(index,0);
  if(action.dataset.photoAction==='left')move(index,index-1);
  if(action.dataset.photoAction==='right')move(index,index+1);
  if(action.dataset.photoAction==='remove')remove(index);
 });
 list.addEventListener('dragstart',event=>{
  if(busy)return;
  const tile=event.target.closest('[data-photo-index]');
  if(!tile)return;
  dragFrom=Number(tile.dataset.photoIndex);
  tile.classList.add('is-dragging');
  event.dataTransfer.effectAllowed='move';
 });
 list.addEventListener('dragend',()=>{
  dragFrom=null;
  list.querySelectorAll('.is-dragging,.is-drop-target').forEach(el=>el.classList.remove('is-dragging','is-drop-target'));
 });
 list.addEventListener('dragover',event=>{
  const tile=event.target.closest('[data-photo-index]');
  if(!tile||dragFrom===null||busy)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  list.querySelectorAll('.is-drop-target').forEach(el=>el.classList.remove('is-drop-target'));
  tile.classList.add('is-drop-target');
 });
 list.addEventListener('drop',event=>{
  const tile=event.target.closest('[data-photo-index]');
  if(!tile||dragFrom===null||busy)return;
  event.preventDefault();const to=Number(tile.dataset.photoIndex),from=dragFrom;
  dragFrom=null;move(from,to);
 });
 coverButton.addEventListener('click',()=>showLightbox(0));
 $('photoLightboxClose').addEventListener('click',hideLightbox);
 $('photoLightboxPrev').addEventListener('click',()=>showLightbox((lightboxIndex-1+entries.length)%entries.length));
 $('photoLightboxNext').addEventListener('click',()=>showLightbox((lightboxIndex+1)%entries.length));
 lightbox.addEventListener('click',event=>{if(event.target===lightbox)hideLightbox()});
 document.addEventListener('keydown',event=>{
  if(lightbox.hidden)return;
  if(event.key==='Escape'){event.preventDefault();hideLightbox()}
  if(event.key==='ArrowRight')showLightbox((lightboxIndex+1)%entries.length);
  if(event.key==='ArrowLeft')showLightbox((lightboxIndex-1+entries.length)%entries.length);
 });
 async function collectImages(uploadOne){
  const urls=[];
  for(let i=0;i<entries.length;i++){
   const entry=entries[i];
   if(entry.file){
    const url=await uploadOne(entry.file,i,entries.length);
    if(!url)throw new Error('No se pudo subir una de las fotografías.');
    entry.url=url;
    entry.file=null;
   }
   urls.push(entry.url);
  }
  return urls;
 }
 return {
  setExisting,addFiles,collectImages,
  closePreview:hideLightbox,
  setBusy(value){busy=Boolean(value);repaint()},
  count(){return entries.length},
  snapshot(){return entries.map(item=>({url:item.url,file:item.file?.name||null,preview:item.preview}))},
  destroy(){entries.forEach(release);entries=[];hideLightbox()}
 };
}
