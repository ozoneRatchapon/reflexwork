// ReflexWork — Team Integration Adapter (drop-in stub)
// ----------------------------------------------------------------------------
// WHAT THIS IS
//   The place where ReflexWork's LLM path forwards a question to ANOTHER
//   team's backend instead of (or before) our own Gemini proxy. ReflexWork is
//   a SCREENING LAYER that sits in front of a team's chatbot/LLM — the kernel
//   decides FastPath vs LLM, so the expensive upstream is only called for the
//   ~20% of questions that genuinely need it.
//
//       LINE user ─▶ kernel.route ─┬─ FastPath ─▶ answer from KB      (0 token)
//                                  └─ LLM path ─▶ askTeam(...) ──────┐
//                                                                    ▼
//                                          the OTHER TEAM's API (gradmahidol-ai)
//                                          or our Gemini proxy, selected by env
//
// HOW TO PLUG IN THE OTHER TEAM'S API (the only edits a real deploy needs)
//   1. Set these Worker secrets / env vars on the line-worker:
//        TEAM_API_PROVIDER   = "gradmahidol" | "gemini" | "echo"   (default gemini)
//        TEAM_API_URL        = https://<their-endpoint>/ask        (their chat/answer route)
//        TEAM_API_KEY        = <bearer token they issue us>        (optional)
//   2. In worker.mjs, replace the body of answerLLM() with:
//        import { askTeam } from '../_shared/team-adapter.mjs';
//        const r = await askTeam(text, env);          // {text, ok, source}
//   3. Confirm the request/response MAPPING below matches their contract.
//      Only `toRequest` and `fromResponse` for the gradmahidol provider should
//      ever need touching — everything else is transport + graceful-degrade.
//
// This is a STUB: it is runnable today (echo + gemini providers work), and the
// gradmahidol provider is wired end-to-end except for the two mapping functions
// a real contract pins down. Nothing here calls a paid model unless configured.
// ----------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 8000; // LINE replyToken is valid ~1 min; we already
                                 // ack 200 before this runs, so budget is loose.

// ---- provider registry ------------------------------------------------------
// Each provider maps our neutral { input } to the upstream's request body, and
// the upstream's response back to a plain answer string. Add a team by adding
// one entry — the transport (askTeam) never changes.
const PROVIDERS = {
  // The other team's grad-school assistant (github.com/narakorn709/gradmahidol-ai).
  // Shapes below are a BEST-GUESS stub — confirm against their real API docs and
  // adjust ONLY these two functions.
  gradmahidol: {
    needsUrl: true,
    toRequest: (input) => ({
      // ⬇️ map to THEIR expected request body
      message: input,
      lang: 'th',
      source: 'reflexwork-kernel',
    }),
    fromResponse: (data) => {
      // ⬇️ map THEIR response to a plain answer string
      // tolerate several common field names so a minor contract diff still works
      return (
        data?.answer ??
        data?.reply ??
        data?.text ??
        data?.message ??
        data?.choices?.[0]?.message?.content ??
        null
      );
    },
  },

  // Our own Gemini proxy (current production default).
  gemini: {
    needsUrl: false,
    url: (env) => `${env.LLM_PROXY || 'https://reflexwork-llm-proxy.solana-thailand.workers.dev'}/llm`,
    headers: () => ({ Origin: 'https://reflexwork.pages.dev' }),
    toRequest: (input) => ({ input }),
    fromResponse: (data) => data?.answer ?? null,
  },

  // No-network fallback for local demos / tests. Never calls anything.
  echo: {
    needsUrl: false,
    local: true,
    answer: (input) => `(echo) คำถามนี้ถูกส่งต่อให้ AI ของทีม: "${input}"`,
  },
};

// An upstream answer that MEANS "unavailable" even though HTTP was 200 — the
// Gemini proxy returns such a placeholder on quota/429. Caller shows a graceful
// FastPath redirect when ok=false.
const UNAVAILABLE_MARKER = /ตอบไม่ได้|ไม่พร้อม|unavailable|quota/i;

/**
 * Ask the configured team backend. Resolves the provider from env, maps the
 * request/response, enforces a timeout, and NEVER throws — a failure degrades
 * to { ok:false } so the LINE flow can fall back to the KB.
 *
 * @param {string} input  the user's question (already kernel-routed to LLM)
 * @param {object} env    Worker env / process.env-like bag
 * @returns {Promise<{text: string|null, ok: boolean, source: string}>}
 */
export async function askTeam(input, env = {}) {
  const name = (env.TEAM_API_PROVIDER || 'gemini').toLowerCase();
  const p = PROVIDERS[name] || PROVIDERS.gemini;
  const source = PROVIDERS[name] ? name : `gemini(fallback:${name})`;

  // Local provider — no network.
  if (p.local) return { text: p.answer(input), ok: true, source };

  // Resolve the endpoint URL.
  const url = p.needsUrl ? env.TEAM_API_URL : p.url(env);
  if (!url) {
    // Misconfigured: provider needs a URL but none set. Degrade, don't crash.
    return { text: null, ok: false, source: `${source}(no-url)` };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(env.TEAM_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json', ...(p.headers?.(env) || {}) };
    if (env.TEAM_API_KEY) headers.Authorization = `Bearer ${env.TEAM_API_KEY}`;

    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(p.toRequest(input)),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    const text = p.fromResponse(data);
    const ok = Boolean(r.ok && text && !UNAVAILABLE_MARKER.test(text));
    return { text: ok ? text : null, ok, source };
  } catch {
    // network error, timeout/abort, or bad JSON → unavailable
    return { text: null, ok: false, source: `${source}(error)` };
  } finally {
    clearTimeout(timer);
  }
}

// Re-exported for tests / introspection in a demo.
export const _providers = Object.keys(PROVIDERS);
