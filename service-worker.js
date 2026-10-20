// AEGIS Service Worker
// Architecture:  DETECTOR -> POLICY ENGINE -> LOGGER -> EXPORTER
//
//   DETECTOR     : PATTERNS, regexSanitize, checkSensitiveFiles
//   POLICY ENGINE: mode filter, riskLevel, requireConfirm
//   LOGGER       : storeSession, storeAuditEvent
//   EXPORTER     : handleGetStats (stats + GDPR evidence)

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if      (msg.type === "SANITIZE")        { call(handleSanitize,  msg, sendResponse); return true; }
  else if (msg.type === "REHYDRATE")       { call(handleRehydrate, msg, sendResponse); return true; }
  else if (msg.type === "TEST_CONNECTION") { call(handleTest,      msg, sendResponse); return true; }
  else if (msg.type === "GET_STATS")       { call(handleGetStats,  msg, sendResponse); return true; }
});

function call(fn, msg, sendResponse) {
  fn(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
}

async function getConfig() {
  return new Promise(resolve =>
    chrome.storage.sync.get(["aegisUrl", "aegisKey", "enabled", "aegisMode"], resolve)
  );
}

// Local session store (in-memory, instant access)
const _sessions = new Map(); // sessionId → entityMap

function storeSession(entityMap) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  _sessions.set(id, entityMap);
  setTimeout(() => _sessions.delete(id), 15 * 60 * 1000); // 15 min TTL
  return "local:" + id;
}

function loadSession(sessionToken) {
  if (!sessionToken?.startsWith("local:")) return null;
  return _sessions.get(sessionToken.slice(6)) ?? null;
}

// Direcciones postales: tipo de vía + nombre + número (+ piso/puerta y código postal), o "CP 28013".
// Heurística: exige nombre de vía con mayúsculas y número de 1 a 3 cifras para evitar falsos positivos.
const ADDR_STREET = "(?:calle|c\\/|cl\\.|avenida|avda\\.?|avd\\.?|av\\.|plaza|pza\\.?|pl\\.|paseo|pº|camino|carretera|ctra\\.?|travesía|travesia|trav\\.?|ronda|glorieta|bulevar|rúa)";
const ADDR_TOKEN = "\\p{L}[\\p{L}'’.\\-]*";
const ADDR_NUM = "(?:n[ºo°]\\.?\\s*|núm(?:ero)?\\.?\\s*|num(?:ero)?\\.?\\s*)?\\d{1,3}(?!\\d)";
const ADDR_QTY = "(?!\\s*(?:veces|vez|euros|eur|€|años|minutos|min|horas|días|dias|personas|km|metros|%))";
const ADDR_FLOOR = "(?:\\s*[,\\-]?\\s*(?:\\d{1,2}\\s?[ºª°]\\.?(?:\\s?[A-Za-z](?!\\p{L}))?|(?:bajo|entresuelo|ático|atico|izquierda|izq|derecha|dcha|dch)(?!\\p{L})\\.?))*";
const ADDR_ZIP = "(?:0[1-9]|[1-4]\\d|5[0-2])\\d{3}(?!\\d)";
const ADDR_RE =
  `(?:(?<![\\p{L}\\p{N}])${ADDR_STREET}\\s+${ADDR_TOKEN}(?:\\s+${ADDR_TOKEN}){0,4}?\\s*,?\\s*${ADDR_NUM}${ADDR_QTY}${ADDR_FLOOR}(?:\\s*,?\\s*${ADDR_ZIP})?` +
  `|(?<![\\p{L}\\p{N}])(?:c\\.?\\s?p\\.?|código\\s+postal)\\s*[:.]?\\s*${ADDR_ZIP})`;
const ADDR_CONNECTORS = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);

function validateAddress(s) {
  if (/^(?:c\.?\s?p|código)/i.test(s)) return true;
  const name = s.replace(/^\S+\s+/, "").split(/\d/)[0];
  const tokens = name.split(/[\s,]+/).filter(t => t && !/^(?:n[ºo°]\.?|núm\.?|num\.?|número|numero)$/i.test(t));
  let real = 0;
  for (const t of tokens) {
    if (ADDR_CONNECTORS.has(t)) continue;
    if (!/^\p{Lu}/u.test(t)) return false;
    real++;
  }
  return real > 0;
}

// Local regex detector - instant, no server needed
// cat: "pii" = datos personales / "secret" = credenciales y claves de API
const PATTERNS = [
  // PII
  { cat: "pii", type: "email_address", ph: "EMAIL_ADDRESS",
    why: "Dirección de correo electrónico",
    re: () => /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g },

  { cat: "pii", type: "iban", ph: "IBAN",
    why: "Número de cuenta bancaria internacional (IBAN)",
    re: () => /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4})+(?:\s?[A-Z0-9]{1,3})?\b/g,
    validate(s) {
      const c = s.replace(/\s/g, "").toUpperCase();
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(c)) return false;
      const r = (c.slice(4) + c.slice(0, 4)).split("").map(ch =>
        /[A-Z]/.test(ch) ? (ch.charCodeAt(0) - 55).toString() : ch
      ).join("");
      let rem = 0;
      for (const d of r) rem = (rem * 10 + +d) % 97;
      return rem === 1;
    },
  },

  { cat: "pii", type: "credit_card", ph: "CARD_NUMBER",
    why: "Número de tarjeta bancaria (validado con algoritmo Luhn)",
    re: () => /\b(?:\d[ \-]?){13,19}\b/g,
    validate(s) {
      const d = s.replace(/\D/g, "");
      if (d.length < 13 || d.length > 19) return false;
      let sum = 0, dbl = false;
      for (let i = d.length - 1; i >= 0; i--) {
        let v = +d[i]; if (dbl && (v = v * 2 - (v > 4 ? 9 : 0)), dbl = !dbl, sum += v);
      }
      return sum % 10 === 0;
    },
  },

  { cat: "pii", type: "phone_number", ph: "PHONE_NUMBER",
    why: "Número de teléfono",
    re: () => /(?<!\d)(\+?[\d][\d\s\-\(\)\.]{7,15}\d)(?!\d)/g },

  { cat: "pii", type: "dni_nie", ph: "DNI",
    why: "DNI o NIE español (letra de control válida)",
    re: () => /\b[XYZxyz]?\d{7,8}[TRWAGMYFPDXBNJZSQVHLCKE]\b/g,
    validate(s) {
      const L = "TRWAGMYFPDXBNJZSQVHLCKE";
      const c = s.toUpperCase().replace(/[\s-]/g, "");
      const m = c.match(/^([XYZ]?)(\d{7,8})([A-Z])$/);
      if (!m) return false;
      const prefix = m[1] === "X" ? "0" : m[1] === "Y" ? "1" : m[1] === "Z" ? "2" : "";
      return L[Number(prefix + m[2]) % 23] === m[3];
    },
  },

  { cat: "pii", type: "ipv4", ph: "IP_ADDRESS",
    why: "Dirección IPv4 pública (puede identificar al usuario)",
    re: () => /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    validate(s) {
      return !s.startsWith("127.") && !s.startsWith("192.168.") &&
             !/^10\./.test(s) && !/^172\.(1[6-9]|2\d|3[01])\./.test(s) &&
             s !== "0.0.0.0" && !s.startsWith("255.");
    },
  },

  { cat: "pii", type: "address", ph: "ADDRESS",
    why: "Dirección postal (calle y número, o código postal). Detección aproximada",
    re: () => new RegExp(ADDR_RE, "giu"),
    validate: validateAddress,
  },

  // Secrets & Credentials
  { cat: "secret", type: "jwt", ph: "JWT",
    why: "Token JWT — credenciales de sesión codificadas en Base64",
    re: () => /\beyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/g },

  { cat: "secret", type: "openai_key", ph: "OPENAI_KEY",
    why: "Clave de API de OpenAI",
    re: () => /\bsk-(?:proj-|[a-zA-Z0-9]{2,8}-)?[A-Za-z0-9]{40,}\b/g },

  { cat: "secret", type: "anthropic_key", ph: "ANTHROPIC_KEY",
    why: "Clave de API de Anthropic / Claude",
    re: () => /\bsk-ant-[A-Za-z0-9\-_]{20,}\b/g },

  { cat: "secret", type: "github_token", ph: "GITHUB_TOKEN",
    why: "Token de acceso personal de GitHub",
    re: () => /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },

  { cat: "secret", type: "aws_key", ph: "AWS_KEY",
    why: "Clave de acceso de AWS IAM",
    re: () => /\b(?:AKIA|AIPA|ASIA|AROA)[A-Z0-9]{16}\b/g },

  { cat: "secret", type: "google_api_key", ph: "GOOGLE_KEY",
    why: "Clave de API de Google Cloud",
    re: () => /\bAIza[A-Za-z0-9\-_]{35}\b/g },

  { cat: "secret", type: "stripe_key", ph: "STRIPE_KEY",
    why: "Clave de API de Stripe",
    re: () => /\b(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]{16,}\b/g },

  { cat: "secret", type: "private_key_header", ph: "PRIVATE_KEY",
    why: "Cabecera de clave privada RSA/EC/Ed25519",
    re: () => /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },

  { cat: "secret", type: "bearer_token", ph: "BEARER_TOKEN",
    why: "Token Bearer de autenticación HTTP",
    re: () => /\bBearer\s+([A-Za-z0-9\-_\.]{20,})/g },

  { cat: "secret", type: "password_in_code", ph: "PASSWORD",
    why: "Contraseña en código fuente o fichero de configuración",
    re: () => /(?:password|passwd|pwd|secret|db_pass)\s*[:=]\s*["']([^"'\s]{6,})["']/gi },

  { cat: "secret", type: "mongodb_uri", ph: "MONGODB_URI",
    why: "Cadena de conexión MongoDB con credenciales embebidas",
    re: () => /\bmongodb(?:\+srv)?:\/\/[^\s'"<>,\]]{8,}/g },

  { cat: "secret", type: "slack_token", ph: "SLACK_TOKEN",
    why: "Token de Slack (bot, usuario o app)",
    re: () => /\bxox[bpsa]-[0-9A-Za-z\-]{10,}/g },

  { cat: "secret", type: "google_oauth_secret", ph: "GOOGLE_OAUTH",
    why: "Client secret de OAuth de Google",
    re: () => /\bclient_secret\s*[:=]\s*["']?([A-Za-z0-9\-_]{20,})["']?/gi },
];

// Files that should never be pasted into AI prompts
const SENSITIVE_FILENAMES = [
  ".env", ".env.local", ".env.production", "credentials.json", "id_rsa",
  "id_ed25519", ".pem", ".pfx", ".p12", ".netrc", ".npmrc", "authorized_keys",
  "docker-compose.yml", "secrets.yml", "secrets.yaml", "config.yaml",
  "terraform.tfvars", "kubeconfig", ".aws/credentials",
];

function checkSensitiveFiles(text) {
  return SENSITIVE_FILENAMES.filter(f => text.toLowerCase().includes(f));
}

function regexSanitize(text, mode = "balanced") {
  // "safe" mode: only intercept credentials/secrets, not personal data
  // Secretos primero: una clave entera no debe trocearse como si fuera un teléfono o un email
  const secrets = PATTERNS.filter(p => p.cat === "secret");
  const activePatterns = mode === "safe"
    ? secrets
    : [...secrets, ...PATTERNS.filter(p => p.cat !== "secret")];

  const counters = {};
  const entityMap = {};
  const interceptions = [];
  let out = text;

  for (const { cat, type, ph, re, validate, why } of activePatterns) {
    const regex = re();
    const found = new Set();

    for (const m of [...out.matchAll(regex)]) {
      const val = m[0];
      if (found.has(val)) continue;
      if (validate && !validate(val)) continue;
      found.add(val);

      // Reuse placeholder if same value seen before
      const existing = Object.entries(entityMap).find(([, v]) => v === val);
      if (existing) continue;

      counters[ph] = (counters[ph] || 0) + 1;
      const placeholder = `[${ph}_${counters[ph]}]`;
      entityMap[placeholder] = val;
      interceptions.push({ cat: cat || "pii", type, ph, placeholder, count: 1, source: "regex", why: why || "" });
    }

    // Replace all found values for this pattern
    for (const [placeholder, val] of Object.entries(entityMap)) {
      if (placeholder.startsWith(`[${ph}_`)) {
        out = out.split(val).join(placeholder);
      }
    }
  }

  return { sanitizedText: out, entityMap, interceptions };
}

// Audit trail
function storeAuditEvent(interceptions, meta = {}) {
  const entry = {
    ts:        Date.now(),
    count:     interceptions.length,
    types:     [...new Set(interceptions.map(i => i.ph || (i.type || "").toUpperCase().split("_")[0]))],
    cats:      [...new Set(interceptions.map(i => i.cat || "pii"))],
    why:       interceptions.map(i => ({ ph: i.ph, why: i.why || "" })),
    riskLevel: meta.riskLevel || "medium",
    site:      meta.site || null,
  };
  chrome.storage.local.get(["auditLog"], ({ auditLog = [] }) => {
    chrome.storage.local.set({ auditLog: [entry, ...auditLog].slice(0, 500) }, updateExtensionBadge);
  });
}

// Extension icon badge - shows today's detection count
function updateExtensionBadge() {
  chrome.storage.local.get(["auditLog"], ({ auditLog = [] }) => {
    const dayAgo = Date.now() - 86_400_000;
    const n = auditLog.filter(e => e.ts > dayAgo).reduce((s, e) => s + e.count, 0);
    chrome.action.setBadgeText({ text: n > 0 ? String(n) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#2D7A4A" });
  });
}
chrome.runtime.onInstalled.addListener(updateExtensionBadge);
chrome.runtime.onStartup.addListener(updateExtensionBadge);

// Explain data - stores last detection for popup Explain View
const VALIDATED_PHS = new Set(["IBAN", "CARD_NUMBER", "DNI", "IP_ADDRESS"]);
const HEURISTIC_PHS = new Set(["ADDRESS"]);

function storeExplainData(interceptions, meta = {}) {
  chrome.storage.local.set({
    lastExplain: {
      ts:    Date.now(),
      site:  meta.site || null,
      items: interceptions.map(i => ({
        ph:          i.ph,
        cat:         i.cat,
        placeholder: i.placeholder,
        why:         i.why || i.ph,
        method:      "regex_local",
        confidence:  VALIDATED_PHS.has(i.ph) ? "100%" : HEURISTIC_PHS.has(i.ph) ? "aproximada" : "99%",
        action:      "anonimizado",
      })),
    },
  });
}

// SANITIZE handler
async function handleSanitize({ text, site }) {
  const { aegisUrl, aegisKey, aegisMode = "balanced" } = await getConfig();

  // Fast local path - regex only, instant response
  const local = regexSanitize(text, aegisMode);
  const sensitiveFiles = checkSensitiveFiles(text);

  if (local.interceptions.length > 0 || sensitiveFiles.length > 0) {
    const hasSecrets = local.interceptions.some(i => i.cat === "secret");
    if (local.interceptions.length > 0) {
      storeAuditEvent(local.interceptions, { riskLevel: hasSecrets ? "high" : "medium", site });
      storeExplainData(local.interceptions, { site });
    }
    return {
      sanitizedText:  local.sanitizedText,
      sessionToken:   storeSession(local.entityMap),
      entityMap:      local.entityMap,
      interceptions:  local.interceptions,
      sensitiveFiles,
      riskLevel:      hasSecrets ? "high" : "medium",
      requireConfirm: aegisMode === "strict" && local.interceptions.length > 0,
    };
  }

  // Slow path - call AEGIS server for LLM semantic detection (names, addresses, etc.)
  if (!aegisUrl || !aegisKey) {
    return { sanitizedText: text, interceptions: [], sessionToken: null, sensitiveFiles };
  }

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 3000); // 3-second hard cap so a slow server doesn't feel like bad wifi
  try {
    const res = await fetch(`${aegisUrl.replace(/\/$/, "")}/api/shield`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${aegisKey}` },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (e) {
    clearTimeout(tid);
    return { sanitizedText: text, interceptions: [], sessionToken: null, serverError: e.message };
  }
}

// REHYDRATE handler
async function handleRehydrate({ text, sessionToken }) {
  // Fast local path
  const entityMap = loadSession(sessionToken);
  if (entityMap) {
    let out = text;
    // Longest-first to avoid partial placeholder replacement
    const sorted = Object.entries(entityMap).sort((a, b) => b[0].length - a[0].length);
    for (const [ph, val] of sorted) out = out.split(ph).join(val);
    return { text: out };
  }

  // Slow path - AEGIS server
  const { aegisUrl, aegisKey } = await getConfig();
  if (!aegisUrl || !aegisKey) return { text };

  const res = await fetch(`${aegisUrl.replace(/\/$/, "")}/api/rehydrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${aegisKey}` },
    body: JSON.stringify({ text, sessionToken }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// GET_STATS handler
async function handleGetStats() {
  return new Promise(resolve => {
    chrome.storage.local.get(["auditLog"], ({ auditLog = [] }) => {
      const dayAgo  = Date.now() - 86_400_000;
      const today   = auditLog.filter(e => e.ts > dayAgo);

      // Today
      const byType  = {};
      const byCat   = { pii: 0, secret: 0 };
      for (const e of today) {
        for (const t of (e.types || [])) byType[t] = (byType[t] || 0) + e.count;
        for (const c of (e.cats  || [])) byCat[c]  = (byCat[c]  || 0) + e.count;
      }

      // All-time
      const allTimeByCat  = { pii: 0, secret: 0 };
      const allTimeByType = {};
      const siteFreq      = {};
      let highRiskEvents  = 0;
      for (const e of auditLog) {
        for (const t of (e.types || [])) allTimeByType[t] = (allTimeByType[t] || 0) + e.count;
        for (const c of (e.cats  || [])) allTimeByCat[c]  = (allTimeByCat[c]  || 0) + e.count;
        if (e.riskLevel === "high") highRiskEvents++;
        if (e.site) siteFreq[e.site] = (siteFreq[e.site] || 0) + 1;
      }

      resolve({
        todayCount:    today.reduce((s, e) => s + e.count, 0),
        todayEvents:   today.length,
        byType,
        byCat,
        totalAll:      auditLog.reduce((s, e) => s + e.count, 0),
        totalPrompts:  auditLog.length,
        allTimeByCat,
        allTimeByType,
        highRiskEvents,
        topSite:       Object.entries(siteFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      });
    });
  });
}

// TEST_CONNECTION handler
async function handleTest({ aegisUrl, aegisKey }) {
  try {
    const res = await fetch(`${aegisUrl.replace(/\/$/, "")}/api/health`, {
      headers: { "Authorization": `Bearer ${aegisKey}` },
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, error: "No se puede conectar" };
  }
}
