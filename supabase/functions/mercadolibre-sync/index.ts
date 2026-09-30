import { createClient } from "npm:@supabase/supabase-js@2";

const ADMIN_EMAIL = "sancristobalpabloignacio@gmail.com";
const SITE_URL = "https://san-cristobal-car-house-sancristobalpabloignacio-8057.vercel.app";
const CALLBACK_URL = "https://hljeiqgrumtlukdvaspz.supabase.co/functions/v1/mercadolibre-sync/callback";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

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

function normalizeMlId(value: string | null | undefined) {
  const s = String(value || "").toUpperCase();
  const m = s.match(/MLA[-_ ]?(\d{6,})/);
  return m ? "MLA" + m[1] : "";
}

function base64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function randomVerifier() {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

async function tokenRequest(params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const r = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || data?.error || "Mercado Libre rechazó el token");
  return data;
}

async function mlGet(url: string, accessToken: string) {
  const r = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || data?.error || ("HTTP " + r.status));
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const { publishable, secret } = getKeys();
  const admin = createClient(supabaseUrl, secret);

  const url = new URL(req.url);

  // Mercado Libre redirects the browser here. Authentication is validated by the
  // one-time random OAuth state stored server-side.
  if (req.method === "GET" && url.pathname.endsWith("/callback")) {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return Response.redirect(SITE_URL + "/analytics?ml=error&reason=missing_code", 302);
    }

    const { data: conn, error } = await admin
      .from("mercadolibre_connection")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error || !conn || !conn.oauth_state || conn.oauth_state !== state) {
      return Response.redirect(SITE_URL + "/analytics?ml=error&reason=invalid_state", 302);
    }

    try {
      const tokenParams: Record<string, string> = {
        grant_type: "authorization_code",
        client_id: conn.client_id,
        client_secret: conn.client_secret,
        code,
        redirect_uri: CALLBACK_URL,
      };
      if (conn.oauth_code_verifier) tokenParams.code_verifier = conn.oauth_code_verifier;
      const tok = await tokenRequest(tokenParams);

      const expiresAt = new Date(Date.now() + Number(tok.expires_in || 0) * 1000).toISOString();
      await admin.from("mercadolibre_connection").upsert({
        id: 1,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        ml_user_id: tok.user_id,
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        oauth_state: null,
        oauth_code_verifier: null,
        redirect_uri: CALLBACK_URL,
        updated_at: new Date().toISOString(),
      });

      return Response.redirect(SITE_URL + "/analytics?ml=connected", 302);
    } catch (e) {
      return Response.redirect(SITE_URL + "/analytics?ml=error&reason=" + encodeURIComponent(String(e?.message || e)), 302);
    }
  }

  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // All admin actions require a valid Supabase user session and exact admin email.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "No autorizado" }, 401);

  const userClient = createClient(supabaseUrl, publishable, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.slice(7);
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user || user.email !== ADMIN_EMAIL) return json({ error: "No autorizado" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "status") {
    const { data: conn } = await admin
      .from("mercadolibre_connection")
      .select("client_id, ml_user_id, token_expires_at, connected_at, last_sync_at, redirect_uri")
      .eq("id", 1)
      .maybeSingle();

    return json({
      configured: !!conn?.client_id,
      connected: !!conn?.ml_user_id,
      user_id: conn?.ml_user_id || null,
      token_expires_at: conn?.token_expires_at || null,
      connected_at: conn?.connected_at || null,
      last_sync_at: conn?.last_sync_at || null,
      redirect_uri: CALLBACK_URL,
    });
  }

  if (action === "configure") {
    const clientId = String(body.client_id || "").trim();
    const clientSecret = String(body.client_secret || "").trim();
    if (!clientId || !clientSecret) return json({ error: "Faltan App ID o Secret Key" }, 400);

    const { error } = await admin.from("mercadolibre_connection").upsert({
      id: 1,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: CALLBACK_URL,
      access_token: null,
      refresh_token: null,
      ml_user_id: null,
      token_expires_at: null,
      connected_at: null,
      oauth_state: null,
      oauth_code_verifier: null,
      updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, redirect_uri: CALLBACK_URL });
  }

  if (action === "authorize") {
    const { data: conn } = await admin
      .from("mercadolibre_connection")
      .select("client_id, client_secret")
      .eq("id", 1)
      .maybeSingle();

    if (!conn?.client_id || !conn?.client_secret) return json({ error: "Primero guardá las credenciales de la app" }, 400);

    const state = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const verifier = randomVerifier();
    const challenge = await pkceChallenge(verifier);
    await admin.from("mercadolibre_connection").update({
      oauth_state: state,
      oauth_code_verifier: verifier,
      redirect_uri: CALLBACK_URL,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);

    const authUrl = new URL("https://auth.mercadolibre.com.ar/authorization");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", conn.client_id);
    authUrl.searchParams.set("redirect_uri", CALLBACK_URL);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    return json({ auth_url: authUrl.toString() });
  }

  if (action === "sync") {
    let { data: conn } = await admin.from("mercadolibre_connection").select("*").eq("id", 1).maybeSingle();
    if (!conn?.access_token || !conn?.refresh_token || !conn?.client_id || !conn?.client_secret) {
      return json({ error: "Mercado Libre todavía no está conectado" }, 400);
    }

    // Refresh shortly before expiry. Mercado Libre rotates refresh tokens, so always store the new one.
    const exp = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
    if (!exp || exp < Date.now() + 5 * 60 * 1000) {
      try {
        const tok = await tokenRequest({
          grant_type: "refresh_token",
          client_id: conn.client_id,
          client_secret: conn.client_secret,
          refresh_token: conn.refresh_token,
        });
        const expiresAt = new Date(Date.now() + Number(tok.expires_in || 0) * 1000).toISOString();
        const next = {
          access_token: tok.access_token,
          refresh_token: tok.refresh_token || conn.refresh_token,
          ml_user_id: tok.user_id || conn.ml_user_id,
          token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        };
        await admin.from("mercadolibre_connection").update(next).eq("id", 1);
        conn = { ...conn, ...next };
      } catch (e) {
        return json({ error: "No se pudo renovar la autorización de Mercado Libre: " + String(e?.message || e), reconnect: true }, 401);
      }
    }

    const { data: listings, error: listErr } = await admin
      .from("external_listings")
      .select("id, external_id, listing_url, vehicle_id, title")
      .eq("channel", "mercadolibre")
      .eq("active", true);

    if (listErr) return json({ error: listErr.message }, 500);
    if (!listings?.length) {
      await admin.from("mercadolibre_connection").update({ last_sync_at: new Date().toISOString() }).eq("id", 1);
      return json({ ok: true, synced_listings: 0, message: "No hay publicaciones de Mercado Libre vinculadas todavía." });
    }

    let synced = 0;
    const warnings: string[] = [];

    for (const listing of listings) {
      let itemId = normalizeMlId(listing.external_id) || normalizeMlId(listing.listing_url);
      if (!itemId) {
        warnings.push((listing.title || "Publicación") + ": no pude detectar el ID MLA.");
        continue;
      }

      if (itemId !== listing.external_id) {
        await admin.from("external_listings").update({ external_id: itemId, updated_at: new Date().toISOString() }).eq("id", listing.id);
      }

      const endpoints = {
        visits: "https://api.mercadolibre.com/items/" + itemId + "/visits/time_window?last=30&unit=day",
        questions: "https://api.mercadolibre.com/items/" + itemId + "/contacts/questions/time_window?last=30&unit=day",
        phone: "https://api.mercadolibre.com/items/" + itemId + "/contacts/phone_views/time_window?last=30&unit=day",
        whatsapp: "https://api.mercadolibre.com/items/" + itemId + "/contacts/whatsapp/time_window?last=30&unit=day",
      };

      const daily = new Map<string, { views: number; clicks: number; inquiries: number }>();
      const ensure = (date: string) => {
        const day = date.slice(0, 10);
        if (!daily.has(day)) daily.set(day, { views: 0, clicks: 0, inquiries: 0 });
        return daily.get(day)!;
      };

      const results = await Promise.allSettled([
        mlGet(endpoints.visits, conn.access_token),
        mlGet(endpoints.questions, conn.access_token),
        mlGet(endpoints.phone, conn.access_token),
        mlGet(endpoints.whatsapp, conn.access_token),
      ]);

      if (results[0].status === "fulfilled") {
        for (const x of results[0].value?.results || []) ensure(String(x.date)).views += Number(x.total || 0);
      } else warnings.push(itemId + ": no pude leer visitas.");

      if (results[1].status === "fulfilled") {
        for (const x of results[1].value?.results || []) ensure(String(x.date)).inquiries += Number(x.total || 0);
      } else warnings.push(itemId + ": no pude leer preguntas.");

      if (results[2].status === "fulfilled") {
        for (const x of results[2].value?.results || []) ensure(String(x.date)).clicks += Number(x.total || 0);
      } else warnings.push(itemId + ": no pude leer clics en teléfono.");

      if (results[3].status === "fulfilled") {
        for (const x of results[3].value?.results || []) ensure(String(x.date)).clicks += Number(x.total || 0);
      } else warnings.push(itemId + ": no pude leer clics en WhatsApp.");

      const rows = [...daily.entries()].map(([metric_date, v]) => ({
        listing_id: listing.id,
        metric_date,
        views: v.views,
        clicks: v.clicks,
        inquiries: v.inquiries,
        favorites: 0,
        notes: "Sincronización automática Mercado Libre API",
      }));

      if (rows.length) {
        const { error: upErr } = await admin.from("external_metrics").upsert(rows, { onConflict: "listing_id,metric_date" });
        if (upErr) warnings.push(itemId + ": " + upErr.message);
        else synced++;
      } else {
        warnings.push(itemId + ": Mercado Libre no devolvió métricas para los últimos 30 días.");
      }
    }

    const now = new Date().toISOString();
    await admin.from("mercadolibre_connection").update({ last_sync_at: now, updated_at: now }).eq("id", 1);
    return json({ ok: true, synced_listings: synced, warnings, last_sync_at: now });
  }

  return json({ error: "Acción desconocida" }, 400);
});
