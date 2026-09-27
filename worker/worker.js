/* worker.js — 어케가지 "인스타에서 장소 찾기" 중계 서버 (Cloudflare Worker)
 *
 * POST /      {images:[{type,data}], caption} → {places:[…], usage}
 *             게시물 사진(base64)·캡션에서 장소 목록을 뽑는다.
 * POST /name  {q, region} → {queries:[…]}
 *             한글 장소명을 OSM 검색용 영문/현지어 이름으로 바꾼다(구글 검색이 막혔을 때의 폴백).
 *
 * 기본은 Cloudflare Workers AI(바인딩 AI) — API 키가 필요 없고 하루 10,000 뉴런까지 무료다.
 *   사진은 한 장씩 따로 분석해 합친다(한 요청에 여러 장을 넣으면 작은 모델이 뒤쪽 사진을 건너뛴다).
 * 선택: PROVIDER="claude" + 시크릿 ANTHROPIC_API_KEY 면 Claude 로 돈다(유료 등급용으로 남겨 둔 경로).
 *
 * 환경 변수 (wrangler.toml [vars] / 시크릿)
 *   ALLOWED_ORIGINS  허용 사이트, 쉼표 구분. 기본: https://nj1099.github.io
 *   PROVIDER         "workers-ai"(기본) | "claude"
 *   AI_MODEL         기본: @cf/meta/llama-4-scout-17b-16e-instruct (사진 인식 지원)
 *   ANTHROPIC_API_KEY · CLAUDE_MODEL   PROVIDER=claude 일 때만
 */
const MAX_IMAGES = 12;
const MAX_IMAGE_B64 = 4 * 1024 * 1024;      // 사진 1장 최대 ~3MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DEFAULT_AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

const PLACE_RULES = `너는 여행 인스타그램 게시물에서 장소를 뽑아내는 도우미야.
간판·메뉴판·텍스트 오버레이·지도 캡처·캡션의 번호 목록·해시태그·위치 태그를 참고해.
광고 문구, 계정 이름, 음식 이름, 설명 문장처럼 장소가 아닌 것은 빼. 보이는 순서를 지켜.
도시·동네·지역·거리 이름(예: 방콕, 실롬, 수쿰윗, 올드타운, 차이나타운)만 있는 것은 장소가 아니다 — 가게·명소처럼 찾아갈 수 있는 한 곳만 적어.
글자가 흐려서 확실하지 않으면 confidence 를 low 로 해.

JSON 배열만 출력해. 설명·마크다운 금지.
[{"name": "구글지도에서 검색될 이름 (영문 또는 현지어 공식명, 게시물에 영문 표기가 있으면 그대로)",
  "name_ko": "한국어 이름 (게시물에 있으면, 없으면 빈 문자열)",
  "address": "게시물에 적힌 주소 (없으면 빈 문자열)",
  "area": "도시/동네 영문 (예: Bangkok Silom)",
  "category": "카페|식당|바|관광지|숙소|쇼핑|사원|해변|스파|기타 중 하나",
  "confidence": "high|medium|low"}]
장소가 하나도 없으면 [] 를 출력해.`;

const NAME_SYSTEM = `너는 여행 장소 이름을 OpenStreetMap 검색어로 바꾸는 도우미야.
입력된 장소(한국어 음역·줄임말·오타일 수 있음)의 공식 명칭을 영문으로, 그리고 현지어가 로마자가 아니면 현지어로도 적어.
각 검색어 끝에 도시 이름(영문)을 붙여. 모르는 곳이면 추측한 표기를 쓰되 최대 3개까지만.
JSON 문자열 배열만 출력해. 예: ["Grande Centre Point Lumpini Bangkok", "แกรนด์ เซนเตอร์ พอยต์ ลุมพินี"]`;

export default {
  async fetch(req, env) {
    const allowed = (env.ALLOWED_ORIGINS || "https://nj1099.github.io").split(",").map((s) => s.trim());
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "POST만 지원해요" }, 405);
    if (!allowed.includes(origin)) return json({ error: "허용되지 않은 사이트예요" }, 403);

    const provider = providerOf(env);
    if (provider === "claude" && !env.ANTHROPIC_API_KEY) return json({ error: "Worker에 ANTHROPIC_API_KEY가 설정되지 않았어요" }, 500);
    if (provider === "workers-ai" && !env.AI) return json({ error: "Worker에 AI 바인딩이 없어요(wrangler.toml [ai])" }, 500);

    let body;
    try { body = await req.json(); } catch { return json({ error: "요청 형식이 올바르지 않아요" }, 400); }

    try {
      const path = new URL(req.url).pathname;
      if (path === "/name") return json(await nameLookup(body, env));
      if (path === "/link") return json(await analyzeLink(body, env));
      return json(await analyzePost(body, env));
    } catch (e) {
      console.log("analyze error", String((e && e.stack) || e).slice(0, 500));
      return json({ error: e.userMessage || "분석 서버 오류" }, e.status || 502);
    }
  },
};

function providerOf(env) { return (env.PROVIDER || "workers-ai") === "claude" ? "claude" : "workers-ai"; }
function fail(msg, status) { const e = new Error(msg); e.userMessage = msg; e.status = status; return e; }

/* ── 모델 호출 한 벌 ──
 * parts: [{type:"text", text} | {type:"image", mediaType, data}] → 응답 텍스트 + 토큰 수 */
async function callModel(env, system, parts, maxTokens) {
  if (providerOf(env) === "claude") {
    const content = parts.map((p) => p.type === "image"
      ? { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } }
      : { type: "text", text: p.text });
    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: env.CLAUDE_MODEL || "claude-sonnet-5", max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
      });
    } catch { throw fail("Claude API에 연결하지 못했어요", 502); }
    if (!r.ok) {
      console.log("anthropic error", r.status, (await r.text().catch(() => "")).slice(0, 300));
      throw fail(`분석 서버 오류 (${r.status})`, 502);
    }
    const d = await r.json();
    return {
      text: (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n"),
      tokens: ((d.usage && d.usage.input_tokens) || 0) + ((d.usage && d.usage.output_tokens) || 0),
    };
  }
  // Workers AI — OpenAI 형식 content 배열(이미지는 data URI)
  const content = parts.map((p) => p.type === "image"
    ? { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } }
    : { type: "text", text: p.text });
  let out;
  try {
    out = await env.AI.run(env.AI_MODEL || DEFAULT_AI_MODEL, {
      messages: [{ role: "system", content: system }, { role: "user", content }],
      max_tokens: maxTokens,
      temperature: 0.1,
    });
  } catch (e) {
    const msg = String((e && e.message) || e);
    console.log("workers-ai error", msg.slice(0, 300));
    // 하루 무료 한도 소진(유료 플랜이 아니면 더 못 쓴다)
    if (/429|limit|quota|neuron/i.test(msg)) throw fail("오늘 무료 분석 한도를 다 썼어요. 내일 다시 시도해 주세요", 429);
    throw fail("분석 서버 오류 (Workers AI)", 502);
  }
  const resp = out && out.response;
  const text = typeof resp === "string" ? resp : JSON.stringify(resp == null ? "" : resp);
  const u = (out && out.usage) || {};
  return { text, tokens: (u.prompt_tokens || 0) + (u.completion_tokens || 0) };
}

// 모델 답에서 JSON 배열을 꺼낸다(코드펜스·앞뒤 설명·{places:[…]} 모양 모두 허용)
function parseArray(text) {
  const t = String(text || "").replace(/```(?:json)?/g, "");
  const m = t.match(/\[[\s\S]*\]/);
  if (m) { try { const v = JSON.parse(m[0]); if (Array.isArray(v)) return v; } catch {} }
  // 배열이 깨졌으면(끝 잘림·쉼표 누락 등) 항목 { … } 을 하나씩 살린다
  // (실측: 사진 한 장의 4곳이 통째로 사라진 적이 있다)
  const out = [];
  for (const b of t.match(/\{[^{}]*\}/g) || []) { try { out.push(JSON.parse(b)); } catch {} }
  return out;
}

const clean = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
function normPlace(p) {
  if (!p || typeof p !== "object") return null;
  const out = {
    name: clean(p.name, 120),
    name_ko: clean(p.name_ko, 120),
    address: clean(p.address, 160),
    area: clean(p.area, 120),
    category: clean(p.category, 20),
    confidence: ["high", "medium", "low"].includes(p.confidence) ? p.confidence : "medium",
  };
  return (out.name || out.name_ko) ? out : null;
}
// 같은 곳이 여러 사진·캡션에 나오면 하나로(영문/한글 이름 어느 쪽이든 겹치면 같은 곳)
function keyOf(s) { return String(s || "").toLowerCase().replace(/[^0-9a-z฀-๿가-힣぀-ヿ一-鿿]/g, ""); }
function mergePlaces(lists) {
  const out = [], seen = new Set();
  for (const list of lists) for (const raw of list) {
    const p = normPlace(raw);
    if (!p) continue;
    const keys = [keyOf(p.name), keyOf(p.name_ko)].filter((k) => k.length >= 2);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    out.push(p);
  }
  return out.slice(0, 60);
}

async function analyzePost(body, env) {
  const images = (Array.isArray(body.images) ? body.images : [])
    .slice(0, MAX_IMAGES)
    .filter((i) => i && typeof i.data === "string" && i.data.length < MAX_IMAGE_B64 && IMAGE_TYPES.includes(i.type));
  const caption = String(body.caption || "").slice(0, 5000).trim();
  if (!images.length && !caption) throw fail("사진이나 캡션이 필요해요", 400);

  const hint = caption ? `\n\n참고용 게시물 캡션(장소 이름은 사진에서 읽을 것):\n${caption.slice(0, 1500)}` : "";
  // 사진은 한 장씩 병렬로 — 작은 모델에 여러 장을 한 번에 주면 뒤쪽 사진을 통째로 건너뛴다
  const askImage = (img, i) => callModel(env, PLACE_RULES, [
    { type: "image", mediaType: img.type, data: img.data },
    // "[사진 2/10]" 처럼 번호를 붙이면 작은 모델이 "사진 속 2번째 장소"로 읽어 한 곳만 답한다(실측 4곳 → 1곳)
    // 격자형 카드(2×2 등)는 아래 줄을 자주 빠뜨린다 → 훑는 순서를 못 박는다
    { type: "text", text: `이 사진 한 장에 소개된 장소를 하나도 빠짐없이 전부 JSON 배열로 알려줘. 여러 칸으로 나뉜 사진이면 맨 위 줄부터 맨 아래 줄까지, 각 줄은 왼쪽에서 오른쪽으로 모든 칸을 확인해. 이름 옆에 깨진 글자(□ 등)가 있어도 읽을 수 있는 부분으로 적어.${hint}` },
  ], 1500);
  // 답이 비거나 깨지면 한 번만 다시 묻는다(같은 사진이 다음엔 멀쩡히 나온다 — 실측)
  const jobs = images.map((img, i) => askImage(img, i)
    .then((r) => parseArray(r.text).length ? r : askImage(img, i).then((r2) => ({ text: r2.text, tokens: r.tokens + r2.tokens })))
    .catch((e) => { if (e.status === 429) throw e; return { text: "[]", tokens: 0, failed: true }; }));
  if (caption) {
    jobs.push(callModel(env, PLACE_RULES, [
      { type: "text", text: `캡션:\n${caption}\n\n이 캡션에 이름이 적힌 장소만 JSON 배열로 알려줘. 이름이 없으면 [].` },
    ], 1500).catch((e) => { if (e.status === 429) throw e; return { text: "[]", tokens: 0, failed: true }; }));
  }
  const res = await Promise.all(jobs);
  const failed = res.filter((r) => r.failed).length;
  if (failed === res.length) throw fail("분석에 실패했어요. 잠시 뒤 다시 시도해 주세요", 502);
  const lists = res.map((r) => parseArray(r.text));
  if (caption && images.length) {
    // 캡션 쪽은 "실롬·수쿰윗" 같은 동네 이름을 장소로 내놓는 일이 잦다(실측 9건) —
    // 주소 없이 이름만 있고, 그 이름이 캡션의 나열(·,/) 안에 있거나 사진에서 찾은 곳들의 area 에 들어 있으면 버린다
    const areaWords = new Set(lists.slice(0, images.length).flat().map((p) => keyOf(p && p.area)).filter(Boolean));
    // "아속·통로·아리 등" — 끝의 "등/같은" 을 떼고 비교
    const listed = new Set(caption.split(/[·,\/|\n.]/).map((w) => keyOf(w.replace(/\s*(등|같은|etc).*$/i, ""))).filter((k) => k.length >= 2));
    lists[lists.length - 1] = lists[lists.length - 1].filter((p) => {
      if (!p || (p.address && String(p.address).trim())) return true;
      const k = keyOf(p.name_ko || p.name), k2 = keyOf(p.name);
      if (listed.has(k) || listed.has(k2)) return false;
      for (const a of areaWords) if ((k && a.includes(k)) || (k2 && a.includes(k2))) return false;
      return true;
    });
  }
  const places = mergePlaces(lists);
  return { places, usage: { provider: providerOf(env), calls: res.length, failed, perCall: lists.map((l) => l.length), tokens: res.reduce((a, r) => a + (r.tokens || 0), 0) } };
}

/* ── 인스타 링크 → 캡션 + 표지 사진 ──
 * 로그인 없이 서버가 받을 수 있는 건 크롤러용 og 태그(캡션·첫 사진)뿐이다.
 * 넘겨 보는 나머지 사진은 로그인 벽 뒤라 못 받는다(2026-09-27 실측 — 응답에 표지 1장만 있다).
 * 그래서 결과에 imagesFromLink 를 실어 화면이 "여러 장이면 캡처를 올려 달라"고 안내하게 한다. */
function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function metaContent(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, "i"));
  return m ? decodeEntities(m[1]) : "";
}
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function analyzeLink(body, env) {
  let u;
  try { u = new URL(String(body.url || "").trim()); } catch { throw fail("인스타 게시물 링크가 아니에요", 400); }
  // 인스타 게시물 주소만 연다(다른 주소를 서버가 대신 열어 주지 않도록)
  const m = u.hostname.replace(/^www\./, "") === "instagram.com" && u.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
  if (!m) throw fail("인스타 게시물 링크가 아니에요 (instagram.com/p/… 형식)", 400);
  const clean = `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`;

  let html = "";
  try {
    const r = await fetch(clean, { headers: { "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "Accept-Language": "ko,en;q=0.8" } });
    if (r.ok) html = await r.text();
  } catch {}
  // og:description = '1,240 likes, 22 comments - 계정 on 날짜: "캡션"' → 따옴표 안만
  const desc = metaContent(html, "og:description") || metaContent(html, "og:title");
  const cap = (desc.match(/:\s*"([\s\S]*)"\s*\.?\s*$/) || [null, desc])[1].trim();
  const cover = metaContent(html, "og:image");
  if (!cap && !cover) throw fail("게시물을 읽지 못했어요(비공개이거나 인스타가 막았어요). 사진을 캡처해서 올려 주세요", 502);

  const images = [];
  if (cover && /^https:\/\/[\w.-]+\.(cdninstagram\.com|fbcdn\.net)\//.test(cover)) {
    try {
      const ir = await fetch(cover);
      const type = (ir.headers.get("content-type") || "image/jpeg").split(";")[0];
      if (ir.ok && IMAGE_TYPES.includes(type)) {
        const buf = await ir.arrayBuffer();
        if (buf.byteLength < 3 * 1024 * 1024) images.push({ type, data: toBase64(buf) });
      }
    } catch {}
  }
  const out = await analyzePost({ images, caption: cap }, env);
  out.link = { url: clean, caption: cap.slice(0, 500), imagesFromLink: images.length };
  return out;
}

async function nameLookup(body, env) {
  const q = String(body.q || "").trim().slice(0, 120);
  const region = String(body.region || "").trim().slice(0, 60);
  if (!q) return { queries: [] };
  const r = await callModel(env, NAME_SYSTEM, [{ type: "text", text: `장소: ${q}${region ? `\n여행 지역: ${region}` : ""}` }], 200);
  const queries = parseArray(r.text)
    .map((s) => String(s == null ? "" : s).trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 3);
  return { queries };
}
