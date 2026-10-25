// Runs in MAIN world (page context) - intercepts fetch before the AI sends data.
(function () {
  // Marca de presencia: se puede leer en la consola de la página con window.__aegisLoaded
  window.__aegisLoaded = "interceptor";

  // Pending mapping from content.js DOM intercept (original text -> sanitized text)
  let pending = null;

  // Registro opcional: localStorage.aegisDebug = "1" en la consola de la página. Nunca escribe valores.
  const dbg = (...args) => {
    try { if (localStorage.getItem("aegisDebug") === "1") console.log("[AEGIS dbg]", ...args); } catch (_) {}
  };
  const seen = (bodyStr) => pending && pending.entityMap
    ? Object.values(pending.entityMap).map(v => !!v && bodyStr.includes(v))
    : null;

  let pendingTimer = null;
  window.addEventListener("aegis-mapping", (e) => {
    pending = e.detail;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { pending = null; }, 120000);
  });
  window.addEventListener("aegis-mapping-clear", () => {
    pending = null;
    clearTimeout(pendingTimer);
  });

  // Race-condition guard: when applyPre fires an emergency SANITIZE (user clicked
  // before the 50ms prefetch debounce completed), it dispatches "aegis-hold" first.
  // The fetch/XHR interceptor then waits up to 400ms for the "aegis-mapping" that
  // follows, instead of letting the request through with PII intact.
  let pendingMappingPromise = null;
  window.addEventListener("aegis-hold", () => {
    pendingMappingPromise = new Promise(resolve => {
      const tid = setTimeout(() => {
        window.removeEventListener("aegis-mapping", onMap);
        resolve(null);
      }, 400);
      function onMap(e) {
        clearTimeout(tid);
        window.removeEventListener("aegis-mapping", onMap);
        resolve(e.detail);
      }
      window.addEventListener("aegis-mapping", onMap);
    });
  });

  const _fetch = window.fetch;

  window.fetch = async function (input, init, ...rest) {
    const url = typeof input === "string" ? input
              : input instanceof URL ? input.href
              : input?.url ?? "";

    // Normalize method - init.method wins, then Request.method, default GET
    const method = ((init?.method ?? input?.method) || "GET").toUpperCase();
    // Body can be in init.body OR on a Request object passed as `input`
    const hasInitBody = init?.body != null;
    const hasReqBody  = !hasInitBody && typeof Request !== "undefined"
                        && input instanceof Request && !input.bodyUsed;

    if (method !== "POST" || (!hasInitBody && !hasReqBody)) {
      return _fetch.apply(this, [input, init, ...rest]);
    }

    const matchesAI     = isAIUrl(url);
    const matchesGemini = isGeminiUrl(url);
    if (localStorage.getItem("aegisDebug") === "1") {
      let ct = null;
      try { ct = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)).get("content-type"); } catch (_) {}
      dbg("fetch POST", url.slice(0, 140), { matchesAI, matchesGemini, pending: !!pending, hold: !!pendingMappingPromise, ct, bodyType: Object.prototype.toString.call(init?.body ?? null) });
    }

    // Con una sustitución preparada se revisa cualquier POST, aunque la ruta no sea de las conocidas.
    if (!matchesAI && !matchesGemini && !pending) {
      return _fetch.apply(this, [input, init, ...rest]);
    }

    // If content.js is running an emergency SANITIZE (aegis-hold), wait for the result
    // before reading the body so we don't miss the swap.
    if (!pending && pendingMappingPromise) {
      const detail = await pendingMappingPromise;
      pendingMappingPromise = null;
      if (detail) pending = detail;
    }

    try {
      // Read body as string.
      // If body is on a Request object, clone it first (reading the original would consume it).
      // Solo se reemplaza el cuerpo si se consumió un stream; en el resto se deja el original intacto.
      let bodyStr;
      if (hasInitBody) {
        const raw = init.body;
        bodyStr = await toStr(raw);
        if (bodyStr && typeof ReadableStream !== "undefined" && raw instanceof ReadableStream) init = { ...init, body: bodyStr };
      } else {
        bodyStr = await toStr(input.clone().body);
      }

      dbg("fetch body", { type: hasInitBody ? Object.prototype.toString.call(init.body) : "Request", length: bodyStr ? bodyStr.length : 0, pending: !!pending, valuesFoundInBody: bodyStr ? seen(bodyStr) : null });

      // Cuerpos binarios: solo se admite un cambio que conserve la longitud; nunca se reescriben como texto.
      if (hasInitBody && (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body))) {
        let out = null;
        if (pending && pending.entityMap) {
          const b = init.body;
          const arr = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
          out = xhrBinarySwap(arr, pending.entityMap);
        }
        dbg("fetch binary body", { swapped: !!out });
        if (out) {
          init = { ...init, body: out };
          window.dispatchEvent(new CustomEvent("aegis-badge", { detail: { count: pending.interceptions?.length ?? 1 } }));
        }
        return _fetch.apply(this, [input, init, ...rest]);
      }

      if (bodyStr) {

        // Strategy 1: raw swap using pre-tokenized mapping from content.js
        if (pending) {
          const orig  = pending.original;
          const san   = pending.sanitized;
          const count = pending.interceptions?.length ?? 1;
          const pct   = encodeURIComponent(orig);
          const plus  = orig.replace(/ /g, "+");

          let newBodyStr = null;
          if (bodyStr.includes(orig)) {
            newBodyStr = bodyStr.split(orig).join(san);
          } else if (pct !== orig && bodyStr.includes(pct)) {
            newBodyStr = bodyStr.split(pct).join(encodeURIComponent(san));
          } else if (plus !== orig && bodyStr.includes(plus)) {
            newBodyStr = bodyStr.split(plus).join(san.replace(/ /g, "+"));
          }

          // Strategy 1b: per-entity swap
          // Fallback when the full message doesn't appear verbatim (e.g. Gemini's
          // batchexecute URL-encodes the body). Look for each individual PII value.
          if (!newBodyStr && pending.entityMap) {
            let modified = bodyStr;
            let changed  = false;
            for (const [placeholder, value] of Object.entries(pending.entityMap)) {
              if (!value) continue;
              const swapped = swapEntity(modified, value, placeholder);
              if (swapped !== null) { modified = swapped; changed = true; }
            }
            if (changed) newBodyStr = modified;
          }

          if (newBodyStr) {
            init = { ...(init || {}), method: "POST", body: newBodyStr };
            // pending se conserva: un mismo mensaje puede viajar en varias peticiones seguidas
            dbg("fetch SWAP OK");
            window.dispatchEvent(new CustomEvent("aegis-badge", { detail: { count } }));
            return _fetch.apply(this, [input, init, ...rest]);
          }
          dbg("fetch strategy 1 found nothing to swap");
        } else {
          dbg("fetch has NO pending mapping (content.js did not prepare one)");
        }

        // Strategy 2: parse JSON + on-the-fly AEGIS call
        // Fallback when no aegis-mapping was dispatched yet (user clicked very fast).
        // Only runs for known JSON endpoints.
        if (matchesAI || matchesGemini) {
          try {
            const body = JSON.parse(bodyStr);
            const text = extractText(url, body);
            if (text?.trim()) {
              const result = await askAegis(text);
              if (result?.sanitizedText && result.sanitizedText !== text) {
                const newBody = replaceText(url, body, result.sanitizedText);
                init = { ...init, body: JSON.stringify(newBody) };
                window.dispatchEvent(new CustomEvent("aegis-badge", { detail: { count: result.interceptions?.length ?? 1 } }));
              }
            }
          } catch (_) { /* non-JSON body — pass through */ }
        }
      }
    } catch (_) {}

    return _fetch.apply(this, [input, init, ...rest]);
  };

  // Un valor con tildes o "º" puede viajar como í (escapado una o varias veces dentro de otro JSON)
  function unicodeEscapedVariants(value) {
    if (!/[^\x00-\x7f]/.test(value)) return [];
    const out = [];
    for (const bs of ["\\", "\\\\", "\\\\\\\\"]) {
      for (const upper of [false, true]) {
        out.push(value.replace(/[^\x00-\x7f]/g, (c) => {
          const hex = c.charCodeAt(0).toString(16).padStart(4, "0");
          return bs + "u" + (upper ? hex.toUpperCase() : hex);
        }));
      }
    }
    return out;
  }

  // Sustituye un valor por su etiqueta en todas las formas en que puede aparecer en el cuerpo:
  // tal cual, con codificación de URL, con "+" por espacio y con escapes \uXXXX.
  // application/x-www-form-urlencoded: espacio como "+", y "+", "," o "!'()~" en porcentaje
  function formEncode(s) {
    return encodeURIComponent(s)
      .replace(/[!'()~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
      .replace(/%20/g, "+");
  }

  function swapEntity(text, value, placeholder) {
    const encP = encodeURIComponent(placeholder);
    const forms = [[value, placeholder]];
    const encV = encodeURIComponent(value);
    if (encV !== value) forms.push([encV, encP]);
    const frmV = formEncode(value);
    if (frmV !== value && frmV !== encV) forms.push([frmV, encP]);
    const plsV = value.replace(/ /g, "+");
    if (plsV !== value) forms.push([plsV, placeholder.replace(/ /g, "+")]);
    for (const v of unicodeEscapedVariants(value)) {
      forms.push([v, placeholder]);
      forms.push([encodeURIComponent(v), encP]);
      forms.push([formEncode(v), encP]);
    }
    let out = text, hit = false;
    for (const [from, to] of forms) {
      if (from && out.includes(from)) { out = out.split(from).join(to); hit = true; }
    }
    return hit ? out : null;
  }

  // Body -> string (handles all Fetch API body types)
  async function toStr(body) {
    if (body == null) return null;
    if (typeof body === "string") return body;
    if (body instanceof Blob) return body.text();
    if (body instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(body));
    if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
    if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
      const reader = body.getReader();
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const buf = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let off = 0;
      for (const c of chunks) { buf.set(c, off); off += c.length; }
      return new TextDecoder().decode(buf);
    }
    return null;
  }

  // URL detection
  function isAIUrl(url) {
    return (
      url.includes("/backend-api/") ||                      // ChatGPT
      url.includes("/backend-anon/") ||                     // ChatGPT sin sesión
      url.includes("/claudeai-rpc/") ||                     // Claude (RPC nuevo)
      url.includes("generativelanguage.googleapis.com") ||  // Gemini direct API
      url.includes("StreamGenerateContent") ||              // Gemini web (gRPC-web)
      url.includes("claude.ai/api") ||                      // Claude.ai
      url.includes("/api/organizations") ||                  // Claude.ai v2
      url.includes("copilot.microsoft.com")                 // Copilot (all paths)
    );
  }

  function isGeminiUrl(url) {
    return (
      url.includes("gemini.google.com") ||
      url.includes("StreamGenerate") ||
      url.includes("batchexecute") ||
      url.includes("alkalimakersuite") ||
      url.includes("generativelanguage")
    );
  }

  // Text extraction per service
  const CHATGPT_CONV = /\/backend-(?:api|anon)\/(?:f\/)?conversation(?:\/prepare)?(?:[?#]|$)/;

  function extractText(url, body) {
    // ChatGPT
    if (CHATGPT_CONV.test(url)) {
      const msgs = body?.messages;
      if (Array.isArray(msgs) && msgs.length) {
        return msgs[msgs.length - 1]?.content?.parts?.[0] ?? null;
      }
    }
    // Gemini (direct API + web UI via StreamGenerateContent/batchexecute)
    if (url.includes("generativelanguage") || url.includes("StreamGenerate") ||
        url.includes("gemini.google.com") || url.includes("alkalimakersuite")) {
      const contents = body?.contents;
      if (Array.isArray(contents) && contents.length) {
        return contents[contents.length - 1]?.parts?.[0]?.text ?? null;
      }
    }
    // Claude.ai
    if (url.includes("claude.ai") || url.includes("/api/organizations")) {
      return body?.text ?? body?.prompt ?? null;
    }
    // Generic fallback
    return body?.text ?? body?.message ?? body?.content ?? body?.input ?? body?.prompt ?? null;
  }

  // Text replacement per service
  function replaceText(url, body, newText) {
    if (CHATGPT_CONV.test(url)) {
      const msgs = body.messages.map((m, i, arr) =>
        i === arr.length - 1
          ? { ...m, content: { ...m.content, parts: [newText, ...(m.content.parts ?? []).slice(1)] } }
          : m
      );
      return { ...body, messages: msgs };
    }
    if (url.includes("generativelanguage") || url.includes("StreamGenerate") ||
        url.includes("gemini.google.com") || url.includes("alkalimakersuite")) {
      const contents = (body.contents ?? []).map((c, i, arr) =>
        i === arr.length - 1
          ? { ...c, parts: [{ text: newText }, ...(c.parts ?? []).slice(1)] }
          : c
      );
      return { ...body, contents };
    }
    if (url.includes("claude.ai") || url.includes("/api/organizations")) {
      if (body.text !== undefined) return { ...body, text: newText };
      if (body.prompt !== undefined) return { ...body, prompt: newText };
    }
    for (const key of ["text", "message", "content", "input", "prompt"]) {
      if (typeof body[key] === "string") return { ...body, [key]: newText };
    }
    return body;
  }

  // Bridge: MAIN world -> isolated world (for Strategy 2 AEGIS calls)
  function askAegis(text) {
    return new Promise((resolve) => {
      const id = "aegis-" + Math.random().toString(36).slice(2);
      const handler = (e) => {
        if (e.detail?.id === id) {
          window.removeEventListener("aegis-sanitize-response", handler);
          resolve(e.detail);
        }
      };
      window.addEventListener("aegis-sanitize-response", handler);
      window.dispatchEvent(new CustomEvent("aegis-sanitize-request", { detail: { id, text } }));
      setTimeout(() => {
        window.removeEventListener("aegis-sanitize-response", handler);
        resolve(null);
      }, 1500); // 1.5s cap — if server is slow/down the message still goes through
    });
  }

  // XHR interception (Gemini sends messages via XHR, not window.fetch)
  // Overrides open() to capture the URL, then send() to swap PII before the
  // request leaves the browser. Shares `pending` with the fetch interceptor above.
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._aegisMethod = (method || "").toUpperCase();
    this._aegisUrl    = url != null ? String(url) : "";
    return _xhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url    = this._aegisUrl    || "";
    const method = this._aegisMethod || "";
    if (method === "POST") dbg("xhr POST", url.slice(0, 140), { bodyType: Object.prototype.toString.call(body), matches: isAIUrl(url) || isGeminiUrl(url), pending: !!pending });

    if (method !== "POST" || !body || !(isAIUrl(url) || isGeminiUrl(url) || pending)) {
      return _xhrSend.apply(this, [body]);
    }

    // If content.js dispatched aegis-hold (emergency SANITIZE in flight), defer the
    // XHR until the mapping arrives. Re-enter send() after pending is set.
    // Important: do NOT null pendingMappingPromise here - Gemini fires two XHRs
    // (batchexecute + StreamGenerate) back-to-back; both must register on the same
    // promise before it resolves, otherwise the second goes through unmodified.
    if (!pending && pendingMappingPromise) {
      const self = this, b = body, pmp = pendingMappingPromise;
      pmp.then(detail => {
        pendingMappingPromise = null; // clear only after all XHRs have registered
        if (detail) pending = detail;
        self.send(b); // re-enters the override with pending now set
      });
      return;
    }

    // Gemini fires TWO XHR calls per message: batchexecute (saves history) then
    // StreamGenerate (generates the response). We must NOT consume `pending` after
    // the first replacement - both calls need it. `pending` auto-expires after 10s.
    const count = pending?.interceptions?.length ?? 1;

    // String body (URL-encoded form data - Gemini's batchexecute)
    if (typeof body === "string" && pending) {
      const patched = xhrStringSwap(body, pending);
      if (patched) {
        window.dispatchEvent(new CustomEvent("aegis-badge", { detail: { count } }));
        return _xhrSend.apply(this, [patched]);
        // pending intentionally NOT cleared - StreamGenerate fires right after
      }
    }

    // Binary body (gRPC-web proto - Gemini's StreamGenerate)
    // Pads replacement with spaces to keep byte length identical so proto
    // varint length prefixes and gRPC frame headers stay valid.
    if (pending?.entityMap) {
      const arr = body instanceof ArrayBuffer ? new Uint8Array(body)
                : ArrayBuffer.isView(body)    ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
                : null;
      if (arr) {
        const result = xhrBinarySwap(arr, pending.entityMap);
        if (result) {
          window.dispatchEvent(new CustomEvent("aegis-badge", { detail: { count } }));
          return _xhrSend.apply(this, [result]);
          // pending intentionally NOT cleared - may be more calls in the same sequence
        }
      }

      // Blob body (async - defer send until decoded)
      if (body instanceof Blob) {
        const self  = this;
        const snap  = pending; // capture before any async gap
        body.arrayBuffer().then(buf => {
          const bArr   = new Uint8Array(buf);
          const result = xhrBinarySwap(bArr, snap.entityMap);
          if (result) {
            window.dispatchEvent(new CustomEvent("aegis-badge", { detail: { count: snap.interceptions?.length ?? 1 } }));
            _xhrSend.apply(self, [result]);
          } else {
            _xhrSend.apply(self, [body]);
          }
        });
        return; // async path takes over
      }
    }

    // XHR Strategy 2: self-contained detection
    // Fires only when content.js didn't set `pending` (click/Enter handler missed).
    // Decodes the URL-encoded body, detects PII via the askAegis bridge, sets
    // `pending`, then re-enters send() so xhrStringSwap can do per-entity swap.
    // `_aegisS2` flag prevents infinite re-entry.
    if (typeof body === "string" && !this._aegisS2 && (isAIUrl(url) || isGeminiUrl(url))) {
      this._aegisS2 = true;
      const self = this, b = body;
      let decoded = b;
      try { decoded = decodeURIComponent(b.replace(/\+/g, " ")); } catch {}
      askAegis(decoded).then(result => {
        if (result?.interceptions?.length) {
          pending = {
            original:      decoded,
            sanitized:     result.sanitizedText,
            interceptions: result.interceptions,
            entityMap:     result.entityMap || {},
          };
          window.dispatchEvent(new CustomEvent("aegis-badge", {
            detail: { count: result.interceptions.length },
          }));
        }
        self.send(b); // re-enters with pending set; _aegisS2 skips this block
      }).catch(() => _xhrSend.apply(self, [b]));
      return;
    }

    return _xhrSend.apply(this, [body]);
  };

  function xhrStringSwap(bodyStr, pend) {
    const orig = pend.original, san = pend.sanitized;
    const pct  = encodeURIComponent(orig);
    const plus = orig.replace(/ /g, "+");

    if (bodyStr.includes(orig))                  return bodyStr.split(orig).join(san);
    if (pct !== orig && bodyStr.includes(pct))   return bodyStr.split(pct).join(encodeURIComponent(san));
    if (plus !== orig && bodyStr.includes(plus)) return bodyStr.split(plus).join(san.replace(/ /g, "+"));

    if (!pend.entityMap) return null;
    let m = bodyStr, hit = false;
    for (const [ph, v] of Object.entries(pend.entityMap)) {
      if (!v) continue;
      const swapped = swapEntity(m, v, ph);
      if (swapped !== null) { m = swapped; hit = true; }
    }
    return hit ? m : null;
  }

  function xhrBinarySwap(arr, entityMap) {
    const enc    = new TextEncoder();
    let modified = new Uint8Array(arr);
    let changed  = false;
    for (const [ph, v] of Object.entries(entityMap)) {
      if (!v) continue;
      const vB = enc.encode(v), pB = enc.encode(ph);
      if (pB.length > vB.length) continue;           // can't grow — would corrupt proto structure
      const idx = xhrFindBytes(modified, vB);
      if (idx === -1) continue;
      modified.set(pB, idx);
      modified.fill(0x20, idx + pB.length, idx + vB.length); // pad remainder with spaces
      changed = true;
    }
    return changed ? modified.buffer : null;
  }

  function xhrFindBytes(arr, needle) {
    outer: for (let i = 0; i <= arr.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) if (arr[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  }
})();
