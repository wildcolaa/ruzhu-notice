// ============================================================
// 《住进来的第三天》AI 中转（Cloudflare Worker）
// 游戏 → 本 Worker → Groq。Groq Key 只存在 Cloudflare 的加密变量 GROQ_API_KEY 里，
// 网页和仓库里都没有 Key。
//
// 防滥用：
//   1. 只接受 ALLOWED_ORIGINS 里的网站调用（浏览器的 Origin 头）
//   2. 只转发 chat/completions，模型限定在 MODELS 里
//   3. 限制消息条数、长度和 max_tokens
//   4. 按 IP 限速（每分钟 RATE_PER_MIN 次）
// Origin 头可以被脚本伪造，所以这只能挡住「直接拿你的地址去用」的普通滥用；
// 额度最终仍受 Groq 免费层限制，不会产生费用。
// ============================================================

const ALLOWED_ORIGINS = [
  'https://wildcolaa.github.io',
  'https://raw.githack.com',
  // 本地测试：python3 -m http.server 打开 index.html 时
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];
const MODELS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
const DEFAULT_MODEL = MODELS[0];
const MAX_MESSAGES = 16;
const MAX_CHARS = 6000;        // 所有消息加起来的字符数
const MAX_TOKENS = 300;
const RATE_PER_MIN = 30;       // 每个 IP 每分钟最多请求数（一句对话通常 1–2 次）

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// 同一个 Worker 实例里的简单计数；Cloudflare 有多个实例时是「每个实例」的限速，已足够挡住刷接口
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const win = Math.floor(now / 60000);
  const h = hits.get(ip);
  if (!h || h.win !== win) { hits.set(ip, { win, n: 1 }); if (hits.size > 5000) hits.clear(); return false; }
  h.n++;
  return h.n > RATE_PER_MIN;
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function json(status, obj, headers) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers) });
}
const fail = (status, message, headers) => json(status, { error: { message } }, headers);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const h = allowed ? cors(origin) : {};

    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: h });
    if (request.method === 'GET') return json(200, { ok: true, service: 'ruzhu-ai-relay' }, h);
    if (request.method !== 'POST') return fail(405, 'Method not allowed', h);
    if (!allowed) return fail(403, 'Origin not allowed', h);
    if (!env.GROQ_API_KEY) return fail(500, 'Relay is missing GROQ_API_KEY', h);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) return fail(429, 'Too many requests', Object.assign({ 'Retry-After': '20' }, h));

    let body;
    try { body = await request.json(); } catch (e) { return fail(400, 'Invalid JSON', h); }
    const msgs = Array.isArray(body.messages) ? body.messages : null;
    if (!msgs || !msgs.length || msgs.length > MAX_MESSAGES) return fail(400, 'Bad messages', h);
    let chars = 0;
    for (const m of msgs) {
      if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return fail(400, 'Bad message', h);
      chars += m.content.length;
    }
    if (chars > MAX_CHARS) return fail(413, 'Messages too long', h);

    // 只挑出允许的字段，其余丢掉
    const model = MODELS.includes(body.model) ? body.model : DEFAULT_MODEL;
    const out = {
      model,
      messages: msgs.map(m => ({ role: m.role, content: m.content })),
      temperature: Math.max(0, Math.min(1.2, Number(body.temperature) || 0.7)),
      max_tokens: Math.max(1, Math.min(MAX_TOKENS, parseInt(body.max_tokens, 10) || 220)),
    };
    if (/qwen/.test(model)) out.reasoning_effort = 'none';
    else if (/gpt-oss/.test(model)) out.reasoning_effort = 'low';
    if (body.response_format && body.response_format.type === 'json_object') out.response_format = { type: 'json_object' };

    let r;
    try {
      r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.GROQ_API_KEY },
        body: JSON.stringify(out),
      });
    } catch (e) {
      return fail(502, 'Upstream unreachable', h);
    }
    const extra = {};
    const ra = r.headers.get('retry-after'); if (ra) extra['Retry-After'] = ra;
    // 不把 Groq 的原始错误（可能含账户信息）原样返回
    if (!r.ok) return fail(r.status === 429 ? 429 : 502, r.status === 429 ? 'Free quota exhausted, retry later' : 'Upstream error ' + r.status, Object.assign(extra, h));
    const d = await r.json();
    const content = d && d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
    return json(200, { choices: [{ message: { role: 'assistant', content } }] }, Object.assign(extra, h));
  },
};
