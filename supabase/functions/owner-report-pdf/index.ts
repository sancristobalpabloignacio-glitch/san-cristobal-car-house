import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const ADMIN_EMAIL = "sancristobalpabloignacio@gmail.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getKeys() {
  let publishable = Deno.env.get("SUPABASE_ANON_KEY") || "";
  let secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  try {
    const p = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    publishable = p.default || publishable;
  } catch {}
  try {
    const s = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    secret = s.default || secret;
  } catch {}
  return { publishable, secret };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fmt(n: number | null | undefined) {
  return new Intl.NumberFormat("es-AR").format(Number(n || 0));
}

function money(n: number | null | undefined, currency = "USD") {
  if (n == null) return "Consultar";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    return (currency || "USD") + " " + fmt(n);
  }
}

function channelName(c: string) {
  if (c === "mercadolibre") return "Mercado Libre";
  if (c === "facebook_marketplace") return "Facebook Marketplace";
  return "Otro";
}

function statusName(s: string) {
  if (s === "sold") return "Vendido";
  if (s === "reserved") return "Reservado";
  return "Publicado";
}

function wrapText(text: string, font: any, size: number, maxWidth: number) {
  const words = String(text || "").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function fetchCover(doc: any, url: string | null) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const type = (r.headers.get("content-type") || "").toLowerCase();
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (type.includes("png")) return await doc.embedPng(bytes);
    if (type.includes("jpeg") || type.includes("jpg")) return await doc.embedJpg(bytes);
  } catch {}
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const { publishable, secret } = getKeys();

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "No autorizado" }, 401);

  const userClient = createClient(supabaseUrl, publishable, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.slice(7);
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || userData?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return json({ error: "No autorizado" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const vehicleId = String(body.vehicle_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(vehicleId)) return json({ error: "Vehículo inválido" }, 400);

  const admin = createClient(supabaseUrl, secret);

  const { data: vehicle, error: vehicleErr } = await admin
    .from("vehicles")
    .select("id,brand,model,version,year,kilometers,price,currency,cover_image,images,status,created_at")
    .eq("id", vehicleId)
    .maybeSingle();

  if (vehicleErr || !vehicle) return json({ error: "No se encontró el vehículo" }, 404);

  const countType = async (eventType: string) => {
    const { count } = await admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_id", vehicleId)
      .eq("event_type", eventType);
    return count || 0;
  };

  const [webClicks, webViews, webInquiries] = await Promise.all([
    countType("vehicle_click"),
    countType("vehicle_view"),
    countType("whatsapp_click"),
  ]);

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 29);

  const { data: recentEvents } = await admin
    .from("analytics_events")
    .select("event_type,created_at")
    .eq("vehicle_id", vehicleId)
    .gte("created_at", since.toISOString())
    .in("event_type", ["vehicle_click", "vehicle_view", "whatsapp_click"])
    .order("created_at", { ascending: true })
    .limit(10000);

  const daily: Record<string, { date: string; clicks: number; views: number; inquiries: number }> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    daily[key] = { date: key, clicks: 0, views: 0, inquiries: 0 };
  }
  for (const e of recentEvents || []) {
    const key = new Date(e.created_at).toISOString().slice(0, 10);
    if (!daily[key]) continue;
    if (e.event_type === "vehicle_click") daily[key].clicks++;
    if (e.event_type === "vehicle_view") daily[key].views++;
    if (e.event_type === "whatsapp_click") daily[key].inquiries++;
  }

  const { data: listings } = await admin
    .from("external_listings")
    .select("id,channel,external_id,listing_url,title,active")
    .eq("vehicle_id", vehicleId)
    .eq("active", true);

  const externalRows: any[] = [];
  let externalViews = 0, externalClicks = 0, externalInquiries = 0, externalFavorites = 0;

  for (const l of listings || []) {
    const { data: metrics } = await admin
      .from("external_metrics")
      .select("metric_date,views,clicks,inquiries,favorites")
      .eq("listing_id", l.id)
      .order("metric_date", { ascending: true })
      .limit(5000);

    const rowsForListing = metrics || [];
    const latestDate = rowsForListing.length ? rowsForListing[rowsForListing.length - 1].metric_date : null;
    const totals = rowsForListing.reduce((a:any,m:any) => {
      a.views += Number(m.views || 0);
      a.clicks += Number(m.clicks || 0);
      a.inquiries += Number(m.inquiries || 0);
      a.favorites += Number(m.favorites || 0);
      return a;
    }, { views:0, clicks:0, inquiries:0, favorites:0 });

    const row = {
      channel: channelName(l.channel),
      metric_date: latestDate,
      views: totals.views,
      clicks: totals.clicks,
      inquiries: totals.inquiries,
      favorites: totals.favorites,
    };
    externalRows.push(row);
    externalViews += row.views;
    externalClicks += row.clicks;
    externalInquiries += row.inquiries;
    externalFavorites += row.favorites;
  }

  const { data: offersData } = await admin
    .from("vehicle_offers")
    .select("id,amount,currency,offer_date,notes,created_at")
    .eq("vehicle_id", vehicleId)
    .order("offer_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  const offerRows = offersData || [];
  const latestOffer = offerRows[0] || null;

  const { data: tradeData } = await admin
    .from("vehicle_trade_ins")
    .select("id,offered_brand,offered_model,offered_version,offered_year,offered_kilometers,cash_adjustment,cash_adjustment_direction,currency,trade_date,notes,created_at")
    .eq("vehicle_id", vehicleId)
    .order("trade_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  const tradeRows = tradeData || [];

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const W = page.getWidth(), H = page.getHeight();
  const margin = 42;
  const green = rgb(22/255,54/255,41/255);
  const olive = rgb(156/255,151/255,137/255);
  const pale = rgb(234/255,229/255,218/255);
  const panel = rgb(247/255,244/255,238/255);
  const line = rgb(183/255,176/255,159/255);
  const muted = rgb(114/255,110/255,99/255);
  const white = rgb(1,1,1);
  const black = rgb(28/255,31/255,29/255);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  page.drawRectangle({ x: 0, y: H-112, width: W, height: 112, color: green });
  page.drawText("SAN CRISTOBAL CAR HOUSE", { x: margin, y: H-35, size: 9, font: bold, color: white, characterSpacing: 1.4 });
  page.drawText("Informe de seguimiento de venta", { x: margin, y: H-77, size: 24, font: serif, color: white });
  page.drawText("Por fanaticos, para fanaticos.", { x: margin, y: H-96, size: 8, font, color: rgb(.83,.81,.76) });

  // Foto del vehículo integrada en el encabezado, sin invadir título ni métricas.
  const cover = await fetchCover(pdf, vehicle.cover_image || vehicle.images?.[0] || null);
  if (cover) {
    const boxW = 138, boxH = 78;
    const x = W - margin - boxW;
    const imgY = H - 100;
    const dims = cover.scale(1);
    const scale = Math.min(boxW/dims.width, boxH/dims.height);
    const iw = dims.width * scale, ih = dims.height * scale;
    page.drawRectangle({
      x, y: imgY, width: boxW, height: boxH,
      color: rgb(1,1,1),
      borderColor: rgb(.92,.90,.86),
      borderWidth: 1
    });
    page.drawImage(cover, {
      x: x + (boxW-iw)/2,
      y: imgY + (boxH-ih)/2,
      width: iw,
      height: ih
    });
  }

  let y = H - 148;
  const title = vehicle.brand + " " + vehicle.model;
  page.drawText(title, { x: margin, y, size: 25, font: serifBold, color: green });
  y -= 22;

  const detailParts = [
    vehicle.year,
    vehicle.version || null,
    fmt(vehicle.kilometers) + " km",
    money(vehicle.price, vehicle.currency),
    statusName(vehicle.status),
  ].filter(Boolean);
  page.drawText(detailParts.join("  |  "), { x: margin, y, size: 9.5, font, color: muted });

  y -= 42;
  const totalViews = webViews + externalViews;
  const totalInquiries = webInquiries + externalInquiries;
  const cards = [
    ["VISTAS TOTALES", fmt(totalViews), "Web + canales externos"],
    ["CONSULTAS TOTALES", fmt(totalInquiries), "Interes registrado"],
    ["VISTAS EN LA WEB", fmt(webViews), "Ficha del vehiculo"],
    ["PERMUTAS", fmt(tradeRows.length), tradeRows.length ? "Propuestas registradas" : "Sin propuestas"],
  ];
  const cardGap = 8;
  const cardW = (W - margin*2 - cardGap*3) / 4;
  const cardH = 74;
  cards.forEach((c, i) => {
    const x = margin + i*(cardW+cardGap);
    page.drawRectangle({ x, y: y-cardH+8, width: cardW, height: cardH, color: panel, borderColor: line, borderWidth: 0.7 });
    page.drawText(c[0], { x:x+10, y:y-11, size:6.3, font:bold, color:muted, characterSpacing:.6 });
    page.drawText(c[1], { x:x+10, y:y-39, size:21, font:serifBold, color:green });
    page.drawText(c[2], { x:x+10, y:y-57, size:6.7, font, color:muted });
  });

  y -= 96;
  page.drawText("Rendimiento por plataforma", { x: margin, y, size: 16, font: serifBold, color: green });
  y -= 20;

  const rows = [
    {
      channel: "Web propia",
      metric_date: "Actual",
      views: webViews,
      clicks: webClicks,
      inquiries: webInquiries,
      favorites: null,
    },
    ...externalRows
  ];

  const cols = [
    { label:"Canal", x:margin, w:140 },
    { label:"Vistas", x:margin+145, w:55 },
    { label:"Clicks", x:margin+205, w:55 },
    { label:"Consultas", x:margin+265, w:65 },
    { label:"Guardados", x:margin+335, w:68 },
    { label:"Actualizacion", x:margin+408, w:100 },
  ];
  page.drawRectangle({ x: margin, y:y-4, width:W-margin*2, height:18, color:pale });
  cols.forEach(c=>page.drawText(c.label.toUpperCase(),{x:c.x+4,y:y+2,size:6.5,font:bold,color:muted,characterSpacing:.4}));
  y -= 14;

  for (const r of rows.slice(0, 6)) {
    y -= 20;
    page.drawLine({ start:{x:margin,y:y-3}, end:{x:W-margin,y:y-3}, thickness:.5, color:line });
    const date = r.metric_date === "Actual" ? "Actual" : r.metric_date ? new Date(r.metric_date+"T12:00:00").toLocaleDateString("es-AR") : "-";
    const values = [
      String(r.channel),
      fmt(r.views),
      fmt(r.clicks),
      fmt(r.inquiries),
      r.favorites == null ? "-" : fmt(r.favorites),
      date
    ];
    values.forEach((v,i)=>{
      const c=cols[i];
      const lines=wrapText(v,font,7.3,c.w-8).slice(0,2);
      lines.forEach((ln,j)=>page.drawText(ln,{x:c.x+4,y:y+5-j*8,size:7.3,font:i===0?bold:font,color:black}));
    });
  }

  y -= 30;
  page.drawText("Ofertas recibidas", { x: margin, y, size: 15, font: serifBold, color: green });
  y -= 15;

  if (offerRows.length) {
    const latestText = latestOffer ? money(Number(latestOffer.amount), latestOffer.currency) : "-";
    const latestDate = latestOffer ? new Date(latestOffer.offer_date + "T12:00:00").toLocaleDateString("es-AR") : "-";

    page.drawRectangle({ x: margin, y:y-35, width: 155, height: 38, color: panel, borderColor: line, borderWidth: .6 });
    page.drawText("OFERTAS REGISTRADAS", { x:margin+9, y:y-10, size:6.2, font:bold, color:muted, characterSpacing:.4 });
    page.drawText(String(offerRows.length), { x:margin+9, y:y-28, size:16, font:serifBold, color:green });

    page.drawRectangle({ x: margin+164, y:y-35, width: 170, height: 38, color: panel, borderColor: line, borderWidth: .6 });
    page.drawText("ULTIMA OFERTA", { x:margin+173, y:y-10, size:6.2, font:bold, color:muted, characterSpacing:.4 });
    page.drawText(latestText, { x:margin+173, y:y-28, size:13, font:serifBold, color:green });

    page.drawRectangle({ x: margin+343, y:y-35, width: W-margin-(margin+343), height: 38, color: panel, borderColor: line, borderWidth: .6 });
    page.drawText("FECHA", { x:margin+352, y:y-10, size:6.2, font:bold, color:muted, characterSpacing:.4 });
    page.drawText(latestDate, { x:margin+352, y:y-28, size:10, font:bold, color:green });

    y -= 50;
    for (const o of offerRows.slice(0, 3)) {
      const date = new Date(o.offer_date + "T12:00:00").toLocaleDateString("es-AR");
      const amount = money(Number(o.amount), o.currency);
      page.drawLine({ start:{x:margin,y:y-3}, end:{x:W-margin,y:y-3}, thickness:.45, color:line });
      page.drawText(date, { x:margin+3, y:y+5, size:7.2, font, color:muted });
      page.drawText(amount, { x:margin+82, y:y+5, size:8, font:bold, color:black });
      if (o.notes) {
        const noteLines = wrapText(String(o.notes), font, 7, W-margin*2-205).slice(0,1);
        if (noteLines[0]) page.drawText(noteLines[0], { x:margin+205, y:y+5, size:7, font, color:muted });
      }
      y -= 18;
    }
  } else {
    page.drawText("Todavia no hay ofertas registradas para este vehiculo.", { x: margin, y, size: 7.5, font, color: muted });
    y -= 12;
  }

  y -= 18;
  page.drawText("Permutas recibidas", { x:margin, y, size:15, font:serifBold, color:green });
  y -= 15;

  if (tradeRows.length) {
    const tcols = [
      { label:"Fecha", x:margin, w:62 },
      { label:"Vehiculo ofrecido", x:margin+66, w:180 },
      { label:"Año / km", x:margin+250, w:85 },
      { label:"Diferencia", x:margin+339, w:120 },
      { label:"Nota", x:margin+463, w:90 },
    ];
    page.drawRectangle({ x:margin, y:y-4, width:W-margin*2, height:18, color:pale });
    tcols.forEach(col=>page.drawText(col.label.toUpperCase(),{x:col.x+3,y:y+2,size:6.2,font:bold,color:muted,characterSpacing:.3}));
    y -= 17;

    for (const t of tradeRows.slice(0, 3)) {
      y -= 26;
      const date = new Date(t.trade_date + "T12:00:00").toLocaleDateString("es-AR");
      const offered = [t.offered_brand,t.offered_model,t.offered_version].filter(Boolean).join(" ");
      const meta = [t.offered_year || null, t.offered_kilometers != null ? fmt(t.offered_kilometers) + " km" : null].filter(Boolean).join(" / ");
      let adjustment = "Sin diferencia";
      if (Number(t.cash_adjustment || 0) > 0 && t.cash_adjustment_direction !== "none") {
        const m = money(Number(t.cash_adjustment), t.currency);
        adjustment = t.cash_adjustment_direction === "to_us" ? m + " a nuestro favor" : m + " a favor del interesado";
      }
      page.drawLine({ start:{x:margin,y:y-3}, end:{x:W-margin,y:y-3}, thickness:.45, color:line });
      const vals = [date,offered,meta,adjustment,String(t.notes || "-")];
      vals.forEach((v,i)=>{
        const col=tcols[i];
        const lines=wrapText(String(v), i===1?bold:font, 7, col.w-6).slice(0,2);
        lines.forEach((ln,j)=>page.drawText(ln,{x:col.x+3,y:y+8-j*8,size:7,font:i===1?bold:font,color:i===1?black:muted}));
      });
    }
    if (tradeRows.length > 3) {
      y -= 15;
      page.drawText("+" + (tradeRows.length - 3) + " permutas adicionales registradas en el panel.", { x:margin, y, size:7, font, color:muted });
    }
  } else {
    page.drawText("Todavia no hay permutas registradas para este vehiculo.", { x:margin, y, size:7.5, font, color:muted });
    y -= 12;
  }

  page.drawLine({ start:{x:margin,y:43}, end:{x:W-margin,y:43}, thickness:.6, color:line });
  const generated = new Date().toLocaleString("es-AR", { timeZone:"America/Argentina/Buenos_Aires" });
  page.drawText("Generado el " + generated, { x:margin, y:28, size:6.7, font, color:muted });
  page.drawText("San Cristobal Car House", { x:W-margin-96, y:28, size:6.7, font:bold, color:green });

  const bytes = await pdf.save();
  const safe = (vehicle.brand + "-" + vehicle.model + "-" + vehicle.year)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9-_]+/g,"-")
    .replace(/-+/g,"-");

  return new Response(bytes, {
    headers: {
      ...CORS,
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Seguimiento-' + safe + '.pdf"',
      "Cache-Control": "no-store",
    },
  });
});
