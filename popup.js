// AEGIS Popup

const $ = id => document.getElementById(id);
$("app-version").textContent = "AEGIS Privacy Shield v" + chrome.runtime.getManifest().version;

const PII_TYPES = {
  EMAIL_ADDRESS: "Email",
  IBAN:          "IBAN",
  CARD_NUMBER:   "Tarjeta",
  PHONE_NUMBER:  "Teléfono",
  DNI:           "DNI/NIE",
  IP_ADDRESS:    "IP pública",
  ADDRESS:       "Dirección",
};
const SECRET_TYPES = {
  JWT:            "JWT",
  OPENAI_KEY:     "OpenAI Key",
  ANTHROPIC_KEY:  "Anthropic Key",
  GITHUB_TOKEN:   "GitHub Token",
  AWS_KEY:        "AWS Key",
  GOOGLE_KEY:     "Google Key",
  STRIPE_KEY:     "Stripe Key",
  PRIVATE_KEY:    "Clave privada",
  BEARER_TOKEN:   "Bearer Token",
  PASSWORD:       "Contraseña",
  MONGODB_URI:    "MongoDB URI",
  SLACK_TOKEN:    "Slack Token",
  GOOGLE_OAUTH:   "Google OAuth",
};

// Allowlist - confiar en el sitio actual
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  try {
    const tab = tabs?.[0];
    if (!tab?.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) return;
    const tabHost = new URL(tab.url).hostname.replace(/^www\./, "");
    if (!tabHost) return;

    // Estado de AEGIS en la pestaña actual: se lo pregunta al script de la propia página
    const diag = $("diag-row");
    diag.style.display = "block";
    const supported = (chrome.runtime.getManifest().content_scripts || [])
      .flatMap(c => c.matches || []).some(m => m.includes("://" + tabHost + "/"));
    if (!supported) {
      diag.textContent = "AEGIS no actúa en esta página.";
    } else {
      diag.textContent = "Comprobando esta pestaña…";
      chrome.tabs.sendMessage(tab.id, { type: "AEGIS_PING" }, (res) => {
        if (chrome.runtime.lastError || !res) {
          diag.textContent = "AEGIS NO está activo en esta pestaña: el script no responde. Recarga la página.";
          diag.style.color = "#C83030";
        } else if (!res.initialized) {
          diag.textContent = "El script está, pero AEGIS está desactivado en este sitio (lista de confianza).";
          diag.style.color = "#C83030";
        } else if (!res.input) {
          diag.textContent = "AEGIS activo (v" + res.version + "), pero NO encuentra el cuadro de texto. Editores en la página: " + res.editors + ".";
          diag.style.color = "#C83030";
        } else {
          diag.textContent = "AEGIS activo en esta pestaña (v" + res.version + "): cuadro de texto encontrado" + (res.submit ? " y botón de enviar." : ".");
          diag.style.color = "#2D7A4A";
        }
      });
    }

    chrome.storage.sync.get(["allowlist"], ({ allowlist = [] }) => {
      $("allowlist-row").style.display = "flex";
      $("allowlist-site").textContent = tabHost;
      $("allowlist-chk").checked = allowlist.includes(tabHost);
    });

    $("allowlist-chk").addEventListener("change", () => {
      const trusted = $("allowlist-chk").checked;
      chrome.storage.sync.get(["allowlist"], ({ allowlist = [] }) => {
        const updated = trusted
          ? [...new Set([...allowlist, tabHost])]
          : allowlist.filter(d => d !== tabHost);
        chrome.storage.sync.set({ allowlist: updated });
      });
    });
  } catch (_) {}
});

// Load saved config
chrome.storage.sync.get(["aegisUrl", "aegisKey", "enabled", "aegisMode"], ({ aegisUrl, aegisKey, enabled, aegisMode }) => {
  if (aegisUrl) {
    $("url").value = aegisUrl;
    $("url-hint").style.display = "none";
  } else {
    $("url-hint").style.display = "block";
  }
  if (aegisKey) $("key").value = aegisKey;
  const on = enabled !== false;
  $("enabled").checked = on;
  $("hdr-status").style.background = on ? "#2D7A4A" : "#5A5040";
  setActiveMode(aegisMode || "balanced");
});

// Mode buttons
function setActiveMode(mode) {
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    chrome.storage.sync.set({ aegisMode: mode });
    setActiveMode(mode);
  });
});

// Load audit stats
let cachedStats = null;

chrome.runtime.sendMessage({ type: "GET_STATS" }, (stats) => {
  const loadingEl = $("stats-loading");
  const contentEl = $("stats-content");

  if (chrome.runtime.lastError || !stats) {
    loadingEl.textContent = "Sin datos aún";
    return;
  }

  cachedStats = stats;
  loadingEl.style.display = "none";
  contentEl.style.display = "block";

  const n = stats.todayCount || 0;
  $("stats-count").textContent = n;
  let sub = n === 1 ? "dato protegido hoy" : "datos protegidos hoy";
  if ((stats.totalAll || 0) > n) sub += ` · ${stats.totalAll} en total`;
  $("stats-sub").textContent = sub;

  // Category pills
  const byCat = stats.byCat || {};
  const piiN = byCat.pii || 0;
  const secN = byCat.secret || 0;
  if (piiN > 0 || secN > 0) {
    $("cat-bar").style.display = "flex";
    $("cat-pii-n").textContent = piiN;
    $("cat-secret-n").textContent = secN;
  }

  // PII chips
  const byType = stats.byType || {};
  const piiChips = Object.entries(PII_TYPES).filter(([k]) => byType[k] !== undefined);
  const secChips = Object.entries(SECRET_TYPES).filter(([k]) => byType[k] !== undefined);

  if (piiChips.length) {
    $("chips-pii-label").style.display = "block";
    renderChips($("stats-types-pii"), piiChips, byType, "");
  }
  if (secChips.length) {
    $("chips-secret-label").style.display = "block";
    renderChips($("stats-types-secret"), secChips, byType, "secret");
  }

  // If nothing detected yet, show all PII chips greyed out
  if (!piiChips.length && !secChips.length) {
    renderChips($("stats-types-pii"), Object.entries(PII_TYPES), {}, "");
  }

  renderScore(stats);
  renderLifetime(stats);
});

function renderLifetime(stats) {
  const total = stats.totalPrompts || 0;
  if (!total) return;

  $("lifetime-section").style.display = "block";
  $("lt-prompts").textContent = total;
  $("lt-pii").textContent    = (stats.allTimeByCat || {}).pii    || 0;
  $("lt-sec").textContent    = (stats.allTimeByCat || {}).secret || 0;

  if (stats.topSite) {
    const PROVIDERS = {
      "chatgpt.com":           "ChatGPT",
      "chat.openai.com":       "ChatGPT",
      "claude.ai":             "Claude",
      "gemini.google.com":     "Gemini",
      "copilot.microsoft.com": "Copilot",
      "mail.google.com":       "Gmail",
      "outlook.live.com":      "Outlook",
      "outlook.office.com":    "Outlook",
      "outlook.office365.com": "Outlook",
    };
    const label = PROVIDERS[stats.topSite] || stats.topSite;
    $("lt-site").textContent = `Sitio más activo: ${label}`;
  }
}

function renderScore(stats) {
  const scoreRow  = $("score-row");
  const scoreRing = $("score-ring");
  const scoreLevel = $("score-level");
  const scoreDesc  = $("score-desc");

  if (!stats || (!stats.todayCount && !stats.totalAll)) return;

  scoreRow.style.display = "flex";

  const secretCount = (stats.byCat || {}).secret || 0;
  const piiCount    = (stats.byCat || {}).pii    || 0;
  const events      = stats.todayEvents || 0;

  // Risk formula: secrets weight more heavily than PII
  const rawRisk = secretCount * 18 + piiCount * 6 + events * 2;
  const score   = Math.max(0, Math.min(100, Math.round(100 - rawRisk)));

  scoreRing.textContent = score;

  if (score >= 75) {
    scoreRing.className = "score-ring clean";
    scoreLevel.textContent = "Riesgo bajo";
    scoreLevel.style.color = "#2D7A4A";
    scoreDesc.textContent  = `${stats.todayCount || 0} datos protegidos hoy · ninguna fuga detectada`;
  } else if (score >= 45) {
    scoreRing.className = "score-ring medium";
    scoreLevel.textContent = "Riesgo moderado";
    scoreLevel.style.color = "#B87030";
    scoreDesc.textContent  = `${piiCount} PII · ${secretCount} secreto${secretCount !== 1 ? "s" : ""} · revisa el historial`;
  } else {
    scoreRing.className = "score-ring high";
    scoreLevel.textContent = "Riesgo alto";
    scoreLevel.style.color = "#C83030";
    scoreDesc.textContent  = `${secretCount} credencial${secretCount !== 1 ? "es" : ""} detectada${secretCount !== 1 ? "s" : ""} · activa modo Seguro`;
  }
}

function renderChips(container, entries, byType, extraClass) {
  container.innerHTML = "";
  for (const [key, label] of entries) {
    const count = byType[key];
    const chip = document.createElement("span");
    chip.className = "chip" + (count ? " active" : "") + (extraClass ? " " + extraClass : "");
    chip.textContent = (count ? `${count} ` : "") + label;
    chip.title = getWhy(key); // explicabilidad
    container.appendChild(chip);
  }
}

function getWhy(ph) {
  const why = {
    EMAIL_ADDRESS: "Dirección de correo electrónico identificable",
    IBAN:          "Número de cuenta bancaria internacional",
    CARD_NUMBER:   "Número de tarjeta (validado con Luhn)",
    PHONE_NUMBER:  "Número de teléfono",
    DNI:           "DNI o NIE español",
    IP_ADDRESS:    "IP pública que puede identificar al usuario",
    ADDRESS:       "Dirección postal (calle y número, o código postal). Detección aproximada",
    JWT:           "Token JWT con credenciales de sesión",
    OPENAI_KEY:    "Clave de API de OpenAI",
    ANTHROPIC_KEY: "Clave de API de Anthropic",
    GITHUB_TOKEN:  "Token de acceso de GitHub",
    AWS_KEY:       "Clave de acceso AWS IAM",
    GOOGLE_KEY:    "Clave de API de Google Cloud",
    STRIPE_KEY:    "Clave de API de Stripe",
    PRIVATE_KEY:   "Clave privada criptográfica",
    BEARER_TOKEN:  "Token de autenticación HTTP",
    PASSWORD:      "Contraseña en código o configuración",
    MONGODB_URI:   "Cadena de conexión MongoDB con credenciales",
    SLACK_TOKEN:   "Token de bot o usuario de Slack",
    GOOGLE_OAUTH:  "Client secret de OAuth de Google",
  };
  return why[ph] || ph;
}

// URL input: show/hide hint
$("url").addEventListener("input", () => {
  $("url-hint").style.display = $("url").value.trim() ? "none" : "block";
});

// Show/hide API key
$("eye-btn").addEventListener("click", () => {
  const inp = $("key");
  const visible = inp.type === "text";
  inp.type = visible ? "password" : "text";
  $("eye-btn").textContent = visible ? "👁" : "🙈";
});

// Toggle enabled
$("enabled").addEventListener("change", () => {
  const on = $("enabled").checked;
  chrome.storage.sync.set({ enabled: on });
  $("hdr-status").style.background = on ? "#2D7A4A" : "#5A5040";
});

// El acceso a un servidor propio es un permiso opcional: solo se pide al guardar o probar uno.
function ensureServerPermission(url, done) {
  if (!url) { done(true); return; }
  let origin;
  try { origin = new URL(url).origin + "/*"; }
  catch (_) { showStatus("URL del servidor no válida (incluye https://)", "error"); done(false); return; }
  chrome.permissions.request({ origins: [origin] }, (granted) => {
    if (!granted) showStatus("Sin permiso para conectar con ese servidor", "error");
    done(Boolean(granted));
  });
}

// Save
$("save-btn").addEventListener("click", () => {
  const url = $("url").value.trim().replace(/\/$/, "");
  const key = $("key").value.trim();
  ensureServerPermission(url, (ok) => {
    if (!ok) return;
    chrome.storage.sync.set({ aegisUrl: url || null, aegisKey: key || null, enabled: $("enabled").checked }, () => {
      showStatus("Configuración guardada", "ok");
    });
  });
});

// Test connection
$("test-btn").addEventListener("click", () => {
  const url = $("url").value.trim().replace(/\/$/, "");
  const key = $("key").value.trim();
  if (!url) {
    showStatus("Protección básica activa (email, IBAN, tarjeta, teléfono, DNI, dirección, secretos). Añade un servidor para detección semántica.", "info");
    return;
  }
  if (!key) { showStatus("Introduce tu clave API para probar", "error"); return; }

  const btn = $("test-btn");
  ensureServerPermission(url, (ok) => {
    if (!ok) return;
    btn.disabled = true; btn.textContent = "…";
    showStatus("Conectando…", "info");

    chrome.runtime.sendMessage({ type: "TEST_CONNECTION", aegisUrl: url, aegisKey: key }, (res) => {
      btn.disabled = false; btn.textContent = "Probar";
      if (chrome.runtime.lastError) { showStatus("Error interno", "error"); return; }
      if (res?.ok) showStatus("Conexión exitosa — AEGIS Neural activo", "ok");
      else showStatus(res?.error || "No se puede conectar", "error");
    });
  });
});

// GDPR export
const PROVIDER_MAP = {
  "chatgpt.com":           "OpenAI (ChatGPT)",
  "chat.openai.com":       "OpenAI (ChatGPT)",
  "claude.ai":             "Anthropic (Claude)",
  "gemini.google.com":     "Google (Gemini)",
  "copilot.microsoft.com": "Microsoft (Copilot)",
  "mail.google.com":       "Gmail",
  "outlook.live.com":      "Outlook Web",
  "outlook.office.com":    "Outlook Web",
  "outlook.office365.com": "Outlook Web",
};

$("gdpr-btn").addEventListener("click", () => {
  // Get active tab for provider info
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    const tabHost = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, "") : null;
    const providerName = tabHost ? (PROVIDER_MAP[tabHost] || tabHost) : "Desconocido";

    chrome.storage.local.get(["auditLog"], ({ auditLog = [] }) => {
      const stats = cachedStats || {};
      const now   = new Date();
      const today = now.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

      const allTimePII    = (stats.allTimeByCat || {}).pii    || 0;
      const allTimeSecret = (stats.allTimeByCat || {}).secret || 0;

      const report = {
        titulo:   "Informe de protección de privacidad — AEGIS Privacy Shield",
        version:  chrome.runtime.getManifest().version,
        generado: now.toISOString(),

        sesion_activa: {
          proveedor:    providerName,
          sitio:        tabHost || "desconocido",
          fecha:        today,
          alcance_de_la_proteccion: "Los datos detectados fueron sustituidos por etiquetas antes del envío. Los datos no detectados (por ejemplo, nombres o direcciones) no están cubiertos.",
          proteccion_aplicada: "Seudonimización local con tokens efímeros (p.ej. [EMAIL_ADDRESS_1], [AWS_KEY_1])",
          modo_activo: stats.aegisMode || "equilibrado",
        },

        resumen_hoy: {
          datos_protegidos:  stats.todayCount  || 0,
          mensajes_protegidos: stats.todayEvents || 0,
          por_categoria:     stats.byCat       || {},
          por_tipo:          stats.byType      || {},
        },

        historico_total: {
          datos_protegidos:    stats.totalAll    || 0,
          mensajes_protegidos: stats.totalPrompts || 0,
          pii_total:           allTimePII,
          secretos_total:      allTimeSecret,
          eventos_alto_riesgo: stats.highRiskEvents || 0,
          sitio_mas_activo:    stats.topSite || null,
        },

        evidencia_tecnica: {
          mecanismo:  "Intercepción de fetch/XHR en MAIN world del navegador (document_start), antes de que la petición abandone el equipo del usuario.",
          validacion: "Algoritmos de validación: Luhn (tarjetas), módulo 97 (IBAN), tabla de caracteres (DNI/NIE).",
          patrones:   20,
          categorias: ["PII", "Credenciales y secretos", "Archivos sensibles"],
        },

        referencias_rgpd: {
          reglamento:  "RGPD — Reglamento (UE) 2016/679",
          articulos_relacionados: [
            { articulo: "Art. 5(1)(f)", descripcion: "Integridad y confidencialidad — medidas técnicas para evitar acceso no autorizado" },
            { articulo: "Art. 25",      descripcion: "Privacidad por diseño y por defecto — protección activa en el origen" },
            { articulo: "Art. 32",      descripcion: "Seguridad del tratamiento — seudonimización como medida técnica adecuada" },
          ],
          nota: "Referencia orientativa. Este informe refleja lo que AEGIS detectó y sustituyó; no certifica cumplimiento del RGPD ni acredita que otros datos no detectados (nombres, direcciones) no se hayan transmitido.",
        },

        historial_de_detecciones: auditLog.slice(0, 100).map(e => ({
          timestamp:  new Date(e.ts).toISOString(),
          cantidad:   e.count,
          tipos:      e.types     || [],
          categorias: e.cats      || [],
          riesgo:     e.riskLevel || "medium",
          sitio:      e.site      || null,
        })),
      };

      const json = JSON.stringify(report, null, 2);
      const a = document.createElement("a");
      a.href = "data:application/json;charset=utf-8," + encodeURIComponent(json);
      a.download = `aegis-gdpr-${now.toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showStatus("Informe GDPR exportado", "ok");
    });
  });
});

// Explain View
chrome.storage.local.get(["lastExplain"], ({ lastExplain }) => {
  if (lastExplain?.items?.length) renderExplainView(lastExplain);
});

function renderExplainView(explain) {
  if (!explain?.items?.length) return;

  const section = $("explain-section");
  section.style.display = "block";

  const elapsed = Math.round((Date.now() - explain.ts) / 60_000);
  const siteLabel = explain.site
    ? (PROVIDER_MAP[explain.site] || explain.site)
    : "";
  const timeLabel = elapsed === 0 ? "ahora" : `hace ${elapsed} min`;
  $("explain-meta").textContent = [siteLabel, timeLabel].filter(Boolean).join(" · ");

  $("explain-list").innerHTML = explain.items.map(item => {
    const catLabel = item.cat === "pii" ? "Datos personales" : "Credencial";
    return `
      <div class="explain-card">
        <div class="explain-row1">
          <span class="explain-ph ${item.cat}">${item.ph}</span>
          <span class="explain-token">${item.placeholder}</span>
        </div>
        <div class="explain-why">${item.why}</div>
        <div class="explain-footer">
          <span class="explain-badge ${item.cat}">${catLabel}</span>
          <span>Regex local</span>
          <span>Detección ${item.confidence}</span>
          <span>${item.action}</span>
        </div>
      </div>`;
  }).join("");

  let open = true;
  $("explain-toggle").addEventListener("click", () => {
    open = !open;
    $("explain-body").style.display = open ? "block" : "none";
    $("explain-caret").classList.toggle("open", open);
  });
  $("explain-caret").classList.add("open");
}

// CSV export
$("csv-btn").addEventListener("click", () => {
  chrome.storage.local.get(["auditLog"], ({ auditLog = [] }) => {
    if (!auditLog.length) { showStatus("Sin datos para exportar", "info"); return; }
    const header = "timestamp,site,count,types,categories,risk_level\n";
    const rows = auditLog.map(e =>
      [new Date(e.ts).toISOString(), e.site || "", e.count,
       (e.types || []).join("|"), (e.cats || []).join("|"), e.riskLevel || "medium"]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
    ).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(header + rows);
    a.download = `aegis-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showStatus("CSV exportado", "ok");
  });
});

// Helpers
function showStatus(msg, type) {
  const el = $("status");
  el.textContent   = msg;
  el.className     = type;
  el.style.display = "block";
}
