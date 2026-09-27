/* worker.js — 어케가지 "인스타에서 장소 찾기" 중계 서버 (Cloudflare Worker)
 *
 * 브라우저 → (사진 base64 + 캡션) → 이 Worker → Claude API → 장소 JSON → 브라우저
 * POST /name {q, region} → {queries:[…]} : 한글 장소명을 OSM 검색용 영문/현지어 이름으로 바꾼다.
 * Claude API 키는 Worker 비밀 변수(ANTHROPIC_API_KEY)에만 둔다.
 *
 * 환경 변수 (Cloudflare 대시보드 → Worker → Settings → Variables and Secrets)
 *   ANTHROPIC_API_KEY  (Secret, 필수)  Claude API 키
 *   ALLOWED_ORIGINS    (선택)  허용 사이트, 쉼표 구분. 기본: https://nj1099.github.io
 *   MODEL              (선택)  기본: claude-sonnet-5
 */
const MAX_IMAGES = 10;
const MAX_IMAGE_B64 = 4 * 1024 * 1024;      // 사진 1장 최대 ~3MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const SYSTEM = `너는 여행 인스타그램 게시물에서 장소를 뽑아내는 도우미야.
사진 속 간판·메뉴판·텍스트 오버레이·지도 캡처, 캡션의 번호 목록과 해시태그, 위치 태그를 모두 참고해.
같은 장소가 여러 사진에 나오면 하나로 합치고, 게시물에 나온 순서를 지켜.
광고 문구나 계정 이름처럼 장소가 아닌 것은 빼.

JSON 배열만 출력해. 설명·마크다운 금지.
[{"name": "구글지도에서 검색될 이름 (영문 또는 현지어 공식명)",
  "name_ko": "한국어 이름 (게시물에 있으면, 없으면 빈 문자열)",
  "area": "도시/동네 (예: Bangkok Sukhumvit)",
  "category": "카페|식당|바|관광지|숙소|쇼핑|사원|해변|스파|기타 중 하나",
  "confidence": "high|medium|low"}]
장소가 하나도 없으면 [] 를 출력해.`;

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
    if (!env.ANTHROPIC_API_KEY) return json({ error: "Worker에 ANTHROPIC_API_KEY가 설정되지 않았어요" }, 500);

    let body;
    try { body = await req.json(); } catch { return json({ error: "요청 형식이 올바르지 않아요" }, 400); }

    // 장소 이름 → 지도 검색용 이름. 구글 검색이 막혀 OSM 으로 찾을 때 한글 이름("그랜드 센터 포인트 룸피니")은
    // 0건이라, 현지/영문 공식명으로 바꿔 돌려준다. 짧은 작업이라 작은 모델을 쓴다.
    if (new URL(req.url).pathname === "/name") return nameLookup(body, env, json);

    const images = (Array.isArray(body.images) ? body.images : [])
      .slice(0, MAX_IMAGES)
      .filter((i) => i && typeof i.data === "string" && i.data.length < MAX_IMAGE_B64 && IMAGE_TYPES.includes(i.type));
    const caption = String(body.caption || "").slice(0, 5000);
    if (!images.length && !caption.trim()) return json({ error: "사진이나 캡션이 필요해요" }, 400);

    const content = [];
    images.forEach((img, i) => {
      content.push({ type: "text", text: `[사진 ${i + 1}]` });
      content.push({ type: "image", source: { type: "base64", media_type: img.type, data: img.data } });
    });
    content.push({ type: "text", text: `캡션:\n${caption || "(없음)"}\n\n이 게시물에 소개된 장소를 JSON 배열로 알려줘.` });

    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: env.MODEL || "claude-sonnet-5",
          max_tokens: 3000,
          system: SYSTEM,
          messages: [{ role: "user", content }],
        }),
      });
    } catch {
      return json({ error: "Claude API에 연결하지 못했어요" }, 502);
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.log("anthropic error", r.status, detail.slice(0, 500));
      return json({ error: `분석 서버 오류 (${r.status})` }, 502);
    }

    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const m = text.replace(/```(?:json)?/g, "").match(/\[[\s\S]*\]/);
    let places = [];
    try { places = m ? JSON.parse(m[0]) : []; } catch { places = []; }

    const clean = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
    places = (Array.isArray(places) ? places : [])
      .map((p) => ({
        name: clean(p.name, 120),
        name_ko: clean(p.name_ko, 120),
        area: clean(p.area, 120),
        category: clean(p.category, 20),
        confidence: ["high", "medium", "low"].includes(p.confidence) ? p.confidence : "medium",
      }))
      .filter((p) => p.name || p.name_ko)
      .slice(0, 40);

    return json({ places });
  },
};

const NAME_SYSTEM = `너는 여행 장소 이름을 OpenStreetMap 검색어로 바꾸는 도우미야.
입력된 장소(한국어 음역·줄임말·오타일 수 있음)의 공식 명칭을 영문으로, 그리고 현지어가 로마자가 아니면 현지어로도 적어.
각 검색어 끝에 도시 이름(영문)을 붙여. 모르는 곳이면 추측한 표기를 쓰되 최대 3개까지만.
JSON 문자열 배열만 출력해. 예: ["Grande Centre Point Lumpini Bangkok", "แกรนด์ เซนเตอร์ พอยต์ ลุมพินี"]`;

async function nameLookup(body, env, json) {
  const q = String(body.q || "").trim().slice(0, 120);
  const region = String(body.region || "").trim().slice(0, 60);
  if (!q) return json({ queries: [] });
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env.NAME_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: NAME_SYSTEM,
        messages: [{ role: "user", content: `장소: ${q}${region ? `\n여행 지역: ${region}` : ""}` }],
      }),
    });
  } catch {
    return json({ error: "Claude API에 연결하지 못했어요" }, 502);
  }
  if (!r.ok) {
    console.log("anthropic error", r.status, (await r.text().catch(() => "")).slice(0, 300));
    return json({ error: `분석 서버 오류 (${r.status})` }, 502);
  }
  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const m = text.match(/\[[\s\S]*\]/);
  let arr = [];
  try { arr = m ? JSON.parse(m[0]) : []; } catch { arr = []; }
  const queries = (Array.isArray(arr) ? arr : [])
    .map((s) => String(s == null ? "" : s).trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 3);
  return json({ queries });
}
