// AEGIS Content Script

// Marca de presencia: se puede leer en la consola con document.documentElement.dataset.aegis
try { document.documentElement.dataset.aegis = "content-" + chrome.runtime.getManifest().version; } catch (_) {}

// Con el registro de depuración activo, muestra 4 segundos "AEGIS activo" al cargar la página
setTimeout(() => {
  try {
    if (localStorage.getItem("aegisDebug") === "1") {
      showBadge("activo v" + chrome.runtime.getManifest().version, "clean");
      setTimeout(hideBadge, 4000);
    }
  } catch (_) {}
}, 600);

// State
let pendingSession = null;
let skipNext = false;
let badge = null;

// Registro opcional: localStorage.aegisDebug = "1" en la consola de la página. Nunca escribe valores.
const dbg = (...args) => {
  try { if (localStorage.getItem("aegisDebug") === "1") console.log("[AEGIS dbg]", ...args); } catch (_) {}
};
let responseObserver = null;
let lastPre = null; // último análisis hecho mientras el usuario escribe
let initDone = false; // true cuando AEGIS ha arrancado en esta página
let sessionEntityValues = new Set(); // PII values from the most recent outbound message

// Cache aegisMode so click handlers can read it synchronously
let aegisModeCache = "balanced";
chrome.storage.sync.get(["aegisMode"], ({ aegisMode }) => { aegisModeCache = aegisMode || "balanced"; });
chrome.storage.onChanged.addListener(changes => {
  if (changes.aegisMode) aegisModeCache = changes.aegisMode.newValue || "balanced";
});

// Responde al menú de la extensión para mostrar el estado de esta pestaña
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "AEGIS_PING") return;
  const h = location.hostname.replace(/^www\./, "");
  const site = Object.entries(SITES).find(([d]) => h.includes(d))?.[1];
  sendResponse({
    version:     chrome.runtime.getManifest().version,
    initialized: initDone,
    input:       Boolean(site && find(site.inputSel)),
    submit:      Boolean(site && find(site.submitSel)),
    editors:     document.querySelectorAll("[contenteditable], textarea").length,
  });
});

// Bridge: fetch-interceptor (MAIN world) ↔ service worker
window.addEventListener("aegis-sanitize-request", async (e) => {
  const { id, text } = e.detail;
  try {
    const result = await bg("SANITIZE", { text });
    window.dispatchEvent(new CustomEvent("aegis-sanitize-response", { detail: { id, ...result } }));
  } catch {
    window.dispatchEvent(new CustomEvent("aegis-sanitize-response", { detail: { id, sanitizedText: text, interceptions: [] } }));
  }
});

// Badge update triggered by the fetch interceptor after a successful body swap
window.addEventListener("aegis-badge", (e) => {
  const count = e.detail?.count ?? 0;
  if (count > 0) showBadge(`${count} dato${count !== 1 ? "s" : ""} protegido${count !== 1 ? "s" : ""}`, "ok");
  // Si el Enter llegó tarde (el sitio vació el cuadro antes), la restauración en la respuesta se prepara aquí
  if (count > 0 && lastPre && lastPre.sessionToken) {
    pendingSession = lastPre.sessionToken;
    sessionEntityValues = new Set(Object.values(lastPre.entityMap || {}));
    watchResponse();
  }
});

// Site config
const SITES = {
  "chatgpt.com": {
    inputSel:    ["#prompt-textarea", "textarea[name='prompt']", "#mobile-composer-prompt"],
    submitSel:   ["button[class*='composer-submit']", "button[aria-label='Enviar mensaje']", "button[aria-label='Send message']"],
    responseSel: [".prose", ".markdown", "[data-message-author-role='assistant'] .whitespace-pre-wrap"],
    editable:    true,
  },
  "chat.openai.com": {
    inputSel:    ["#prompt-textarea", "textarea[name='prompt']", "#mobile-composer-prompt"],
    submitSel:   ["button[class*='composer-submit']", "button[aria-label='Send message']"],
    responseSel: [".prose", ".markdown"],
    editable:    true,
  },
  "claude.ai": {
    inputSel:    [".ProseMirror[contenteditable]", "[contenteditable='true'][data-placeholder]"],
    submitSel:   ["button[aria-label='Send Message']", "button[aria-label='Send message']", "button[type='submit']"],
    responseSel: [".prose", "[data-is-streaming='false'] .prose"],
    editable:    true,
  },
  "gemini.google.com": {
    inputSel:    [".ql-editor[contenteditable]", "rich-textarea .ql-editor", ".ql-editor",
                  "[contenteditable='true'][aria-multiline='true']"],
    submitSel:   ["button[aria-label='Enviar mensaje']", "button[aria-label='Send message']",
                  "button[aria-label='Enviar']", "button[aria-label='Send']",
                  "bard-form-query-submit-button button", "button[data-test-id='send-button']",
                  "button.send-button", ".send-button button"],
    responseSel: ["model-response .markdown", ".response-content"],
    editable:    true,
  },
  "copilot.microsoft.com": {
    inputSel:    ["textarea#searchbox", "cib-text-input textarea", "textarea[aria-label]"],
    submitSel:   ["button[aria-label='Submit']", "cib-text-input button[type='submit']"],
    responseSel: [".ac-textBlock", "cib-message-group .response"],
    editable:    false,
  },
  "mail.google.com": {
    inputSel:    [
      ".Am.Al.editable[contenteditable]",
      "div[aria-label='Message Body'][contenteditable]",
      "div[contenteditable='true'][role='textbox']",
    ],
    submitSel:   [
      "div[data-tooltip='Send'][role='button']",
      "div[data-tooltip='Enviar'][role='button']",
      "div[data-tooltip='Send this email'][role='button']",
    ],
    responseSel: [],
    editable:    true,
  },
  "outlook.live.com": {
    inputSel:    [
      "div[contenteditable='true'][aria-label]",
      "div[role='textbox'][contenteditable='true']",
    ],
    submitSel:   [
      "button[data-testid='compose-send-button']",
      "button[aria-label='Send']",
      "button[title='Send']",
      "button[title='Enviar']",
    ],
    responseSel: [],
    editable:    true,
  },
  "outlook.office.com": {
    inputSel:    [
      "div[contenteditable='true'][aria-label]",
      "div[role='textbox'][contenteditable='true']",
    ],
    submitSel:   [
      "button[data-testid='compose-send-button']",
      "button[aria-label='Send']",
      "button[title='Send']",
      "button[title='Enviar']",
    ],
    responseSel: [],
    editable:    true,
  },
  "outlook.office365.com": {
    inputSel:    [
      "div[contenteditable='true'][aria-label]",
      "div[role='textbox'][contenteditable='true']",
    ],
    submitSel:   [
      "button[data-testid='compose-send-button']",
      "button[aria-label='Send']",
      "button[title='Send']",
      "button[title='Enviar']",
    ],
    responseSel: [],
    editable:    true,
  },
};

const hostname = location.hostname.replace(/^www\./, "");
const cfg = Object.entries(SITES).find(([d]) => hostname.includes(d))?.[1];
if (cfg) {
  chrome.storage.sync.get(["allowlist"], ({ allowlist = [] }) => {
    if (!allowlist.includes(hostname)) initDom();
  });
}

// DOM setup
function initDom() {
  initDone = true;
  let pre = null;
  let preKey = null;
  let preTimer = null;
  let fallbackRegistered = false;

  // Deja la sustitución preparada en la página mientras se escribe: así no depende de cuándo llegue el Enter
  function publishMapping(p) {
    window.dispatchEvent(new CustomEvent("aegis-mapping", {
      detail: {
        original:      p.original,
        sanitized:     p.sanitizedText,
        interceptions: p.interceptions,
        entityMap:     p.entityMap || {},
      },
    }));
  }

  function schedulePrefetch() {
    clearTimeout(preTimer);
    preTimer = setTimeout(async () => {
      const el = find(cfg.inputSel);
      if (!el) return;
      const text = getText(el);
      if (!text) { preKey = null; pre = null; return; }
      if (text === preKey) return;
      preKey = text;
      pre = null;
      try {
        const r = await bg("SANITIZE", { text });
        if (!r?.error && preKey === text) {
          pre = { original: text, ...r };
          lastPre = pre;
          dbg("prefetch", { textLen: text.length, detected: (pre.interceptions || []).length });
          if (pre.interceptions?.length) publishMapping(pre);
          else window.dispatchEvent(new CustomEvent("aegis-mapping-clear"));
        }
      } catch (_) {}
    }, 50);
  }

  function applyPre(text) {
    dbg("applyPre", { textLen: text.length, cached: !!(pre && pre.original === text), detected: pre ? (pre.interceptions || []).length : null });
    if (!pre || pre.original !== text) {
      // No cached result yet - emergency path:
      // Tell the fetch/XHR interceptor to hold the outgoing request for up to 400ms
      // while we fire an urgent SANITIZE. Local regex detection takes ~2-5ms so this
      // covers the race where the user clicks before the prefetch debounce fires.
      if (text.trim()) {
        window.dispatchEvent(new CustomEvent("aegis-hold"));
        bg("SANITIZE", { text }).then(r => {
          if (!r || r.error) return;
          if (r.sensitiveFiles?.length) {
            showBadge(`⚠️ Archivo sensible: ${r.sensitiveFiles[0]}`, "error");
          }
          if (!r.interceptions?.length) return;
          sessionEntityValues = new Set(Object.values(r.entityMap || {}));
          window.dispatchEvent(new CustomEvent("aegis-mapping", {
            detail: {
              original:      text,
              sanitized:     r.sanitizedText,
              interceptions: r.interceptions,
              entityMap:     r.entityMap || {},
            },
          }));
          const count = r.interceptions.length;
          const tag = r.riskLevel === "high" ? "error" : "ok";
          pendingSession = r.sessionToken;
          showBadge(`${count} dato${count !== 1 ? "s" : ""} protegido${count !== 1 ? "s" : ""}`, tag);
          watchResponse();
        }).catch(() => {});
      }
      return;
    }
    if (pre.sensitiveFiles?.length) {
      showBadge(`⚠️ Archivo sensible: ${pre.sensitiveFiles[0]}`, "error");
    }
    const count = (pre.interceptions ?? []).length;
    if (count > 0) {
      sessionEntityValues = new Set(Object.values(pre.entityMap || {}));
      window.dispatchEvent(new CustomEvent("aegis-mapping", {
        detail: {
          original:      pre.original,
          sanitized:     pre.sanitizedText,
          interceptions: pre.interceptions,
          entityMap:     pre.entityMap || {},
        },
      }));
      const tag = pre.riskLevel === "high" ? "error" : "ok";
      pendingSession = pre.sessionToken;
      showBadge(`${count} dato${count !== 1 ? "s" : ""} protegido${count !== 1 ? "s" : ""}`, tag);
      watchResponse();
    }
    pre = null;
    preKey = null;
  }

  // Set up input watcher + Enter key handler - runs independently of the submit button.
  function trySetupInput() {
    const el = find(cfg.inputSel);
    if (!el || el._aegisInput) return;
    el._aegisInput = true;
    dbg("input attached", el.tagName, (el.id || String(el.className)).slice(0, 50));

    el.addEventListener("input", schedulePrefetch);
    new MutationObserver(schedulePrefetch).observe(el, {
      childList: true, subtree: true, characterData: true,
    });

    if (!el._aegisKey) {
      el._aegisKey = true;
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || e.shiftKey) return;
        dbg("Enter pressed", { skipNext });
        if (skipNext) { skipNext = false; return; }
        const text = getText(el);
        if (aegisModeCache === "strict" && text.trim()) {
          e.preventDefault();
          e.stopPropagation();
          handleStrictMode(find(cfg.submitSel), text);
          return;
        }
        applyPre(text);
      }, true);
    }
  }

  // Set up the explicit send-button click handler when the button can be found.
  function trySetupSubmit() {
    const submit = find(cfg.submitSel);
    if (!submit || submit._aegis) return;
    submit._aegis = true;
    dbg("submit button attached");

    submit.addEventListener("click", (e) => {
      if (skipNext) { skipNext = false; return; }
      const el2 = find(cfg.inputSel);
      if (!el2) return;
      const text = getText(el2);
      if (aegisModeCache === "strict" && text.trim()) {
        e.preventDefault();
        e.stopPropagation();
        handleStrictMode(e.currentTarget, text);
        return;
      }
      applyPre(text);
    }, true);
  }

  // Fallback: when no submit button selector matches (e.g. Gemini's button changes
  // aria-label between versions), catch any button/role=button click. applyPre is a
  // no-op unless PII was pre-fetched and the text matches, so false positives are safe.
  function tryFallbackClick() {
    if (fallbackRegistered) return;
    fallbackRegistered = true;
    document.addEventListener("click", (e) => {
      if (e.target.closest("#aegis-strict-overlay")) return;
      if (!e.target.closest("button, [role='button']")) return;
      const el = find(cfg.inputSel);
      if (!el) return;
      const text = getText(el);
      if (aegisModeCache === "strict" && text.trim()) {
        e.preventDefault();
        e.stopPropagation();
        handleStrictMode(e.target.closest("button, [role='button']"), text);
        return;
      }
      applyPre(text);
    }, true);
  }

  function trySetupDom() {
    trySetupInput();
    trySetupSubmit();
    tryFallbackClick();
  }

  new MutationObserver(trySetupDom).observe(document.body, { childList: true, subtree: true });
  trySetupDom();
}

function getText(el) {
  const isField = el.tagName === "TEXTAREA" || el.tagName === "INPUT";
  return (cfg.editable && !isField ? el.innerText || el.textContent || "" : el.value || "").trim();
}

// Watch AI response and rehydrate tokens
function watchResponse() {
  if (responseObserver) responseObserver.disconnect();

  let debounce;
  responseObserver = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(tryRehydrate, 800); // 800ms after streaming stops
  });
  responseObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  setTimeout(() => responseObserver?.disconnect(), 120_000); // 2-min safety cap
}

async function tryRehydrate() {
  if (!pendingSession) return;

  const inputEl = find(cfg.inputSel);
  const PATTERN = /\[[A-Z][A-Z_]*_\d+\]/;

  // Universal: walk ALL text nodes in the page - no CSS selectors that break with UI updates.
  // Skip only the active input element so we don't touch what the user is still typing.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (inputEl && inputEl.contains(node.parentElement)) continue;
    if (PATTERN.test(node.textContent)) nodes.push(node);
  }

  if (nodes.length === 0) return;

  // Batch everything into one service-worker round-trip
  const SEP = "\x00S\x00";
  const combined = nodes.map(n => n.textContent).join(SEP);

  try {
    const result = await bg("REHYDRATE", { text: combined, sessionToken: pendingSession });
    if (result.error || !result.text) return;

    const parts = result.text.split(SEP);
    nodes.forEach((n, i) => { if (parts[i] != null) n.textContent = parts[i]; });

    pendingSession = null;
    responseObserver?.disconnect();
    hideBadge();
    // Scan what the AI actually returned for any leaked PII
    scanOutputForPII();
  } catch (err) {
    console.error("[AEGIS] rehydrate failed:", err.message);
  }
}

// Output scanner: detect PII in the AI's response
async function scanOutputForPII() {
  if (!cfg?.responseSel) return;

  // Collect all response containers and pick the last one (most recent)
  const containers = cfg.responseSel.flatMap(s => [...document.querySelectorAll(s)]);
  if (!containers.length) return;

  const lastContainer = containers[containers.length - 1];
  const text = (lastContainer.innerText || lastContainer.textContent || "").trim();
  if (text.length < 30) return;

  try {
    const result = await bg("SANITIZE", { text });
    if (!result?.interceptions?.length) return;

    // Filter out PII values that came from the user's own outbound message
    // (they were legitimately rehydrated into the response)
    const knownValues = sessionEntityValues;
    const novel = result.interceptions.filter(i => {
      const val = result.entityMap?.[i.placeholder];
      return !val || !knownValues.has(val);
    });

    if (!novel.length) return;

    const n = novel.length;
    const hasSecret = novel.some(i => i.cat === "secret");
    showBadge(
      `⚠️ Respuesta: ${n} dato${n !== 1 ? "s" : ""} sensible${n !== 1 ? "s" : ""}`,
      hasSecret ? "error" : "loading"
    );
  } catch (_) {}
}

// Helpers
function find(selectors) {
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}

function bg(type, data) {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, site: hostname, ...data }, res => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    })
  );
}

// Badge UI
const COLORS = {
  loading: { fg: "#C89030", bg: "rgba(200,144,48,0.12)" },
  ok:      { fg: "#2D7A4A", bg: "rgba(45,122,74,0.12)"  },
  clean:   { fg: "#5A8ADF", bg: "rgba(90,138,223,0.12)" },
  error:   { fg: "#C83030", bg: "rgba(200,48,48,0.12)"  },
};

function showBadge(text, state) {
  if (aegisModeCache === "silent") return;
  if (!badge) {
    badge = Object.assign(document.createElement("div"), { id: "aegis-ext-badge" });
    Object.assign(badge.style, {
      position: "fixed", bottom: "80px", right: "18px", zIndex: "2147483647",
      fontFamily: "'Courier New',monospace", fontSize: "11px", fontWeight: "700",
      padding: "5px 11px", borderRadius: "2px", border: "1.5px solid currentColor",
      letterSpacing: ".06em", textTransform: "uppercase",
      pointerEvents: "none", transition: "opacity .15s",
    });
    document.body.appendChild(badge);
  }
  const c = COLORS[state] || COLORS.loading;
  badge.style.color = c.fg;
  badge.style.background = c.bg;
  badge.style.borderColor = c.fg;
  badge.style.opacity = "1";
  badge.textContent = `AEGIS · ${text}`;
}

function hideBadge() {
  if (badge) badge.style.opacity = "0";
}

// Strict-mode blocking overlay
function showBlockOverlay(interceptions) {
  return new Promise(resolve => {
    const hasCritical = interceptions.some(i => i.cat === "secret");
    const n = interceptions.length;
    const items = interceptions.slice(0, 4)
      .map(i => `<span style="color:${i.cat === "secret" ? "#C85020" : "#2D7A4A"};font-weight:700;font-size:11px">[${i.placeholder}]</span>`)
      .join("  ");
    const more = n > 4 ? `  <span style="color:#8A8070;font-size:10px">+${n - 4} más</span>` : "";

    const ov = document.createElement("div");
    ov.id = "aegis-strict-overlay";
    ov.innerHTML = `
      <div id="aegis-strict-card">
        <div id="aegis-strict-head">AEGIS <span style="color:#C85020;margin-left:6px;font-size:9px;letter-spacing:.08em">MODO ESTRICTO</span></div>
        <div id="aegis-strict-icon">${hasCritical ? "🔴" : "⚠️"}</div>
        <div id="aegis-strict-title">Se detectó${n > 1 ? "ron" : ""} <strong>${n}</strong> dato${n !== 1 ? "s" : ""} sensible${n !== 1 ? "s" : ""}</div>
        <div id="aegis-strict-items">${items}${more}</div>
        <div id="aegis-strict-reason">${hasCritical ? "Credencial crítica — no se recomienda enviar" : "Datos personales detectados"}</div>
        <div id="aegis-strict-btns">
          <button id="aegis-cancel-b">Cancelar</button>
          <button id="aegis-send-b">Enviar con etiquetas</button>
        </div>
      </div>`;

    // Overlay styles
    Object.assign(ov.style, {
      position: "fixed", inset: "0", zIndex: "2147483647",
      background: "rgba(0,0,0,.72)", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "'Courier New',monospace",
    });
    const card = ov.querySelector("#aegis-strict-card");
    Object.assign(card.style, {
      background: "#1A1510", border: `1.5px solid ${hasCritical ? "#C85020" : "#C89030"}`,
      padding: "22px 24px", maxWidth: "360px", width: "90%", color: "#F5F0E6",
    });
    Object.assign(ov.querySelector("#aegis-strict-head").style, {
      fontSize: "13px", fontWeight: "700", letterSpacing: ".06em", marginBottom: "16px",
      display: "flex", alignItems: "center",
    });
    Object.assign(ov.querySelector("#aegis-strict-icon").style, { fontSize: "28px", marginBottom: "10px" });
    Object.assign(ov.querySelector("#aegis-strict-title").style, { fontSize: "13px", marginBottom: "10px" });
    Object.assign(ov.querySelector("#aegis-strict-items").style, { marginBottom: "8px", lineHeight: "1.7" });
    Object.assign(ov.querySelector("#aegis-strict-reason").style, {
      fontSize: "10px", color: "#8A8070", marginBottom: "18px", letterSpacing: ".04em",
    });
    const btns = ov.querySelector("#aegis-strict-btns");
    Object.assign(btns.style, { display: "flex", gap: "8px" });
    const cancelB = ov.querySelector("#aegis-cancel-b");
    const sendB   = ov.querySelector("#aegis-send-b");
    Object.assign(cancelB.style, {
      flex: "1", fontFamily: "inherit", fontSize: "10px", letterSpacing: ".06em",
      padding: "8px", border: "1px solid #3A3025", background: "none", color: "#8A8070", cursor: "pointer",
    });
    Object.assign(sendB.style, {
      flex: "2", fontFamily: "inherit", fontSize: "10px", letterSpacing: ".06em", fontWeight: "700",
      padding: "8px", border: "none", background: "#2D7A4A", color: "#F5F0E6", cursor: "pointer",
    });

    document.body.appendChild(ov);

    const cleanup = (result) => { ov.remove(); resolve(result); };
    cancelB.addEventListener("click", () => cleanup(false));
    sendB.addEventListener("click",   () => cleanup(true));
    ov.addEventListener("keydown", e => { if (e.key === "Escape") cleanup(false); });
  });
}

// Handles submit in strict mode: blocks the original event, shows overlay, re-fires if confirmed.
async function handleStrictMode(submitEl, text) {
  if (!text?.trim()) { submitEl?.click(); return; }

  const r = await bg("SANITIZE", { text });

  if (!r || r.error || !r.interceptions?.length) {
    // Nothing to protect - let it through
    skipNext = true;
    submitEl?.click();
    return;
  }

  if (r.sensitiveFiles?.length) showBadge(`⚠️ Archivo sensible: ${r.sensitiveFiles[0]}`, "error");

  const go = await showBlockOverlay(r.interceptions);
  if (!go) return; // user cancelled

  sessionEntityValues = new Set(Object.values(r.entityMap || {}));
  window.dispatchEvent(new CustomEvent("aegis-hold"));
  window.dispatchEvent(new CustomEvent("aegis-mapping", {
    detail: {
      original:      text,
      sanitized:     r.sanitizedText,
      interceptions: r.interceptions,
      entityMap:     r.entityMap || {},
    },
  }));
  pendingSession = r.sessionToken;
  const count = r.interceptions.length;
  showBadge(`${count} dato${count !== 1 ? "s" : ""} protegido${count !== 1 ? "s" : ""}`,
    r.riskLevel === "high" ? "error" : "ok");
  watchResponse();
  skipNext = true;
  (submitEl || find(cfg.submitSel))?.click();
}
