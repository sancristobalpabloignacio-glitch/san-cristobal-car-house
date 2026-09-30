import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function getSecretKey() {
  let secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    secret = keys.default || secret;
  } catch {}
  return secret;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "Método no permitido" }, 405);

  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: "Link inválido" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, getSecretKey());

  const { data: link, error: linkErr } = await admin
    .from("owner_tracking_links")
    .select("vehicle_id, active")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();

  if (linkErr || !link) return json({ error: "Este link ya no está disponible" }, 404);

  const { data: vehicle, error: vehicleErr } = await admin
    .from("vehicles")
    .select("id,brand,model,version,year,kilometers,price,currency,cover_image,images,status,published,created_at")
    .eq("id", link.vehicle_id)
    .maybeSingle();

  if (vehicleErr || !vehicle) return json({ error: "No se encontró el vehículo" }, 404);

  const vehicleId = vehicle.id;
  const countType = async (eventType: string) => {
    const { count } = await admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_id", vehicleId)
      .eq("event_type", eventType);
    return count || 0;
  };

  const [clicks, views, inquiries] = await Promise.all([
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

  const external: any[] = [];
  let externalViews = 0;
  let externalClicks = 0;
  let externalInquiries = 0;
  let externalFavorites = 0;

  for (const l of listings || []) {
    const { data: metric } = await admin
      .from("external_metrics")
      .select("metric_date,views,clicks,inquiries,favorites")
      .eq("listing_id", l.id)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = {
      channel: l.channel,
      metric_date: metric?.metric_date || null,
      views: metric?.views || 0,
      clicks: metric?.clicks || 0,
      inquiries: metric?.inquiries || 0,
      favorites: metric?.favorites || 0,
    };
    external.push(row);
    externalViews += row.views;
    externalClicks += row.clicks;
    externalInquiries += row.inquiries;
    externalFavorites += row.favorites;
  }

  return json({
    vehicle: {
      id: vehicle.id,
      brand: vehicle.brand,
      model: vehicle.model,
      version: vehicle.version,
      year: vehicle.year,
      kilometers: vehicle.kilometers,
      price: vehicle.price,
      currency: vehicle.currency,
      cover_image: vehicle.cover_image || vehicle.images?.[0] || null,
      status: vehicle.status,
      created_at: vehicle.created_at,
    },
    web: {
      clicks,
      views,
      inquiries,
      conversion: views ? inquiries / views : 0,
      daily: Object.values(daily),
    },
    external: {
      listings: external,
      totals: {
        views: externalViews,
        clicks: externalClicks,
        inquiries: externalInquiries,
        favorites: externalFavorites,
      },
    },
    combined: {
      views: views + externalViews,
      clicks: clicks + externalClicks,
      inquiries: inquiries + externalInquiries,
    },
    generated_at: new Date().toISOString(),
  });
});
