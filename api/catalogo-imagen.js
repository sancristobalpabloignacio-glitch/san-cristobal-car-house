// Resolve catálogo images directly from public manufacturer pages.
// Only allow model names from the public San Cristóbal 0 km catalogue.
const VW_MODELS=['Tera','Polo','Virtus','Nivus','T-Cross','Taos','Vento GLI','Saveiro','Amarok','Tiguan'];
const PEUGEOT_PAGES={
 '208':'208.html','2008':'2008.html','3008':'nuevo-3008.html',
 '408':'nuevo-408.html','5008':'nuevo-5008.html',
 'Partner':'partner.html','Expert':'expert.html','Boxer':'boxer.html'
};
function decode(s){
 return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:x([a-f0-9]+)|([0-9]+));/gi,(_,h,d)=>String.fromCharCode(parseInt(h||d,h?16:10)));
}
function attr(tag,name){
 const m=tag.match(new RegExp('(?:\\s|^)'+name+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i'));
 return decode(m&&(m[1]||m[2]||m[3])||'');
}
function sourceUrl(url,base){
 if(!url)return '';
 try{
  const u=new URL(url,base);
  if(u.protocol!=='https:')return '';
  if(!/^(www\.volkswagen\.com\.ar|media\.vw\.mediaservice\.avp\.tech|assets\.volkswagen\.com|www\.peugeot\.com\.ar|configurador\.peugeot\.com\.ar|stellantis\.com|www\.stellantis\.com|b2c\.media\.stellantis\.com)$/i.test(u.hostname))return '';
  if(!/\.(png|webp|jpg|jpeg)(\?|$)/i.test(u.href))return '';
  return u.href;
 }catch{return ''}
}
async function readPage(url){
 const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; SanCristobalCarHouse/1.0)','Accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(8500)});
 if(!response.ok)throw new Error('Upstream '+response.status);
 return response.text();
}
function collectImages(html,base){
 const imgs=[];
 for(const match of html.matchAll(/<img\b[^>]*>/gi)){
  const tag=match[0],alt=attr(tag,'alt');
  const srcset=attr(tag,'data-srcset')||attr(tag,'srcset');
  let src=attr(tag,'data-src')||attr(tag,'data-original')||attr(tag,'src');
  if(srcset){
   const variants=srcset.split(/,\s*(?=https?:|\/)/).map(x=>x.trim().split(/\s+/)[0]);
   const chosen=variants.reverse().find(x=>sourceUrl(x,base));
   if(chosen)src=chosen;
  }
  const url=sourceUrl(src,base);
  if(url)imgs.push({url,alt,raw:tag.slice(0,850),index:match.index});
 }
 return imgs;
}
function vwImage(html,model,url){
 const images=collectImages(html,url),target=model.toLowerCase();
 const exact=images.filter(x=>x.alt.trim().toLowerCase()===target && x.url.includes('media.vw.mediaservice.avp.tech'));
 if(exact.length)return exact[0].url;
 const near=images.filter(x=>x.alt.toLowerCase().includes(target)&&x.url.includes('media.vw.mediaservice.avp.tech'));
 if(near.length)return near[0].url;
 return null;
}
function peugeotImage(html,model,url){
 const imgs=collectImages(html,url);
 const titleMatch=(model==='Partner'?'partner':model.toLowerCase());
 const preferred=imgs.map(img=>{
  const context=html.slice(Math.max(0,img.index-400),Math.min(html.length,img.index+500)).toLowerCase();
  let score=0;
  if((img.url+' '+img.alt).toLowerCase().includes(titleMatch))score+=15;
  if(/hero|showroom|packshot|front|exterior|carline|mobile-range|vehicle|model|visuel|desktop/.test((img.url+' '+img.alt).toLowerCase()))score+=5;
  if(/interior|seat|dashboard|cockpit|logo|icon|svg|engine|tyre|wheel|safety|detail/.test((img.url+' '+img.alt).toLowerCase()))score-=35;
  if(context.includes('hero')||context.includes('banner'))score+=2;
  return {...img,score}
 }).filter(x=>x.score>=8).sort((a,b)=>b.score-a.score);
 if(preferred.length)return preferred[0].url;
 for(const match of html.matchAll(/<meta\b[^>]*>/gi)){
  const t=match[0];
  if(attr(t,'property')==='og:image'||attr(t,'name')==='twitter:image'){
   const u=sourceUrl(attr(t,'content'),url);
   if(u&&u.toLowerCase().includes(titleMatch))return u
  }
 }
 return null;
}
module.exports=async (req,res)=>{
 const brand=String(req.query.brand||''),model=String(req.query.model||'');
 let page;
 if(brand==='Volkswagen'&&VW_MODELS.includes(model))page='https://www.volkswagen.com.ar/es/modelos.html';
 else if(brand==='Peugeot'&&Object.prototype.hasOwnProperty.call(PEUGEOT_PAGES,model))page='https://www.peugeot.com.ar/gama/'+PEUGEOT_PAGES[model];
 else {res.status(404).end('Modelo no disponible');return}
 try{
  const html=await readPage(page);
  const img=brand==='Volkswagen'?vwImage(html,model,page):peugeotImage(html,model,page);
  if(!img){res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=3600');res.status(404).end('Sin foto');return}
  res.setHeader('Cache-Control','public, s-maxage=43200, stale-while-revalidate=86400');
  res.setHeader('Location',img);
  res.status(302).end()
 }catch(e){res.setHeader('Cache-Control','public, s-maxage=180');res.status(404).end('Sin foto');}
};