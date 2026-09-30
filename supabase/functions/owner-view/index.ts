import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = "https://hljeiqgrumtlukdvaspz.supabase.co";
const TRACKING_API = PROJECT_URL + "/functions/v1/owner-tracking";

function escHtml(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m] || m));
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Seguimiento de venta | San Cristóbal Car House</title>
<style>
:root{--g:#163629;--stone:#C4BDAD;--gray:#9C9789;--bg:#EAE5DA;--panel:#F7F4EE;--line:#B7B09F;--muted:#726E63}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--g);font-family:Arial,sans-serif}.shell{width:min(1120px,calc(100% - 40px));margin:auto}.head{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.brand{font-size:11px;font-weight:800;letter-spacing:.16em}.private{font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.hero{padding:42px 0 28px}.hero-grid{display:grid;grid-template-columns:1fr 390px;gap:40px;align-items:center}.kicker{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}.hero h1{font:400 clamp(42px,5vw,66px)/.98 Georgia,serif;letter-spacing:-.045em;margin:0}.hero p{color:var(--muted);line-height:1.6;max-width:620px}.photo{height:255px;background:var(--stone);overflow:hidden;border:1px solid var(--line)}.photo img{width:100%;height:100%;object-fit:cover;display:block}.status{display:inline-block;margin-top:14px;padding:6px 8px;background:var(--gray);color:#fff;font-size:8px;text-transform:uppercase;letter-spacing:.1em}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.metric{background:var(--panel);border:1px solid var(--line);padding:20px}.metric small{display:block;font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:18px}.metric strong{font:400 38px Georgia,serif}.metric span{display:block;font-size:9px;color:var(--muted);margin-top:5px}.section{background:var(--panel);border:1px solid var(--line);padding:22px;margin-top:16px}.section-head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:18px}.section h2{font:400 29px Georgia,serif;margin:0}.section-head p{font-size:9px;color:var(--muted);margin:0}.chart{display:grid;grid-template-columns:repeat(30,1fr);gap:3px;height:190px;align-items:end;border-top:1px solid #D9D2C6;padding-top:16px}.day{height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}.bars{height:150px;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:2px}.bar{width:35%;min-height:2px;background:var(--g)}.bar.q{background:var(--gray)}.day label{font-size:6px;color:var(--muted);margin-top:6px}.legend{display:flex;gap:14px;font-size:9px;color:var(--muted)}.dot{display:inline-block;width:8px;height:8px;margin-right:4px;background:var(--g)}.dot.q{background:var(--gray)}.channels{width:100%;border-collapse:collapse}.channels th,.channels td{text-align:left;padding:13px 10px;border-bottom:1px solid #DED8CD;font-size:11px}.channels th{font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}.foot{padding:34px 0 50px;color:var(--muted);font-size:10px;line-height:1.6}.error{max-width:700px;margin:80px auto;background:var(--panel);border:1px solid var(--line);padding:35px;text-align:center}.error h1{font:400 38px Georgia,serif;margin:0 0 12px}.two-note{display:grid;grid-template-columns:1fr 1fr;gap:12px}.note{background:#DDD7CC;padding:15px;font-size:10px;color:#5E625B;line-height:1.55}
@media(max-width:850px){.hero-grid{grid-template-columns:1fr}.photo{height:300px}.metrics{grid-template-columns:1fr 1fr}.chart{grid-template-columns:repeat(15,1fr)}.day:nth-child(odd){display:none}}
@media(max-width:520px){.shell{width:calc(100% - 26px)}.metrics{grid-template-columns:1fr}.hero{padding-top:30px}.photo{height:230px}.section{padding:16px}.section-head{display:block}.legend{margin-top:10px}.two-note{grid-template-columns:1fr}.head .private{display:none}}
</style>
</head>
<body>
<div class="shell"><header class="head"><div class="brand">SAN CRISTÓBAL · CAR HOUSE</div><div class="private">Seguimiento privado</div></header><div id="content"><section class="hero"><div class="hero-grid"><div><div class="kicker">SEGUIMIENTO DE VENTA</div><h1>Cargando información…</h1></div></div></section></div></div>
<script>
const TOKEN=${JSON.stringify(token)};
const API=${JSON.stringify(TRACKING_API)};
const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat('es-AR').format(n||0);
const money=(n,c='USD')=>n==null?'Consultar':new Intl.NumberFormat('es-AR',{style:'currency',currency:c||'USD',maximumFractionDigits:0}).format(Number(n));
const channelName=c=>c==='mercadolibre'?'Mercado Libre':c==='facebook_marketplace'?'Facebook Marketplace':'Otro';
const statusName=s=>s==='sold'?'Vendido':s==='reserved'?'Reservado':'Publicado';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function showError(title,msg){$('content').innerHTML='<div class="error"><h1>'+esc(title)+'</h1><p>'+esc(msg)+'</p></div>'}
function render(data){
 const v=data.vehicle,w=data.web,e=data.external,c=data.combined;
 const max=Math.max(1,...w.daily.flatMap(x=>[x.views,x.inquiries]));
 const chart=w.daily.map((x,i)=>'<div class="day" title="'+x.date+': '+x.views+' vistas, '+x.inquiries+' consultas"><div class="bars"><div class="bar" style="height:'+Math.max(2,x.views/max*100)+'%"></div><div class="bar q" style="height:'+Math.max(2,x.inquiries/max*100)+'%"></div></div><label>'+(i%5===0?x.date.slice(5).replace('-','/'):'')+'</label></div>').join('');
 const rows=[{name:'Web propia',views:w.views,clicks:w.clicks,inquiries:w.inquiries,favorites:'—',date:'Actual'},...e.listings.map(x=>({name:channelName(x.channel),views:x.views,clicks:x.clicks,inquiries:x.inquiries,favorites:x.favorites,date:x.metric_date?new Date(x.metric_date+'T12:00:00').toLocaleDateString('es-AR'):'Sin datos'}))];
 $('content').innerHTML=
 '<section class="hero"><div class="hero-grid"><div><div class="kicker">SEGUIMIENTO DE VENTA</div><h1>'+esc(v.brand)+' '+esc(v.model)+'</h1><p>'+v.year+(v.version?' · '+esc(v.version):'')+' · '+fmt(v.kilometers)+' km · '+money(v.price,v.currency)+'</p><span class="status">'+statusName(v.status)+'</span></div><div class="photo">'+(v.cover_image?'<img src="'+esc(v.cover_image)+'" alt="'+esc(v.brand+' '+v.model)+'">':'')+'</div></div></section>'+
 '<section class="metrics"><div class="metric"><small>Vistas totales</small><strong>'+fmt(c.views)+'</strong><span>Web + canales externos</span></div><div class="metric"><small>Consultas totales</small><strong>'+fmt(c.inquiries)+'</strong><span>Interés registrado</span></div><div class="metric"><small>Vistas en la web</small><strong>'+fmt(w.views)+'</strong><span>Ficha del vehículo</span></div><div class="metric"><small>Conversión web</small><strong>'+(w.conversion*100).toFixed(1).replace('.',',')+'%</strong><span>Consultas / vistas</span></div></section>'+
 '<section class="section"><div class="section-head"><div><div class="kicker">ÚLTIMOS 30 DÍAS</div><h2>Actividad en la web</h2></div><div class="legend"><span><i class="dot"></i>Vistas</span><span><i class="dot q"></i>Consultas</span></div></div><div class="chart">'+chart+'</div></section>'+
 '<section class="section"><div class="section-head"><div><div class="kicker">CANALES</div><h2>Rendimiento por plataforma</h2></div><p>Última medición disponible</p></div><div style="overflow:auto"><table class="channels"><thead><tr><th>Canal</th><th>Vistas</th><th>Clicks</th><th>Consultas</th><th>Guardados</th><th>Actualización</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><b>'+r.name+'</b></td><td>'+fmt(r.views)+'</td><td>'+fmt(r.clicks)+'</td><td>'+fmt(r.inquiries)+'</td><td>'+(r.favorites==='—'?'—':fmt(r.favorites))+'</td><td>'+r.date+'</td></tr>').join('')+'</tbody></table></div></section>'+
 '<div class="two-note" style="margin-top:16px"><div class="note"><b>¿Qué cuenta como consulta?</b><br>En la web propia se registra cuando una persona toca el botón para consultar por WhatsApp.</div><div class="note"><b>Datos externos</b><br>Facebook Marketplace y Mercado Libre muestran la última medición cargada en el panel administrativo.</div></div>'+
 '<footer class="foot">Datos actualizados el '+new Date(data.generated_at).toLocaleString('es-AR')+'. Este enlace es privado y corresponde únicamente a este vehículo.</footer>';
}
async function load(){
 if(!TOKEN){showError('Link inválido','No encontramos un código de seguimiento en este enlace.');return}
 try{
   const r=await fetch(API+'?token='+encodeURIComponent(TOKEN),{cache:'no-store'});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||'No se pudo cargar el seguimiento.');
   render(data);
 }catch(e){showError('Seguimiento no disponible',String(e.message||e))}
}
load();
</script>
</body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
});
