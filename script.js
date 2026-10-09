/* ==========================================================
   Glimpse – an infinite, zoomable wall of photos, 30-second
   videos and quotes. Plain JavaScript, no dependencies.

   Storage:
   - When served by server.js, posts go to the server and every
     visitor sees the same wall.
   - Opened any other way (e.g. as a local file), posts are kept
     in this browser with IndexedDB so you can still try it out.
   ========================================================== */
(() => {
  "use strict";

  /* ---------------------------------------------------------
     1. SETTINGS
     --------------------------------------------------------- */
  const MAX_VIDEO_SECONDS = 30;
  const MAX_VIDEO_MB = 60;
  const MAX_PHOTO_MB = 25;          // before resizing in the browser
  const PHOTO_MAX_PX = 1800;        // long edge of the stored photo
  const THUMB_MAX_PX = 520;         // long edge of the wall thumbnail
  const QUOTE_MAX = 280;
  const POLL_MS = 20000;            // how often to check the server for new posts

  const THOUGHT_MAX = 500;

  // Reactions people can leave on thoughts (one per person per thought)
  const REACTIONS = [
    { id: "love",   emoji: "❤️", label: "Love" },
    { id: "hug",    emoji: "🤗", label: "Hug" },
    { id: "haha",   emoji: "😂", label: "Haha" },
    { id: "wow",    emoji: "😮", label: "Wow" },
    { id: "sad",    emoji: "😢", label: "Sad" },
    { id: "relate", emoji: "🙌", label: "Same here" },
  ];

  // Note colours for thoughts
  const TINTS = [
    { id: "cream", label: "Cream", color: "#fbf3d5" },
    { id: "mint",  label: "Mint",  color: "#d6f0e0" },
    { id: "sky",   label: "Sky",   color: "#d9e7fa" },
    { id: "blush", label: "Blush", color: "#fadde1" },
  ];

  const SAMPLE_THOUGHTS = [
    ["Moved to a new city three months ago. Today the guy at the coffee stand knew my order. Small thing, felt huge.", "Wanjiru", "mint", { love: 9, hug: 4, relate: 6 }],
    ["Does anyone else rehearse conversations in the shower that never end up happening?", "Anonymous", "cream", { haha: 14, relate: 21 }],
    ["Finished my first 10K this morning. A year ago I couldn't run to the bus stop.", "Otieno", "sky", { love: 12, wow: 5 }],
    ["Missing my grandmother's cooking today. Trying her recipe tonight and I'll probably get it wrong.", "Anonymous", "blush", { hug: 11, sad: 3, love: 7 }],
  ];

  // A question of the day, the same for everyone (rotates daily)
  const PROMPTS = [
    "What made you smile this week?", "What's a small thing you're grateful for today?", "What song is stuck in your head?",
    "Describe your perfect Sunday.", "What's the best advice you've ever been given?", "What are you looking forward to?",
    "What's something new you learned recently?", "Who made a difference to you this year?", "What does home smell like?",
    "What's your favourite place in your city?", "If today had a colour, what would it be?", "What would you tell your younger self?",
    "What's a dream you haven't told anyone?", "What's the kindest thing a stranger did for you?", "What are you proud of this month?",
    "What's your comfort food?", "Where would you go if you could leave tomorrow?", "What made you laugh out loud recently?",
    "What's a skill you'd love to learn?", "What does a good day look like for you?", "Which book or film changed how you see things?",
    "What's something you've changed your mind about?", "What tradition do you love?", "What's the view from your window right now?",
    "Who would you love to have dinner with?", "What's a sound that makes you happy?", "What's a goal you're working toward?",
    "What's the best thing about where you grew up?", "What are you letting go of?", "What tiny moment felt huge?",
    "What do you wish more people knew?", "What's your favourite way to rest?", "What's a risk you're glad you took?",
    "What's on your mind tonight?", "What season are you in, in life?", "What would make tomorrow great?",
    "What's something beautiful you saw today?", "What's a memory that always makes you smile?", "Who taught you something important?",
    "What do you do when you need courage?", "What's a promise you made to yourself?", "What's your favourite word, and why?",
    "What are you curious about lately?", "What would your theme song be?", "What's the best gift you've ever given?",
    "What did you used to believe as a child?", "What are you saying yes to this year?", "What's a place that feels like a hug?",
    "What's one thing you'd put in a time capsule?", "What's a question you'd ask the future?", "What's your secret talent?",
    "What did today teach you?", "Which moment would you relive?", "What's the bravest thing you've done?",
    "What do you love about your friends?", "What would you name a star?", "What makes your city special?",
    "What's something you made with your hands?", "What do you hope people say about you?", "What are you hopeful about?",
  ];
  const dayIndex = () => { const d = new Date(); return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5); };
  const todayPrompt = () => ((dayIndex() % PROMPTS.length) + PROMPTS.length) % PROMPTS.length;

  const QUOTE_STYLES = [
    { id: "ink",   label: "Ink" },
    { id: "paper", label: "Paper" },
    { id: "sun",   label: "Sun" },
    { id: "bloom", label: "Bloom" },
  ];

  // Starter quotes for the browser-only preview (the server seeds its own copy).
  const SAMPLE_QUOTES = [
    ["We suffer more often in imagination than in reality.", "Seneca", "ink"],
    ["If you want to go fast, go alone. If you want to go far, go together.", "African proverb", "sun"],
    ["Do what you can, with what you have, where you are.", "Theodore Roosevelt", "paper"],
    ["Go confidently in the direction of your dreams.", "Henry David Thoreau", "bloom"],
    ["Nothing great was ever achieved without enthusiasm.", "Ralph Waldo Emerson", "sun"],
    ["Waste no more time arguing what a good person should be. Be one.", "Marcus Aurelius", "ink"],
    ["Little by little, one travels far.", "Proverb", "bloom"],
    ["Until the lion learns to write, tales of the hunt will glorify the hunter.", "African proverb", "paper"],
    ["The best way out is always through.", "Robert Frost", "ink"],
    ["Rest is not idleness.", "John Lubbock", "paper"],
    ["Simplicity is the ultimate sophistication.", "Attributed to Leonardo da Vinci", "sun"],
    ["Wherever you go, go with all your heart.", "Confucius", "bloom"],
  ];

  /* ---------------------------------------------------------
     2. HELPERS
     --------------------------------------------------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const mod = (n, m) => ((n % m) + m) % m;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let calm = (() => { try { return JSON.parse(localStorage.getItem("glimpse:calm")) === true; } catch (_) { return false; } })();
  let reduceMotion = prefersReduced || calm;     // calm mode (in the theme menu) turns motion down too
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // Always escape user content before putting it into HTML.
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const ls = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch (_) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  function timeAgo(ts) {
    const sec = (ts - Date.now()) / 1000;
    const steps = [[60, "second"], [3600, "minute"], [86400, "hour"], [604800, "day"], [2629800, "week"], [31557600, "month"], [Infinity, "year"]];
    const div = [1, 60, 3600, 86400, 604800, 2629800, 31557600];
    for (let i = 0; i < steps.length; i++) {
      if (Math.abs(sec) < steps[i][0]) return rtf.format(Math.round(sec / div[i]), steps[i][1]);
    }
  }

  // Timestamps: compact ("3h ago"), full ("7 Oct 2026, 14:32") and futuristic ("2026.10.07 14:32")
  function shortAgo(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
    const d = new Date(ts), sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString("en", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
  }
  function durationWords(ms) {
    const m = Math.max(1, Math.round(ms / 60000)), h = Math.round(ms / 3600000), d = Math.round(ms / 86400000);
    if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
    if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
    return `${d} days`;
  }
  const fullDate = ts => new Date(ts).toLocaleString("en", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const pad2 = n => String(n).padStart(2, "0");
  function neoDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function stampHTML(p) {
    const ts = p.createdAt || Date.now();
    return `<time class="stamp" datetime="${new Date(ts).toISOString()}" data-ts="${ts}" title="${esc(fullDate(ts))}"><span class="stamp__rel">${shortAgo(ts)}</span><span class="stamp__abs">${neoDate(ts)}</span></time>`;
  }
  // Keep "5m ago" labels fresh
  setInterval(() => {
    document.querySelectorAll(".stamp[data-ts]").forEach(el => { el.firstChild.textContent = shortAgo(+el.dataset.ts); });
  }, 60000);

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2400);
  }

  /* ---------------------------------------------------------
     3. STORAGE
     Both stores expose: list(), create(data, onProgress),
     like(id, delta), remove(id, token)
     --------------------------------------------------------- */
  // Where the server lives. Empty = same site (the website). The Android app sets
  // this in config.js to your server's https address.
  const API = String(window.GLIMPSE_CONFIG?.apiBase || "").replace(/\/+$/, "");
  const IN_APP = !!window.Capacitor?.isNativePlatform?.();
  // Media links come back as "/uploads/…"; point them at the server when it's elsewhere
  const absolute = p => {
    if (!API) return p;
    for (const k of ["url", "thumb", "og"]) if (typeof p[k] === "string" && p[k].startsWith("/")) p[k] = API + p[k];
    return p;
  };
  // Which wall we're on: /w/<slug> on the website (remembered in the app). "" = the public wall.
  let WALL = (location.pathname.match(/^\/w\/([a-z0-9]{6,20})\/?$/) || [])[1] || (IN_APP ? ls.get("glimpse:currentWall", "") : "");
  const wallQS = () => (WALL ? `?wall=${encodeURIComponent(WALL)}` : "");
  // Links people can share (the website address, even from inside the app)
  const SHARE_ORIGIN = API || (location.protocol.startsWith("http") ? location.origin : "");
  const jsonFetch = async (url, opts = {}, fallback = "Something went wrong. Try again.") => {
    const r = await fetch(url, opts);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || fallback);
    return body;
  };
  const postJSON = (url, data) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

  const ServerStore = {
    mode: "server",
    async list() {
      const r = await fetch(`${API}/api/posts${wallQS()}`, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't load the wall.");
      return (await r.json()).map(absolute);
    },
    async get(id) { return absolute(await jsonFetch(`${API}/api/posts/${encodeURIComponent(id)}`, {}, "This post isn't available any more.")); },
    create(data, onProgress) {
      return new Promise((resolve, reject) => {
        const fd = new FormData();
        for (const k of ["type", "author", "caption", "text", "quoteBy", "style", "tint", "width", "height", "duration", "opensAt", "clipStart", "clipEnd", "peaks", "prompt"]) {
          if (data[k] !== undefined && data[k] !== null) fd.append(k, data[k]);
        }
        fd.append("agreed", "1");
        fd.append("deviceId", deviceId);
        if (data.media) fd.append("media", data.media, data.mediaName || "media");
        if (data.thumb) fd.append("thumb", data.thumb, "thumb.jpg");
        if (data.og) fd.append("og", data.og, "og.jpg");
        if (WALL) fd.append("wall", WALL);
        const x = new XMLHttpRequest();
        x.open("POST", `${API}/api/posts`);
        x.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
        x.onload = () => {
          let body = {};
          try { body = JSON.parse(x.responseText); } catch (_) {}
          if (x.status >= 200 && x.status < 300) { if (body.post) absolute(body.post); resolve(body); }
          else if (body.error) reject(new Error(body.error));
          else if (x.status === 413) reject(new Error("The server says this file is too large. If you host the site behind a proxy (e.g. nginx), raise its upload limit to at least 60 MB."));
          else if (x.status === 404 || x.status === 405) reject(new Error("The upload address wasn't found. Start the site with “npm start” and open the address it prints, rather than opening index.html directly."));
          else reject(new Error(`Upload failed (error ${x.status}). Try again.`));
        };
        x.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
        x.send(fd);
      });
    },
    async like(id, delta) {
      const r = await fetch(`${API}/api/posts/${encodeURIComponent(id)}/like`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delta }),
      });
      if (!r.ok) throw new Error("Couldn't save your like.");
      return (await r.json()).likes;
    },
    async react(id, add, remove) {
      const r = await fetch(`${API}/api/posts/${encodeURIComponent(id)}/react`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ add, remove }),
      });
      if (!r.ok) throw new Error("Couldn't save your reaction.");
      return (await r.json()).reactions;
    },
    async report(id, reason, note) {
      const r = await fetch(`${API}/api/posts/${encodeURIComponent(id)}/report`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, note, deviceId }),
      });
      if (!r.ok) throw new Error("Couldn't send the report. Try again.");
    },
    async remove(id, token) {
      const headers = { "X-Delete-Token": token || "" };
      if (wallHostToken()) headers["X-Wall-Token"] = wallHostToken();
      const r = await fetch(`${API}/api/posts/${encodeURIComponent(id)}`, { method: "DELETE", headers });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't delete this post.");
    },
    // Replies on thoughts
    async replies(id) { return jsonFetch(`${API}/api/posts/${encodeURIComponent(id)}/replies`, {}, "Couldn't load the replies."); },
    async addReply(id, text, author) {
      return jsonFetch(`${API}/api/posts/${encodeURIComponent(id)}/replies`, postJSON(null, { text, author, agreed: "1", deviceId }), "Couldn't send your reply.");
    },
    async removeReply(id, rid, token) {
      const headers = { "X-Delete-Token": token || "" };
      if (wallHostToken()) headers["X-Wall-Token"] = wallHostToken();
      const r = await fetch(`${API}/api/posts/${encodeURIComponent(id)}/replies/${encodeURIComponent(rid)}`, { method: "DELETE", headers });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't delete this reply.");
    },
    async reportReply(id, rid, reason, note) {
      await jsonFetch(`${API}/api/posts/${encodeURIComponent(id)}/replies/${encodeURIComponent(rid)}/report`, postJSON(null, { reason, note, deviceId }), "Couldn't send the report.");
    },
    // Private walls
    async wallInfo(slug) { return jsonFetch(`${API}/api/walls/${encodeURIComponent(slug)}`, {}, "That wall doesn't exist (check the link)."); },
    async createWall(name, theme) { return jsonFetch(`${API}/api/walls`, postJSON(null, { name, theme, agreed: "1", deviceId }), "Couldn't create the wall."); },
  };

  const LocalStore = {
    mode: "local",
    db: null,
    mem: new Map(),      // fallback if IndexedDB is unavailable
    urls: new Map(),

    async open() {
      try {
        this.db = await new Promise((res, rej) => {
          const r = indexedDB.open("glimpse", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("posts", { keyPath: "id" });
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      } catch (_) { this.db = null; }
      if (!ls.get("glimpse:seeded", false) || (!this.db && !this.mem.size)) {
        const now = Date.now();
        for (const [i, [text, by, style]] of SAMPLE_QUOTES.entries()) {
          await this._put({ id: "sample-" + i, type: "quote", author: "Glimpse", text, quoteBy: by, style, likes: 3 + ((i * 7) % 20), createdAt: now - (i + 1) * 2.4 * 864e5 });
        }
        ls.set("glimpse:seeded", true);
      }
      if (!ls.get("glimpse:seeded-thoughts", false) || (!this.db && ![...this.mem.values()].some(p => p.type === "thought"))) {
        const now = Date.now();
        for (const [i, [text, author, tint, reactions]] of SAMPLE_THOUGHTS.entries()) {
          await this._put({ id: "sample-thought-" + i, type: "thought", author, text, tint, reactions, likes: 0, createdAt: now - [0.15, 1.6, 4, 11][i] * 864e5 });
        }
        ls.set("glimpse:seeded-thoughts", true);
      }
    },
    _req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    _os(mode) { return this.db.transaction("posts", mode).objectStore("posts"); },
    async _put(p) { if (this.db) await this._req(this._os("readwrite").put(p)); else this.mem.set(p.id, p); },
    async _get(id) { return this.db ? this._req(this._os("readonly").get(id)) : this.mem.get(id); },
    async _all() { return this.db ? this._req(this._os("readonly").getAll()) : [...this.mem.values()]; },
    async _del(id) { if (this.db) await this._req(this._os("readwrite").delete(id)); else this.mem.delete(id); },
    _url(key, blob) { if (!this.urls.has(key)) this.urls.set(key, URL.createObjectURL(blob)); return this.urls.get(key); },
    _view(p) {
      const { mediaBlob, thumbBlob, ...v } = p;
      if (mediaBlob) v.url = this._url(p.id + ":m", mediaBlob);
      if (thumbBlob) v.thumb = this._url(p.id + ":t", thumbBlob);
      return sealView(v);
    },

    async list() {
      return (await this._all()).sort((a, b) => b.createdAt - a.createdAt).map(p => this._view(p));
    },
    async create(d, onProgress) {
      const p = {
        id: uid(), type: d.type, author: d.author || "Anonymous", caption: d.caption || "",
        text: d.text, quoteBy: d.quoteBy, style: d.style, tint: d.tint, opensAt: d.opensAt || undefined,
        reactions: d.type === "thought" ? {} : undefined,
        width: d.width, height: d.height, duration: d.duration,
        clip: d.clipEnd !== undefined ? [d.clipStart, d.clipEnd] : undefined,
        peaks: d.peaks ? JSON.parse(d.peaks) : undefined,
        prompt: d.prompt !== undefined ? Number(d.prompt) : undefined,
        likes: 0, createdAt: Date.now(), mediaBlob: d.media, thumbBlob: d.thumb,
      };
      await this._put(p);
      onProgress?.(1);
      return { post: this._view(p), deleteToken: "local" };
    },
    async like(id, delta) {
      const p = await this._get(id);
      if (!p) return 0;
      p.likes = Math.max(0, (p.likes || 0) + delta);
      await this._put(p);
      return p.likes;
    },
    async react(id, add, remove) {
      const p = await this._get(id);
      if (!p) return {};
      p.reactions = p.reactions || {};
      if (remove) p.reactions[remove] = Math.max(0, (p.reactions[remove] || 0) - 1);
      if (add) p.reactions[add] = (p.reactions[add] || 0) + 1;
      await this._put(p);
      return p.reactions;
    },
    async report() { /* browser-only mode: nothing to send, the post is just hidden here */ },
    async get(id) { const p = await this._get(id); if (!p) throw new Error("This post isn't available any more."); return this._view(p); },
    async replies(id) { const p = await this._get(id); return (p?.replies || []).slice(); },
    async addReply(id, text, author) {
      const p = await this._get(id);
      const reply = { id: uid(), author: author || "Anonymous", text, createdAt: Date.now() };
      p.replies = [...(p.replies || []), reply];
      p.replyCount = p.replies.length;
      await this._put(p);
      return { reply, deleteToken: "local" };
    },
    async removeReply(id, rid) {
      const p = await this._get(id);
      p.replies = (p.replies || []).filter(r => r.id !== rid);
      p.replyCount = p.replies.length;
      await this._put(p);
    },
    async reportReply() {},
    async wallInfo() { throw new Error("Private walls need the server. Run Glimpse with “npm start”."); },
    async createWall() { throw new Error("Private walls need the server. Run Glimpse with “npm start”."); },
    async remove(id) {
      await this._del(id);
      for (const k of [id + ":m", id + ":t"]) {
        if (this.urls.has(k)) { URL.revokeObjectURL(this.urls.get(k)); this.urls.delete(k); }
      }
    },
  };

  async function pickStore() {
    if (API || location.protocol.startsWith("http")) {
      try {
        const r = await fetch(`${API}/api/posts`, { headers: { Accept: "application/json" } });
        if (r.ok && (r.headers.get("content-type") || "").includes("json")) return ServerStore;
      } catch (_) {}
    }
    await LocalStore.open();
    return LocalStore;
  }

  /* ---------------------------------------------------------
     4. STATE
     --------------------------------------------------------- */
  let store = null;
  const state = {
    posts: [],
    type: "all",
    query: "",
    when: "all",          // "all" | "past" | "new"
    until: null,          // timeline slider: only show posts made before this moment
    cutoff: 0,            // the line between past and new
    tokens: ls.get("glimpse:tokens", {}),   // delete tokens for posts made in this browser
    liked: new Set(ls.get("glimpse:liked", [])),
    reacted: ls.get("glimpse:reacted", {}),  // postId -> reaction id chosen in this browser
    hiddenIds: new Set(ls.get("glimpse:hiddenPosts", [])),   // posts this person reported
    blocked: new Set(ls.get("glimpse:blocked", [])),         // people this person blocked
  };
  const postById = id => state.posts.find(p => p.id === id);

  /* ---------------------------------------------------------
     5. CARD MARKUP
     --------------------------------------------------------- */
  function quoteSize(text) {
    const n = text.length;
    return n < 40 ? "xl" : n < 90 ? "l" : n < 170 ? "m" : "s";
  }
  function quoteHTML(p) {
    const style = QUOTE_STYLES.some(s => s.id === p.style) ? p.style : "ink";
    const by = p.quoteBy || p.author;
    return `<div class="quote quote--${style} quote--${quoteSize(p.text || "")}">
      <blockquote>${esc(p.text)}</blockquote>
      <div class="quote__foot">${by ? `<cite>${esc(by)}</cite>` : "<span></span>"}${stampHTML(p)}</div>
    </div>`;
  }
  // Thoughts: a personal note with the poster's initial and a reaction summary
  const hashOf = str => [...String(str)].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);
  const initialOf = name => (!name || name === "Anonymous") ? "?" : [...name.trim()][0].toUpperCase();
  function reactSummary(p) {
    const r = p.reactions || {};
    const total = REACTIONS.reduce((n, x) => n + (r[x.id] || 0), 0);
    if (!total) return `<span class="thought__hint">React</span>`;
    const top = REACTIONS.filter(x => r[x.id] > 0).sort((a, b) => r[b.id] - r[a.id]).slice(0, 3);
    return `<span class="thought__emoji">${top.map(x => x.emoji).join("")}</span><span>${total}</span>`;
  }
  function thoughtHTML(p) {
    const tint = TINTS.some(t => t.id === p.tint) ? p.tint : "cream";
    const n = (p.text || "").length;
    const size = n < 70 ? "xl" : n < 160 ? "l" : n < 300 ? "m" : "s";
    const name = p.author || "Anonymous";
    const h = hashOf(p.id || name);
    const tilt = ((h % 7) - 3) * 0.6;          // a slight, stable tilt per note
    return `<div class="thought thought--${tint} thought--${size}" style="--tilt:${tilt}deg">
      <span class="thought__pin" aria-hidden="true"></span>
      <div class="thought__who"><span class="avatar" style="--hue:${hashOf(name) % 360}">${esc(initialOf(name))}</span><strong>${esc(name)}</strong>${stampHTML(p)}</div>
      ${Number.isInteger(p.prompt) && PROMPTS[p.prompt] ? `<p class="thought__prompt">↳ ${esc(PROMPTS[p.prompt])}</p>` : ""}
      <p class="thought__text">${esc(p.text)}</p>
      <div class="thought__reacts">${reactSummary(p)}${p.replyCount ? `<span class="thought__replies">💬 ${p.replyCount}</span>` : ""}</div>
    </div>`;
  }
  // Voice notes: a waveform you can see from across the wall
  function wavePeaks(p, n = 40) {
    const src = Array.isArray(p.peaks) && p.peaks.length ? p.peaks : Array.from({ length: n }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 0.7 + hashOf(p.id || "") % 7)));
    return Array.from({ length: n }, (_, i) => Math.max(0.06, src[Math.floor((i / n) * src.length)] || 0));
  }
  function voiceHTML(p) {
    const hue = hashOf(p.author || p.id || "") % 360;
    return `<div class="voice" style="--vh:${hue}">
      <div class="voice__top"><span class="voice__mic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg></span><span class="voice__dur">${fmtDur(p.duration || 0)}</span></div>
      <div class="voice__wave" aria-hidden="true">${wavePeaks(p).map(v => `<i style="--v:${v.toFixed(2)}"></i>`).join("")}</div>
      ${p.caption ? `<p class="voice__caption">${esc(p.caption)}</p>` : ""}
      <p class="voice__by">${esc(p.author || "Anonymous")} · ${stampHTML(p)}</p>
    </div>`;
  }
  const clipLength = p => (p.clip ? p.clip[1] - p.clip[0] : p.duration || 0);

  function cardHTML(p) {
    if (p.sealed) return capsuleHTML(p);
    if (p.type === "thought") return thoughtHTML(p);
    if (p.type === "quote") return quoteHTML(p);
    if (p.type === "voice") return voiceHTML(p);
    const badge = p.type === "video"
      ? `<span class="card__badge"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>${fmtDur(clipLength(p))}</span>` : "";
    const caption = p.caption
      ? `<span class="card__caption"><strong>${esc(p.caption)}</strong><span>${esc(p.author)} · ${stampHTML(p)}</span></span>`
      : `<span class="card__caption card__caption--slim"><span>${esc(p.author)} · ${stampHTML(p)}</span></span>`;
    return `<img class="card__img" src="${esc(p.thumb)}" alt="" draggable="false" decoding="async">${badge}${caption}`;
  }
  // Museum-style wall label, shown in the gallery theme
  const QUOTE_MEDIUM = { ink: "Ink on paper", paper: "Letterpress", sun: "Screen print", bloom: "Risograph" };
  function placardHTML(p) {
    if (p.type === "thought" && !p.sealed) return "";       // notes are pinned straight to the wall
    const year = new Date(p.createdAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
    if (p.sealed) {
      return `<span class="placard" aria-hidden="true">
        <strong>${esc(p.author)}</strong>
        <em>Time capsule</em>, sealed ${year}
        <span>Opens ${fullDate(p.opensAt)}</span>
      </span>`;
    }
    if (p.type === "quote") {
      return `<span class="placard" aria-hidden="true">
        <strong>${esc(p.quoteBy || p.author)}</strong>
        <em>Quotation</em>, ${year}
        <span>${QUOTE_MEDIUM[p.style] || "Ink on paper"}${p.quoteBy ? ` · Shared by ${esc(p.author)}` : ""}</span>
      </span>`;
    }
    const medium = p.type === "video" ? `Moving image, ${fmtDur(clipLength(p))}` : p.type === "voice" ? `Sound recording, ${fmtDur(p.duration || 0)}` : "Photograph";
    return `<span class="placard" aria-hidden="true">
      <strong>${esc(p.author)}</strong>
      <em>${esc(p.caption || "Untitled")}</em>, ${year}
      <span>${medium}</span>
    </span>`;
  }

  function aspect(p) {
    if (p.sealed) return 1.2;
    if (p.type === "quote") return 1.15;
    if (p.type === "voice") return p.caption ? 1.05 : 0.9;
    if (p.type === "thought") { const n = (p.text || "").length; return n < 120 ? 0.85 : n < 260 ? 1.05 : 1.3; }
    if (p.width && p.height) return clamp(p.height / p.width, 0.62, 1.6);
    return 1.25;
  }
  function label(p) {
    if (p.sealed) return `Time capsule from ${p.author}, opens ${fullDate(p.opensAt)}`;
    if (p.type === "thought") return `Thought by ${p.author}: ${p.text}`;
    if (p.type === "quote") return `Quote: ${p.text}${p.quoteBy ? `, ${p.quoteBy}` : ""}`;
    if (p.type === "voice") return `Voice note by ${p.author}, ${fmtDur(p.duration || 0)}${p.caption ? `: ${p.caption}` : ""}`;
    return `${p.type === "video" ? "Video" : "Photo"} by ${p.author}${p.caption ? `: ${p.caption}` : ""}`;
  }

  /* ---------------------------------------------------------
     6. THE WALL + INFINITE ZOOM
     Each card has a spot on a repeating tile and a depth between
     0 (far) and 1 (near). Zooming shifts every depth together and
     wraps it, so cards fly past you and come back far away.
     --------------------------------------------------------- */
  const canvas = $("#canvas");
  const world = $("#world");
  let cards = [];
  let tile = { w: 0, h: 0 };
  let vw = innerWidth, vh = innerHeight;
  let BASE = 200, UNIT = 105;

  const S_MIN = 0.35, S_MAX = 4;
  const LOG_RANGE = Math.log(S_MAX / S_MIN);
  const depthScale = de => S_MIN * Math.exp(de * LOG_RANGE);
  const ZOOM_STEP = 0.12;
  const cam = { x: 0, y: 0, vx: 0, vy: 0, z: 0, tz: 0, ax: 0, ay: 0, focus: null };
  let fx = null;   // the effect currently playing (see section 11)

  function buildWall(isFirst) {
    vw = innerWidth; vh = innerHeight;
    const small = vw < 700;
    BASE = small ? 150 : 200;
    UNIT = small ? 78 : 105;
    const cell = small ? 160 : 230;
    tile.w = Math.ceil((vw + 300) / 0.42 / cell) * cell;
    tile.h = Math.ceil((vh + 300) / 0.42 / cell) * cell;
    const cols = tile.w / cell, rows = tile.h / cell;

    world.innerHTML = "";
    cards = [];
    $("#empty").hidden = state.posts.length > 0;
    if (!state.posts.length) return;

    const rand = mulberry32(2026);
    let deck = [];
    const draw = () => {
      if (!deck.length) deck = state.posts.slice().sort(() => rand() - 0.5);
      return deck.pop();
    };

    const frag = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const post = draw();
        const card = {
          post, ar: aspect(post), d0: rand(), seed: rand(), spin: rand() * 2 - 1,
          x: c * cell + rand() * cell * 0.7,
          y: r * cell + rand() * cell * 0.7,
          el: document.createElement("button"),
        };
        const el = card.el;
        el.className = `card card--${post.sealed ? "sealed" : post.type}` + (isFirst && !reduceMotion ? " intro" : "");
        el.type = "button";
        el.tabIndex = -1;
        el.dataset.id = post.id;
        el.setAttribute("aria-label", label(post));
        el.style.setProperty("--w", BASE + "px");
        el.style.setProperty("--ar", card.ar.toFixed(3));
        el.style.setProperty("--delay", (rand() * 1.1).toFixed(2) + "s");
        el.innerHTML = `<div class="card__inner">${cardHTML(post)}${placardHTML(post)}</div>`;
        if (el.classList.contains("intro")) {
          el.addEventListener("animationend", () => el.classList.remove("intro"), { once: true });
        }
        cards.push(card);
        frag.appendChild(el);
      }
    }
    world.appendChild(frag);
    applyFilter();
    render(true);
    timelineSetup();
  }

  // Re-draw the cards for one post (e.g. after reactions change)
  function refreshCards(id) {
    const p = postById(id);
    if (!p) return;
    for (const c of cards) {
      if (c.post.id !== id) continue;
      c.post = p;
      c.el.querySelector(".card__inner").innerHTML = cardHTML(p) + placardHTML(p);
    }
  }

  function render(force) {
    const cx = vw / 2, cy = vh / 2;
    for (const c of cards) {
      const de = mod(c.d0 + cam.z, 1);
      const s = depthScale(de);
      const u = mod(c.x - cam.x, tile.w) - tile.w / 2;
      const v = mod(c.y - cam.y, tile.h) - tile.h / 2;
      const w = UNIT * s, h = w * c.ar;
      const sx = cx + u * s - w / 2;
      const sy = cy + v * s - h / 2;
      const alpha = (0.3 + 0.7 * smooth(0, 0.7, de)) * smooth(0.02, 0.16, de) * (1 - smooth(0.8, 0.97, de));
      c.de = de; c.s = s; c.w = w; c.h = h; c.sx = sx; c.sy = sy;

      // While an effect plays, it moves each card away from its resting spot
      if (fx) {
        const m = fx.E.card(fx, c, fx.t, sx + w / 2, sy + h / 2);
        const a = alpha * m.a;
        const mw = w * m.s * (m.stretch || 1);
        const vis = a > 0.01 && m.s > 0.002 && m.x > -mw && m.x < vw + mw && m.y > -mw && m.y < vh + mw;
        if (vis !== c.visible) { c.visible = vis; c.el.style.visibility = vis ? "visible" : "hidden"; }
        if (!vis) continue;
        let tr = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0)`;
        if (m.stretch && m.stretch !== 1) {
          tr += ` rotate(${m.phi.toFixed(3)}rad) scale(${m.stretch.toFixed(3)}, ${(1 / Math.sqrt(m.stretch)).toFixed(3)}) rotate(${(-m.phi).toFixed(3)}rad)`;
        }
        if (m.rot) tr += ` rotate(${m.rot.toFixed(3)}rad)`;
        tr += ` scale(${((w / BASE) * m.s).toFixed(4)}) translate(-50%, -50%)`;
        c.el.style.transform = tr;
        c.el.style.opacity = a.toFixed(3);
        const zi = Math.round(de * 1000);
        if (zi !== c.zi) { c.zi = zi; c.el.style.zIndex = zi; }
        continue;
      }

      const visible = alpha > 0.01 && sx > -w && sx < vw && sy > -h && sy < vh;
      if (visible !== c.visible || force) {
        c.visible = visible;
        c.el.style.visibility = visible ? "visible" : "hidden";
      }
      if (!visible) continue;
      c.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) scale(${(w / BASE).toFixed(4)})`;
      c.el.style.opacity = alpha.toFixed(3);
      const zi = Math.round(de * 1000);
      if (zi !== c.zi) { c.zi = zi; c.el.style.zIndex = zi; }
      const tab = de > 0.5 && de < 0.8 ? 0 : -1;
      if (tab !== c.tab) { c.tab = tab; c.el.tabIndex = tab; }
    }
  }

  function applyZoom(dz, ax, ay) {
    if (!dz) return;
    const k = Math.exp(dz * LOG_RANGE);
    cam.x += (ax - vw / 2) * (1 - 1 / k);
    cam.y += (ay - vh / 2) * (1 - 1 / k);
    cam.z += dz;
  }
  function zoomBy(dz, ax = vw / 2, ay = vh / 2) {
    if (ax !== cam.ax || ay !== cam.ay) {
      applyZoom(cam.tz - cam.z, cam.ax, cam.ay);
      cam.ax = ax; cam.ay = ay;
    }
    cam.tz += dz;
  }

  function tick() {
    let moved = false;
    const dzLeft = cam.tz - cam.z;
    if (Math.abs(dzLeft) > 0.0002) {
      applyZoom(reduceMotion ? dzLeft : dzLeft * 0.14, cam.ax, cam.ay);
      moved = true;
    }
    if (cam.focus) {
      const c = cam.focus;
      const ox = c.sx + c.w / 2 - vw / 2, oy = c.sy + c.h / 2 - vh / 2;
      const k = reduceMotion ? 1 : 0.1;
      cam.x += (ox / c.s) * k; cam.y += (oy / c.s) * k;
      if (Math.hypot(ox, oy) < 1 && Math.abs(cam.tz - cam.z) < 0.001) cam.focus = null;
      moved = true;
    } else if (!dragging && (Math.abs(cam.vx) > 0.05 || Math.abs(cam.vy) > 0.05)) {
      cam.x += cam.vx; cam.y += cam.vy;
      cam.vx *= 0.93; cam.vy *= 0.93;
      moved = true;
    }
    if (fx) {
      const now = performance.now();
      fx.t = (now - fx.start) / fx.dur;
      fx.dt = Math.min(0.05, (now - fx.last) / 1000);
      fx.last = now;
      if (fx.E.mid && !fx.midDone && fx.t >= fx.E.midAt) { fx.midDone = true; fx.E.mid(fx); }
      if (fx && fx.t >= 1) endFx();
      else { drawFx(); moved = true; }
    }
    if (moved) render();
    requestAnimationFrame(tick);
  }

  // Zoom + pan so the nearest card matching `test` sits mid-screen at a readable size
  function glideTo(test, { instant = false } = {}) {
    applyZoom(cam.tz - cam.z, cam.ax, cam.ay);
    cam.tz = cam.z;
    render();
    let best = null, bestDist = Infinity;
    for (const c of cards) {
      if (!test(c) || c.de < 0.2 || c.de > 0.8) continue;
      const dist = Math.hypot(c.sx + c.w / 2 - vw / 2, c.sy + c.h / 2 - vh / 2);
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    if (!best) return;
    cam.vx = cam.vy = 0;
    cam.ax = vw / 2; cam.ay = vh / 2;
    if (instant) {
      // Jump straight there (used behind an effect, which then reveals the spot)
      applyZoom(0.66 - best.de, vw / 2, vh / 2);
      cam.tz = cam.z;
      render();
      cam.x += (best.sx + best.w / 2 - vw / 2) / best.s;
      cam.y += (best.sy + best.h / 2 - vh / 2) / best.s;
      cam.focus = null;
      render(true);
      return;
    }
    cam.tz = cam.z + (0.66 - best.de);
    cam.focus = best;
  }

  /* ----- Pointer: drag (one pointer), pinch-zoom (two) ----- */
  let dragging = false, pointerDown = false, downCard = null;
  let last = { x: 0, y: 0, t: 0 }, start = { x: 0, y: 0 };
  const pointers = new Map();
  let pinch = null;
  const pinchInfo = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture?.(e.pointerId);
    cam.focus = null;
    if (pointers.size === 2) {
      pinch = pinchInfo();
      dragging = true; downCard = null;
      canvas.classList.add("dragging");
      cam.vx = cam.vy = 0;
      return;
    }
    pointerDown = true;
    downCard = e.target.closest(".card");
    start = { x: e.clientX, y: e.clientY };
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
    cam.vx = cam.vy = 0;
  });

  window.addEventListener("pointermove", e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const now = pinchInfo();
      const dz = Math.log(now.dist / pinch.dist) / LOG_RANGE;
      cam.x -= now.mx - pinch.mx; cam.y -= now.my - pinch.my;
      cam.tz += dz; applyZoom(dz, now.mx, now.my);
      cam.ax = now.mx; cam.ay = now.my;
      pinch = now;
      render();
      return;
    }
    if (!pointerDown) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) {
      dragging = true;
      canvas.classList.add("dragging");
      stopHoverVideo();
    }
    if (dragging) {
      cam.x -= dx; cam.y -= dy;
      const now = performance.now(), dt = Math.max(1, now - last.t);
      cam.vx = (-dx / dt) * 16; cam.vy = (-dy / dt) * 16;
      render();
    }
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) {
        const p = [...pointers.values()][0];
        last = { x: p.x, y: p.y, t: performance.now() };
        return;
      }
    }
    if (pointers.size > 0) return;
    if (!pointerDown && !dragging) return;
    pointerDown = false;
    if (dragging) {
      dragging = false;
      canvas.classList.remove("dragging");
      if (performance.now() - last.t > 80) cam.vx = cam.vy = 0;
    } else if (downCard && e.type === "pointerup") {
      openViewer(downCard.dataset.id, downCard);
    } else if (e.type === "pointerup" && !downCard) {
      sceneTap(e.clientX, e.clientY);
    }
    downCard = null;
  }
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);

  world.addEventListener("keydown", e => {
    const card = e.target.closest(".card");
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openViewer(card.dataset.id, card); }
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    cam.focus = null;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) { cam.x += dx; cam.vx = 0; render(); return; }
    zoomBy(clamp(-dy * (e.ctrlKey ? 0.01 : 0.0012), -0.3, 0.3), e.clientX, e.clientY);
  }, { passive: false });

  const anyModalOpen = () => !$("#viewer").hidden || !$("#composer").hidden;
  window.addEventListener("keydown", e => {
    if (e.target.matches("input, textarea") || anyModalOpen()) return;
    const step = 14;
    if (e.key === "ArrowLeft")  cam.vx -= step;
    if (e.key === "ArrowRight") cam.vx += step;
    if (e.key === "ArrowUp")    cam.vy -= step;
    if (e.key === "ArrowDown")  cam.vy += step;
    if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
    if (e.key === "-" || e.key === "_") zoomBy(-ZOOM_STEP);
  });
  $("#zoomIn").addEventListener("click", () => zoomBy(ZOOM_STEP * 1.5));
  $("#zoomOut").addEventListener("click", () => zoomBy(-ZOOM_STEP * 1.5));

  let resizeT;
  window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => buildWall(false), 150); });

  /* ----- Videos play (muted) while you hover them ----- */
  let hoverVideo = null;
  function stopHoverVideo() { hoverVideo?.remove(); hoverVideo = null; }
  world.addEventListener("pointerover", e => {
    if (e.pointerType !== "mouse" || dragging) return;
    const el = e.target.closest(".card--video");
    if (!el || el.querySelector("video")) return;
    const p = postById(el.dataset.id);
    if (!p?.url) return;
    stopHoverVideo();
    const v = document.createElement("video");
    Object.assign(v, { src: p.url, muted: true, loop: true, playsInline: true, autoplay: true, className: "card__video" });
    v.setAttribute("aria-hidden", "true");
    applyClip(v, p);
    el.querySelector(".card__inner").appendChild(v);
    v.play().catch(() => {});
    hoverVideo = v;
  });
  world.addEventListener("pointerout", e => {
    const el = e.target.closest(".card--video");
    if (el && !el.contains(e.relatedTarget)) stopHoverVideo();
  });

  /* ---------------------------------------------------------
     7. SEARCH + FILTERS
     --------------------------------------------------------- */
  const input = $("#searchInput");
  const status = $("#searchStatus");

  // Past = before the cutoff, New = after it. The cutoff is 24 hours ago, or the
  // middle of the wall's history if that would leave one side nearly empty.
  function computeCutoff() {
    const DAY = 864e5, now = Date.now();
    const when = state.when;
    state.when = "all";                                  // look at the type/search matches, ignoring time
    const pool = state.posts.filter(matches);
    state.when = when;
    const ts = (pool.length >= 2 ? pool : state.posts).map(p => p.createdAt).sort((a, b) => a - b);
    let cut = now - DAY;
    const older = ts.filter(x => x < cut).length;
    const need = Math.min(3, Math.floor(ts.length / 2));
    if (older < need || ts.length - older < need) cut = ts.length ? (ts[Math.floor((ts.length - 1) / 2)] + ts[Math.floor(ts.length / 2)]) / 2 + 1 : now;
    return cut;
  }

  function matches(p) {
    if (state.type !== "all" && p.type !== state.type) return false;
    if (state.until && p.createdAt > state.until) return false;
    if (state.prompt !== null && state.prompt !== undefined && p.prompt !== state.prompt) return false;
    if (state.when === "past" && p.createdAt >= state.cutoff) return false;
    if (state.when === "new" && p.createdAt < state.cutoff) return false;
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const hay = `${p.caption || ""} ${p.text || ""} ${p.quoteBy || ""} ${p.author || ""}`.toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }

  function applyFilter() {
    if (state.when !== "all") state.cutoff = computeCutoff();
    const active = state.type !== "all" || state.query.trim() || state.when !== "all" || state.until || state.prompt !== null;
    const hits = new Set();
    for (const c of cards) {
      const hit = matches(c.post);
      c.el.classList.toggle("is-dim", !!active && !hit);
      if (hit) hits.add(c.post.id);
    }
    if (!active) { status.innerHTML = ""; return hits; }
    const n = state.posts.filter(matches).length;
    const what = state.type === "all" ? "post" : state.type;
    const span = durationWords(Date.now() - state.cutoff);
    let when = state.when === "past" ? ` older than ${span}` : state.when === "new" ? ` from the last ${span}` : "";
    if (state.until) when += ` posted before ${new Date(state.until).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`;
    status.innerHTML = (n
      ? `${n} ${what}${n > 1 ? "s" : ""}${when}${state.query.trim() ? ` matching “${esc(state.query.trim())}”` : ""}.`
      : `Nothing matches yet. Try another word or show all posts.`) + `<button type="button" id="clearSearch">Show all</button>`;
    return hits;
  }

  /* ----- Time travel: Past → Noir, New → Neo Tokyo, Now → back to your theme ----- */
  const TIME_THEMES = { past: "noir", new: "neotokyo" };
  const currentTheme = () => document.documentElement.dataset.theme;

  function setWhen(when) {
    const prev = state.when;
    if (when === "all") resetTimeline();
    state.when = when;
    $$("#timeChips .chip").forEach(ch => ch.setAttribute("aria-pressed", String(ch.dataset.when === when)));
    const cur = currentTheme();
    // "Now" lands in a random theme: never Noir or Neo Tokyo, and never the one you're in
    const randomTheme = () => {
      const options = Object.keys(THEMES).filter(k => !Object.values(TIME_THEMES).includes(k) && k !== cur);
      return options[Math.floor(Math.random() * options.length)];
    };
    const target = when === "all" ? randomTheme() : TIME_THEMES[when];
    const hits = applyFilter();
    const land = instant => { if (when !== "all" && hits.size) glideTo(c => !c.el.classList.contains("is-dim"), { instant }); };
    if (target === cur) { if (prev !== when) land(false); return; }
    const year = new Date().getFullYear();
    const years = when === "past" ? [year, 1947] : when === "new" ? [year, 2087]
      : cur === "noir" ? [1947, year] : cur === "neotokyo" ? [2087, year] : null;
    travelTo(target, { years, after: () => land(true) });
  }
  $("#timeChips").addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (b) setWhen(b.dataset.when);
  });

  // Which effect each filter plays
  const FILTER_FX = { all: ["fireworks", "all"], photo: ["fireworks", "photo"], thought: ["fireworks", "thought"], quote: ["wormhole"], video: ["blackhole"] };

  function setFilter({ type = state.type, query = state.query } = {}, { effect = false } = {}) {
    state.type = type; state.query = query;
    input.value = query;
    $$("#chips .chip").forEach(ch => ch.setAttribute("aria-pressed", String(ch.dataset.type === type)));
    const hits = applyFilter();
    const play = effect && !reduceMotion && cards.length;
    if ((type !== "all" || query.trim()) && hits.size) glideTo(c => !c.el.classList.contains("is-dim"), { instant: play });
    if (play) startFx(...FILTER_FX[type]);
  }

  // Plain-language search: "old photos", "latest thoughts about running", "new videos"…
  const PAST_RE = /\b(past|old|older|oldest|earlier|yesterday|history|vintage|throwback|before|last (week|month|year))\b/gi;
  const NEW_RE = /\b(new|newer|newest|latest|recent|recently|today|fresh|now)\b/gi;
  const TYPE_RE = { photo: /\b(photos?|pictures?|pics?|images?)\b/gi, video: /\b(videos?|clips?)\b/gi, voice: /\b(voice notes?|voices?|audio|recordings?|voicenotes?)\b/gi, quote: /\b(quotes?)\b/gi, thought: /\b(thoughts?|notes?)\b/gi };
  const FILLER_RE = /\b(show|me|find|the|from|of|any|all|some|posts?|about|with|by|and|a|an)\b/gi;
  function parseSearch(text) {
    let rest = text, when = null, type = null;
    if (PAST_RE.test(rest)) when = "past";
    else if (NEW_RE.test(rest)) when = "new";
    for (const [t, re] of Object.entries(TYPE_RE)) { re.lastIndex = 0; if (re.test(rest)) { type = t; break; } }
    for (const re of [PAST_RE, NEW_RE, ...Object.values(TYPE_RE)]) { re.lastIndex = 0; rest = rest.replace(re, " "); }
    PAST_RE.lastIndex = NEW_RE.lastIndex = 0;
    const leftover = rest.replace(FILLER_RE, " ").replace(/\s+/g, " ").trim();
    return { when, type, query: when || type ? leftover : text.trim() };
  }
  $("#searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const typed = input.value;
    const { when, type, query } = parseSearch(typed);
    setFilter({ query, type: type || state.type });
    input.value = typed;
    if (when) setWhen(when);
  });
  input.addEventListener("input", () => { if (!input.value) setFilter({ query: "" }); });
  status.addEventListener("click", e => {
    if (e.target.id !== "clearSearch") return;
    resetTimeline();
    if (state.prompt !== null) { state.prompt = null; $("#qSee").setAttribute("aria-pressed", "false"); $("#qSee").textContent = "See answers"; }
    setFilter({ type: "all", query: "" });
    if (state.when !== "all") setWhen("all");
  });
  $("#chips").addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (b) setFilter({ type: b.dataset.type }, { effect: true });
  });
  $("#discoverToggle").addEventListener("click", e => {
    const collapsed = $("#discover").classList.toggle("collapsed");
    e.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  });

  /* ---------------------------------------------------------
     8. VIEWER
     --------------------------------------------------------- */
  const viewer = $("#viewer");
  let viewing = null, returnFocus = null;

  // Long videos play only their chosen 30-second clip
  function applyClip(v, p) {
    if (!v || !p.clip) return;
    const [a, b] = p.clip;
    v.addEventListener("loadedmetadata", () => { v.currentTime = a; }, { once: true });
    v.addEventListener("timeupdate", () => { if (v.currentTime >= b || v.currentTime < a - 0.5) v.currentTime = a; });
  }

  // Voice note player: play button, a waveform you can tap to seek, and the time
  function voicePlayerHTML(p) {
    return `<div class="vplayer" style="--vh:${hashOf(p.author || p.id || "") % 360}">
      <button class="vplayer__play" type="button" aria-label="Play voice note">
        <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>
        <svg class="i-pause" viewBox="0 0 24 24"><path d="M8 5h3v14H8zM13 5h3v14h-3z"/></svg>
      </button>
      <div class="vplayer__wave" role="slider" tabindex="0" aria-label="Position in the voice note" aria-valuemin="0" aria-valuemax="${Math.round(p.duration || 0)}" aria-valuenow="0">${wavePeaks(p, 64).map(v => `<i style="--v:${v.toFixed(2)}"></i>`).join("")}</div>
      <span class="vplayer__time">0:00 / ${fmtDur(p.duration || 0)}</span>
      <audio src="${esc(p.url)}" preload="auto"></audio>
    </div>`;
  }
  function bindVoicePlayer(root, p, autoplay = true) {
    const a = root.querySelector("audio"), btn = root.querySelector(".vplayer__play"), wave = root.querySelector(".vplayer__wave");
    const bars = [...wave.children], time = root.querySelector(".vplayer__time");
    const total = () => (isFinite(a.duration) && a.duration) || p.duration || 0;
    const sync = () => {
      const f = total() ? a.currentTime / total() : 0;
      bars.forEach((b, i) => b.classList.toggle("on", i / bars.length < f));
      time.textContent = `${fmtDur(a.currentTime)} / ${fmtDur(total())}`;
      wave.setAttribute("aria-valuenow", String(Math.round(a.currentTime)));
      root.classList.toggle("playing", !a.paused);
      btn.setAttribute("aria-label", a.paused ? "Play voice note" : "Pause voice note");
    };
    btn.addEventListener("click", () => (a.paused ? a.play().catch(() => {}) : a.pause()));
    ["timeupdate", "play", "pause"].forEach(ev => a.addEventListener(ev, sync));
    a.addEventListener("ended", () => { a.currentTime = 0; sync(); });
    wave.addEventListener("pointerdown", e => { const r = wave.getBoundingClientRect(); a.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * total(); sync(); });
    wave.addEventListener("keydown", e => {
      if (e.key === "ArrowRight") a.currentTime = Math.min(total(), a.currentTime + 2);
      else if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 2);
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); btn.click(); }
      sync();
    });
    if (autoplay) a.play().catch(() => {});
  }

  function openViewer(id, fromEl) {
    const p = postById(id);
    if (!p) return;
    viewing = p;
    returnFocus = fromEl || document.activeElement;
    stopHoverVideo();

    if (p.sealed) {                                     // a sealed time capsule: only the countdown
      const media = $("#vMedia");
      media.className = "viewer__media viewer__media--quote";
      media.innerHTML = `<div class="viewer__capsule">${capsuleHTML(p, true)}</div>`;
      $("#vAuthor").textContent = p.author || "Anonymous";
      $("#vTime").textContent = `Sealed ${fullDate(p.createdAt)}`;
      $("#vCaption").textContent = `Opens ${fullDate(p.opensAt)}. Nobody can see what's inside until then.`;
      $("#vLike").hidden = true;
      $("#vReacts").hidden = true;
      $(".viewer__bar").classList.remove("viewer__bar--thought");
      $("#vDelete").hidden = !state.tokens[p.id] && !wallHostToken();
      $("#vReport").hidden = true;                       // nothing to see yet; block still works
      $("#vBlock").hidden = !!state.tokens[p.id];
      $("#vShare").hidden = !SHARE_ORIGIN || store.mode !== "server";
      $("#vReplies").hidden = true;
      viewer.hidden = false;
      $(".modal__close", viewer).focus();
      return;
    }

    const media = $("#vMedia");
    media.className = "viewer__media" + (p.type === "quote" || p.type === "thought" ? " viewer__media--quote" : "");
    if (p.type === "photo") {
      media.innerHTML = `<img src="${esc(p.url)}" alt="${esc(p.caption || `Photo by ${p.author}`)}">`;
    } else if (p.type === "video") {
      media.innerHTML = `<video src="${esc(p.url)}" poster="${esc(p.thumb)}" controls autoplay playsinline loop></video>`;
      applyClip(media.querySelector("video"), p);
    } else if (p.type === "voice") {
      media.classList.add("viewer__media--quote");
      media.innerHTML = voicePlayerHTML(p);
      bindVoicePlayer(media.querySelector(".vplayer"), p);
    } else if (p.type === "thought") {
      media.innerHTML = `<div class="viewer__thought">${thoughtHTML(p)}</div>`;
    } else {
      media.innerHTML = `<div class="viewer__quote">${quoteHTML(p)}</div>`;
    }
    $("#vAuthor").textContent = p.author || "Anonymous";
    $("#vTime").textContent = `${timeAgo(p.createdAt)} · ${fullDate(p.createdAt)}`;
    $("#vTime").title = new Date(p.createdAt).toString();
    $("#vCaption").textContent = p.type === "quote" ? (p.quoteBy ? `Shared by ${p.author}` : "")
      : p.type === "thought" ? (Number.isInteger(p.prompt) && PROMPTS[p.prompt] ? `Answering: ${PROMPTS[p.prompt]}` : "") : (p.caption || "");
    const isThought = p.type === "thought";
    $("#vLike").hidden = isThought;
    $("#vReacts").hidden = !isThought;
    $(".viewer__bar").classList.toggle("viewer__bar--thought", isThought);
    if (isThought) renderReacts(); else renderLike();
    $("#vDelete").hidden = !state.tokens[p.id] && !wallHostToken();
    $("#vDelete").textContent = state.tokens[p.id] ? "Delete" : "Remove";
    $("#vReport").hidden = $("#vBlock").hidden = !!state.tokens[p.id];   // not on your own posts
    $("#vShare").hidden = !SHARE_ORIGIN || store.mode !== "server";
    loadReplies(p);
    viewer.hidden = false;
    $(".modal__close", viewer).focus();
  }

  function closeViewer() {
    viewer.hidden = true;
    $("#vMedia").innerHTML = "";        // stops video playback
    $("#vReplyList").innerHTML = "";
    viewing = null;
    if (/^\/p\//.test(location.pathname)) history.replaceState(null, "", WALL ? `/w/${WALL}` : "/");
    returnFocus?.focus?.({ preventScroll: true });
  }

  function renderLike() {
    const liked = state.liked.has(viewing.id);
    const btn = $("#vLike");
    btn.setAttribute("aria-pressed", String(liked));
    btn.setAttribute("aria-label", liked ? "Unlike" : "Like");
    $("#vLikes").textContent = viewing.likes || 0;
  }

  $("#vLike").addEventListener("click", async () => {
    const p = viewing;
    const delta = state.liked.has(p.id) ? -1 : 1;
    delta > 0 ? state.liked.add(p.id) : state.liked.delete(p.id);
    p.likes = Math.max(0, (p.likes || 0) + delta);      // optimistic update
    ls.set("glimpse:liked", [...state.liked]);
    renderLike();
    if (delta > 0) { const b = $("#vLike"); b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse"); }
    try {
      p.likes = await store.like(p.id, delta);
      if (viewing === p) renderLike();
    } catch (err) { toast(err.message); }
  });

  /* ----- Reactions on thoughts ----- */
  function renderReacts(focusId) {
    const p = viewing, box = $("#vReacts");
    const mine = state.reacted[p.id];
    box.innerHTML = REACTIONS.map(r => {
      const n = (p.reactions || {})[r.id] || 0;
      return `<button type="button" class="react" data-r="${r.id}" aria-pressed="${mine === r.id}" aria-label="${r.label}, ${n}" title="${r.label}">
        <span class="react__e" aria-hidden="true">${r.emoji}</span><span class="react__n" aria-hidden="true">${n || ""}</span>
      </button>`;
    }).join("");
    if (focusId) box.querySelector(`[data-r="${focusId}"]`)?.focus();
  }

  $("#vReacts").addEventListener("click", async e => {
    const b = e.target.closest(".react");
    if (!b) return;
    const p = viewing, id = b.dataset.r;
    const prev = state.reacted[p.id] || null;
    const add = prev === id ? null : id;       // tapping your reaction again removes it
    const remove = prev;
    const hadFocus = $("#vReacts").contains(document.activeElement);

    // Update right away, then confirm with the server
    p.reactions = { ...(p.reactions || {}) };
    if (remove) p.reactions[remove] = Math.max(0, (p.reactions[remove] || 0) - 1);
    if (add) p.reactions[add] = (p.reactions[add] || 0) + 1;
    if (add) state.reacted[p.id] = add; else delete state.reacted[p.id];
    ls.set("glimpse:reacted", state.reacted);
    renderReacts(hadFocus ? id : null);
    if (add) $(`#vReacts [data-r="${add}"]`)?.classList.add("pop");
    refreshCards(p.id);

    try {
      p.reactions = await store.react(p.id, add, remove);
      if (viewing === p) renderReacts(hadFocus ? id : null);
      refreshCards(p.id);
    } catch (err) { toast(err.message); }
  });

  $("#vDelete").addEventListener("click", async () => {
    const p = viewing;
    if (!confirm("Delete this post from the wall? This can't be undone.")) return;
    try {
      await store.remove(p.id, state.tokens[p.id]);
      delete state.tokens[p.id];
      ls.set("glimpse:tokens", state.tokens);
      state.posts = state.posts.filter(x => x.id !== p.id);
      closeViewer();
      buildWall(false);
      toast("Post deleted");
    } catch (err) { toast(err.message); }
  });

  viewer.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeViewer(); });

  /* ---------------------------------------------------------
     9. COMPOSER
     --------------------------------------------------------- */
  const composer = $("#composer");
  const form = $("#composeForm");
  const fileInput = $("#fileInput");
  const drop = $("#drop");
  const preview = $("#dropPreview");
  const postBtn = $("#postBtn");
  const errorEl = $("#formError");
  const quoteText = $("#quoteText");
  const quoteBy = $("#quoteBy");
  const authorName = $("#authorName");
  const thoughtText = $("#thoughtText");
  let kind = "photo", prepared = null, quoteStyle = "ink", thoughtTint = "cream", busy = false;
  let photoFilter = "none", voicePrepared = null;

  // Note colour swatches for thoughts
  $("#tintRow").innerHTML = TINTS.map((t, i) => `
    <label class="swatch" title="${t.label}">
      <input type="radio" name="tint" value="${t.id}" ${i === 0 ? "checked" : ""} aria-label="${t.label}">
      <span aria-hidden="true" style="background:${t.color}"></span>
    </label>`).join("");
  $("#tintRow").addEventListener("change", e => { thoughtTint = e.target.value; updateThoughtPreview(); });
  function updateThoughtPreview() {
    $("#thoughtPreview").innerHTML = thoughtHTML({
      id: "preview", text: thoughtText.value.trim() || "What's on your mind?",
      author: authorName.value.trim() || "Anonymous", tint: thoughtTint, reactions: {},
    });
    $("#thoughtCount").textContent = `${thoughtText.value.length} / ${THOUGHT_MAX}`;
  }

  // Style swatches
  $("#styleRow").innerHTML = QUOTE_STYLES.map((s, i) => `
    <label class="swatch swatch--${s.id}" title="${s.label}">
      <input type="radio" name="qstyle" value="${s.id}" ${i === 0 ? "checked" : ""} aria-label="${s.label}">
      <span aria-hidden="true">Aa</span>
    </label>`).join("");
  $("#styleRow").addEventListener("change", e => { quoteStyle = e.target.value; updateQuotePreview(); });

  function openComposer() {
    authorName.value = ls.get("glimpse:name", "");
    setKind(kind);
    composer.hidden = false;
    $(".seg [aria-selected='true']").focus();
  }
  function closeComposer() {
    if (busy) return;
    composer.hidden = true;
    clearFile();
    form.reset();
    quoteStyle = "ink";
    thoughtTint = "cream";
    $("#capsuleWhen").hidden = true;
    stopRecording();
    clearVoice();
    $("#promptToggle").checked = false;
    labelPostBtn();
    errorEl.textContent = "";
    updateQuotePreview();
    updateThoughtPreview();
  }

  function setKind(k) {
    kind = k;
    $$(".seg button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.kind === k)));
    const isMedia = k === "photo" || k === "video";
    $("#mediaPane").hidden = !isMedia;
    $("#quotePane").hidden = k !== "quote";
    $("#thoughtPane").hidden = k !== "thought";
    $("#voicePane").hidden = k !== "voice";
    if (k !== "voice") stopRecording();
    if (isMedia) {
      fileInput.accept = k === "photo" ? "image/*" : "video/mp4,video/webm,video/quicktime,video/*";
      $("#dropTitle").textContent = k === "photo" ? "Choose a photo" : "Choose a video";
      $("#dropSub").textContent = k === "photo"
        ? "or drop it here. JPG, PNG or WebP."
        : `or drop it here. Up to ${MAX_VIDEO_MB} MB; longer videos are trimmed to ${MAX_VIDEO_SECONDS} seconds.`;
      if (prepared && prepared.kind !== k) clearFile();
    }
    errorEl.textContent = "";
    updatePostBtn();
  }
  $(".seg").addEventListener("click", e => { const b = e.target.closest("button[data-kind]"); if (b) setKind(b.dataset.kind); });

  function clearFile() {
    if (prepared?.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
    prepared?.source?.close?.();
    prepared = null;
    photoFilter = "none";
    $("#filters").hidden = true;
    $("#trim").hidden = true;
    preview.innerHTML = "";
    drop.classList.remove("has-file");
    fileInput.value = "";
    updatePostBtn();
  }

  function updatePostBtn() {
    const ok = kind === "quote" ? quoteText.value.trim().length >= 2
      : kind === "thought" ? thoughtText.value.trim().length >= 2
      : kind === "voice" ? !!voicePrepared
      : !!prepared;
    postBtn.disabled = !ok || busy;
  }

  // Wait for one of two events, with a timeout
  function once(el, okEvt, badEvt, ms = 15000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { cleanup(); rej(new Error("timeout")); }, ms);
      const ok = () => { cleanup(); res(); };
      const bad = () => { cleanup(); rej(new Error(badEvt)); };
      const cleanup = () => { clearTimeout(t); el.removeEventListener(okEvt, ok); if (badEvt) el.removeEventListener(badEvt, bad); };
      el.addEventListener(okEvt, ok, { once: true });
      if (badEvt) el.addEventListener(badEvt, bad, { once: true });
    });
  }

  function toJpeg(src, maxPx, quality, pixelFilter = null) {
    const sw = src.videoWidth || src.naturalWidth || src.width;
    const sh = src.videoHeight || src.naturalHeight || src.height;
    const k = Math.min(1, maxPx / Math.max(sw, sh));
    const w = Math.round(sw * k), h = Math.round(sh * k);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);    // flatten transparent PNGs
    ctx.drawImage(src, 0, 0, w, h);
    if (pixelFilter) { const img = ctx.getImageData(0, 0, w, h); pixelFilter(img.data, w, h); ctx.putImageData(img, 0, 0); }
    return new Promise((res, rej) => cv.toBlob(b => (b ? res({ blob: b, w, h }) : rej(new Error("encode"))), "image/jpeg", quality));
  }

  // Some phones and browsers leave file.type empty, so fall back to the file extension.
  const PHOTO_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp)$/i;
  const VIDEO_TYPES = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", mkv: "video/x-matroska" };
  function fileKind(file) {
    if (file.type.startsWith("image/") || (!file.type && PHOTO_EXT.test(file.name))) return "photo";
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (file.type.startsWith("video/") || VIDEO_TYPES[ext]) return "video";
    return null;
  }
  function videoType(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    return VIDEO_TYPES[ext] || (file.type.startsWith("video/") ? file.type : "video/mp4");
  }

  // Decode a photo, trying the fast path first and a plain <img> as a fallback (older Safari)
  async function decodePhoto(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (_) {}
    try { return await createImageBitmap(file); } catch (_) {}
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  async function preparePhoto(file) {
    if (fileKind(file) !== "photo") throw new Error("That file isn't a photo. Choose a JPG, PNG or WebP image.");
    if (file.size > MAX_PHOTO_MB * 1e6) throw new Error(`That photo is ${Math.round(file.size / 1e6)} MB. Choose one under ${MAX_PHOTO_MB} MB.`);
    let src;
    try {
      src = await decodePhoto(file);
    } catch (_) {
      const heic = /\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type);
      throw new Error(heic
        ? "This browser can't open iPhone HEIC photos. Open the site in Safari, or on the iPhone go to Settings › Camera › Formats and choose Most Compatible."
        : "Your browser can't open this photo format. Try a JPG or PNG instead.");
    }
    const full = await toJpeg(src, PHOTO_MAX_PX, 0.86);
    const thumb = await toJpeg(src, THUMB_MAX_PX, 0.8);
    return {
      kind: "photo", media: full.blob, mediaName: "photo.jpg", thumb: thumb.blob, source: src,
      width: full.w, height: full.h, previewUrl: URL.createObjectURL(thumb.blob),
    };
  }

  async function prepareVideo(file) {
    if (fileKind(file) !== "video") throw new Error("That file isn't a video. Choose an MP4, WebM or MOV clip.");
    if (file.size > MAX_VIDEO_MB * 1e6) throw new Error(`That video is ${Math.round(file.size / 1e6)} MB. Videos can be up to ${MAX_VIDEO_MB} MB.`);
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    try {
      await once(v, "loadeddata", "error");
      let d = v.duration;
      if (!isFinite(d)) {                         // some WebM files don't report length up front
        v.currentTime = 1e7;
        await once(v, "seeked");
        d = v.duration;
      }
      if (!(d > 0)) throw new Error("length");
      const long = d > MAX_VIDEO_SECONDS + 0.5;          // long videos: you choose a 30-second clip
      v.currentTime = Math.min(1, d / 3);
      await once(v, "seeked");
      const thumb = await toJpeg(v, THUMB_MAX_PX, 0.8);
      return {
        kind: "video", media: new File([file], file.name || "video.mp4", { type: videoType(file) }),
        mediaName: file.name || "video.mp4", thumb: thumb.blob, probe: v,
        width: v.videoWidth, height: v.videoHeight, duration: Math.round(d * 100) / 100, previewUrl: url,
        clip: long ? [0, MAX_VIDEO_SECONDS] : null,
      };
    } catch (err) {
      URL.revokeObjectURL(url);
      if (err.message.includes("seconds")) throw err;
      throw new Error("This browser can't play this video, so it can't be checked or posted. iPhone videos often use HEVC: open the site in Safari, or on the iPhone go to Settings › Camera › Formats and choose Most Compatible. MP4 (H.264) works everywhere.");
    }
  }

  async function takeFile(file) {
    if (!file) return;
    clearFile();
    errorEl.textContent = "";
    drop.classList.add("busy");
    try {
      const fk = fileKind(file);
      if (!fk) throw new Error("That file type isn't supported. Choose a photo (JPG, PNG, WebP) or a video (MP4, MOV, WebM).");
      if (fk !== kind) setKind(fk);
      prepared = kind === "video" ? await prepareVideo(file) : await preparePhoto(file);
      preview.innerHTML = prepared.kind === "video"
        ? `<video src="${prepared.previewUrl}" muted autoplay loop playsinline></video><span class="meta">${fmtDur(prepared.clip ? MAX_VIDEO_SECONDS : prepared.duration)}</span>`
        : `<img src="${prepared.previewUrl}" alt="Selected photo">`;
      drop.classList.add("has-file");
      if (prepared.kind === "video" && prepared.clip) setupTrim();
      if (prepared.kind === "photo") setupFilters();
    } catch (err) {
      errorEl.textContent = err.message;
      fileInput.value = "";
    } finally {
      drop.classList.remove("busy");
      updatePostBtn();
    }
  }

  fileInput.addEventListener("change", () => takeFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", e => { e.preventDefault(); takeFile(e.dataTransfer.files[0]); });

  function updateQuotePreview() {
    const text = quoteText.value.trim() || "Your words here.";
    $("#quotePreview").innerHTML = quoteHTML({ text, quoteBy: quoteBy.value.trim(), author: authorName.value.trim(), style: quoteStyle });
    $("#quoteCount").textContent = `${quoteText.value.length} / ${QUOTE_MAX}`;
  }
  [quoteText, quoteBy, authorName, thoughtText].forEach(el => el.addEventListener("input", () => { updateQuotePreview(); updateThoughtPreview(); updatePostBtn(); }));
  updateQuotePreview();
  updateThoughtPreview();

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (postBtn.disabled) return;
    const author = authorName.value.trim();
    ls.set("glimpse:name", author);
    const data = { type: kind, author: author || "Anonymous" };
    const sealing = $("#capsuleToggle").checked;
    if (sealing) {
      const opensAt = new Date($("#capsuleDate").value).getTime();
      if (!(opensAt > Date.now() + 60 * 1000)) { errorEl.textContent = "Pick an opening time at least a minute from now."; return; }
      data.opensAt = opensAt;
    }
    if (kind === "quote") {
      Object.assign(data, { text: quoteText.value.trim().slice(0, QUOTE_MAX), quoteBy: quoteBy.value.trim(), style: quoteStyle });
    } else if (kind === "thought") {
      Object.assign(data, { text: thoughtText.value.trim().slice(0, THOUGHT_MAX), tint: thoughtTint });
      if ($("#promptToggle").checked) data.prompt = todayPrompt();
    } else if (kind === "voice") {
      Object.assign(data, {
        caption: $("#voiceCaption").value.trim(), media: voicePrepared.media, mediaName: voicePrepared.mediaName,
        duration: voicePrepared.duration, peaks: JSON.stringify(voicePrepared.peaks),
      });
    } else {
      Object.assign(data, {
        caption: $("#caption").value.trim(),
        media: prepared.media, mediaName: prepared.mediaName, thumb: prepared.thumb,
        width: prepared.width, height: prepared.height, duration: prepared.duration,
      });
    }

    busy = true; updatePostBtn();
    errorEl.textContent = "";
    postBtn.textContent = "Preparing…";
    try {
      // Photo filter: re-render the full photo and its thumbnail with it
      if (kind === "photo" && photoFilter !== "none" && prepared.source) {
        const fn = filterFn(photoFilter);
        data.media = (await toJpeg(prepared.source, PHOTO_MAX_PX, 0.86, fn)).blob;
        data.thumb = (await toJpeg(prepared.source, THUMB_MAX_PX, 0.8, fn)).blob;
      }
      // Long video: send the chosen clip, with a thumbnail from inside it
      if (kind === "video" && prepared.clip) {
        const [a, b] = prepared.clip;
        Object.assign(data, { clipStart: a.toFixed(2), clipEnd: b.toFixed(2) });
        const target = a + Math.min(1, (b - a) / 3);
        if (Math.abs(prepared.probe.currentTime - target) > 0.05) { prepared.probe.currentTime = target; await once(prepared.probe, "seeked", "error", 5000); }
        data.thumb = (await toJpeg(prepared.probe, THUMB_MAX_PX, 0.8)).blob;
      }
      // A 1200×630 picture for link previews (WhatsApp, X, Facebook…)
      if (store.mode === "server") data.og = await makeOgImage(data).catch(() => null);
    } catch (err) { console.warn("Preparing extras failed:", err); }
    const bar = $("#uploadBar");
    const textOnly = kind === "quote" || kind === "thought";   // voice notes upload a file, so they show progress
    bar.hidden = textOnly;
    bar.style.setProperty("--p", "0%");
    postBtn.textContent = sealing ? "Sealing…" : textOnly ? "Posting…" : "Uploading…";

    try {
      const { post, deleteToken } = await store.create(data, p => bar.style.setProperty("--p", Math.round(p * 100) + "%"));
      state.tokens[post.id] = deleteToken;
      ls.set("glimpse:tokens", state.tokens);
      // the live stream may have delivered it already
      if (!state.posts.some(x => x.id === post.id)) state.posts.unshift(post);
      busy = false;
      closeComposer();
      if (state.type !== "all" && state.type !== post.type) setFilter({ type: "all" });
      timelineSetup();
      buildWall(false);
      glideTo(c => c.post.id === post.id);
      if (sealing) { toast(`Time capsule sealed until ${fullDate(data.opensAt)}`); Sound.sfx("seal"); }
      else toast("Posted to the wall");
    } catch (err) {
      console.error("Post failed:", err);
      errorEl.textContent = err.message || "Couldn't post. Try again.";
    } finally {
      busy = false;
      bar.hidden = true;
      labelPostBtn();
      updatePostBtn();
    }
  });

  composer.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeComposer(); });
  document.addEventListener("click", e => {
    if (e.target.closest("[data-open-composer]")) { if (rulesAccepted()) openComposer(); else openRules(openComposer); }
    if (e.target.closest("[data-open-rules]")) openRules();
  });

  window.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!$("#report").hidden) closeReport();
    else if (!$("#rules").hidden) closeRules();
    else if (!$("#wallShare").hidden) $("#wallShare").hidden = true;
    else if (!$("#wallCreate").hidden) $("#wallCreate").hidden = true;
    else if (!viewer.hidden) closeViewer();
    else if (!composer.hidden) closeComposer();
  });

  /* ---------------------------------------------------------
     11. EFFECTS
     Each effect has:
       card(fx, card, t, restX, restY) → where that card is drawn at
         time t (0→1): { x, y, s(scale), a(alpha), rot, stretch, phi }
       draw(fx, ctx, t, dt) → paints sparks, rings, the black hole…
         on the #fx canvas above the wall.
     --------------------------------------------------------- */
  const fxCanvas = $("#fx");
  const fxCtx = fxCanvas.getContext("2d");
  let fxDpr = 1;
  const TAU = Math.PI * 2;
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = {
    inCubic: t => t * t * t,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outBack: t => { const k = 1.6; return 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2); },
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const polar = (fx, x, y) => { const dx = x - fx.cx, dy = y - fx.cy; return { r: Math.hypot(dx, dy), th: Math.atan2(dy, dx) }; };
  const fromPolar = (fx, r, th) => ({ x: fx.cx + Math.cos(th) * r, y: fx.cy + Math.sin(th) * r });

  function sizeFx() {
    fxDpr = Math.min(devicePixelRatio || 1, 1.5);
    fxCanvas.width = Math.round(innerWidth * fxDpr);
    fxCanvas.height = Math.round(innerHeight * fxDpr);
  }

  function startFx(name, variant, opts = {}) {
    if (reduceMotion || !cards.length) return;
    endFx();
    sizeFx();
    const E = EFFECTS[name];
    const now = performance.now();
    fx = { name, variant, E, opts, start: now, last: now, t: 0, dt: 0, dur: E.dur, cx: vw / 2, cy: vh / 2, maxR: Math.hypot(vw, vh) / 2, parts: [] };
    Sound.sfx(name, opts);
    E.init?.(fx);
    canvas.classList.add("fx-running");
    render(true);
  }

  function endFx() {
    if (!fx) return;
    if (fx.E.mid && !fx.midDone) { fx.midDone = true; fx.E.mid(fx); }   // e.g. still switch the theme if skipped
    fx.E.end?.(fx);
    fx = null;
    fxCtx.setTransform(1, 0, 0, 1, 0, 0);
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    canvas.classList.remove("fx-running");
    canvas.style.transform = "";
    render(true);
  }

  function drawFx() {
    const ctx = fxCtx;
    ctx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, vw, vh);
    fx.E.draw(fx, ctx, fx.t, fx.dt);
  }

  // A soft glowing dot
  function glow(ctx, x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace("ALPHA", alpha));
    g.addColorStop(1, color.replace("ALPHA", 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Shared spark physics: drag, gravity, fading streaks
  function stepSparks(fx, ctx, dt, gravity = 260) {
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const keep = [];
    for (const p of fx.parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const px = p.x, py = p.y;
      p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt;
      p.vy += gravity * p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const f = p.life / p.max;
      let a = Math.min(1, f * 1.4);
      if (f < 0.45) a *= 0.55 + 0.45 * Math.random();       // glitter as it dies
      ctx.strokeStyle = `hsla(${p.h}, ${p.sat}%, ${p.l}%, ${a})`;
      ctx.lineWidth = p.w * (0.4 + f * 0.8);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y); ctx.stroke();
      keep.push(p);
    }
    fx.parts = keep;
  }

  const FIREWORK_HUES = {
    all:     [0, 35, 55, 140, 190, 265, 310],
    photo:   [40, 18, 350, 195, 280],
    thought: [48, 150, 205, 340],           // the note colours, glowing
    capsule: [44, 50, 270, 285, 190],       // gold and violet, like the capsules
  };

  const EFFECTS = {
    /* ---- 1. FIREWORKS: a rocket rises, bursts, and the cards are flung out with the sparks ---- */
    fireworks: {
      dur: 2600,
      init(fx) {
        const { cx, cy } = fx;
        fx.hues = FIREWORK_HUES[fx.variant] || FIREWORK_HUES.all;
        fx.burstAt = 0.17;
        fx.bursts = [
          { t: 0.17, x: cx, y: cy, n: 300, speed: 560, main: true },
          { t: 0.36, x: cx - vw * 0.27, y: cy - vh * 0.2, n: 120, speed: 330 },
          { t: 0.45, x: cx + vw * 0.28, y: cy - vh * 0.12, n: 120, speed: 330 },
          { t: 0.55, x: cx + vw * 0.06, y: cy + vh * 0.22, n: 100, speed: 300 },
          { t: 0.63, x: cx - vw * 0.12, y: cy - vh * 0.3, n: 90, speed: 280 },
        ];
        fx.flashes = [];
      },
      draw(fx, ctx, t, dt) {
        const { cx, cy } = fx;
        // Night falls for a moment
        const dark = seg(t, 0, 0.12) * (1 - seg(t, 0.5, 1));
        ctx.fillStyle = `rgba(4, 5, 18, ${0.72 * dark})`;
        ctx.fillRect(0, 0, vw, vh);

        // Rocket
        if (t < fx.burstAt) {
          const k = ease.outCubic(seg(t, 0, fx.burstAt));
          const y = vh + 20 - (vh + 20 - cy) * k;
          const x = cx + Math.sin(k * 9) * 4;
          for (let i = 0; i < 3; i++) {
            fx.parts.push({ x, y, vx: rnd(-40, 40), vy: rnd(60, 160), drag: 2, g: 0.6, life: rnd(0.25, 0.5), max: 0.5, h: 40, sat: 100, l: 70, w: 2 });
          }
          ctx.globalCompositeOperation = "lighter";
          glow(ctx, x, y, 26, "hsla(45, 100%, 85%, ALPHA)", 0.95);
        }

        // Bursts
        for (const b of fx.bursts) {
          if (b.done || t < b.t) continue;
          b.done = true;
          const hue = fx.hues[Math.floor(Math.random() * fx.hues.length)];
          for (let i = 0; i < b.n; i++) {
            const ang = (i / b.n) * TAU + rnd(-0.04, 0.04);
            const sp = b.speed * (b.main ? rnd(0.35, 1.05) : rnd(0.55, 1));
            const h = Math.random() < 0.7 ? hue : fx.hues[Math.floor(Math.random() * fx.hues.length)];
            const life = rnd(1.0, b.main ? 1.9 : 1.4);
            fx.parts.push({ x: b.x, y: b.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: 1.7, g: 1, life, max: life, h, sat: 100, l: rnd(60, 80), w: b.main ? 2.6 : 2 });
          }
          if (b.main) {                                   // golden willow trails
            for (let i = 0; i < 90; i++) {
              const ang = rnd(0, TAU), sp = rnd(80, 260), life = rnd(1.6, 2.4);
              fx.parts.push({ x: b.x, y: b.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: 1.2, g: 0.55, life, max: life, h: 42, sat: 90, l: 72, w: 1.4 });
            }
          }
          fx.flashes.push({ x: b.x, y: b.y, t0: t, r: b.main ? 340 : 170 });
        }

        // Flashes
        ctx.globalCompositeOperation = "lighter";
        for (const f of fx.flashes) {
          const k = seg(t, f.t0, f.t0 + 0.12);
          if (k >= 1) continue;
          glow(ctx, f.x, f.y, f.r * (0.4 + k), "hsla(50, 100%, 92%, ALPHA)", 0.9 * (1 - k));
        }
        stepSparks(fx, ctx, dt);
      },
      card(fx, c, t, bx, by) {
        const bt = fx.burstAt + c.seed * 0.06;
        if (t < bt) return { x: fx.cx, y: fx.cy, s: 0, a: 0 };
        const p = ease.outExpo(seg(t, bt, bt + 0.6));
        const droop = Math.sin(p * Math.PI) * 50 * c.seed;  // a little fall, like sparks
        return {
          x: fx.cx + (bx - fx.cx) * p,
          y: fx.cy + (by - fx.cy) * p + droop,
          s: 0.15 + 0.85 * ease.outBack(seg(t, bt, bt + 0.55)),
          rot: (1 - p) * c.spin * Math.PI * 2.4,
          a: seg(t, bt, bt + 0.1),
        };
      },
    },

    /* ---- 2. WORMHOLE: cards spiral into a tunnel of light and come out the other side ---- */
    wormhole: {
      dur: 2700,
      init(fx) {
        for (let i = 0; i < 260; i++) fx.parts.push({ ang: rnd(0, TAU), z: Math.random(), sp: rnd(0.6, 1.4), h: rnd(180, 320) });
      },
      draw(fx, ctx, t, dt) {
        const { cx, cy, maxR } = fx;
        const env = seg(t, 0, 0.16) * (1 - seg(t, 0.72, 1));
        const swirl = t * 5;

        // Darken toward the throat
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
        g.addColorStop(0, `rgba(3, 0, 14, ${0.92 * env})`);
        g.addColorStop(1, `rgba(3, 0, 14, ${0.5 * env})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, vw, vh);

        ctx.globalCompositeOperation = "lighter";
        // Rings rushing toward you
        const N = 30;
        for (let i = 0; i < N; i++) {
          const z = mod(i / N + t * 1.7, 1);
          const r = 4 + Math.pow(z, 2.6) * maxR * 1.25;
          const wob = (1 - z) * 34;
          const hue = 190 + ((z * 140 + t * 160) % 150);      // cyan → violet → magenta
          ctx.strokeStyle = `hsla(${hue}, 95%, 66%, ${env * z * (1 - z) * 3.2})`;
          ctx.lineWidth = 0.6 + z * 6;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(swirl + z * 5) * wob, cy + Math.sin(swirl + z * 5) * wob, r, r * 0.9, swirl * 0.4 + z * 3, 0, TAU);
          ctx.stroke();
        }
        // Spiral arms
        ctx.lineWidth = 2;
        for (let a = 0; a < 6; a++) {
          ctx.strokeStyle = `hsla(${200 + a * 22}, 100%, 70%, ${0.32 * env})`;
          ctx.beginPath();
          for (let r = 4; r < maxR; r += 10) {
            const th = (a / 6) * TAU + r * 0.011 + swirl;
            const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r * 0.9;
            r === 4 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // Streaks flying out of the throat
        ctx.lineCap = "round";
        for (const p of fx.parts) {
          const z0 = p.z;
          p.z += dt * 0.9 * p.sp;
          if (p.z > 1) { p.z -= 1; continue; }
          const r0 = Math.pow(z0, 2.4) * maxR * 1.3, r1 = Math.pow(p.z, 2.4) * maxR * 1.3;
          const th = p.ang + swirl * 0.25;
          ctx.strokeStyle = `hsla(${p.h}, 100%, 75%, ${env * p.z})`;
          ctx.lineWidth = 0.5 + p.z * 2.5;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(th) * r0, cy + Math.sin(th) * r0);
          ctx.lineTo(cx + Math.cos(th) * r1, cy + Math.sin(th) * r1);
          ctx.stroke();
        }
        // The bright throat
        const pulse = 1 + Math.sin(t * 30) * 0.08;
        glow(ctx, cx, cy, 120 * env * pulse, "hsla(195, 100%, 85%, ALPHA)", 0.9);
        glow(ctx, cx, cy, 40 * env, "hsla(0, 0%, 100%, ALPHA)", 1);
      },
      card(fx, c, t, bx, by) {
        const { r, th } = polar(fx, bx, by);
        if (t < 0.44) {                                   // pulled in
          const q = ease.inCubic(seg(t, 0.02 + (1 - c.seed) * 0.06, 0.44));
          const p = fromPolar(fx, r * (1 - q), th + q * 3);
          return { ...p, s: 1 - q * 0.94, a: 1 - seg(q, 0.75, 1), rot: q * 3 };
        }
        const k = ease.outCubic(seg(t, 0.48 + c.seed * 0.14, 0.95));   // pushed out
        const p = fromPolar(fx, r * k, th - (1 - k) * 3.4);
        return { ...p, s: 0.04 + 0.96 * k, a: seg(k, 0, 0.25), rot: -(1 - k) * 3.4 };
      },
    },

    /* ---- 3. BLACK HOLE: everything (panels too) is stretched and swallowed, then blasted back ---- */
    blackhole: {
      dur: 3000,
      init(fx) {
        fx.R = Math.min(vw, vh) * 0.085;
        for (let i = 0; i < 420; i++) {
          fx.parts.push({ r: rnd(0.3, 1.05) * fx.maxR, th: rnd(0, TAU), h: rnd(18, 48), l: rnd(60, 92) });
        }
        // Pull the interface into the hole too
        fx.anims = [];
        for (const el of [$(".topbar"), $("#discover"), $(".zoom"), $("#notice")]) {
          if (!el || el.hidden || !el.getClientRects().length) continue;
          const rc = el.getBoundingClientRect();
          const dx = fx.cx - (rc.left + rc.width / 2), dy = fx.cy - (rc.top + rc.height / 2);
          fx.anims.push(el.animate([
            { transform: "none", opacity: 1, offset: 0, easing: "cubic-bezier(.6, 0, .95, .45)" },
            { transform: `translate(${dx}px, ${dy}px) rotate(600deg) scale(.02)`, opacity: 0, offset: 0.48 },
            { transform: `translate(${dx}px, ${dy}px) scale(.02)`, opacity: 0, offset: 0.62, easing: "cubic-bezier(.16, 1, .3, 1)" },
            { transform: "none", opacity: 1, offset: 1 },
          ], { duration: fx.dur }));
        }
      },
      end(fx) { fx.anims?.forEach(a => a.cancel()); },
      draw(fx, ctx, t, dt) {
        const { cx, cy, maxR } = fx;
        const grow = ease.outCubic(seg(t, 0, 0.18));
        const collapse = ease.inCubic(seg(t, 0.48, 0.58));
        const R = fx.R * grow * (1 - collapse);
        const dark = seg(t, 0, 0.18) * (1 - seg(t, 0.6, 0.8));
        const sucking = t < 0.52;

        // Gravity darkens space around the hole
        const g = ctx.createRadialGradient(cx, cy, R, cx, cy, maxR);
        g.addColorStop(0, `rgba(0, 0, 0, ${0.92 * dark})`);
        g.addColorStop(0.35, `rgba(4, 2, 10, ${0.7 * dark})`);
        g.addColorStop(1, `rgba(8, 4, 16, ${0.45 * dark})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, vw, vh);

        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        // Debris spiralling in (then flung out after the collapse)
        for (const p of fx.parts) {
          const r0 = p.r, th0 = p.th;
          const n = p.r / maxR;
          if (sucking) {
            p.th += dt * (2.6 / (n + 0.06));
            p.r -= dt * (90 + 1400 * Math.pow(1 - Math.min(1, n), 2)) * grow;
            if (p.r < R * 1.05) { p.r = rnd(0.8, 1.1) * maxR; p.th = rnd(0, TAU); continue; }
          } else if (t > 0.58) {
            p.r += dt * (900 + p.l * 8);
            p.th += dt * 1.2;
          } else continue;
          const a = (sucking ? Math.min(1, (1 - n) * 1.8) : 1 - seg(t, 0.6, 0.95)) * 0.9;
          ctx.strokeStyle = `hsla(${p.h}, 100%, ${p.l}%, ${a})`;
          ctx.lineWidth = 1.2 + (1 - Math.min(1, n)) * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(th0) * r0, cy + Math.sin(th0) * r0 * 0.75);
          ctx.lineTo(cx + Math.cos(p.th) * p.r, cy + Math.sin(p.th) * p.r * 0.75);
          ctx.stroke();
        }

        if (R > 0.5) {
          const spin = t * 22;
          const disk = (from, to) => {     // accretion disk, tilted, hottest on the inside
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, 0.3);
            for (let k = 0; k < 16; k++) {
              const rr = R * (1.35 + k * 0.13);
              for (let s2 = 0; s2 < 36; s2++) {
                const a0 = (s2 / 36) * TAU;
                if (a0 < from || a0 > to) continue;
                const beam = 0.55 + 0.45 * Math.cos(a0 + spin * 0.15);      // one side brighter
                ctx.strokeStyle = `hsla(${38 - k * 1.6}, 100%, ${88 - k * 3.2}%, ${(0.5 - k * 0.026) * beam * grow})`;
                ctx.lineWidth = R * 0.16;
                ctx.beginPath();
                ctx.arc(0, 0, rr, a0 + spin * (0.1 + 0.4 / (k + 1)), a0 + spin * (0.1 + 0.4 / (k + 1)) + TAU / 36 + 0.02);
                ctx.stroke();
              }
            }
            ctx.restore();
          };
          disk(Math.PI, TAU);                              // far half (behind)
          // Light bent over the top of the hole
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(1, 0.62);
          ctx.strokeStyle = `hsla(36, 100%, 75%, ${0.55 * grow})`;
          ctx.lineWidth = R * 0.22;
          ctx.beginPath(); ctx.arc(0, 0, R * 1.45, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
          ctx.restore();
          // Event horizon
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = "#000";
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = "lighter";
          disk(0, Math.PI);                                // near half (in front)
          // Photon ring
          ctx.strokeStyle = `hsla(40, 100%, 90%, ${0.85 * grow})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, R * 1.04, 0, TAU); ctx.stroke();
        }

        // Collapse: flash and shockwave
        if (t > 0.55) {
          const k = seg(t, 0.56, 0.86);
          if (k < 1) {
            ctx.globalCompositeOperation = "lighter";
            ctx.strokeStyle = `hsla(${195 + k * 85}, 100%, ${92 - k * 20}%, ${1 - k})`;
            ctx.lineWidth = 34 * (1 - k) + 2;
            ctx.beginPath(); ctx.arc(cx, cy, k * maxR * 1.15, 0, TAU); ctx.stroke();
          }
          const f = 1 - seg(t, 0.56, 0.68);
          if (f > 0) {
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = `rgba(255, 252, 240, ${0.75 * f})`;
            ctx.fillRect(0, 0, vw, vh);
          }
        }

        // Shake the wall as it collapses
        const sh = t > 0.52 && t < 0.74 ? 12 * (1 - seg(t, 0.52, 0.74)) : 0;
        canvas.style.transform = sh ? `translate(${rnd(-sh, sh).toFixed(1)}px, ${rnd(-sh, sh).toFixed(1)}px)` : "";
      },
      card(fx, c, t, bx, by) {
        const { r, th } = polar(fx, bx, by);
        if (t < 0.5) {                                    // swallowed, faster and faster
          const q = Math.pow(seg(t, c.seed * 0.14, 0.5), 2.3);
          const th2 = th + q * q * 7;
          const p = fromPolar(fx, r * (1 - q), th2);
          return { ...p, s: 1 - Math.pow(q, 0.8) * 0.96, a: 1 - seg(q, 0.85, 1), rot: q * q * 7, stretch: 1 + 4.5 * q, phi: th2 };
        }
        if (t < 0.6) return { x: fx.cx, y: fx.cy, s: 0, a: 0 };
        const k = ease.outExpo(seg(t, 0.6 + c.seed * 0.06, 0.96));   // blasted back out
        const th2 = th - (1 - k) * 2.2;
        const p = fromPolar(fx, r * k, th2);
        return { ...p, s: k, a: seg(k, 0, 0.2), rot: -(1 - k) * 2.2, stretch: 1 + (1 - k) * 2.5, phi: th2 };
      },
    },
  };

  // Escape skips an effect that is playing
  window.addEventListener("keydown", e => { if (fx && e.key === "Escape") endFx(); });

  /* ---------------------------------------------------------
     12. UNIVERSE THEME
     A live background: the Milky Way and nebulae far behind, and a
     3D field of stars and spiral galaxies you fly through when you
     zoom. Moving the wall moves space (near stars faster), and fast
     moves stretch the stars into warp streaks.
     --------------------------------------------------------- */
  const Space = {
    cv: $("#space"),
    ctx: null, w: 0, h: 0, dpr: 1,
    stars: [], galaxies: [], milky: null,
    running: false, raf: 0, t0: performance.now(),

    gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; },

    // A spiral galaxy, drawn once into a small canvas
    makeGalaxy(hueCore, hueArm, arms, size = 256) {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d");
      const m = size / 2;
      g.globalCompositeOperation = "lighter";
      const halo = g.createRadialGradient(m, m, 0, m, m, m);
      halo.addColorStop(0, `hsla(${hueArm}, 70%, 70%, .22)`);
      halo.addColorStop(1, "hsla(0, 0%, 0%, 0)");
      g.fillStyle = halo; g.fillRect(0, 0, size, size);
      for (let i = 0; i < 3200; i++) {
        const arm = i % arms;
        const t = Math.pow(Math.random(), 0.75);
        const r = t * m * 0.92;
        const ang = (arm / arms) * TAU + t * 5.2 + this.gauss() * 0.42 * (1 - t * 0.4);
        const x = m + Math.cos(ang) * r + this.gauss() * 5;
        const y = m + Math.sin(ang) * r + this.gauss() * 5;
        const hue = t < 0.35 ? hueCore : hueArm;
        g.fillStyle = `hsla(${hue}, 80%, ${62 + Math.random() * 30}%, ${0.1 + Math.random() * 0.3})`;
        const s = Math.random() < 0.04 ? 2.2 : 1.1;
        g.fillRect(x, y, s, s);
      }
      const core = g.createRadialGradient(m, m, 0, m, m, m * 0.24);
      core.addColorStop(0, "rgba(255, 250, 235, 1)");
      core.addColorStop(0.35, `hsla(${hueCore}, 90%, 78%, .55)`);
      core.addColorStop(1, "hsla(0, 0%, 0%, 0)");
      g.fillStyle = core; g.fillRect(0, 0, size, size);
      return c;
    },

    // The Milky Way band with dust lanes and nebulae, drawn once per screen size
    makeMilkyWay(D) {
      const c = document.createElement("canvas");
      c.width = c.height = D;
      const g = c.getContext("2d");
      g.translate(D / 2, D / 2);
      g.rotate(-0.42);
      const bandY = x => Math.sin(x * 0.0035) * D * 0.04;
      g.globalCompositeOperation = "lighter";
      // glowing clouds along the band
      for (let i = 0; i < 160; i++) {
        const x = (Math.random() - 0.5) * D;
        const y = bandY(x) + this.gauss() * D * 0.05;
        const r = D * (0.03 + Math.random() * 0.09);
        const hue = [265, 285, 220, 200, 30, 330][i % 6];
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `hsla(${hue}, 70%, ${55 + Math.random() * 20}%, ${0.05 + Math.random() * 0.06})`);
        gr.addColorStop(1, "hsla(0, 0%, 0%, 0)");
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // dense star dust in the band
      for (let i = 0; i < 9000; i++) {
        const x = (Math.random() - 0.5) * D;
        const y = bandY(x) + this.gauss() * D * 0.07;
        g.fillStyle = `hsla(${Math.random() < 0.5 ? 220 : 40}, 60%, 90%, ${0.2 + Math.random() * 0.6})`;
        const s = Math.random() < 0.05 ? 1.6 : 0.8;
        g.fillRect(x, y, s, s);
      }
      // dark dust lanes
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 70; i++) {
        const x = (Math.random() - 0.5) * D;
        const y = bandY(x) + this.gauss() * D * 0.015;
        const r = D * (0.015 + Math.random() * 0.035);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(0,0,0,.35)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.save(); g.translate(x, y); g.scale(2.4, 0.6);
        g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
        g.restore();
      }
      // a few nebulae away from the band
      g.globalCompositeOperation = "lighter";
      for (const [nx, ny, hue] of [[-0.3, -0.24, 330], [0.28, 0.22, 175], [0.12, -0.3, 285], [-0.2, 0.3, 20]]) {
        for (let j = 0; j < 14; j++) {
          const x = nx * D + this.gauss() * D * 0.05, y = ny * D + this.gauss() * D * 0.05;
          const r = D * (0.03 + Math.random() * 0.06);
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, `hsla(${hue + this.gauss() * 20}, 85%, 60%, ${0.05 + Math.random() * 0.05})`);
          gr.addColorStop(1, "hsla(0,0%,0%,0)");
          g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
      // scattered background stars
      g.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.5})`;
        g.fillRect(Math.random() * D, Math.random() * D, 0.8, 0.8);
      }
      return c;
    },

    resize() {
      this.dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.w = innerWidth; this.h = innerHeight;
      this.cv.width = Math.round(this.w * this.dpr);
      this.cv.height = Math.round(this.h * this.dpr);
      this.ctx = this.cv.getContext("2d");
      this.milky = this.makeMilkyWay(Math.ceil(Math.hypot(this.w, this.h) * 1.12));
      const n = clamp(Math.round((this.w * this.h) / 1700), 380, 1100);
      this.stars = Array.from({ length: n }, () => ({
        x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(),
        hue: Math.random() < 0.7 ? 220 : Math.random() < 0.5 ? 40 : 0,
        size: Math.random() < 0.06 ? 2.2 : 1.1, tw: Math.random() * TAU, px: null, py: null,
      }));
      if (!this.galaxies.length) {
        const kinds = [[45, 215, 2], [30, 25, 3], [200, 260, 2], [330, 290, 4], [50, 190, 2], [15, 340, 3], [190, 200, 2]];
        this.galaxies = kinds.map(([a, b, arms]) => ({
          img: this.makeGalaxy(a, b, arms), x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(),
          rot: Math.random() * TAU, tilt: 0.35 + Math.random() * 0.55, spin: (Math.random() < 0.5 ? -1 : 1) * 0.02,
        }));
      }
    },

    frame() {
      if (!this.running) return;
      const { ctx, w, h } = this;
      const time = (performance.now() - this.t0) / 1000;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.7);
      bg.addColorStop(0, "#0b0c26"); bg.addColorStop(0.6, "#05051a"); bg.addColorStop(1, "#010108");
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

      // Milky Way: turns very slowly, nudged a little by panning
      const D = this.milky.width;
      ctx.save();
      ctx.translate(w / 2 + Math.tanh(-cam.x / 4000) * 60, h / 2 + Math.tanh(-cam.y / 4000) * 60);
      ctx.rotate(time * 0.004);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(this.milky, -D / 2, -D / 2);
      ctx.restore();
      ctx.globalAlpha = 1;

      // 3D field: depth follows the wall's zoom, and drifts slowly forward on its own
      const cx = w / 2, cy = h / 2, span = Math.max(w, h) * 1.3;
      const zShift = cam.z * 0.6 + time * 0.006;
      const panX = cam.x * 0.18, panY = cam.y * 0.18;
      const project = (o, size) => {
        const z = 0.04 + mod(o.z - zShift, 1) * 0.96;          // 1 = far, 0.04 = right in front of you
        const wx = mod(o.x * span - panX * (1 - z * 0.7), span * 2) - span;
        const wy = mod(o.y * span - panY * (1 - z * 0.7), span * 2) - span;
        return { x: cx + (wx / z) * 0.5, y: cy + (wy / z) * 0.5, z, s: size / z };
      };

      ctx.globalCompositeOperation = "lighter";
      for (const g of this.galaxies) {
        const p = project(g, 1);
        const size = 42 * p.s;
        const a = smooth(1, 0.75, p.z) * smooth(0.04, 0.2, p.z);   // fade in from afar, out as it passes
        if (a < 0.01 || size < 4 || p.x < -size || p.x > w + size || p.y < -size || p.y > h + size) continue;
        ctx.save();
        ctx.globalAlpha = a * 0.85;
        ctx.translate(p.x, p.y);
        ctx.rotate(g.rot + time * g.spin);
        ctx.scale(1, g.tilt);
        ctx.drawImage(g.img, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // Supernovas from taps: a flash, a ring and a fading glow
      if (this.novas?.length) {
        ctx.globalCompositeOperation = "lighter";
        this.novas = this.novas.filter(n => {
          const age = (performance.now() - n.t) / 1000;
          if (age > 2.2) return false;
          const k = age / 2.2;
          glow(ctx, n.x, n.y, 30 + k * 220, "hsla(45, 100%, 85%, ALPHA)", 0.9 * (1 - k));
          ctx.strokeStyle = `hsla(${200 + k * 100}, 100%, 80%, ${1 - k})`; ctx.lineWidth = 3 * (1 - k) + 0.5;
          ctx.beginPath(); ctx.arc(n.x, n.y, k * 260, 0, TAU); ctx.stroke();
          return true;
        });
      }
      ctx.lineCap = "round";
      for (const s of this.stars) {
        const p = project(s, s.size);
        const tw = 0.7 + 0.3 * Math.sin(time * 2.2 + s.tw);
        const a = Math.min(1, (1 - p.z) * 1.6) * tw;
        const r = Math.min(3.2, p.s * 0.55);
        const moved = s.px !== null ? Math.hypot(p.x - s.px, p.y - s.py) : 0;
        if (moved > 1.5 && moved < 260) {                       // warp streak
          ctx.strokeStyle = `hsla(${s.hue}, 70%, 88%, ${a})`;
          ctx.lineWidth = r;
          ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        } else {
          ctx.fillStyle = `hsla(${s.hue}, 70%, 88%, ${a})`;
          ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
          if (r > 2) { ctx.fillStyle = `hsla(${s.hue}, 80%, 80%, ${a * 0.15})`; ctx.fillRect(p.x - r * 2, p.y - r * 2, r * 4, r * 4); }
        }
        s.px = p.x; s.py = p.y;
      }
      if (!calm) this.raf = requestAnimationFrame(() => this.frame());
    },

    start() {
      if (this.running) return;
      if (!this.ctx || this.w !== innerWidth || this.h !== innerHeight) this.resize();
      this.running = true;
      this.cv.hidden = false;
      this.frame();
    },
    stop() {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.cv.hidden = true;
    },
    tap(x, y) { (this.novas = this.novas || []).push({ x, y, t: performance.now() }); Sound.sfx("nova"); if (calm) this.frame(); },
  };
  let spaceResizeT;
  window.addEventListener("resize", () => {
    clearTimeout(spaceResizeT);
    spaceResizeT = setTimeout(() => { if (Space.running) Space.resize(); }, 200);
  });

  /* ---------------------------------------------------------
     13. AMAZON THEME
     A rainforest at night. Back canvas (#space): sky, moonbeams,
     three layers of jungle silhouettes, mist, fireflies, glowing
     frogs on branches. Front canvas (#sceneFront, above the posts):
     swaying leaves in the corners, frogs sitting on them, and the
     nearest fireflies.
     --------------------------------------------------------- */
  const Jungle = {
    cv: $("#space"), front: $("#sceneFront"), fringeEl: $("#fringe"),
    ctx: null, fctx: null, w: 0, h: 0, dpr: 1, TW: 0,
    far: null, mid: null, near: null,
    perches: [], flies: [], frogs: [], fringe: [], sprites: new Map(),
    running: false, raf: 0, t0: performance.now(), mouse: { x: -9999, y: -9999 },

    // Soft glow, cached per colour
    sprite(hue, light = 60) {
      const key = hue + ":" + light;
      if (this.sprites.has(key)) return this.sprites.get(key);
      const S = 64, c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d");
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, `hsla(${hue}, 100%, ${Math.min(96, light + 32)}%, 1)`);
      gr.addColorStop(0.16, `hsla(${hue}, 100%, ${light}%, .75)`);
      gr.addColorStop(0.45, `hsla(${hue}, 100%, ${light}%, .16)`);
      gr.addColorStop(1, `hsla(${hue}, 100%, ${light}%, 0)`);
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      this.sprites.set(key, c);
      return c;
    },

    // A palm or fern frond, drawn once. Pivot at (0, py).
    makeFrond(len, color, { leaflets = 30, droop = 0.35, leafLen = 0.3, leafW = 0.05 } = {}) {
      const W = Math.ceil(len * 1.08), H = Math.ceil(len * (0.75 + droop)), py = Math.round(len * 0.36);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      const pt = t => ({ x: t * len, y: py + droop * len * t * t });
      g.strokeStyle = color; g.fillStyle = color; g.lineCap = "round";
      g.lineWidth = Math.max(2, len * 0.014);
      g.beginPath(); g.moveTo(0, py);
      for (let t = 0; t <= 1.001; t += 0.05) { const p = pt(t); g.lineTo(p.x, p.y); }
      g.stroke();
      for (let i = 1; i <= leaflets; i++) {
        const t = i / (leaflets + 1);
        const p = pt(t), q = pt(t + 0.01);
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        const L = len * leafLen * (1 - t * 0.55) * (0.85 + Math.random() * 0.3);
        for (const side of [-1, 1]) {
          const a = ang + side * (0.75 + t * 0.35);
          const ex = p.x + Math.cos(a) * L, ey = p.y + Math.sin(a) * L + L * 0.25;
          const nx = Math.cos(a + Math.PI / 2) * L * leafW * 2.2, ny = Math.sin(a + Math.PI / 2) * L * leafW * 2.2;
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.quadraticCurveTo((p.x + ex) / 2 + nx, (p.y + ey) / 2 + ny, ex, ey);
          g.quadraticCurveTo((p.x + ex) / 2 - nx, (p.y + ey) / 2 - ny, p.x, p.y);
          g.fill();
        }
      }
      return { img: c, px: 0, py };
    },

    // A split-leaf monstera, pivot at the bottom of its stem
    makeMonstera(size, color) {
      const W = Math.ceil(size * 1.2), H = Math.ceil(size * 1.5);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      const cx = W / 2, cy = size * 0.62;
      g.fillStyle = color; g.strokeStyle = color;
      g.lineWidth = size * 0.035; g.lineCap = "round";
      g.beginPath(); g.moveTo(cx, H - 2); g.quadraticCurveTo(cx + size * 0.08, cy + size * 0.5, cx, cy + size * 0.2); g.stroke();
      g.beginPath();
      g.moveTo(cx, cy - size * 0.32);
      g.bezierCurveTo(cx + size * 0.62, cy - size * 0.62, cx + size * 0.66, cy + size * 0.42, cx, cy + size * 0.5);
      g.bezierCurveTo(cx - size * 0.66, cy + size * 0.42, cx - size * 0.62, cy - size * 0.62, cx, cy - size * 0.32);
      g.fill();
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 9; i++) {                       // the slits
        const side = i % 2 ? 1 : -1;
        const a = -Math.PI / 2 + side * (0.45 + Math.floor(i / 2) * 0.32);
        g.lineWidth = size * 0.035;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * size * 0.3, cy + Math.sin(a) * size * 0.3);
        g.lineTo(cx + Math.cos(a) * size * 0.75, cy + Math.sin(a) * size * 0.75);
        g.stroke();
      }
      for (let i = 0; i < 4; i++) {                       // the holes
        const a = -Math.PI / 2 + (i - 1.5) * 0.7;
        g.beginPath(); g.ellipse(cx + Math.cos(a) * size * 0.2, cy + Math.sin(a) * size * 0.2, size * 0.035, size * 0.06, a, 0, TAU); g.fill();
      }
      return { img: c, px: cx, py: H - 2, top: { x: 0, y: -(H - 2 - (cy - size * 0.3)) } };
    },

    // A horizontally tileable layer
    layer(shapes) {
      const c = document.createElement("canvas");
      c.width = this.TW; c.height = this.h;
      const g = c.getContext("2d");
      for (const dx of [-this.TW, 0, this.TW]) { g.save(); g.translate(dx, 0); shapes.forEach(fn => fn(g)); g.restore(); }
      return c;
    },

    buildForest() {
      const { TW, h } = this;
      // Far: misty canopy line with a few giant emergent trees
      const far = [];
      for (let x = -40; x < TW + 40; x += 24) {
        const y = h * 0.44 + Math.sin(x * 0.006) * h * 0.04 + rnd(-h * 0.025, h * 0.025), r = rnd(26, 58);
        far.push(g => { g.fillStyle = "#08201a"; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillRect(x - r, y, r * 2, h - y); });
      }
      for (let i = 0; i < 4; i++) {
        const x = rnd(0, TW), top = h * rnd(0.18, 0.28), cw = rnd(90, 150);
        far.push(g => {
          g.fillStyle = "#08201a";
          g.fillRect(x - 5, top, 10, h);
          g.beginPath(); g.ellipse(x, top, cw, cw * 0.32, 0, 0, TAU); g.fill();
          g.beginPath(); g.ellipse(x - cw * 0.5, top + 12, cw * 0.55, cw * 0.25, 0, 0, TAU); g.fill();
          g.beginPath(); g.ellipse(x + cw * 0.5, top + 10, cw * 0.55, cw * 0.25, 0, 0, TAU); g.fill();
        });
      }
      this.far = this.layer(far);

      // Mid: trunks, a canopy ceiling and hanging vines
      const mid = [];
      const col = "#04140e";
      for (let i = 0; i < Math.ceil(TW / 170); i++) {
        const x = rnd(0, TW), w = rnd(14, 38), lean = rnd(-30, 30);
        mid.push(g => {
          g.fillStyle = col;
          g.beginPath(); g.moveTo(x - w / 2, h); g.quadraticCurveTo(x + lean, h * 0.5, x - w * 0.35 + lean, -10);
          g.lineTo(x + w * 0.35 + lean, -10); g.quadraticCurveTo(x + lean + w, h * 0.5, x + w / 2, h); g.fill();
          g.beginPath(); g.moveTo(x - w * 2.2, h); g.quadraticCurveTo(x - w * 0.4, h * 0.86, x, h * 0.8); g.quadraticCurveTo(x + w * 0.4, h * 0.86, x + w * 2.2, h); g.fill();
        });
      }
      for (let x = -40; x < TW + 40; x += 30) {
        const y = rnd(-30, h * 0.12), r = rnd(30, 70);
        mid.push(g => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillRect(x - r, -10, r * 2, y + 10); });
      }
      for (let i = 0; i < Math.ceil(TW / 60); i++) {
        const x = rnd(0, TW), len = h * rnd(0.25, 0.62), sway = rnd(-40, 40), lw = rnd(1.5, 3.5);
        const leaves = Array.from({ length: Math.floor(len / 26) }, (_, k) => ({ t: (k + 1) / (len / 26 + 1), s: Math.random() < 0.5 ? -1 : 1 }));
        mid.push(g => {
          g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw;
          g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + sway, len * 0.6, x + sway * 0.4, len); g.stroke();
          for (const l of leaves) {
            const t = l.t, px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * (x + sway) + t * t * (x + sway * 0.4), py = 2 * (1 - t) * t * len * 0.6 + t * t * len;
            g.beginPath(); g.ellipse(px + l.s * 6, py, 7, 3, l.s * 0.6, 0, TAU); g.fill();
          }
        });
      }
      this.mid = this.layer(mid);

      // Near: branches (where frogs sit), ground, ferns and big leaves
      const near = [], ncol = "#020b07";
      this.perches = [];
      const branches = Math.max(3, Math.round(TW / 520));
      for (let i = 0; i < branches; i++) {
        const x0 = (i / branches) * TW + rnd(-60, 60), len = rnd(260, 460), y0 = h * rnd(0.56, 0.84);
        const x1 = x0 + len, y1 = y0 + rnd(-70, 40), cxp = (x0 + x1) / 2, cyp = Math.min(y0, y1) - rnd(20, 70), lw = rnd(9, 15);
        near.push(g => {
          g.strokeStyle = ncol; g.lineWidth = lw; g.lineCap = "round";
          g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cxp, cyp, x1, y1); g.stroke();
          g.lineWidth = lw * 0.45;
          g.beginPath(); g.moveTo(x0 + len * 0.6, (y0 + cyp) / 2 + 10); g.quadraticCurveTo(x0 + len * 0.7, cyp - 50, x0 + len * 0.85, cyp - 70); g.stroke();
        });
        for (let t = 0.12; t < 0.92; t += 0.11) {
          const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cxp + t * t * x1;
          const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cyp + t * t * y1 - lw / 2 + 1;
          this.perches.push({ x: mod(px, TW), y: py });
        }
      }
      for (let x = -40; x < TW + 40; x += 22) {
        const y = h * 0.93 + rnd(-h * 0.03, h * 0.02), r = rnd(22, 46);
        near.push(g => { g.fillStyle = ncol; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillRect(x - r, y, r * 2, h); });
      }
      for (let i = 0; i < Math.ceil(TW / 140); i++) {
        const f = this.makeFrond(rnd(90, 170), ncol, { leaflets: 22, droop: 0.5, leafLen: 0.22 });
        const x = rnd(0, TW), y = h * rnd(0.88, 0.97), rot = rnd(-2.6, -0.5);
        near.push(g => { g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(f.img, -f.px, -f.py); g.restore(); });
      }
      this.near = this.layer(near);
    },

    // Sky, moon glow, moonbeams and a mist puff, drawn once per screen size
    buildSky() {
      const { w, h } = this;
      const mk = (cw, ch) => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return [c, c.getContext("2d")]; };
      const [sky, g] = mk(w, h);
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#020906"); grad.addColorStop(0.45, "#05170f"); grad.addColorStop(1, "#010503");
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      const moon = g.createRadialGradient(w * 0.22, -h * 0.05, 0, w * 0.22, -h * 0.05, h * 0.85);
      moon.addColorStop(0, "rgba(170, 255, 215, .13)"); moon.addColorStop(1, "rgba(170, 255, 215, 0)");
      g.fillStyle = moon; g.fillRect(0, 0, w, h);
      this.skyImg = sky;

      const b = g;                                       // moonbeams baked into the sky
      for (let i = 0; i < 4; i++) {
        const x = w * (0.08 + i * 0.17), bw = 40 + i * 18;
        const beam = b.createLinearGradient(0, 0, 0, h);
        beam.addColorStop(0, "rgba(200, 255, 230, .06)"); beam.addColorStop(1, "rgba(200, 255, 230, 0)");
        b.fillStyle = beam;
        b.beginPath(); b.moveTo(x, 0); b.lineTo(x + bw, 0); b.lineTo(x + bw + h * 0.45, h); b.lineTo(x + h * 0.3, h); b.fill();
      }

      const M = 256;
      const [mist, m] = mk(M, M);
      const mg = m.createRadialGradient(M / 2, M / 2, 0, M / 2, M / 2, M / 2);
      mg.addColorStop(0, "rgba(150, 230, 195, 1)"); mg.addColorStop(1, "rgba(150, 230, 195, 0)");
      m.fillStyle = mg; m.fillRect(0, 0, M, M);
      this.mistImg = mist;
    },

    // Corner leaves are page elements swaying with CSS (cheap for the browser to animate)
    buildFringe() {
      const { w, h } = this, S = Math.min(w, h);
      const dark = "#010a06";
      const frond = (len, o) => this.makeFrond(len, dark, o);
      const box = this.fringeEl;
      box.innerHTML = "";
      box.dataset.owner = "amazon";
      const add = (el, ax, ay, rot, flip = 1, sway = 0.025) => {
        const holder = document.createElement("div");
        holder.className = "fringe__leaf";
        holder.style.transform = `translate(${ax}px, ${ay}px) scale(${flip}, 1) rotate(${rot}rad)`;
        const swayer = document.createElement("div");
        swayer.className = "fringe__sway";
        swayer.style.setProperty("--amp", sway + "rad");
        swayer.style.animationDuration = rnd(5, 8).toFixed(2) + "s";
        swayer.style.animationDelay = (-Math.random() * 8).toFixed(2) + "s";
        el.img.style.left = -el.px + "px";
        el.img.style.top = -el.py + "px";
        swayer.appendChild(el.img);
        holder.appendChild(swayer);
        box.appendChild(holder);
        return { ...el, swayer, rot };
      };
      add(frond(S * 0.58, { droop: 0.32 }), -20, h + 30, -1.05);
      add(frond(S * 0.48, { droop: 0.4 }), -30, h + 20, -0.55);
      add(frond(S * 0.5, { droop: 0.28 }), w + 20, h + 30, -1.1, -1);
      add(frond(S * 0.5, { droop: 0.45 }), w + 30, -20, 0.85, -1, 0.02);
      add(frond(S * 0.42, { droop: 0.6, leafLen: 0.22 }), -20, -25, 0.55, 1, 0.02);
      const leafL = add(this.makeMonstera(S * 0.26, dark), S * 0.17, h + 12, -0.18, 1, 0.035);
      const leafR = add(this.makeMonstera(S * 0.22, dark), w - S * 0.2, h + 12, 0.22, 1, 0.035);
      return [leafL, leafR];
    },

    // A frog sitting on a corner leaf gets its own small canvas inside that leaf
    seatFrog(frog, leaf) {
      const box = Math.ceil(frog.size * 8);
      const c = document.createElement("canvas");
      c.className = "fringe__frog";
      c.width = Math.round(box * this.dpr); c.height = Math.round(box * this.dpr);
      c.style.width = c.style.height = box + "px";
      c.style.left = leaf.top.x - box / 2 + "px";
      c.style.top = leaf.top.y + 2 - box / 2 - frog.size * 0.4 + "px";
      c.style.transform = `rotate(${-leaf.rot * 0.8}rad)`;
      leaf.swayer.appendChild(c);
      frog.canvas = c; frog.box = box;
      frog.ctx = c.getContext("2d");
    },

    makeFrog(hue, size, place) {
      return {
        hue, size, ...place, dir: Math.random() < 0.5 ? -1 : 1,
        phase: Math.random() * TAU, croak: rnd(0.6, 1.2),
        spots: Array.from({ length: 6 }, () => ({ x: rnd(-0.45, 0.4), y: rnd(-0.6, -0.2), r: rnd(0.05, 0.1) })),
        blinkAt: rnd(1, 6), nextHop: rnd(6, 14), hop: null,
      };
    },

    resize() {
      this.dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.w = innerWidth; this.h = innerHeight;
      this.TW = Math.ceil(this.w * 1.6);
      for (const cv of [this.cv, this.front]) {
        cv.width = Math.round(this.w * this.dpr);
        cv.height = Math.round(this.h * this.dpr);
      }
      this.ctx = this.cv.getContext("2d");
      this.fctx = this.front.getContext("2d");
      this.buildForest();
      this.buildSky();
      const [leafL, leafR] = this.buildFringe();

      const HUES = [192, 205, 28, 300, 135, 52, 170];
      const n = clamp(Math.round(this.TW / 360), 4, 8);
      const picks = this.perches.slice().sort(() => Math.random() - 0.5).slice(0, n);
      this.frogs = picks.map((p, i) => this.makeFrog(HUES[i % HUES.length], rnd(20, 28), { perch: p, x: p.x, y: p.y }));
      const fs = Math.min(this.w, this.h) * 0.045;
      this.frontFrogs = [
        this.makeFrog(195, clamp(fs, 18, 34), {}),
        this.makeFrog(25, clamp(fs * 0.85, 16, 30), {}),
      ];
      this.seatFrog(this.frontFrogs[0], leafL);
      this.seatFrog(this.frontFrogs[1], leafR);

      const count = clamp(Math.round((this.w * this.h) / 9000), 60, 170);
      this.flies = Array.from({ length: count }, () => ({
        x: rnd(0, this.TW), y: rnd(0.06, 0.96) * this.h, d0: Math.random(),
        ax: rnd(20, 70), ay: rnd(12, 40), f1: rnd(0.15, 0.4), f2: rnd(0.2, 0.5), p1: rnd(0, TAU), p2: rnd(0, TAU),
        period: rnd(2.2, 5.5), ph: Math.random(), hue: rnd(66, 92), drift: rnd(-10, 10),
      }));
    },

    drawFrog(g, f, t) {
      const s = f.size, hue = f.hue;
      let croak = Math.pow(Math.max(0, Math.sin(t * f.croak * 2 + f.phase)), 8);
      if (f.forceCroak > t) croak = Math.max(croak, Math.pow(Math.sin((f.forceCroak - t) * 9), 2));
      const glowA = 0.75 + 0.2 * Math.sin(t * 1.3 + f.phase) + croak * 0.45;
      g.save();
      g.scale(f.dir, 1);
      // glow halo
      g.globalCompositeOperation = "lighter";
      const R = s * 3.8 * (1 + croak * 0.25);
      g.globalAlpha = Math.min(1, glowA);
      g.drawImage(this.sprite(hue, 55), -R, -s * 0.45 - R, R * 2, R * 2);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";

      const body = `hsl(${hue}, 95%, 54%)`, deep = `hsl(${hue}, 85%, 24%)`, pale = `hsl(${hue}, 100%, 82%)`;
      const ell = (x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); };
      const hopK = f.hop ? Math.sin(Math.PI * f.hop.k) : 0;
      g.rotate(-hopK * 0.35);

      g.fillStyle = deep;
      if (hopK > 0.1) {                                  // legs stretched mid-hop
        g.strokeStyle = deep; g.lineWidth = s * 0.14; g.lineCap = "round";
        g.beginPath(); g.moveTo(-s * 0.4, -s * 0.3); g.lineTo(-s * 1.05, -s * 0.05 + hopK * s * 0.2); g.stroke();
      } else {
        ell(-s * 0.46, -s * 0.16, s * 0.42, s * 0.19, -0.25);
      }
      g.fillStyle = body;
      ell(0, -s * 0.38, s * 0.62, s * 0.35, -0.15);
      ell(s * 0.5, -s * 0.5, s * 0.32, s * 0.25, 0.1);
      ell(-s * 0.36, -s * 0.27, s * 0.3, s * 0.18, -0.55);
      g.strokeStyle = body; g.lineWidth = s * 0.1; g.lineCap = "round";
      g.beginPath(); g.moveTo(s * 0.42, -s * 0.3); g.lineTo(s * 0.55, -s * 0.02); g.lineTo(s * 0.72, 0); g.stroke();
      // dart-frog spots
      g.fillStyle = deep; g.globalAlpha = 0.7;
      for (const sp of f.spots) ell(sp.x * s, sp.y * s, sp.r * s, sp.r * s * 0.8);
      g.globalAlpha = 1;
      // throat puffing as it croaks
      if (croak > 0.02) {
        g.fillStyle = `hsla(${hue}, 100%, 88%, ${0.45 + croak * 0.45})`;
        ell(s * 0.6, -s * 0.26, s * 0.2 * (0.35 + croak), s * 0.16 * (0.35 + croak));
      }
      // eyes (they blink now and then)
      const blinking = mod(t - f.blinkAt, 5.5) < 0.14;
      for (const [ex, ey, shade] of [[s * 0.44, -s * 0.74, 0.75], [s * 0.62, -s * 0.72, 1]]) {
        g.fillStyle = pale; g.globalAlpha = shade;
        ell(ex, ey, s * 0.13, blinking ? s * 0.025 : s * 0.13);
        if (!blinking) {
          g.fillStyle = "#03110a"; ell(ex + s * 0.02, ey, s * 0.075, s * 0.09);
          g.fillStyle = "#fff"; ell(ex + s * 0.05, ey - s * 0.04, s * 0.025, s * 0.025);
        }
      }
      g.globalAlpha = 1;
      g.restore();
    },

    // Frogs on branches occasionally hop to a nearby perch
    updateFrog(f, t, dt) {
      if (!f.perch) return;
      if (f.hop) {
        f.hop.k += dt / f.hop.dur;
        const k = Math.min(1, f.hop.k);
        f.x = f.hop.fx + (f.hop.tx - f.hop.fx) * k;
        f.y = f.hop.fy + (f.hop.ty - f.hop.fy) * k - Math.sin(Math.PI * k) * f.size * 4;
        if (f.hop.k >= 1) { f.perch = f.hop.to; f.x = f.perch.x; f.y = f.perch.y; f.hop = null; f.nextHop = t + rnd(7, 16); }
      } else if (t > f.nextHop) {
        const options = this.perches.filter(p => p !== f.perch && Math.abs(p.x - f.perch.x) < 240 && Math.abs(p.x - f.perch.x) > 30 && Math.abs(p.y - f.perch.y) < 120);
        if (options.length) {
          const to = options[Math.floor(Math.random() * options.length)];
          f.dir = to.x > f.perch.x ? 1 : -1;
          f.hop = { to, fx: f.x, fy: f.y, tx: to.x, ty: to.y, k: 0, dur: 0.55 };
        } else f.nextHop = t + 5;
      }
    },

    frame() {
      if (!this.running) return;
      const { ctx, fctx, w, h, TW } = this;
      const now = performance.now();
      const t = (now - this.t0) / 1000;
      const dt = Math.min(0.05, (now - (this.lastT || now)) / 1000);
      this.lastT = now;
      for (const c of [ctx, fctx]) c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Slow device? Quietly lighten the scene once (fewer fireflies, no mist)
      if (!this.lite) {
        this.slow = dt > 0.03 ? (this.slow || 0) + 1 : Math.max(0, (this.slow || 0) - 2);
        if (this.slow > 90) { this.lite = true; this.flies = this.flies.filter((_, i) => i % 2 === 0); }
      }

      // Sky, moonlight and moonbeams (pre-drawn)
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.skyImg, 0, 0, w, h);

      const oy = k => Math.tanh(-cam.y / 5000) * 40 * k;
      // Draw only the slice of a wrapping layer that's on screen
      const drawLayer = (img, par) => {
        const x0 = -mod(cam.x * par, TW), y = oy(par * 6);
        const sx = -x0, first = Math.min(w, TW - sx);
        ctx.drawImage(img, sx, 0, first, h, 0, y, first, h);
        if (first < w) ctx.drawImage(img, 0, 0, w - first, h, first, y, w - first, h);
        return x0;
      };
      const mist = (y, a, speed) => {
        ctx.globalAlpha = a;
        for (let i = 0; i < 3; i++) {
          const x = mod(t * speed + i * w * 0.55 - cam.x * 0.05, w * 1.65) - w * 0.3;
          ctx.drawImage(this.mistImg, x - w * 0.4, y - w * 0.07, w * 0.8, w * 0.14);
        }
        ctx.globalAlpha = 1;
      };

      drawLayer(this.far, 0.03);
      if (!this.lite) mist(h * 0.5, 0.07, 6);
      drawLayer(this.mid, 0.08);

      // Fireflies, sorted into three depths (zoom in to fly into the swarm)
      const behind = [], among = [], front = [];
      for (const f of this.flies) {
        const d = mod(f.d0 + cam.z * 0.5, 1);
        (d < 0.45 ? behind : d < 0.75 ? among : front).push([f, d]);
      }
      const flies = list => { ctx.globalCompositeOperation = "lighter"; for (const [f, d] of list) this.drawFly(ctx, f, d, t); };
      flies(behind);
      if (!this.lite) mist(h * 0.78, 0.06, -4);
      const nx0 = drawLayer(this.near, 0.16);

      // Frogs on the branches
      ctx.globalCompositeOperation = "source-over";
      for (const f of this.frogs) {
        this.updateFrog(f, t, dt);
        let sx = mod(f.x + nx0, TW);
        if (sx > w + 60) sx -= TW;
        if (sx < -60 || sx > w + 60) continue;
        f.sx = sx; f.sy = f.y + oy(0.96);
        ctx.save(); ctx.translate(sx, f.y + oy(0.96)); this.drawFrog(ctx, f, t); ctx.restore();
      }
      flies(among);

      // Front: corner leaves drift a touch with the wall; their frogs and the nearest fireflies
      const px = Math.tanh(-cam.x / 6000) * 18, pyy = Math.tanh(-cam.y / 6000) * 14;
      this.fringeEl.style.transform = `translate(${px.toFixed(1)}px, ${pyy.toFixed(1)}px)`;
      for (const fr of this.frontFrogs) {
        const g = fr.ctx;
        g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        g.clearRect(0, 0, fr.box, fr.box);
        g.translate(fr.box / 2, fr.box / 2 + fr.size * 0.4);
        this.drawFrog(g, fr, t);
      }
      fctx.clearRect(0, 0, w, h);
      fctx.globalCompositeOperation = "lighter";
      for (const [f, d] of front) this.drawFly(fctx, f, d, t);

      if (!calm) this.raf = requestAnimationFrame(() => this.frame());
    },

    drawFly(g, f, d, t) {
      const { w, h, TW } = this;
      const par = 0.04 + d * 0.42;
      let x = mod(f.x + Math.sin(t * f.f1 + f.p1) * f.ax + t * f.drift - cam.x * par, TW) - (TW - w) / 2;
      let y = mod(f.y + Math.sin(t * f.f2 + f.p2) * f.ay - Math.tanh(cam.y / 4000) * 60 * d, h * 1.08) - h * 0.04;
      if (this.burst && t - this.burst.t < 2.2) {          // a tap scatters nearby fireflies and makes them flash
        const bx = x - this.burst.x, by = y - this.burst.y, bd = Math.hypot(bx, by), age = t - this.burst.t;
        if (bd < 260 && bd > 0.1) { const k = (1 - bd / 260) * ease.outCubic(Math.min(1, age / 0.6)) * (1 - smooth(1.2, 2.2, age)) * 140; x += (bx / bd) * k; y += (by / bd) * k; f.flash = t + 0.6; }
      }
      const dx = x - this.mouse.x, dy = y - this.mouse.y, dist = Math.hypot(dx, dy);
      if (dist < 150 && dist > 0.1) {                     // they swerve away from the cursor
        const push = (1 - dist / 150) * 55 * (0.4 + d);
        x += (dx / dist) * push; y += (dy / dist) * push;
      }
      if (x < -40 || x > w + 40) return;
      const blink = f.flash > t ? 1 : Math.pow(Math.max(0, Math.sin((t / f.period + f.ph) * TAU)), 3);
      const light = 0.1 + 0.9 * blink;
      const fade = smooth(0, 0.12, d) * (1 - smooth(0.9, 1, d));
      const size = 1 + d * 5.5;
      const R = size * 6 * (0.5 + light * 0.7);
      g.globalAlpha = Math.min(1, light * fade);
      g.drawImage(this.sprite(Math.round(f.hue), 62), x - R, y - R, R * 2, R * 2);
      g.globalAlpha = Math.min(1, (0.35 + light) * fade);
      g.fillStyle = `hsl(${f.hue}, 100%, 88%)`;
      g.beginPath(); g.arc(x, y, size * 0.45, 0, TAU); g.fill();
      g.globalAlpha = 1;
    },

    tap(x, y) {
      const t = (performance.now() - this.t0) / 1000;
      const frog = this.frogs.find(f => f.sx !== undefined && Math.hypot(f.sx - x, f.sy - f.size * 0.4 - y) < Math.max(44, f.size * 2.2));
      if (frog) {
        frog.forceCroak = t + 0.9;
        if (!frog.hop) frog.nextHop = t + 0.5;
        Sound.sfx("croak");
      } else {
        this.burst = { x, y, t };
        Sound.sfx("sparkle");
      }
      if (calm) this.frame();
    },
    start() {
      if (this.running) return;
      if (!this.ctx || this.w !== innerWidth || this.h !== innerHeight || this.fringeEl.dataset.owner !== "amazon"
          || this.front.width !== Math.round(this.w * this.dpr)) this.resize();
      this.running = true;
      this.cv.hidden = false; this.front.hidden = false; this.fringeEl.hidden = false;
      this.lastT = performance.now();
      this.frame();
    },
    stop() {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.cv.hidden = true; this.front.hidden = true; this.fringeEl.hidden = true;
      this.fctx?.clearRect(0, 0, this.front.width, this.front.height);
    },
  };
  window.addEventListener("pointermove", e => { Jungle.mouse.x = e.clientX; Jungle.mouse.y = e.clientY; }, { passive: true });
  document.addEventListener("pointerleave", () => { Jungle.mouse.x = Jungle.mouse.y = -9999; });
  let jungleResizeT;
  window.addEventListener("resize", () => {
    clearTimeout(jungleResizeT);
    jungleResizeT = setTimeout(() => { if (Jungle.running) Jungle.resize(); }, 200);
  });

  /* ---------------------------------------------------------
     14. MORE ANIMATED THEMES
     A small scene kit (canvases, loop, resizing, slow-device
     fallback) and five themes built with it:
     Deep Ocean · Aurora · Sakura Dusk · Neon City · Sahara Night
     --------------------------------------------------------- */
  const pointer = Jungle.mouse;
  const mkCanvas = (cw, ch) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(cw)); c.height = Math.max(1, Math.ceil(ch));
    return [c, c.getContext("2d")];
  };
  // A horizontally repeating layer (drawn 3× so shapes crossing the edge wrap)
  function tileLayer(TW, h, shapes) {
    const [c, g] = mkCanvas(TW, h);
    for (const dx of [-TW, 0, TW]) { g.save(); g.translate(dx, 0); shapes.forEach(fn => fn(g)); g.restore(); }
    return c;
  }
  // Draw the on-screen slice of a repeating layer; returns its x offset
  function drawWrapped(ctx, img, par, w, y = 0) {
    const TW = img.width, H = img.height;
    const x0 = -mod(cam.x * par, TW), sx = -x0, first = Math.min(w, TW - sx);
    ctx.drawImage(img, sx, 0, first, H, 0, y, first, H);
    if (first < w) ctx.drawImage(img, 0, 0, w - first, H, first, y, w - first, H);
    return x0;
  }
  const wrapX = (x, TW, w) => { let s = mod(x, TW); if (s > w + 120) s -= TW; return s; };
  // Smooth ridge line that repeats exactly every TW pixels
  function periodicRidge(TW, base, amps) {
    const ks = amps.map(([k, a]) => [k, a, rnd(0, TAU)]);
    return x => base + ks.reduce((s, [k, a, ph]) => s + Math.sin((TAU * k * x) / TW + ph) * a, 0);
  }
  // Swaying corner decoration (page element, animated by CSS)
  function fringeItem(box, el, ax, ay, rot, flip = 1, sway = 0.025) {
    const holder = document.createElement("div");
    holder.className = "fringe__leaf";
    holder.style.transform = `translate(${ax}px, ${ay}px) scale(${flip}, 1) rotate(${rot}rad)`;
    const swayer = document.createElement("div");
    swayer.className = "fringe__sway";
    swayer.style.setProperty("--amp", sway + "rad");
    swayer.style.animationDuration = rnd(5, 8).toFixed(2) + "s";
    swayer.style.animationDelay = (-Math.random() * 8).toFixed(2) + "s";
    el.img.style.left = -el.px + "px"; el.img.style.top = -el.py + "px";
    swayer.appendChild(el.img); holder.appendChild(swayer); box.appendChild(holder);
    return swayer;
  }
  // An occasional shooting star
  function shootingStar(st, ctx, t, dt, w, maxY) {
    if (!st.s) {
      if (st.next === undefined) st.next = t + rnd(2, 6);
      if (t < st.next) return;
      const a = rnd(0.25, 0.6), sp = rnd(650, 950), dir = Math.random() < 0.5 ? -1 : 1;
      st.s = { x: rnd(w * 0.15, w * 0.85), y: rnd(0, maxY * 0.45), vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp, life: 0.8 };
    }
    const s = st.s;
    s.life -= dt;
    if (s.life <= 0) { st.s = null; st.next = t + rnd(3, 9); return; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    const tx = s.x - s.vx * 0.13, ty = s.y - s.vy * 0.13;
    const gr = ctx.createLinearGradient(s.x, s.y, tx, ty);
    gr.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, s.life * 1.6)})`);
    gr.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
  }

  function makeScene(name, def) {
    const sc = {
      name, cv: $("#space"), front: $("#sceneFront"), fringeEl: $("#fringe"),
      ctx: null, fctx: null, w: 0, h: 0, dpr: 1, running: false, raf: 0,
      t0: performance.now(), lastT: 0, lite: false, slow: 0, sizedFor: "",
      resize() {
        this.dpr = Math.min(devicePixelRatio || 1, 1.5);
        this.w = innerWidth; this.h = innerHeight;
        for (const cv of def.front ? [this.cv, this.front] : [this.cv]) {
          cv.width = Math.round(this.w * this.dpr); cv.height = Math.round(this.h * this.dpr);
        }
        this.ctx = this.cv.getContext("2d");
        this.fctx = this.front.getContext("2d");
        if (def.fringe) { this.fringeEl.innerHTML = ""; this.fringeEl.dataset.owner = name; }
        def.build.call(this);
        this.sizedFor = `${this.w}x${this.h}`;
      },
      frame() {
        if (!this.running) return;
        const now = performance.now();
        const t = (now - this.t0) / 1000;
        const dt = Math.min(0.05, (now - (this.lastT || now)) / 1000);
        this.lastT = now;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.globalCompositeOperation = "source-over"; this.ctx.globalAlpha = 1;
        if (def.front) {
          this.fctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          this.fctx.clearRect(0, 0, this.w, this.h);
          this.fctx.globalCompositeOperation = "source-over"; this.fctx.globalAlpha = 1;
        }
        if (!this.lite) {                                   // slow device? lighten once
          this.slow = dt > 0.03 ? this.slow + 1 : Math.max(0, this.slow - 2);
          if (this.slow > 90) { this.lite = true; def.lite?.call(this); }
        }
        def.draw.call(this, t, dt);
        if (!calm) this.raf = requestAnimationFrame(() => this.frame());
      },
      start() {
        if (this.running) return;
        const stale = this.sizedFor !== `${innerWidth}x${innerHeight}`;
        if (stale || (def.fringe && this.fringeEl.dataset.owner !== name)) this.resize();
        else if (def.front && this.front.width !== Math.round(this.w * this.dpr)) this.resize();
        this.running = true;
        this.cv.hidden = false;
        if (def.front) this.front.hidden = false;
        if (def.fringe) this.fringeEl.hidden = false;
        this.lastT = performance.now();
        this.frame();
      },
      tap(x, y) { def.tap?.call(this, x, y, (performance.now() - this.t0) / 1000); },
      stop() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.cv.hidden = true;
        if (def.front) { this.fctx.clearRect(0, 0, this.front.width, this.front.height); this.front.hidden = true; }
        if (def.fringe) this.fringeEl.hidden = true;
      },
    };
    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (sc.running) sc.resize(); }, 200); });
    return sc;
  }

  /* ===== DEEP OCEAN: glowing jellyfish, plankton that sparkles when disturbed, kelp, light from above ===== */
  function drawJelly(ctx, j, t, w, h) {
    const d = mod(j.d0 + cam.z * 0.4, 1);
    const fade = smooth(0, 0.15, d) * (1 - smooth(0.85, 1, d));
    if (fade < 0.02) return;
    const k = 0.35 + d * 1.5, par = 0.05 + d * 0.35;
    const x0 = mod(j.x * w * 1.4 + Math.sin(t * 0.2 + j.ph) * 40 - cam.x * par, w * 1.4) - w * 0.2;
    const y0 = mod(j.y * h * 1.6 - t * 14 * j.sp * (0.5 + d) - cam.y * par * 0.4, h * 1.6) - h * 0.3;
    const R = 30 * j.size * k;
    let x = x0, y = y0, c = Math.pow(Math.max(0, Math.sin(t * 2.2 * j.sp + j.ph)), 2);   // the bell pulses
    if (j.dash) {                                           // tapped: it jets away, then drifts back
      const age = t - j.dash.t, d = 190 * ease.outCubic(Math.min(1, age / 1.4)) * (1 - smooth(4, 9, age));
      x += Math.cos(j.dash.ang) * d; y += Math.sin(j.dash.ang) * d;
      if (age < 1.4) c = Math.max(c, Math.pow(Math.sin(age * 9), 2));
      if (age > 9) j.dash = null;
    }
    j.sx = x; j.sy = y; j.R = R;
    if (x < -R * 3 || x > w + R * 3 || y < -R * 4 || y > h + R * 2) return;
    const bw = R * (1 - c * 0.18), bh = R * 0.85 * (1 + c * 0.16);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 * fade;
    const G = R * 4.2;
    ctx.drawImage(Jungle.sprite(j.hue, 60), x - G, y - G * 0.7, G * 2, G * 2);
    ctx.globalAlpha = fade;
    ctx.lineCap = "round";
    ctx.strokeStyle = `hsla(${j.hue}, 100%, 78%, .35)`;
    ctx.lineWidth = Math.max(0.6, 1.1 * k);
    for (let n = 0; n < 7; n++) {                            // trailing tentacles
      const x0 = x + (n / 6 - 0.5) * bw * 1.7, L = R * (2.4 + (n % 3) * 0.5);
      ctx.beginPath(); ctx.moveTo(x0, y);
      for (let s = 1; s <= 10; s++) { const f = s / 10; ctx.lineTo(x0 + Math.sin(t * 2 + n * 1.3 - f * 4) * R * 0.22 * f, y + f * L * (1 - c * 0.12)); }
      ctx.stroke();
    }
    ctx.strokeStyle = `hsla(${j.hue}, 100%, 85%, .45)`;
    ctx.lineWidth = Math.max(1, 3 * k);
    for (const side of [-1, 1]) {                            // frilly oral arms
      ctx.beginPath(); ctx.moveTo(x + side * bw * 0.15, y);
      for (let s = 1; s <= 8; s++) { const f = s / 8; ctx.lineTo(x + side * bw * 0.15 + Math.sin(t * 1.6 + side + f * 5) * R * 0.25 * f, y + f * R * 1.5); }
      ctx.stroke();
    }
    const gr = ctx.createRadialGradient(x, y - bh * 0.6, 0, x, y - bh * 0.3, bw * 1.1);
    gr.addColorStop(0, `hsla(${j.hue}, 100%, 90%, .7)`);
    gr.addColorStop(0.6, `hsla(${j.hue}, 95%, 65%, .28)`);
    gr.addColorStop(1, `hsla(${j.hue}, 90%, 55%, .08)`);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(x, y, bw, bh, 0, Math.PI, TAU);
    for (let s = 0; s <= 8; s++) { const f = s / 8; ctx.lineTo(x + bw - f * bw * 2, y + Math.sin(f * Math.PI * 8) * R * 0.06 + R * 0.05); }
    ctx.fill();
    ctx.strokeStyle = `hsla(${j.hue}, 100%, 88%, .65)`;
    ctx.lineWidth = Math.max(0.8, 1.4 * k);
    ctx.beginPath(); ctx.ellipse(x, y, bw, bh, 0, Math.PI, TAU); ctx.stroke();
    ctx.fillStyle = `hsla(${j.hue}, 100%, 92%, .5)`;
    for (let n = 0; n < 4; n++) {
      const a = Math.PI + ((n + 0.5) / 4) * Math.PI;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * bw * 0.42, y + Math.sin(a) * bh * 0.42, bw * 0.12, bh * 0.1, a, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const Ocean = makeScene("ocean", {
    build() {
      const { w, h } = this;
      const [bg, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#06324a"); gr.addColorStop(0.35, "#03203a"); gr.addColorStop(1, "#010810");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const sun = g.createRadialGradient(w * 0.5, -h * 0.15, 0, w * 0.5, -h * 0.15, h * 0.9);
      sun.addColorStop(0, "rgba(140, 230, 255, .28)"); sun.addColorStop(1, "rgba(140, 230, 255, 0)");
      g.fillStyle = sun; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 7; i++) {                            // light shafts from the surface
        const x = w * (0.08 + i * 0.13) + rnd(-30, 30), bw = rnd(30, 90), sk = rnd(-0.25, 0.25) * h;
        const lg = g.createLinearGradient(0, 0, 0, h * 0.8);
        lg.addColorStop(0, "rgba(150, 230, 255, .09)"); lg.addColorStop(1, "rgba(150, 230, 255, 0)");
        g.fillStyle = lg;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + bw, 0); g.lineTo(x + bw * 2 + sk, h * 0.8); g.lineTo(x + sk, h * 0.8); g.fill();
      }
      this.bg = bg;
      this.TW = Math.ceil(w * 1.6);
      const shapes = [];
      for (let x = -40; x < this.TW + 40; x += 28) {
        const y = h * 0.91 + Math.sin(x * 0.01) * h * 0.03 + rnd(-10, 10), r = rnd(24, 60);
        shapes.push(c => { c.fillStyle = "#010a12"; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillRect(x - r, y, r * 2, h); });
      }
      for (let i = 0; i < Math.ceil(this.TW / 150); i++) {      // fan corals
        const x = rnd(0, this.TW), y = h * rnd(0.87, 0.93), s = rnd(30, 70), lean = rnd(-0.3, 0.3);
        shapes.push(c => {
          c.strokeStyle = "#021320"; c.lineCap = "round";
          const br = (x0, y0, a, len, dep) => {
            if (dep > 4) return;
            const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
            c.lineWidth = Math.max(1, 4 - dep);
            c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
            br(x1, y1, a - 0.42, len * 0.72, dep + 1); br(x1, y1, a + 0.42, len * 0.72, dep + 1);
          };
          br(x, y, -Math.PI / 2 + lean, s * 0.45, 0);
        });
      }
      this.bed = tileLayer(this.TW, h, shapes);
      this.kelp = Array.from({ length: Math.ceil(this.TW / 110) }, () => ({ x: rnd(0, this.TW), hgt: h * rnd(0.35, 0.72), ph: rnd(0, TAU), wd: rnd(5, 9) }));
      const hues = [320, 190, 270, 175, 300, 210];
      this.jellies = Array.from({ length: clamp(Math.round(w / 190), 5, 10) }, (_, i) => ({ x: Math.random(), y: Math.random(), d0: Math.random(), hue: hues[i % hues.length], ph: rnd(0, TAU), size: rnd(0.8, 1.2), sp: rnd(0.6, 1) }));
      this.plankton = Array.from({ length: clamp(Math.round((w * h) / 5000), 150, 320) }, () => ({ x: Math.random(), y: Math.random(), d0: Math.random(), lit: 0, ph: rnd(0, TAU), hue: Math.round(rnd(165, 200)) }));
      this.bubbles = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(1.5, 5), sp: rnd(30, 80), ph: rnd(0, TAU) }));
    },
    lite() { this.plankton = this.plankton.filter((_, i) => i % 2 === 0); },
    tap(x, y, t) {
      const j = this.jellies.find(j => j.sx !== undefined && Math.hypot(j.sx - x, j.sy - j.R * 0.3 - y) < Math.max(40, j.R * 1.6));
      if (j) j.dash = { t, ang: Math.atan2(j.sy - y, j.sx - x) + rnd(-0.4, 0.4) };
      this.glow = { x, y, t };
      this.extra = (this.extra || []).concat(Array.from({ length: 14 }, () => ({ x: x + rnd(-14, 14), y: y + rnd(-8, 8), vy: rnd(60, 160), r: rnd(2, 6), life: rnd(1.2, 2.4), ph: rnd(0, TAU) })));
      Sound.sfx("bubbles");
    },
    draw(t, dt) {
      const { ctx, w, h, TW } = this;
      ctx.drawImage(this.bg, 0, 0, w, h);
      // Kelp swaying in the current
      const kx0 = -mod(cam.x * 0.14, TW);
      ctx.lineCap = "round";
      for (const k of this.kelp) {
        const bx = wrapX(k.x + kx0, TW, w);
        if (bx < -80 || bx > w + 80) continue;
        ctx.strokeStyle = "#03283c"; ctx.fillStyle = "#03283c";
        let px = bx, py = h;
        for (let i = 1; i <= 14; i++) {
          const f = i / 14;
          const nx = bx + Math.sin(t * 0.8 + k.ph + i * 0.35) * i * 2.4, ny = h - f * k.hgt;
          ctx.lineWidth = k.wd * (1 - f * 0.6);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
          if (i % 2 === 0) { ctx.beginPath(); ctx.ellipse(nx + (i % 4 ? 7 : -7), ny, 9, 3.5, i % 4 ? 0.5 : -0.5, 0, TAU); ctx.fill(); }
          px = nx; py = ny;
        }
      }
      // Plankton light up when your cursor passes or the wall moves
      const stir = Math.min(1, Math.hypot(cam.vx, cam.vy) / 25);
      ctx.globalCompositeOperation = "lighter";
      for (const p of this.plankton) {
        const d = mod(p.d0 + cam.z * 0.5, 1), par = 0.05 + d * 0.4;
        const x = mod(p.x * w * 1.3 + Math.sin(t * 0.3 + p.ph) * 12 - cam.x * par, w * 1.3) - w * 0.15;
        const y = mod(p.y * h * 1.2 - t * 6 * (0.3 + d) - cam.y * par * 0.5 + Math.cos(t * 0.4 + p.ph) * 8, h * 1.2) - h * 0.1;
        const dist = Math.hypot(x - pointer.x, y - pointer.y);
        if (dist < 130) p.lit = Math.max(p.lit, 1 - dist / 130);
        if (this.glow && t - this.glow.t < 0.8) {             // a tap sends a wave of light outward
          const gd = Math.hypot(x - this.glow.x, y - this.glow.y), front = (t - this.glow.t) * 420;
          if (Math.abs(gd - front) < 60) p.lit = 1;
        }
        p.lit = Math.max(p.lit * (1 - dt * 0.9), stir * 0.6);
        const sz = 0.6 + d * 2.2, fade = smooth(0, 0.1, d);
        if (p.lit > 0.12) {
          const R = sz * 8 * p.lit;
          ctx.globalAlpha = p.lit * 0.9 * fade;
          ctx.drawImage(Jungle.sprite(p.hue, 62), x - R, y - R, R * 2, R * 2);
        }
        ctx.globalAlpha = (0.15 + p.lit * 0.85) * fade;
        ctx.fillStyle = `hsl(${p.hue}, 100%, 82%)`;
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;
      for (const j of this.jellies) drawJelly(ctx, j, t, w, h);
      ctx.globalCompositeOperation = "source-over";
      drawWrapped(ctx, this.bed, 0.18, w);
      // Bubbles released by taps
      if (this.extra?.length) {
        ctx.strokeStyle = "rgba(200, 245, 255, .7)"; ctx.lineWidth = 1.2;
        this.extra = this.extra.filter(b => {
          b.life -= dt; b.y -= b.vy * dt; b.x += Math.sin(t * 6 + b.ph) * 0.6;
          if (b.life <= 0) return false;
          ctx.globalAlpha = Math.min(1, b.life);
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
          return true;
        });
        ctx.globalAlpha = 1;
      }
      // Rising bubbles
      ctx.strokeStyle = "rgba(180, 240, 255, .35)"; ctx.lineWidth = 1;
      for (const b of this.bubbles) {
        const x = mod(b.x * w + Math.sin(t * 2 + b.ph) * 6 - cam.x * 0.2, w), y = mod(b.y * h - t * b.sp, h * 1.1);
        ctx.beginPath(); ctx.arc(x, y, b.r, 0, TAU); ctx.stroke();
      }
    },
  });

  /* ===== AURORA: northern lights rippling over snowy mountains, gentle snowfall ===== */
  function mountainLayer(TW, h, { base, hMin, hMax, color, snow, trees }) {
    const pts = [[0, base - rnd(0, hMin * 0.3)]];
    let x = 0;
    while (x < TW - 240) {
      x += rnd(70, 150); pts.push([x, base - rnd(hMin, hMax)]);
      x += rnd(70, 150); pts.push([Math.min(x, TW - 60), base - rnd(0, hMin * 0.35)]);
    }
    pts.push([TW, pts[0][1]]);
    const ridgeY = px => {
      for (let i = 1; i < pts.length; i++) if (pts[i][0] >= px) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; return ay + ((by - ay) * (px - ax)) / (bx - ax || 1); }
      return pts[0][1];
    };
    const treeList = [];
    if (trees) for (let tx = 4; tx < TW; tx += rnd(7, 16)) treeList.push([tx, rnd(14, 34)]);
    return tileLayer(TW, h, [g => {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(0, h);
      for (const [px, py] of pts) g.lineTo(px, py);
      g.lineTo(TW, h); g.closePath(); g.fill();
      if (snow) {
        g.fillStyle = snow;
        for (let i = 1; i < pts.length - 1; i += 2) {
          const [px, py] = pts[i], [lx, ly] = pts[i - 1], [rx, ry] = pts[i + 1], k = 0.32;
          const ax = px + (lx - px) * k, ay = py + (ly - py) * k, bx = px + (rx - px) * k, by = py + (ry - py) * k;
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(px, py); g.lineTo(bx, by);
          for (let s = 6; s >= 0; s--) { const f = s / 6; g.lineTo(ax + (bx - ax) * f, ay + (by - ay) * f + (s % 2 ? 9 : -3)); }
          g.closePath(); g.fill();
        }
      }
      if (trees) {
        g.fillStyle = color;
        for (const [tx, th] of treeList) {
          const ty = ridgeY(tx) + 4;
          for (let k = 0; k < 3; k++) {
            const tw = th * (0.45 - k * 0.1), y0 = ty - th * (k * 0.28);
            g.beginPath(); g.moveTo(tx - tw, y0); g.lineTo(tx, y0 - th * 0.5); g.lineTo(tx + tw, y0); g.fill();
          }
        }
      }
    }]);
  }

  const Aurora = makeScene("aurora", {
    front: true,
    build() {
      const { w, h } = this;
      const [sky, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#01040f"); gr.addColorStop(0.55, "#061633"); gr.addColorStop(0.78, "#12305a"); gr.addColorStop(1, "#0a1a33");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) {
        g.fillStyle = `rgba(255, 255, 255, ${rnd(0.15, 0.8)})`;
        const s = Math.random() < 0.06 ? 1.6 : 0.9;
        g.fillRect(rnd(0, w), rnd(0, h * 0.75), s, s);
      }
      this.sky = sky;
      this.twinkle = Array.from({ length: 90 }, () => ({ x: rnd(0, w), y: rnd(0, h * 0.7), ph: rnd(0, TAU), sp: rnd(1, 3) }));
      // Aurora colour strips: bright at the base, fading up into violet
      const strip = (c0, c1, c2) => {
        const [c, s] = mkCanvas(2, 256);
        const lg = s.createLinearGradient(0, 256, 0, 0);
        lg.addColorStop(0, c0); lg.addColorStop(0.12, c1); lg.addColorStop(0.55, c2); lg.addColorStop(1, "rgba(0,0,0,0)");
        s.fillStyle = lg; s.fillRect(0, 0, 2, 256);
        return c;
      };
      this.ribbons = [
        { img: strip("rgba(190,255,220,.9)", "rgba(60,255,160,.7)", "rgba(120,80,255,.18)"), base: 0.28, amp: 0.07, ph: rnd(0, TAU), ph2: rnd(0, TAU), hgt: 0.3 },
        { img: strip("rgba(170,255,240,.8)", "rgba(40,220,200,.55)", "rgba(80,120,255,.15)"), base: 0.2, amp: 0.05, ph: rnd(0, TAU), ph2: rnd(0, TAU), hgt: 0.24 },
        { img: strip("rgba(255,190,240,.7)", "rgba(200,90,255,.45)", "rgba(80,60,200,.12)"), base: 0.36, amp: 0.06, ph: rnd(0, TAU), ph2: rnd(0, TAU), hgt: 0.2 },
      ];
      this.TW = Math.ceil(w * 1.6);
      this.far = mountainLayer(this.TW, h, { base: h * 0.74, hMin: h * 0.12, hMax: h * 0.3, color: "#0a1830", snow: "rgba(190, 210, 240, .6)" });
      this.mid = mountainLayer(this.TW, h, { base: h * 0.84, hMin: h * 0.08, hMax: h * 0.22, color: "#060f22", snow: "rgba(215, 228, 250, .8)" });
      this.near = mountainLayer(this.TW, h, { base: h * 0.95, hMin: h * 0.02, hMax: h * 0.08, color: "#02060e", trees: true });
      this.flakes = Array.from({ length: clamp(Math.round((w * h) / 7000), 90, 220) }, () => ({ x: Math.random(), y: Math.random(), d0: Math.random(), ph: rnd(0, TAU), sp: rnd(0.7, 1.3) }));
      this.shoot = {};
    },
    lite() { this.flakes = this.flakes.filter((_, i) => i % 2 === 0); },
    tap() { this.shoot.next = 0; this.shoot.s = null; Sound.sfx("sparkle"); },
    draw(t, dt) {
      const { ctx, fctx, w, h } = this;
      ctx.drawImage(this.sky, 0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const s of this.twinkle) {
        ctx.globalAlpha = 0.3 + 0.7 * Math.pow(Math.max(0, Math.sin(t * s.sp + s.ph)), 3);
        ctx.fillStyle = "#fff"; ctx.fillRect(s.x, s.y, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      shootingStar(this.shoot, ctx, t, dt, w, h * 0.5);
      // The aurora: columns of light that ripple and shimmer
      const step = this.lite ? 10 : 6, pan = Math.tanh(-cam.x / 6000) * 80;
      ctx.globalCompositeOperation = "lighter";
      for (const r of this.ribbons) {
        const breathe = 0.65 + 0.35 * Math.sin(t * 0.25 + r.ph);
        for (let x = -20; x < w + 20; x += step) {
          const X = x - pan;
          const y = h * r.base + Math.sin(X * 0.0035 + t * 0.15 + r.ph) * h * r.amp + Math.sin(X * 0.011 - t * 0.33 + r.ph2) * h * r.amp * 0.4;
          const H = h * r.hgt * (0.55 + 0.45 * Math.sin(X * 0.021 + t * 0.9 + r.ph2));
          const edge = smooth(-20, w * 0.15, x) * (1 - smooth(w * 0.85, w + 20, x));
          ctx.globalAlpha = (0.35 + 0.3 * Math.sin(X * 0.05 + t * 1.7 + r.ph)) * breathe * edge;
          ctx.drawImage(r.img, x, y - H, step + 1, H);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      drawWrapped(ctx, this.far, 0.02, w);
      drawWrapped(ctx, this.mid, 0.06, w);
      drawWrapped(ctx, this.near, 0.13, w);
      // Snow (the nearest flakes fall in front of the posts)
      for (const f of this.flakes) {
        const d = mod(f.d0 + cam.z * 0.5, 1), par = 0.05 + d * 0.4;
        const x = mod(f.x * w * 1.2 + Math.sin(t * 0.6 * f.sp + f.ph) * 30 - cam.x * par, w * 1.2) - w * 0.1;
        const y = mod(f.y * h * 1.2 + t * (18 + d * 55) * f.sp - cam.y * par * 0.4, h * 1.2) - h * 0.1;
        const sz = 0.8 + d * 3.4, a = (0.35 + d * 0.6) * smooth(0, 0.12, d) * (1 - smooth(0.92, 1, d));
        const g = d > 0.8 ? fctx : ctx;
        g.globalAlpha = a; g.fillStyle = "#eef4ff";
        g.beginPath(); g.arc(x, y, sz, 0, TAU); g.fill();
      }
      ctx.globalAlpha = 1; fctx.globalAlpha = 1;
    },
  });

  /* ===== SAKURA DUSK: cherry blossoms swirling past paper lanterns at sunset ===== */
  function makeBlossomBranch(S) {
    const [c, g] = mkCanvas(S * 1.15, S * 0.85);
    const py = S * 0.1, blossoms = [];
    const br = (x, y, a, len, wd, dep) => {
      const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
      g.strokeStyle = "#2a1420"; g.lineWidth = wd; g.lineCap = "round";
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x1) / 2 + rnd(-8, 8), (y + y1) / 2 + rnd(-8, 8), x1, y1); g.stroke();
      if (dep > 0) blossoms.push([x1, y1, 1 + dep * 0.15], [(x + x1) / 2, (y + y1) / 2, 0.8]);
      if (dep < 5 && wd > 1.2) {
        br(x1, y1, a + rnd(0.2, 0.6), len * rnd(0.6, 0.8), wd * 0.68, dep + 1);
        br(x1, y1, a - rnd(0.1, 0.5), len * rnd(0.6, 0.8), wd * 0.68, dep + 1);
      }
    };
    br(0, py, 0.35, S * 0.3, S * 0.035, 0);
    for (const [x, y, k] of blossoms) {
      for (let i = 0; i < 8; i++) {
        const bx = x + rnd(-14, 14) * k, by = y + rnd(-12, 12) * k, r = rnd(3, 6.5);
        g.fillStyle = `hsl(${rnd(330, 352)}, ${rnd(60, 82)}%, ${rnd(78, 90)}%)`;
        g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
        g.fillStyle = "hsla(340, 80%, 58%, .6)";
        g.beginPath(); g.arc(bx, by, r * 0.3, 0, TAU); g.fill();
      }
    }
    return { img: c, px: 0, py };
  }

  const Sakura = makeScene("sakura", {
    front: true, fringe: true,
    build() {
      const { w, h } = this;
      const hz = h * 0.74;
      const [sky, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, hz);
      gr.addColorStop(0, "#2a1a4a"); gr.addColorStop(0.42, "#6b3a78"); gr.addColorStop(0.75, "#e0708a"); gr.addColorStop(0.92, "#ffb27a"); gr.addColorStop(1, "#ffd59e");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const sunX = w * 0.62, sunR = h * 0.11;
      const glow = g.createRadialGradient(sunX, hz, 0, sunX, hz, h * 0.6);
      glow.addColorStop(0, "rgba(255, 210, 150, .55)"); glow.addColorStop(1, "rgba(255, 210, 150, 0)");
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffe6b8"; g.beginPath(); g.arc(sunX, hz - sunR * 0.25, sunR, 0, TAU); g.fill();
      for (let i = 0; i < 9; i++) {                                // sunset clouds
        const cx = rnd(0, w), cy = rnd(h * 0.12, h * 0.55), cw = rnd(w * 0.08, w * 0.25);
        g.fillStyle = `rgba(255, ${Math.round(rnd(150, 200))}, ${Math.round(rnd(170, 200))}, ${rnd(0.12, 0.28)})`;
        g.beginPath(); g.ellipse(cx, cy, cw, cw * 0.06, 0, 0, TAU); g.fill();
      }
      this.sky = sky;
      this.TW = Math.ceil(w * 1.6);
      const TW = this.TW;
      // Far: a snow-capped volcano
      const fx = TW * 0.3, fw = w * 0.42, fh = h * 0.3;
      this.far = tileLayer(TW, h, [c => {
        c.fillStyle = "#4a2a5e";
        c.beginPath(); c.moveTo(fx - fw, hz + 4); c.quadraticCurveTo(fx - fw * 0.25, hz - fh * 0.6, fx - fw * 0.09, hz - fh);
        c.lineTo(fx + fw * 0.09, hz - fh); c.quadraticCurveTo(fx + fw * 0.25, hz - fh * 0.6, fx + fw, hz + 4); c.fill();
        c.fillStyle = "#f2c6d6";
        c.beginPath(); c.moveTo(fx - fw * 0.09, hz - fh); c.lineTo(fx + fw * 0.09, hz - fh); c.lineTo(fx + fw * 0.2, hz - fh * 0.72);
        for (let s = 6; s >= 0; s--) c.lineTo(fx - fw * 0.2 + (fw * 0.4 * s) / 6, hz - fh * 0.72 + (s % 2 ? 8 : -2));
        c.fill();
        c.fillStyle = "#3a1f45"; c.fillRect(0, hz, TW, h - hz);
      }]);
      // Mid: hills and a pagoda
      const ridge = periodicRidge(TW, hz + h * 0.04, [[2, h * 0.025], [5, h * 0.012]]);
      const px = TW * 0.72, pBase = ridge(TW * 0.72);
      this.mid = tileLayer(TW, h, [c => {
        c.fillStyle = "#2c1638";
        c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= TW; x += 8) c.lineTo(x, ridge(x)); c.lineTo(TW, h); c.fill();
        for (let k = 0; k < 5; k++) {
          const y = pBase - 12 - k * 22, rw = 46 - k * 6;
          c.fillRect(px - rw * 0.32, y - 6, rw * 0.64, 22);
          c.beginPath(); c.moveTo(px - rw, y + 2); c.quadraticCurveTo(px - rw * 0.5, y - 2, px - rw * 0.3, y - 10);
          c.lineTo(px + rw * 0.3, y - 10); c.quadraticCurveTo(px + rw * 0.5, y - 2, px + rw, y + 2); c.fill();
        }
        c.fillRect(px - 1.5, pBase - 145, 3, 30);
      }]);
      // Near: dark hills with round blossom trees
      const ridge2 = periodicRidge(TW, h * 0.9, [[3, h * 0.03], [7, h * 0.012]]);
      const trees = Array.from({ length: Math.ceil(TW / 120) }, () => [rnd(0, TW), rnd(26, 52)]);
      this.near = tileLayer(TW, h, [c => {
        c.fillStyle = "#1a0d24";
        c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= TW; x += 8) c.lineTo(x, ridge2(x)); c.lineTo(TW, h); c.fill();
        for (const [tx, r] of trees) {
          const ty = ridge2(tx);
          c.fillStyle = "#1a0d24"; c.fillRect(tx - 3, ty - r, 6, r);
          c.fillStyle = "#3a1838";
          for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(tx + Math.cos(k * 1.3) * r * 0.55, ty - r - Math.abs(Math.sin(k * 1.7)) * r * 0.5, r * 0.55, 0, TAU); c.fill(); }
        }
      }]);
      // Blossom branches reaching in from the top corners
      const S = Math.min(w, h) * 0.95;
      fringeItem(this.fringeEl, makeBlossomBranch(S), -10, -S * 0.04, 0.12, 1, 0.02);
      fringeItem(this.fringeEl, makeBlossomBranch(S * 0.85), w + 10, -S * 0.02, 0.18, -1, 0.02);
      this.petals = Array.from({ length: clamp(Math.round((w * h) / 9000), 80, 180) }, () => ({ x: Math.random(), y: Math.random(), d0: Math.random(), rot: rnd(0, TAU), spin: rnd(0, TAU), sp: rnd(1.5, 3.5), hue: rnd(335, 352) }));
      this.lanterns = Array.from({ length: 7 }, () => ({ x: Math.random(), y: Math.random(), d: rnd(0.25, 1), ph: rnd(0, TAU), sp: rnd(6, 14) }));
    },
    lite() { this.petals = this.petals.filter((_, i) => i % 2 === 0); },
    tap(x, y, t) { this.gust = { x, y, t }; Sound.sfx("petals"); },
    draw(t) {
      const { ctx, fctx, w, h } = this;
      ctx.drawImage(this.sky, 0, 0, w, h);
      drawWrapped(ctx, this.far, 0.02, w);
      // Sky lanterns drifting up
      for (const L of this.lanterns) {
        const par = 0.03 + L.d * 0.15;
        const x = mod(L.x * w * 1.3 + Math.sin(t * 0.3 + L.ph) * 18 - cam.x * par, w * 1.3) - w * 0.15;
        const y = mod(L.y * h * 1.3 - t * L.sp * L.d, h * 1.3) - h * 0.1;
        const s = 7 + L.d * 12, flick = 0.85 + 0.15 * Math.sin(t * 9 + L.ph);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.85 * flick;
        ctx.drawImage(Jungle.sprite(32, 58), x - s * 4, y - s * 4, s * 8, s * 8);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        const lg = ctx.createLinearGradient(0, y - s, 0, y + s);
        lg.addColorStop(0, "#ffe2b0"); lg.addColorStop(1, "#ff9a3c");
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(x - s * 0.55, y - s * 0.8); ctx.lineTo(x + s * 0.55, y - s * 0.8); ctx.lineTo(x + s * 0.45, y + s * 0.6); ctx.lineTo(x - s * 0.45, y + s * 0.6); ctx.fill();
        ctx.fillStyle = "rgba(120, 40, 20, .5)"; ctx.fillRect(x - s * 0.55, y - s * 0.86, s * 1.1, s * 0.12);
      }
      drawWrapped(ctx, this.mid, 0.06, w);
      drawWrapped(ctx, this.near, 0.14, w);
      // Petals tumbling on the breeze (nearest ones over the posts)
      for (const p of this.petals) {
        const d = mod(p.d0 + cam.z * 0.5, 1), par = 0.05 + d * 0.4;
        let x = mod(p.x * w * 1.3 + t * (20 + d * 45) + Math.sin(t * 0.9 + p.spin) * 25 - cam.x * par, w * 1.3) - w * 0.15;
        let y = mod(p.y * h * 1.2 + t * (14 + d * 40) - cam.y * par * 0.4, h * 1.2) - h * 0.1;
        if (this.gust && t - this.gust.t < 3) {
          const gx = x - this.gust.x, gy = y - this.gust.y, gd = Math.hypot(gx, gy), age = t - this.gust.t;
          if (gd < 300 && gd > 0.1) { const k = (1 - gd / 300) * ease.outCubic(Math.min(1, age / 0.7)) * (1 - smooth(1.5, 3, age)) * 180; const a = Math.atan2(gy, gx) + age * 1.2; x += Math.cos(a) * k; y += Math.sin(a) * k; }
        }
        const s = 2.5 + d * 8, a = (0.55 + d * 0.45) * smooth(0, 0.1, d) * (1 - smooth(0.93, 1, d));
        const g = d > 0.78 ? fctx : ctx;
        g.save();
        g.translate(x, y); g.rotate(p.rot + t * 0.6);
        g.scale(Math.cos(t * p.sp + p.spin), 1);                 // flipping in the air
        g.globalAlpha = a;
        g.fillStyle = `hsl(${p.hue}, 85%, 86%)`;
        g.beginPath(); g.moveTo(0, -s);
        g.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.7, s * 0.7, 0, s);
        g.bezierCurveTo(-s * 0.7, s * 0.7, -s * 0.9, -s * 0.6, 0, -s);
        g.fill();
        g.restore();
      }
    },
  });

  /* ===== NEON CITY: synthwave grid, striped sunset, glowing skyline, rain and flying cars ===== */
  function skyline(TW, h, hz, { hMin, hMax, color, wins, density, glow }) {
    const list = [];
    let x = 0;
    while (x < TW) {
      const bw = rnd(28, 90), bh = rnd(hMin, hMax), bx = x;
      x += bw + rnd(0, 8);
      const winList = [];
      if (wins) for (let wy = hz - bh + 8; wy < hz - 6; wy += 9) for (let wx = bx + 5; wx < bx + bw - 6; wx += 8) if (Math.random() < density) winList.push([wx, wy, wins[Math.floor(Math.random() * wins.length)]]);
      const ant = Math.random() < 0.25 ? rnd(10, 40) : 0;
      const sign = glow && Math.random() < 0.3 ? wins[Math.floor(Math.random() * wins.length)] : null;
      list.push({ bx, bw, bh, winList, ant, sign });
    }
    return tileLayer(TW, h, [g => {
      for (const b of list) {
        g.fillStyle = color;
        g.fillRect(b.bx, hz - b.bh, b.bw, b.bh + 2);
        if (b.ant) g.fillRect(b.bx + b.bw / 2 - 1, hz - b.bh - b.ant, 2, b.ant);
        if (glow) { g.shadowBlur = 6; }
        for (const [wx, wy, wc] of b.winList) { g.fillStyle = wc; g.shadowColor = wc; g.fillRect(wx, wy, 4, 3); }
        if (b.sign) { g.shadowColor = b.sign; g.shadowBlur = 14; g.fillStyle = b.sign; g.fillRect(b.bx + 3, hz - b.bh + 12, 3, b.bh * 0.35); }
        g.shadowBlur = 0;
      }
    }]);
  }

  const Neon = makeScene("neon", {
    front: true,
    build() {
      const { w, h } = this;
      const hz = (this.hz = h * 0.62);
      const [sky, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, hz);
      gr.addColorStop(0, "#0b0221"); gr.addColorStop(0.55, "#2b0a4a"); gr.addColorStop(0.85, "#7a1a6e"); gr.addColorStop(1, "#ff3d81");
      g.fillStyle = gr; g.fillRect(0, 0, w, hz);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.2, 0.8)})`; g.fillRect(rnd(0, w), rnd(0, hz * 0.6), 1, 1); }
      const R = h * 0.2;                                             // the striped sun
      const [sun, sg] = mkCanvas(R * 2, R * 2);
      const sgr = sg.createLinearGradient(0, 0, 0, R * 2);
      sgr.addColorStop(0, "#ffe45c"); sgr.addColorStop(0.5, "#ff8a3d"); sgr.addColorStop(1, "#ff2e88");
      sg.fillStyle = sgr; sg.beginPath(); sg.arc(R, R, R, 0, TAU); sg.fill();
      sg.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 9; i++) sg.fillRect(0, R * 0.95 + i * R * 0.12, R * 2, 2 + i * 1.7);
      const sglow = g.createRadialGradient(w / 2, hz - R * 0.4, R * 0.5, w / 2, hz - R * 0.4, R * 2.6);
      sglow.addColorStop(0, "rgba(255, 80, 160, .45)"); sglow.addColorStop(1, "rgba(255, 80, 160, 0)");
      g.fillStyle = sglow; g.fillRect(0, 0, w, hz);
      g.drawImage(sun, w / 2 - R, hz - R * 1.4);
      const floor = g.createLinearGradient(0, hz, 0, h);
      floor.addColorStop(0, "#2a0638"); floor.addColorStop(1, "#07010f");
      g.fillStyle = floor; g.fillRect(0, hz, w, h - hz);
      const hg = g.createLinearGradient(0, hz - 8, 0, hz + 30);
      hg.addColorStop(0, "rgba(255, 60, 180, 0)"); hg.addColorStop(0.3, "rgba(255, 90, 200, .7)"); hg.addColorStop(1, "rgba(255, 60, 180, 0)");
      g.fillStyle = hg; g.fillRect(0, hz - 8, w, 38);
      this.sky = sky;
      this.TW = Math.ceil(w * 1.6);
      this.far = skyline(this.TW, h, hz + 1, { hMin: h * 0.06, hMax: h * 0.22, color: "#1a0a35", wins: ["rgba(255,120,220,.45)", "rgba(120,220,255,.4)"], density: 0.12 });
      this.near = skyline(this.TW, h, hz + 2, { hMin: h * 0.08, hMax: h * 0.34, color: "#0a0418", wins: ["#30f3ff", "#ff3df2", "#ffe066", "#7c5cff"], density: 0.22, glow: true });
      this.rain = Array.from({ length: clamp(Math.round((w * h) / 5500), 120, 260) }, () => ({ x: Math.random(), y: Math.random(), d0: Math.random() }));
      this.cars = Array.from({ length: 5 }, (_, i) => ({ y: rnd(0.12, 0.45), sp: rnd(90, 230) * (i % 2 ? 1 : -1), x0: rnd(0, 1), hue: [190, 320, 50, 280, 175][i] }));
    },
    lite() { this.rain = this.rain.filter((_, i) => i % 2 === 0); },
    draw(t) {
      const { ctx, fctx, w, h, hz } = this;
      ctx.drawImage(this.sky, 0, 0, w, h);
      // Flying cars with light trails
      ctx.globalCompositeOperation = "lighter";
      for (const c of this.cars) {
        const x = mod(c.x0 * (w + 400) + t * c.sp - cam.x * 0.08, w + 400) - 200, y = c.y * h;
        const tail = -Math.sign(c.sp) * 130;
        const lg = ctx.createLinearGradient(x, y, x + tail, y);
        lg.addColorStop(0, `hsla(${c.hue}, 100%, 70%, .9)`); lg.addColorStop(1, `hsla(${c.hue}, 100%, 60%, 0)`);
        ctx.strokeStyle = lg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + tail, y); ctx.stroke();
        ctx.drawImage(Jungle.sprite(c.hue, 65), x - 14, y - 14, 28, 28);
      }
      ctx.globalCompositeOperation = "source-over";
      drawWrapped(ctx, this.far, 0.03, w);
      drawWrapped(ctx, this.near, 0.08, w);
      // The grid floor: rushes toward you (faster when you zoom), slides when you pan
      ctx.globalCompositeOperation = "lighter";
      const fh = h - hz, speed = t * 0.35 + cam.z * 1.2 + cam.y * 0.0006;
      const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      for (let i = 0; i < 22; i++) {
        const z = mod(i / 22 + speed, 1), y = hz + fh * Math.pow(z, 2.6);
        ctx.strokeStyle = `rgba(255, 60, 200, ${z * 0.3})`; ctx.lineWidth = 1 + z * 6; line(0, y, w, y);
        ctx.strokeStyle = `rgba(255, 140, 235, ${z * 0.9})`; ctx.lineWidth = 0.5 + z * 1.5; line(0, y, w, y);
      }
      const spacing = w / 8, shift = -mod(cam.x * 0.9, spacing), vpx = w / 2;
      for (let k = -12; k <= 12; k++) {
        const xb = vpx + (k * spacing + shift) * 2.4, xt = vpx + (xb - vpx) * 0.035;
        ctx.strokeStyle = "rgba(60, 220, 255, .22)"; ctx.lineWidth = 4; line(xt, hz, xb, h);
        ctx.strokeStyle = "rgba(140, 240, 255, .75)"; ctx.lineWidth = 1; line(xt, hz, xb, h);
      }
      ctx.globalCompositeOperation = "source-over";
      // Rain (the nearest streaks fall in front of the posts)
      ctx.lineCap = "round"; fctx.lineCap = "round";
      for (const r of this.rain) {
        const d = mod(r.d0 + cam.z * 0.5, 1), par = 0.05 + d * 0.4, sp = 500 + d * 900;
        const x = mod(r.x * w * 1.2 - t * sp * 0.22 - cam.x * par, w * 1.2) - w * 0.1;
        const y = mod(r.y * h * 1.2 + t * sp, h * 1.2) - h * 0.1;
        const len = 8 + d * 28, g = d > 0.82 ? fctx : ctx;
        g.strokeStyle = `rgba(180, 210, 255, ${(0.12 + d * 0.35) * (1 - smooth(0.95, 1, d))})`;
        g.lineWidth = 0.6 + d * 1.3;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.22, y - len); g.stroke();
      }
    },
  });

  /* ===== SAHARA NIGHT: dunes under wheeling stars, a camel caravan, shooting stars, a campfire ===== */
  function camel(g, x, y, s, ph, rider) {
    g.lineCap = "round";
    g.lineWidth = s * 0.12;
    const sw = Math.sin(ph) * s * 0.25;
    for (const [lx, o] of [[-0.45, 1], [-0.3, -1], [0.35, -1], [0.5, 1]]) {
      g.beginPath(); g.moveTo(x + lx * s, y - s * 0.9); g.lineTo(x + lx * s + sw * o, y); g.stroke();
    }
    g.beginPath(); g.ellipse(x, y - s * 1.05, s * 0.7, s * 0.3, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(x - s * 0.05, y - s * 1.3, s * 0.35, s * 0.28, 0, Math.PI, TAU); g.fill();
    g.lineWidth = s * 0.16;
    g.beginPath(); g.moveTo(x + s * 0.6, y - s * 1.05); g.quadraticCurveTo(x + s * 0.95, y - s * 1.2, x + s * 0.95, y - s * 1.65); g.stroke();
    g.beginPath(); g.ellipse(x + s * 1.08, y - s * 1.68, s * 0.18, s * 0.09, 0.2, 0, TAU); g.fill();
    if (rider) {
      g.beginPath(); g.ellipse(x - s * 0.05, y - s * 1.62, s * 0.1, s * 0.22, 0, 0, TAU); g.fill();
      g.beginPath(); g.arc(x - s * 0.05, y - s * 1.9, s * 0.09, 0, TAU); g.fill();
    }
  }

  const Sahara = makeScene("sahara", {
    build() {
      const { w, h } = this;
      const [sky, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#070418"); gr.addColorStop(0.45, "#1b1240"); gr.addColorStop(0.62, "#3d2453"); gr.addColorStop(0.72, "#8c4a3e"); gr.addColorStop(0.78, "#c27a4a");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const mx = w * 0.58, my = h * 0.16, mr = Math.min(w, h) * 0.055;   // the moon
      const mg = g.createRadialGradient(mx, my, mr, mx, my, mr * 7);
      mg.addColorStop(0, "rgba(255, 240, 210, .3)"); mg.addColorStop(1, "rgba(255, 240, 210, 0)");
      g.fillStyle = mg; g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff3d6"; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.fillStyle = "rgba(200, 180, 150, .35)";
      for (const [cx, cy, cr] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.35, 0.12], [0.3, -0.35, 0.1]]) { g.beginPath(); g.arc(mx + cx * mr, my + cy * mr, cr * mr, 0, TAU); g.fill(); }
      this.sky = sky;
      // Stars wheel slowly around the pole star
      this.pole = { x: w * 0.18, y: h * 0.08 };
      const maxR = Math.hypot(w, h);
      this.stars = Array.from({ length: clamp(Math.round((w * h) / 800), 700, 1800) }, () => ({ r: Math.sqrt(Math.random()) * maxR, a: rnd(0, TAU), s: Math.random() < 0.08 ? 2 : 1.2, b: rnd(0.35, 1), tw: rnd(0, TAU) }));
      this.TW = Math.ceil(w * 1.6);
      const TW = this.TW;
      const dune = (ridge, top, bottom, rim) => {
        let minY = h;
        for (let x = 0; x <= TW; x += 16) minY = Math.min(minY, ridge(x));
        return tileLayer(TW, h, [c => {
          const lg = c.createLinearGradient(0, minY, 0, h);
          lg.addColorStop(0, top); lg.addColorStop(1, bottom);
          c.fillStyle = lg;
          c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= TW; x += 6) c.lineTo(x, ridge(x)); c.lineTo(TW, h); c.fill();
          c.strokeStyle = rim; c.lineWidth = 1.5;
          c.beginPath(); for (let x = 0; x <= TW; x += 6) x ? c.lineTo(x, ridge(x)) : c.moveTo(x, ridge(x)); c.stroke();
        }]);
      };
      this.r1 = periodicRidge(TW, h * 0.74, [[2, h * 0.03], [5, h * 0.015]]);
      this.r2 = periodicRidge(TW, h * 0.8, [[3, h * 0.035], [7, h * 0.012]]);
      this.r3 = periodicRidge(TW, h * 0.88, [[2, h * 0.04], [4, h * 0.02]]);
      this.d1 = dune(this.r1, "#6e4560", "#3d2440", "rgba(255, 220, 190, .25)");
      this.d2 = dune(this.r2, "#5a3449", "#2a1730", "rgba(255, 210, 170, .3)");
      this.d3 = dune(this.r3, "#3a1f30", "#140912", "rgba(255, 200, 160, .22)");
      this.caravan = [0, 1, 2, 3, 4].map(i => ({ off: i * 34, rider: i === 0 || i === 2 }));
      this.fireX = TW * 0.16;
      this.embers = [];
      this.shoot = {};
    },
    lite() { this.stars = this.stars.filter((_, i) => i % 2 === 0); },
    tap() { this.shoot.next = 0; this.shoot.s = null; Sound.sfx("sparkle"); },
    draw(t, dt) {
      const { ctx, w, h, TW } = this;
      ctx.drawImage(this.sky, 0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const rot = t * 0.012, { x: px, y: py } = this.pole;
      for (const s of this.stars) {
        const a = s.a + rot, x = px + Math.cos(a) * s.r, y = py + Math.sin(a) * s.r;
        if (x < 0 || x > w || y < 0 || y > h * 0.8) continue;
        ctx.globalAlpha = s.b * (0.75 + 0.25 * Math.sin(t * 2 + s.tw));
        ctx.fillStyle = "#fff8ec"; ctx.fillRect(x, y, s.s, s.s);
      }
      ctx.globalAlpha = 1;
      shootingStar(this.shoot, ctx, t, dt, w, h * 0.6);
      ctx.globalCompositeOperation = "source-over";
      const x1 = drawWrapped(ctx, this.d1, 0.03, w);
      // The caravan walking along the far dune
      ctx.fillStyle = "#3b2238"; ctx.strokeStyle = "#3b2238";
      const head = mod(t * 11, TW);
      for (const c of this.caravan) {
        const lx = mod(head - c.off, TW), sx = wrapX(lx + x1, TW, w);
        if (sx < -40 || sx > w + 40) continue;
        camel(ctx, sx, this.r1(lx) + 1, 11, t * 3.2 + c.off, c.rider);
      }
      drawWrapped(ctx, this.d2, 0.07, w);
      const x3 = drawWrapped(ctx, this.d3, 0.13, w);
      // Campfire on the near dune, with rising embers
      const fx = wrapX(this.fireX + x3, TW, w), fy = this.r3(this.fireX) + 2;
      const flick = 0.82 + 0.12 * Math.sin(t * 13) + 0.08 * Math.sin(t * 7.3);
      if (fx > -200 && fx < w + 200) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.85;
        const G = 130 * flick;
        ctx.drawImage(Jungle.sprite(28, 55), fx - G, fy - G * 0.8, G * 2, G * 2);
        ctx.globalAlpha = 1;
        for (const [c, k, sp] of [["#ff4d1a", 1, 9], ["#ff8a2b", 0.75, 11], ["#ffd27a", 0.45, 14]]) {
          const fh = 26 * k * flick, fw = 9 * k;
          ctx.fillStyle = c;
          ctx.beginPath(); ctx.moveTo(fx - fw, fy);
          ctx.quadraticCurveTo(fx - fw * 0.8, fy - fh * 0.6, fx + Math.sin(t * sp) * 3, fy - fh);
          ctx.quadraticCurveTo(fx + fw * 0.8, fy - fh * 0.6, fx + fw, fy); ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#1a0a08";
        ctx.save(); ctx.translate(fx, fy); ctx.rotate(0.25); ctx.fillRect(-14, -2, 28, 4); ctx.rotate(-0.5); ctx.fillRect(-14, -2, 28, 4); ctx.restore();
      }
      if (this.embers.length < (this.lite ? 30 : 70)) this.embers.push({ ox: rnd(-6, 6), oy: -10, vx: rnd(-12, 12), vy: rnd(-70, -35), life: rnd(1.2, 2.6), max: 2.6, ph: rnd(0, TAU) });
      ctx.globalCompositeOperation = "lighter";
      this.embers = this.embers.filter(e => {
        e.life -= dt; e.ox += (e.vx + Math.sin(t * 3 + e.ph) * 10) * dt; e.oy += e.vy * dt;
        if (e.life <= 0) return false;
        ctx.globalAlpha = Math.min(1, e.life / 1.2);
        ctx.fillStyle = e.life > 1.5 ? "#ffd27a" : "#ff7a2b";
        ctx.fillRect(fx + e.ox, fy + e.oy, 1.8, 1.8);
        return true;
      });
      ctx.globalAlpha = 1;
    },
  });

  /* ---------------------------------------------------------
     15. TIME TRAVEL TRANSITION + NOIR + NEO TOKYO
     --------------------------------------------------------- */
  const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

  EFFECTS.timewarp = {
    dur: 2400,
    midAt: 0.5,                       // the theme switches under the flash
    init(fx) {
      fx.dir = fx.opts.dir || 1;
      fx.tint = fx.dir < 0 ? "255, 214, 150" : "120, 230, 255";     // amber into the past, cyan into the future
      for (let i = 0; i < 220; i++) fx.parts.push({ ang: rnd(0, TAU), z: Math.random(), sp: rnd(0.7, 1.4) });
    },
    mid(fx) { fx.opts.onMid?.(); },
    draw(fx, ctx, t, dt) {
      const { cx, cy, maxR, dir, tint } = fx;
      const env = seg(t, 0, 0.18) * (1 - seg(t, 0.78, 1));
      // Darkness tinted toward the era you're heading for
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      g.addColorStop(0, dir < 0 ? `rgba(30, 20, 8, ${0.9 * env})` : `rgba(2, 8, 26, ${0.9 * env})`);
      g.addColorStop(1, dir < 0 ? `rgba(12, 8, 4, ${0.7 * env})` : `rgba(1, 3, 12, ${0.7 * env})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      // Light streaks rushing past
      for (const p of fx.parts) {
        const z0 = p.z;
        p.z += dt * 1.1 * p.sp * (0.4 + env * 1.6);
        if (p.z > 1) { p.z -= 1; continue; }
        const r0 = Math.pow(z0, 2.2) * maxR * 1.2, r1 = Math.pow(p.z, 2.2) * maxR * 1.2;
        ctx.strokeStyle = `rgba(${tint}, ${env * p.z * 0.8})`;
        ctx.lineWidth = 0.6 + p.z * 2.4;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(p.ang) * r0, cy + Math.sin(p.ang) * r0); ctx.lineTo(cx + Math.cos(p.ang) * r1, cy + Math.sin(p.ang) * r1); ctx.stroke();
      }
      // Clock rings: you fall through them, then the new era's rings close in
      const zoom = t < 0.5 ? 0.55 + 2.6 * ease.inCubic(t / 0.5) : 3.15 - 2.6 * ease.outCubic((t - 0.5) / 0.5);
      const spin = dir * (t * t * 26);
      ctx.font = `600 ${Math.round(Math.min(vw, vh) * 0.03)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < 4; i++) {
        const R = Math.min(vw, vh) * (0.14 + i * 0.12) * zoom;
        const a = env * (0.85 - i * 0.15);
        const rot = spin * (i % 2 ? -0.6 : 1) * (1 + i * 0.3);
        ctx.strokeStyle = `rgba(${tint}, ${a * 0.8})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
        for (let k = 0; k < 60; k++) {
          const ang = rot + (k / 60) * TAU, big = k % 5 === 0;
          const r0 = R * (big ? 0.9 : 0.95);
          ctx.lineWidth = big ? 2.5 : 1;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); ctx.stroke();
        }
        if (i === 1) {
          ctx.fillStyle = `rgba(${tint}, ${a})`;
          for (let k = 0; k < 12; k++) {
            const ang = rot + (k / 12) * TAU - Math.PI / 2;
            ctx.fillText(ROMAN[k], cx + Math.cos(ang) * R * 0.78, cy + Math.sin(ang) * R * 0.78);
          }
        }
      }
      // Clock hands spinning out of control
      const handA = dir * Math.pow(t, 2) * 70, R0 = Math.min(vw, vh) * 0.14 * zoom;
      ctx.strokeStyle = `rgba(${tint}, ${env})`;
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(handA / 12) * R0 * 0.55, cy + Math.sin(handA / 12) * R0 * 0.55); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(handA) * R0 * 0.85, cy + Math.sin(handA) * R0 * 0.85); ctx.stroke();
      glow(ctx, cx, cy, 70 * env, `rgba(${tint}, ALPHA)`, 0.9);

      // Year counter rolling to the destination
      if (fx.opts.years) {
        const [y0, y1] = fx.opts.years;
        const k = ease.inCubic(seg(t, 0.1, 0.5));
        const yr = Math.round(y0 + (y1 - y0) * k);
        const a = seg(t, 0.06, 0.18) * (1 - seg(t, 0.8, 0.98));
        ctx.globalCompositeOperation = "source-over";
        ctx.font = `800 ${Math.round(Math.min(vw, vh) * 0.11)}px ${getComputedStyle(document.body).fontFamily}`;
        ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
        ctx.shadowColor = `rgba(${tint}, ${a})`; ctx.shadowBlur = 30;
        ctx.fillText(String(yr), cx, cy + Math.min(vw, vh) * 0.32);
        ctx.shadowBlur = 0;
      }
      // Flash that hides the switch
      const f = seg(t, 0.4, 0.5) * (1 - seg(t, 0.5, 0.66));
      if (f > 0) { ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = `rgba(${tint}, ${f * 0.95})`; ctx.fillRect(0, 0, vw, vh); }
      const sh = t > 0.42 && t < 0.6 ? 7 * (1 - Math.abs(t - 0.5) / 0.1) : 0;
      canvas.style.transform = sh > 0 ? `translate(${rnd(-sh, sh).toFixed(1)}px, ${rnd(-sh, sh).toFixed(1)}px)` : "";
    },
    card(fx, c, t, bx, by) {
      const { r, th } = polar(fx, bx, by);
      if (t < 0.5) {                                        // flung outward at warp speed
        const q = ease.inCubic(seg(t, c.seed * 0.08, 0.48));
        const p = fromPolar(fx, r * (1 + q * 2.4) + q * 120, th + fx.dir * q * 0.5);
        return { ...p, s: 1 + q * 0.7, a: 1 - seg(q, 0.55, 1), stretch: 1 + q * 3.5, phi: th, rot: fx.dir * q * 0.5 };
      }
      const k = ease.outCubic(seg(t, 0.52 + c.seed * 0.1, 0.96));   // the new era arrives
      const p = fromPolar(fx, r * k, th - fx.dir * (1 - k) * 0.8);
      return { ...p, s: 0.3 + 0.7 * k, a: seg(k, 0, 0.25), stretch: 1 + (1 - k) * 2.5, phi: th, rot: -fx.dir * (1 - k) * 0.8 };
    },
  };

  /* ===== NOIR: a black-and-white rainy city, venetian blinds, a street lamp, film grain ===== */
  const Noir = makeScene("noir", {
    front: true,
    build() {
      const { w, h } = this;
      const [bg, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#0d0d0d"); gr.addColorStop(0.6, "#1c1c1c"); gr.addColorStop(1, "#060606");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      this.bg = bg;
      this.TW = Math.ceil(w * 1.6);
      this.city = skyline(this.TW, h, h * 0.82, { hMin: h * 0.12, hMax: h * 0.42, color: "#121212", wins: ["rgba(235,235,225,.55)", "rgba(200,200,190,.35)"], density: 0.07 });
      // Street lamp and a figure in a hat beneath it (screen-fixed)
      this.lampX = w * 0.84; this.lampTop = h * 0.36;
      const [lamp, l] = mkCanvas(w, h);
      const lx = this.lampX, ly = this.lampTop;
      l.fillStyle = "#050505";
      l.fillRect(lx - 4, ly, 8, h - ly);
      l.fillRect(lx - 4, ly, 46, 6);
      l.beginPath(); l.moveTo(lx + 30, ly + 6); l.lineTo(lx + 52, ly + 6); l.lineTo(lx + 47, ly + 22); l.lineTo(lx + 35, ly + 22); l.fill();
      const mx = lx - 40, my = h - 4, s = Math.min(h * 0.11, 90);   // the man in the trench coat
      l.beginPath(); l.moveTo(mx - s * 0.28, my); l.lineTo(mx - s * 0.2, my - s * 0.9); l.lineTo(mx + s * 0.22, my - s * 0.9); l.lineTo(mx + s * 0.3, my); l.fill();
      l.beginPath(); l.ellipse(mx, my - s * 1.0, s * 0.12, s * 0.13, 0, 0, TAU); l.fill();
      l.beginPath(); l.ellipse(mx, my - s * 1.08, s * 0.24, s * 0.04, 0, 0, TAU); l.fill();
      l.fillRect(mx - s * 0.13, my - s * 1.24, s * 0.26, s * 0.15);
      this.lamp = lamp;
      // The pool of light under the lamp
      const [cone, c] = mkCanvas(w, h);
      const cg = c.createLinearGradient(0, ly + 20, 0, h);
      cg.addColorStop(0, "rgba(255, 255, 245, .32)"); cg.addColorStop(1, "rgba(255, 255, 245, .04)");
      c.fillStyle = cg;
      c.beginPath(); c.moveTo(lx + 36, ly + 20); c.lineTo(lx + 46, ly + 20); c.lineTo(lx + 41 + h * 0.32, h); c.lineTo(lx + 41 - h * 0.32, h); c.fill();
      const pg = c.createRadialGradient(lx + 41, h, 0, lx + 41, h, h * 0.35);
      pg.addColorStop(0, "rgba(255, 255, 245, .25)"); pg.addColorStop(1, "rgba(255, 255, 245, 0)");
      c.fillStyle = pg; c.fillRect(0, 0, w, h);
      glow(c, lx + 41, ly + 16, 60, "rgba(255, 255, 240, ALPHA)", 0.9);
      this.cone = cone;
      // Venetian-blind light: soft bright bars, drawn rotated and swept slowly
      const D = Math.ceil(Math.hypot(w, h) * 1.3);
      const [bl, b] = mkCanvas(D, D);
      for (let y = 0; y < D; y += 46) {
        const bar = b.createLinearGradient(0, y, 0, y + 26);
        bar.addColorStop(0, "rgba(255,255,255,0)"); bar.addColorStop(0.5, "rgba(255,255,255,.55)"); bar.addColorStop(1, "rgba(255,255,255,0)");
        b.fillStyle = bar; b.fillRect(0, y, D, 26);
      }
      const fade = b.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
      fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, "rgba(0,0,0,1)");
      b.globalCompositeOperation = "destination-out"; b.fillStyle = fade; b.fillRect(0, 0, D, D);
      this.blinds = bl;
      // Film grain tiles
      this.grain = [0, 1, 2].map(() => {
        const [n, ng] = mkCanvas(160, 160);
        const img = ng.createImageData(160, 160);
        for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 40; }
        ng.putImageData(img, 0, 0);
        return n;
      });
      this.rain = Array.from({ length: clamp(Math.round((w * h) / 6000), 110, 240) }, () => ({ x: Math.random(), y: Math.random(), d0: Math.random() }));
      this.smoke = Array.from({ length: 5 }, (_, i) => ({ ph: i * 1.3, off: rnd(-6, 6) }));
      this.flash = 0; this.nextFlash = rnd(6, 12);
    },
    lite() { this.rain = this.rain.filter((_, i) => i % 2 === 0); },
    tap() { this.flash = 1; Sound.sfx("thunder"); },
    draw(t, dt) {
      const { ctx, fctx, w, h } = this;
      ctx.drawImage(this.bg, 0, 0, w, h);
      drawWrapped(ctx, this.city, 0.05, w);
      // Blinds of light sweep slowly, like headlights passing outside
      const D = this.blinds.width;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 0.4);
      ctx.translate(w * 0.45, h * 0.45); ctx.rotate(-0.42);
      ctx.drawImage(this.blinds, -D / 2, -D / 2 + mod(t * 14, 46));
      ctx.restore();
      // Lamp (flickers now and then) and its rain-filled light
      const flick = Math.random() < 0.015 ? 0.4 : 1;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = flick;
      ctx.drawImage(this.cone, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.lamp, 0, 0, w, h);
      // Cigarette smoke curling up from the figure
      const sx = this.lampX - 40 + 10, sy = h - Math.min(h * 0.11, 90) * 1.0;
      ctx.lineCap = "round";
      for (const p of this.smoke) {
        ctx.strokeStyle = "rgba(220, 220, 220, .07)"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        for (let k = 1; k < 16; k++) ctx.lineTo(sx + Math.sin(t * 0.9 + p.ph + k * 0.45) * k * 1.8 + p.off, sy - k * 9);
        ctx.stroke();
      }
      // Rain: brighter where it crosses the lamp light
      const coneX = this.lampX + 41;
      for (const r of this.rain) {
        const d = mod(r.d0 + cam.z * 0.5, 1), par = 0.05 + d * 0.4, sp = 650 + d * 700;
        const x = mod(r.x * w * 1.2 - t * sp * 0.12 - cam.x * par, w * 1.2) - w * 0.1;
        const y = mod(r.y * h * 1.2 + t * sp, h * 1.2) - h * 0.1;
        const inLight = y > this.lampTop && Math.abs(x - coneX) < (y - this.lampTop) * 0.55;
        const len = 10 + d * 24, g = d > 0.85 ? fctx : ctx;
        g.strokeStyle = `rgba(230, 230, 230, ${(inLight ? 0.55 : 0.12) + d * 0.2})`;
        g.lineWidth = 0.6 + d;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.12, y - len); g.stroke();
      }
      // Lightning, every so often
      if (t > this.nextFlash) { this.flash = 1; this.nextFlash = t + rnd(8, 16); }
      if (this.flash > 0) {
        fctx.fillStyle = `rgba(255, 255, 255, ${this.flash * (0.5 + 0.5 * Math.random()) * 0.5})`;
        fctx.fillRect(0, 0, w, h);
        this.flash = Math.max(0, this.flash - dt * 3);
      }
      // Projector flicker, grain and scratches over everything
      fctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.06})`; fctx.fillRect(0, 0, w, h);
      if (!this.lite) {
        fctx.globalAlpha = 0.55;
        fctx.fillStyle = fctx.createPattern(this.grain[Math.floor(t * 24) % 3], "repeat");
        fctx.save(); fctx.translate(rnd(0, 160), rnd(0, 160)); fctx.fillRect(-160, -160, w + 160, h + 160); fctx.restore();
        fctx.globalAlpha = 1;
      }
      if (Math.random() < 0.3) {
        fctx.strokeStyle = `rgba(255, 255, 255, ${rnd(0.08, 0.25)})`; fctx.lineWidth = 1;
        const x = rnd(0, w);
        fctx.beginPath(); fctx.moveTo(x, 0); fctx.lineTo(x + rnd(-6, 6), h); fctx.stroke();
      }
    },
  });

  /* ===== NEO TOKYO: neon kanji towers, holographic koi, a bullet train, a glowing torii ===== */
  const KANJI = ["東京", "未来", "夢", "光", "電気", "ネオン", "愛", "星空", "都", "桜", "侍", "龍", "ラーメン", "カフェ", "時間"];
  function neoTowers(TW, h, base, { color, hMin, hMax, signs, track }) {
    const list = [];
    let x = 0;
    const neon = ["#ff2bd6", "#00f0ff", "#ffe600", "#7cff4f", "#ff7a2b"];
    while (x < TW) {
      const bw = rnd(40, 110), bh = rnd(hMin, hMax), bx = x;
      x += bw + rnd(6, 26);
      const wins = [];
      for (let wy = base - bh + 10; wy < base - 8; wy += 7) for (let wx = bx + 4; wx < bx + bw - 4; wx += 6) if (Math.random() < 0.12) wins.push([wx, wy]);
      const sign = signs && Math.random() < 0.55 ? { text: KANJI[Math.floor(Math.random() * KANJI.length)], color: neon[Math.floor(Math.random() * neon.length)], side: Math.random() < 0.5 } : null;
      const strip = Math.random() < 0.4 ? neon[Math.floor(Math.random() * neon.length)] : null;
      list.push({ bx, bw, bh, wins, sign, strip, crown: Math.random() < 0.3 });
    }
    const trackY = track ? base - h * 0.16 : 0;
    return tileLayer(TW, h, [g => {
      for (const b of list) {
        g.fillStyle = color;
        g.fillRect(b.bx, base - b.bh, b.bw, b.bh + 4);
        if (b.crown) { g.beginPath(); g.moveTo(b.bx, base - b.bh); g.lineTo(b.bx + b.bw / 2, base - b.bh - b.bw * 0.4); g.lineTo(b.bx + b.bw, base - b.bh); g.fill(); }
        g.fillStyle = "rgba(160, 220, 255, .25)";
        for (const [wx, wy] of b.wins) g.fillRect(wx, wy, 3, 2);
        if (b.strip) { g.shadowColor = b.strip; g.shadowBlur = 10; g.fillStyle = b.strip; g.fillRect(b.bx, base - b.bh, b.bw, 2); g.shadowBlur = 0; }
        if (b.sign) {                                    // vertical neon sign
          const chars = [...b.sign.text], cs = 18, sx = b.side ? b.bx - 4 : b.bx + b.bw - 22, sy = base - b.bh + 18;
          g.fillStyle = "rgba(0, 0, 0, .7)"; g.fillRect(sx, sy, 26, chars.length * cs + 10);
          g.strokeStyle = b.sign.color; g.lineWidth = 1.5; g.shadowColor = b.sign.color; g.shadowBlur = 12;
          g.strokeRect(sx, sy, 26, chars.length * cs + 10);
          g.fillStyle = b.sign.color; g.font = `700 ${cs - 2}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`; g.textAlign = "center"; g.textBaseline = "top";
          chars.forEach((ch, i) => g.fillText(ch, sx + 13, sy + 6 + i * cs));
          g.shadowBlur = 0;
        }
      }
      if (track) {                                        // elevated maglev track
        g.fillStyle = color;
        g.fillRect(0, trackY, TW, 8);
        for (let px = 20; px < TW; px += 140) g.fillRect(px, trackY + 8, 10, base - trackY);
        g.shadowColor = "#00f0ff"; g.shadowBlur = 8; g.fillStyle = "#00f0ff"; g.fillRect(0, trackY, TW, 1.5); g.shadowBlur = 0;
      }
    }]);
  }

  const NeoTokyo = makeScene("neotokyo", {
    build() {
      const { w, h } = this;
      const [sky, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#050314"); gr.addColorStop(0.5, "#14062e"); gr.addColorStop(0.8, "#3a0d4a"); gr.addColorStop(1, "#120418");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.15, 0.6)})`; g.fillRect(rnd(0, w), rnd(0, h * 0.45), 1, 1); }
      // Holographic sun ring and a mountain outlined in light
      const sr = Math.min(w, h) * 0.2, sx = w * 0.32, sy = h * 0.4;
      g.strokeStyle = "rgba(255, 43, 160, .55)"; g.lineWidth = 3; g.shadowColor = "#ff2b9e"; g.shadowBlur = 24;
      g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.stroke();
      g.lineWidth = 1; g.beginPath(); g.arc(sx, sy, sr * 0.82, 0, TAU); g.stroke();
      g.shadowBlur = 0;
      const fx0 = w * 0.32, fy = h * 0.66, fw = w * 0.3, fh = h * 0.26;
      g.fillStyle = "#12062a";
      g.beginPath(); g.moveTo(fx0 - fw, fy); g.lineTo(fx0 - fw * 0.1, fy - fh); g.lineTo(fx0 + fw * 0.1, fy - fh); g.lineTo(fx0 + fw, fy); g.fill();
      g.strokeStyle = "rgba(0, 240, 255, .6)"; g.lineWidth = 1.5; g.shadowColor = "#00f0ff"; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(fx0 - fw, fy); g.lineTo(fx0 - fw * 0.1, fy - fh); g.lineTo(fx0 + fw * 0.1, fy - fh); g.lineTo(fx0 + fw, fy); g.stroke();
      g.shadowBlur = 0;
      this.sky = sky;
      this.TW = Math.ceil(w * 1.6);
      this.base = h * 0.98;
      this.far = neoTowers(this.TW, h, h * 0.9, { color: "#0e0822", hMin: h * 0.25, hMax: h * 0.6, signs: false });
      this.near = neoTowers(this.TW, h, this.base, { color: "#06030f", hMin: h * 0.15, hMax: h * 0.48, signs: true, track: true });
      this.trackY = this.base - h * 0.16;
      // A glowing torii gate in the foreground
      const [tor, tg] = mkCanvas(w, h);
      const tw = Math.min(w, h) * 0.3, tx = w * 0.12, ty = h;
      tg.strokeStyle = "#ff3355"; tg.lineWidth = 3; tg.shadowColor = "#ff3355"; tg.shadowBlur = 18; tg.lineCap = "round";
      tg.fillStyle = "rgba(60, 0, 15, .85)";
      const post = (x) => { tg.fillRect(x - 6, ty - tw * 1.1, 12, tw * 1.1); tg.strokeRect(x - 6, ty - tw * 1.1, 12, tw * 1.1); };
      post(tx - tw * 0.35); post(tx + tw * 0.35);
      tg.beginPath(); tg.moveTo(tx - tw * 0.62, ty - tw * 1.12); tg.quadraticCurveTo(tx, ty - tw * 1.2, tx + tw * 0.62, ty - tw * 1.12);
      tg.lineTo(tx + tw * 0.6, ty - tw * 1.04); tg.quadraticCurveTo(tx, ty - tw * 1.11, tx - tw * 0.6, ty - tw * 1.04); tg.closePath(); tg.fill(); tg.stroke();
      tg.fillRect(tx - tw * 0.48, ty - tw * 0.92, tw * 0.96, 9); tg.strokeRect(tx - tw * 0.48, ty - tw * 0.92, tw * 0.96, 9);
      this.torii = tor;
      this.koi = [0, 1, 2].map(i => ({ hue: [190, 320, 40][i], cx: rnd(0.2, 0.8), cy: rnd(0.18, 0.45), rx: rnd(0.15, 0.3), ry: rnd(0.06, 0.12), sp: rnd(0.12, 0.2) * (i % 2 ? -1 : 1), ph: rnd(0, TAU), size: rnd(14, 22) }));
      this.drones = Array.from({ length: 14 }, () => ({ x: Math.random(), y: rnd(0.05, 0.55), ph: rnd(0, TAU), hue: Math.random() < 0.5 ? 190 : 320 }));
      this.petals = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), d: Math.random(), ph: rnd(0, TAU) }));
      this.train = { next: rnd(2, 5), start: -1 };
    },
    lite() { this.petals = this.petals.slice(0, 20); },
    tap(x, y, t) { this.lure = { x, y, t }; Sound.sfx("sparkle"); },
    draw(t) {
      const { ctx, w, h } = this;
      ctx.drawImage(this.sky, 0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      // Drones with blinking lights
      for (const d of this.drones) {
        const x = mod(d.x * w + t * 12 + Math.sin(t * 0.5 + d.ph) * 20 - cam.x * 0.04, w), y = d.y * h + Math.sin(t * 0.8 + d.ph) * 8;
        ctx.globalAlpha = Math.sin(t * 4 + d.ph) > 0.6 ? 1 : 0.3;
        ctx.drawImage(Jungle.sprite(d.hue, 65), x - 6, y - 6, 12, 12);
      }
      ctx.globalAlpha = 1;
      // Holographic koi swimming through the sky
      for (const k of this.koi) {
        const lw = this.lure ? smooth(0, 0.8, t - this.lure.t) * (1 - smooth(3, 6, t - this.lure.t)) : 0;
        const pos = s => {
          const a = (t - s) * k.sp * TAU * 0.25 + k.ph;
          const bx = k.cx * w + Math.cos(a) * k.rx * w - cam.x * 0.03, by = k.cy * h + Math.sin(a * 2) * k.ry * h;
          return lw ? [bx + (this.lure.x - bx) * 0.75 * lw, by + (this.lure.y - by) * 0.75 * lw] : [bx, by];
        };
        const flick = 0.75 + 0.25 * Math.sin(t * 23 + k.ph);
        const [hx, hy] = pos(0);
        ctx.globalAlpha = 0.5 * flick;
        ctx.drawImage(Jungle.sprite(k.hue, 60), hx - k.size * 3, hy - k.size * 3, k.size * 6, k.size * 6);
        for (let i = 11; i >= 0; i--) {
          const [x, y] = pos(i * 0.09);
          const r = k.size * (i < 3 ? 0.5 + i * 0.12 : 0.86 - (i - 3) * 0.08);
          ctx.globalAlpha = (0.55 - i * 0.03) * flick;
          ctx.fillStyle = `hsl(${k.hue + (i % 3 === 1 ? 30 : 0)}, 100%, ${i % 4 === 2 ? 85 : 62}%)`;
          ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.55), 0, TAU); ctx.fill();
          if (i === 11) {                                  // flowing tail
            const [x2, y2] = pos(i * 0.09 + 0.12), ang = Math.atan2(y2 - y, x2 - x) + Math.sin(t * 6) * 0.4;
            ctx.beginPath(); ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(ang - 0.5) * k.size * 1.3, y + Math.sin(ang - 0.5) * k.size * 1.3);
            ctx.lineTo(x + Math.cos(ang + 0.5) * k.size * 1.3, y + Math.sin(ang + 0.5) * k.size * 1.3);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      drawWrapped(ctx, this.far, 0.03, w);
      drawWrapped(ctx, this.near, 0.08, w);
      // The bullet train glides past every few seconds
      const tr = this.train;
      if (tr.start < 0 && t > tr.next) tr.start = t;
      if (tr.start >= 0) {
        const k = (t - tr.start) / 2.4, len = w * 0.7;
        const x = -len + k * (w + len * 2), y = this.trackY - 18;
        ctx.globalCompositeOperation = "lighter";
        const lg = ctx.createLinearGradient(x - 220, 0, x, 0);
        lg.addColorStop(0, "rgba(0, 240, 255, 0)"); lg.addColorStop(1, "rgba(0, 240, 255, .5)");
        ctx.fillStyle = lg; ctx.fillRect(x - 220, y + 6, 220, 6);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#e9f6ff";
        ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x + len - 60, y + 18); ctx.quadraticCurveTo(x + len + 10, y + 18, x + len, y + 6);
        ctx.quadraticCurveTo(x + len - 40, y - 2, x + len - 90, y); ctx.lineTo(x, y); ctx.fill();
        ctx.fillStyle = "#0a1a3a"; ctx.fillRect(x + 10, y + 4, len - 120, 5);
        ctx.fillStyle = "#ff2bd6"; ctx.fillRect(x, y + 13, len - 70, 2);
        if (k > 1) { tr.start = -1; tr.next = t + rnd(6, 11); }
      }
      // Glowing torii and drifting neon petals
      ctx.drawImage(this.torii, 0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of this.petals) {
        const x = mod(p.x * w + t * (20 + p.d * 30) + Math.sin(t + p.ph) * 20 - cam.x * (0.05 + p.d * 0.2), w), y = mod(p.y * h + t * (12 + p.d * 25), h);
        ctx.globalAlpha = 0.5 + p.d * 0.5;
        ctx.drawImage(Jungle.sprite(330, 72), x - 5 - p.d * 4, y - 5 - p.d * 4, 10 + p.d * 8, 10 + p.d * 8);
      }
      ctx.globalAlpha = 1;
    },
  });

  // Animated themes ("scenes") share the background canvas
  const SCENES = { universe: Space, amazon: Jungle, ocean: Ocean, aurora: Aurora, sakura: Sakura, neon: Neon, sahara: Sahara, noir: Noir, neotokyo: NeoTokyo };

  /* ---------------------------------------------------------
     16. TIME CAPSULES
     Sealed posts show a glowing capsule and a countdown. The
     contents arrive only when it opens, then it bursts open.
     --------------------------------------------------------- */
  function sealView(p) {
    if (p.opensAt && p.opensAt > Date.now()) {
      return { id: p.id, type: p.type, author: p.author, createdAt: p.createdAt, opensAt: p.opensAt, sealed: true, likes: p.likes || 0, width: p.width, height: p.height };
    }
    return p;
  }
  function countdown(ts, long) {
    let s = Math.max(0, Math.floor((ts - Date.now()) / 1000));
    if (!s) return "opening…";
    const y = Math.floor(s / 31557600); s -= y * 31557600;
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60), sec = s - m * 60;
    if (y) return `${y}y ${d}d${long ? ` ${h}h` : ""}`;
    if (d) return `${d}d ${h}h${long ? ` ${m}m ${pad2(sec)}s` : ""}`;
    if (h) return `${h}h ${m}m${long ? ` ${pad2(sec)}s` : ""}`;
    return `${m}m ${pad2(sec)}s`;
  }
  const TYPE_NAMES = { photo: "a photo", video: "a video", voice: "a voice note", quote: "a quote", thought: "a thought" };
  function capsuleHTML(p, long = false) {
    return `<div class="capsule">
      <div class="capsule__orb"><svg class="capsule__lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="11" width="12" height="9" rx="2" fill="currentColor" stroke="none"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></svg></div>
      <p class="capsule__label">Time capsule</p>
      <p class="capsule__count">Opens in <span data-opens="${p.opensAt}"${long ? " data-long" : ""}>${countdown(p.opensAt, long)}</span></p>
      <p class="capsule__by">${esc(TYPE_NAMES[p.type] || "a post")} from ${esc(p.author || "Anonymous")}</p>
    </div>`;
  }

  async function openCapsule(p) {
    let fresh;
    try { fresh = (await store.list()).find(x => x.id === p.id); } catch (_) { return; }
    if (!fresh || fresh.sealed) return;                // server clock may lag a moment; try again soon
    const i = state.posts.indexOf(p);
    if (i >= 0) state.posts[i] = fresh;
    const wasViewing = viewing && viewing.id === p.id;
    buildWall(false);
    if (wasViewing) openViewer(fresh.id);
    else if (!anyModalOpen() && !reduceMotion) {
      glideTo(c => c.post.id === fresh.id, { instant: true });
      startFx("fireworks", "capsule");
    }
    Sound.sfx("capsule");
    toast(`A time capsule from ${fresh.author || "someone"} just opened!`);
  }

  // Every second: tick the countdowns, and open any capsule whose time has come
  setInterval(() => {
    document.querySelectorAll("[data-opens]").forEach(el => { el.textContent = countdown(+el.dataset.opens, el.hasAttribute("data-long")); });
    const now = Date.now();
    for (const p of state.posts) {
      if (p.sealed && p.opensAt <= now && !(p._retry > now)) { p._retry = now + 6000; openCapsule(p); }
    }
  }, 1000);

  // Composer: "Seal as a time capsule"
  const capsuleToggle = $("#capsuleToggle"), capsuleDate = $("#capsuleDate");
  const toLocalInput = ts => { const d = new Date(ts); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  function labelPostBtn() { postBtn.textContent = capsuleToggle.checked ? "Seal time capsule" : "Post to the wall"; }
  capsuleToggle.addEventListener("change", () => {
    $("#capsuleWhen").hidden = !capsuleToggle.checked;
    capsuleDate.min = toLocalInput(Date.now() + 60 * 1000);
    if (capsuleToggle.checked && !capsuleDate.value) {
      const d = new Date(Date.now() + 7 * 864e5); d.setHours(9, 0, 0, 0);
      capsuleDate.value = toLocalInput(d);
    }
    labelPostBtn();
  });
  $("#capsuleQuick").addEventListener("click", e => {
    const b = e.target.closest("[data-in]");
    if (!b) return;
    let d;
    if (b.dataset.in === "newyear") d = new Date(new Date().getFullYear() + 1, 0, 1, 0, 0);
    else if (b.dataset.in === "minute") d = new Date(Date.now() + 70 * 1000);
    else { d = new Date(Date.now() + Number(b.dataset.in) * 864e5); d.setHours(9, 0, 0, 0); }
    capsuleDate.value = toLocalInput(d);
  });

  /* ---------------------------------------------------------
     17. TIMELINE SLIDER
     Drag back through the wall's history: newer posts fade away
     and the whole scene ages into sepia.
     --------------------------------------------------------- */
  const tlRange = $("#tlRange"), tlLabel = $("#tlLabel"), tlGhost = $("#tlGhost"), tlTicks = $("#tlTicks");
  const timeline = { min: Date.now() - 864e5 };
  const rootEl = document.documentElement;
  const tlDate = ts => new Date(ts).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

  function timelineSetup() {
    if (!state.posts.length) return;
    timeline.min = Math.min(...state.posts.map(p => p.createdAt), Date.now() - 3600e3);
    const span = Date.now() - timeline.min;
    tlTicks.innerHTML = state.posts.map(p =>
      `<i style="left:${(((p.createdAt - timeline.min) / span) * 100).toFixed(2)}%"${p.sealed ? ' class="is-capsule"' : ""}></i>`).join("");
    $("#tlStart").textContent = new Date(timeline.min).toLocaleDateString("en", { day: "numeric", month: "short" });
  }
  function setAge(a) {
    rootEl.style.setProperty("--age", a.toFixed(3));
    rootEl.classList.toggle("aging", a > 0.005);
  }
  function resetTimeline() {
    tlRange.value = 1000;
    tlRange.style.setProperty("--pct", "100%");
    tlRange.setAttribute("aria-valuetext", "Now");
    state.until = null;
    tlLabel.textContent = "Now";
    tlGhost.classList.remove("show");
    setAge(0);
  }
  let lastTick = 0;
  tlRange.addEventListener("input", () => {
    const v = +tlRange.value / 1000;
    tlRange.style.setProperty("--pct", (v * 100).toFixed(1) + "%");
    if (v > 0.995) {
      state.until = null; tlLabel.textContent = "Now"; tlGhost.classList.remove("show"); setAge(0);
    } else {
      state.until = timeline.min + (Date.now() - timeline.min) * v;
      tlLabel.textContent = tlGhost.textContent = tlDate(state.until);
      tlGhost.classList.add("show");
      setAge(Math.min(1, (1 - v) * 1.15));
    }
    tlRange.setAttribute("aria-valuetext", tlLabel.textContent);
    if (performance.now() - lastTick > 70) { lastTick = performance.now(); Sound.sfx("tick"); }
    applyFilter();
  });
  tlRange.addEventListener("change", () => {
    tlGhost.classList.remove("show");
    if (state.until) glideTo(c => !c.el.classList.contains("is-dim"));
  });

  /* ---------------------------------------------------------
     18. AMBIENT SOUND
     Every theme has its own soundscape, made live with the Web
     Audio API (no audio files), plus sounds for the effects.
     Off until the visitor turns it on.
     --------------------------------------------------------- */
  const Sound = (() => {
    let ctx = null, master = null, white = null, brown = null, current = null, currentName = null;
    let on = ls.get("glimpse:sound", false);
    const btn = $("#soundBtn");
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    const pick = a => a[Math.floor(Math.random() * a.length)];

    function ensure() {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      const buf = kind => {
        const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
        }
        return b;
      };
      white = buf("white"); brown = buf("brown");
      return true;
    }
    const now = () => ctx.currentTime;
    const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const filter = (type, freq, Q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f; };
    const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
    function noiseSrc(kind) { const s = ctx.createBufferSource(); s.buffer = kind === "brown" ? brown : white; s.loop = true; s.start(now(), Math.random() * 3); return s; }
    function lfo(freq, depth, target) { const o = ctx.createOscillator(); o.frequency.value = freq; const g = gain(depth); o.connect(g); g.connect(target); o.start(); return o; }

    // One note with an envelope
    function note(dest, freq, { type = "sine", vol = 0.2, attack = 0.005, decay = 1.2, at = 0, glideTo = null, filterFreq = null } = {}) {
      const t = now() + at, o = ctx.createOscillator(), g = gain(0);
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay * 0.9);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      if (filterFreq) chain(o, filter("lowpass", filterFreq), g); else o.connect(g);
      g.connect(dest); o.start(t); o.stop(t + attack + decay + 0.05);
      o.onended = () => g.disconnect();
    }
    // A burst of noise (raindrops, crackles, whooshes, booms)
    function burst(dest, { vol = 0.3, decay = 0.2, type = "lowpass", freq = 1000, Q = 0.7, at = 0, sweepTo = null, attack = 0.002, kind = "white" } = {}) {
      const t = now() + at, s = ctx.createBufferSource();
      s.buffer = kind === "brown" ? brown : white;
      const f = filter(type, freq, Q), g = gain(0);
      if (sweepTo) { f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay); }
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      chain(s, f, g, dest); s.start(t, Math.random() * 2); s.stop(t + attack + decay + 0.05);
      s.onended = () => g.disconnect();
    }
    function bell(dest, f, at = 0, vol = 0.08) {
      note(dest, f, { vol, decay: 2.6, at });
      note(dest, f * 2.76, { vol: vol * 0.5, decay: 1.6, at });
      note(dest, f * 5.4, { vol: vol * 0.25, decay: 0.9, at });
    }

    // A soundscape: a bus that fades in, timers for random events, and a stop() that fades out
    function scape(build) {
      const bus = gain(0), timers = new Set(), nodes = [];
      bus.connect(master);
      bus.gain.setValueAtTime(0, now()); bus.gain.linearRampToValueAtTime(1, now() + 2.5);
      const api = {
        bus, alive: true,
        keep(n) { nodes.push(n); return n; },
        every(min, max, fn) {
          const wait = () => {
            const id = setTimeout(() => { timers.delete(id); if (!api.alive) return; fn(); wait(); }, rnd(min, max) * 1000);
            timers.add(id);
          };
          wait();
        },
      };
      build(api);
      return {
        stop() {
          api.alive = false;
          timers.forEach(clearTimeout);
          const t = now();
          bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + 1.5);
          setTimeout(() => { nodes.forEach(n => { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} }); bus.disconnect(); }, 1700);
        },
      };
    }
    // Building blocks
    function bed(a, { kind = "white", type = "lowpass", freq = 800, Q = 0.7, vol = 0.1, swell = 0, swellRate = 0.1, sweep = 0, sweepRate = 0.05 } = {}) {
      const s = a.keep(noiseSrc(kind)), f = a.keep(filter(type, freq, Q)), g = a.keep(gain(vol));
      chain(s, f, g, a.bus);
      if (swell) a.keep(lfo(swellRate, vol * swell, g.gain));
      if (sweep) a.keep(lfo(sweepRate, sweep, f.frequency));
    }
    function pad(a, chords, { type = "sine", vol = 0.04, cutoff = 1200, every = [9, 14] } = {}) {
      const f = a.keep(filter("lowpass", cutoff)), g = a.keep(gain(vol));
      chain(f, g, a.bus);
      a.keep(lfo(0.06, cutoff * 0.3, f.frequency));
      const voices = chords[0].map(m => [-7, 7].map(dt => {
        const o = a.keep(ctx.createOscillator()); o.type = type; o.frequency.value = hz(m); o.detune.value = dt; o.connect(f); o.start(); return o;
      }));
      let ci = 0;
      if (chords.length > 1) a.every(every[0], every[1], () => {
        ci = (ci + 1) % chords.length;
        chords[ci].forEach((m, i) => voices[i].forEach(o => o.frequency.setTargetAtTime(hz(m), now(), 1.2)));
      });
    }
    function drone(a, freqs, { type = "sawtooth", vol = 0.03, cutoff = 300 } = {}) {
      const f = a.keep(filter("lowpass", cutoff)), g = a.keep(gain(vol));
      chain(f, g, a.bus);
      a.keep(lfo(0.05, cutoff * 0.4, f.frequency));
      freqs.forEach(fr => { const o = a.keep(ctx.createOscillator()); o.type = type; o.frequency.value = fr; o.connect(f); o.start(); });
    }
    const chirp = d => { const f = rnd(4200, 5200); for (let k = 0; k < 3; k++) note(d, f, { vol: 0.012, attack: 0.004, decay: 0.035, at: k * 0.06 }); };
    const croak = d => { const f0 = rnd(110, 210), n = 2 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) note(d, f0, { type: "sawtooth", vol: 0.05, attack: 0.01, decay: 0.12, at: k * 0.17, filterFreq: 650, glideTo: f0 * 0.85 }); };
    const bubble = d => note(d, rnd(350, 600), { vol: 0.035, attack: 0.003, decay: 0.09, glideTo: rnd(1100, 1800) });
    const whale = d => note(d, rnd(190, 240), { vol: 0.035, attack: 0.9, decay: 3.2, glideTo: rnd(110, 140) });
    const crackle = (d, vol = 0.05) => burst(d, { type: "highpass", freq: 2500, decay: 0.012, vol: rnd(vol * 0.3, vol) });
    function sax(dest) {                              // a lonely, muted horn
      const blues = [58, 60, 63, 65, 66, 67, 70, 72];
      const o = ctx.createOscillator(), g = gain(0), vib = ctx.createOscillator(), vg = gain(5);
      o.type = "sawtooth"; vib.frequency.value = 5.2; vib.connect(vg); vg.connect(o.frequency);
      chain(o, filter("lowpass", 1500), filter("bandpass", 900, 1.1), g, dest);
      let t = now() + 0.05, m = pick(blues);
      const n = 3 + Math.floor(Math.random() * 3);
      o.frequency.setValueAtTime(hz(m), t);
      for (let i = 0; i < n; i++) {
        const d = rnd(0.35, 0.9);
        o.frequency.setTargetAtTime(hz(m), t, 0.05);
        g.gain.setTargetAtTime(0.16, t, 0.07); g.gain.setTargetAtTime(0.09, t + d * 0.6, 0.12);
        t += d;
        m = pick(blues.filter(x => Math.abs(x - m) <= 5 && x !== m));
      }
      g.gain.setTargetAtTime(0, t, 0.3);
      o.start(); vib.start(); o.stop(t + 1.6); vib.stop(t + 1.6);
      o.onended = () => g.disconnect();
    }
    const chords = list => list;

    const SCAPES = {
      light: a => { pad(a, chords([[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]), { vol: 0.03, cutoff: 1500 }); a.every(4, 9, () => note(a.bus, hz(pick([72, 74, 76, 79, 81])), { vol: 0.025, decay: 2.6 })); },
      dark: a => { pad(a, chords([[45, 52, 57], [41, 48, 57], [43, 50, 55]]), { type: "triangle", vol: 0.035, cutoff: 700 }); bed(a, { kind: "brown", freq: 220, vol: 0.05 }); },
      gallery: a => {
        bed(a, { kind: "brown", freq: 320, vol: 0.05 });
        pad(a, chords([[60, 67, 76], [57, 64, 72], [62, 69, 74]]), { vol: 0.018, cutoff: 1800, every: [12, 18] });
        a.every(8, 16, () => { for (let k = 0; k < 4; k++) burst(a.bus, { kind: "brown", freq: 180, decay: 0.08, vol: 0.12, at: k * 0.55 }); });   // distant footsteps
      },
      universe: a => {
        drone(a, [55, 55.3, 82.5], { cutoff: 260, vol: 0.035 });
        pad(a, chords([[69, 76, 81], [67, 74, 79], [65, 72, 81]]), { vol: 0.02, cutoff: 2500 });
        a.every(1, 3.5, () => note(a.bus, rnd(1400, 3200), { vol: 0.012, decay: 1.6 }));
      },
      amazon: a => { bed(a, { kind: "brown", freq: 400, vol: 0.06 }); a.every(0.15, 0.6, () => chirp(a.bus)); a.every(1.2, 4, () => croak(a.bus)); },
      ocean: a => { bed(a, { kind: "brown", freq: 260, vol: 0.16, swell: 0.6, swellRate: 0.08 }); a.every(0.3, 1.6, () => bubble(a.bus)); a.every(14, 26, () => whale(a.bus)); },
      aurora: a => {
        bed(a, { type: "bandpass", freq: 600, Q: 1.4, vol: 0.06, sweep: 300, sweepRate: 0.07, swell: 0.5, swellRate: 0.05 });
        pad(a, chords([[64, 71, 76], [62, 69, 74], [60, 67, 76]]), { vol: 0.025, cutoff: 2600 });
        a.every(2, 5, () => note(a.bus, hz(pick([83, 86, 88, 91])), { vol: 0.012, decay: 2 }));
      },
      sakura: a => {
        bed(a, { type: "bandpass", freq: 500, Q: 0.8, vol: 0.03, sweep: 200, swell: 0.6, swellRate: 0.06 });
        const hira = [62, 63, 67, 69, 70, 74, 75, 79];        // a Japanese scale, for koto-like plucks
        a.every(0.8, 3, () => { note(a.bus, hz(pick(hira)), { type: "triangle", vol: 0.07, decay: 1.6, filterFreq: 2600 }); if (Math.random() < 0.3) note(a.bus, hz(pick(hira)), { type: "triangle", vol: 0.05, decay: 1.4, filterFreq: 2600, at: 0.18 }); });
        a.every(9, 16, () => [0, 0.12, 0.27].forEach(at => bell(a.bus, hz(pick([86, 88, 91, 93])), at, 0.025)));
      },
      neon: a => {
        bed(a, { type: "highpass", freq: 1200, vol: 0.05 });
        pad(a, chords([[45, 52, 57], [41, 48, 55], [43, 50, 57], [40, 47, 55]]), { type: "sawtooth", vol: 0.02, cutoff: 900, every: [7.7, 7.7] });
        const bass = [33, 33, 29, 31]; let i = 0;
        a.every(0.48, 0.48, () => note(a.bus, hz(bass[Math.floor(i++ / 16) % 4]), { type: "square", vol: 0.04, decay: 0.3, filterFreq: 320 }));
      },
      sahara: a => {
        bed(a, { type: "bandpass", freq: 420, Q: 0.8, vol: 0.06, sweep: 220, sweepRate: 0.05, swell: 0.6, swellRate: 0.07 });
        drone(a, [73.4, 110], { type: "sine", vol: 0.03, cutoff: 600 });
        a.every(0.04, 0.35, () => crackle(a.bus, 0.06));      // the campfire
        const scale = [62, 63, 66, 67, 69, 70, 72];
        a.every(4, 9, () => [0, 0.22, 0.44].forEach(at => note(a.bus, hz(pick(scale)), { type: "triangle", vol: 0.05, decay: 0.9, filterFreq: 1800, at })));
      },
      noir: a => {
        bed(a, { type: "bandpass", freq: 2500, Q: 0.5, vol: 0.08 });                       // rain
        bed(a, { kind: "brown", freq: 150, vol: 0.04 });
        a.every(0.03, 0.3, () => crackle(a.bus, 0.035));                                     // vinyl crackle
        a.every(7, 14, () => sax(a.bus));
      },
      neotokyo: a => {
        bed(a, { kind: "brown", freq: 160, vol: 0.07 });
        pad(a, chords([[57, 64, 69], [53, 60, 69], [55, 62, 67]]), { type: "sawtooth", vol: 0.018, cutoff: 1500 });
        const seq = [69, 72, 76, 79, 81, 79, 76, 72]; let i = 0;
        a.every(0.14, 0.14, () => note(a.bus, hz(seq[i++ % seq.length] + (Math.floor(i / 32) % 2 ? -2 : 0)), { type: "square", vol: 0.018, decay: 0.16, filterFreq: 2200 }));
        a.every(11, 20, () => burst(a.bus, { type: "bandpass", freq: 300, sweepTo: 2600, Q: 1.5, attack: 0.8, decay: 1.4, vol: 0.07 }));   // a train passing
      },
    };

    // Sound effects for the visual effects
    const boom = (at, vol) => { burst(master, { kind: "brown", freq: 380, decay: 1.3, vol, at }); burst(master, { type: "highpass", freq: 1600, decay: 0.15, vol: vol * 0.35, at }); };
    const SFX = {
      fireworks() {
        note(master, 700, { vol: 0.03, attack: 0.05, decay: 0.4, glideTo: 2200 });
        boom(0.44, 0.5);
        [0.94, 1.17, 1.43, 1.64].forEach(at => boom(at, 0.2));
        for (let k = 0; k < 30; k++) burst(master, { type: "highpass", freq: 3000, decay: 0.02, vol: rnd(0.03, 0.09), at: rnd(0.6, 2.4) });
      },
      wormhole() {
        burst(master, { type: "bandpass", freq: 200, sweepTo: 4000, Q: 3, attack: 0.5, decay: 0.8, vol: 0.25 });
        burst(master, { type: "bandpass", freq: 4000, sweepTo: 220, Q: 3, attack: 0.3, decay: 1, vol: 0.2, at: 1.25 });
        note(master, 110, { vol: 0.06, attack: 0.6, decay: 1.8, glideTo: 880 });
      },
      blackhole() {
        note(master, 90, { type: "sawtooth", vol: 0.09, attack: 0.9, decay: 0.7, glideTo: 28, filterFreq: 300 });
        burst(master, { type: "bandpass", freq: 3000, sweepTo: 120, Q: 2, attack: 1.3, decay: 0.3, vol: 0.3 });
        boom(1.65, 0.8);
        note(master, 1200, { vol: 0.03, decay: 2.2, at: 1.7 });
      },
      timewarp(opts = {}) {
        const fwd = (opts.dir || 1) > 0;
        let t = 0, gap = 0.22;
        while (t < 1.15) { burst(master, { type: "highpass", freq: 3200, decay: 0.015, vol: 0.09, at: t }); t += gap; gap = Math.max(0.03, gap * 0.82); }
        burst(master, { type: "bandpass", freq: fwd ? 300 : 5000, sweepTo: fwd ? 5000 : 300, Q: 2, attack: 0.9, decay: 0.5, vol: 0.25 });
        bell(master, hz(fwd ? 84 : 60), 1.2, 0.1);
      },
      capsule() { [72, 76, 79, 84, 88].forEach((m, i) => note(master, hz(m), { type: "triangle", vol: 0.08, decay: 1.4, at: i * 0.09 })); },
      seal() { note(master, hz(55), { type: "triangle", vol: 0.12, decay: 0.5 }); burst(master, { type: "highpass", freq: 2000, decay: 0.06, vol: 0.15, at: 0.02 }); bell(master, hz(79), 0.15, 0.04); },
      tick() { burst(master, { type: "highpass", freq: 3800, decay: 0.012, vol: 0.06 }); },
      arrive() { [79, 84].forEach((m, i) => note(master, hz(m), { type: "triangle", vol: 0.05, decay: 0.9, at: i * 0.08 })); },
      croak() { croak(master); },
      bubbles() { for (let k = 0; k < 7; k++) setTimeout(() => bubble(master), k * 70); },
      sparkle() { [88, 91, 95].forEach((m, i) => note(master, hz(m), { vol: 0.03, decay: 0.8, at: i * 0.06 })); },
      petals() { burst(master, { type: "bandpass", freq: 900, sweepTo: 2400, Q: 1, attack: 0.15, decay: 0.6, vol: 0.06 }); [86, 90].forEach((m, i) => note(master, hz(m), { type: "triangle", vol: 0.03, decay: 1.1, at: 0.1 + i * 0.12 })); },
      nova() { note(master, 220, { vol: 0.05, attack: 0.02, decay: 1.6, glideTo: 880 }); bell(master, hz(91), 0.05, 0.03); },
      thunder() { burst(master, { kind: "brown", freq: 300, decay: 2.4, vol: 0.5, attack: 0.05 }); burst(master, { type: "highpass", freq: 2000, decay: 0.25, vol: 0.15 }); },
    };

    function play(theme) {
      if (!on || !ctx) return;
      if (theme === currentName && current) return;
      current?.stop();
      currentName = theme;
      current = scape(SCAPES[theme] || SCAPES.light);
    }
    function sfx(name, opts) {
      if (!on || !ctx || ctx.state !== "running") return;
      SFX[name]?.(opts);
    }
    function updateBtn() {
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
      btn.classList.toggle("is-on", on);
    }
    function wake() {
      if (!ensure()) return false;
      ctx.resume();
      master.gain.setTargetAtTime(0.7, now(), 0.4);
      play(currentTheme());
      return true;
    }
    function setOn(v) {
      on = v;
      ls.set("glimpse:sound", v);
      updateBtn();
      if (v) { if (!wake()) { toast("Sound isn't supported in this browser."); on = false; updateBtn(); } }
      else if (ctx) {
        master.gain.setTargetAtTime(0, now(), 0.25);
        setTimeout(() => { if (!on) { current?.stop(); current = null; currentName = null; ctx.suspend(); } }, 1500);
      }
    }
    btn.addEventListener("click", () => setOn(!on));
    // Browsers only allow sound after a tap or key press, so resume on the first one
    const first = () => { if (on && (!ctx || ctx.state !== "running")) wake(); };
    window.addEventListener("pointerdown", first, { once: true });
    window.addEventListener("keydown", first, { once: true });
    updateBtn();
    return { play, sfx };
  })();


  /* ---------------------------------------------------------
     19. COMMUNITY: rules, reporting, blocking
     --------------------------------------------------------- */
  // A random ID for this browser/app. It never leaves as-is: the server turns it into an
  // anonymous poster ID, so people can be blocked or banned without knowing who they are.
  const deviceId = (() => { let id = ls.get("glimpse:device", null); if (!id) { id = uid(); ls.set("glimpse:device", id); } return id; })();
  const blockKey = p => p.authorId || `name:${p.author || ""}`;
  function screen(list) { return list.filter(p => !state.hiddenIds.has(p.id) && !state.blocked.has(blockKey(p))); }
  const rulesAccepted = () => ls.get("glimpse:rulesAccepted", false);

  let afterRules = null, rulesReturn = null;
  function openRules(then) {
    afterRules = then || null;
    rulesReturn = document.activeElement;
    const accepted = rulesAccepted();
    $("#rulesAccept").textContent = accepted && !then ? "Got it" : "I agree";
    const info = $("#blockedInfo");
    const nb = state.blocked.size, nh = state.hiddenIds.size;
    info.hidden = !nb && !nh;
    if (nb || nh) {
      info.innerHTML = `On this device you've blocked ${nb} ${nb === 1 ? "person" : "people"} and reported ${nh} ${nh === 1 ? "post" : "posts"}. <button type="button" class="link-btn" id="unblockAll">Show them again</button>`;
    }
    $("#rules").hidden = false;
    $("#rulesAccept").focus();
  }
  function closeRules() { $("#rules").hidden = true; afterRules = null; rulesReturn?.focus?.(); }
  $("#rulesAccept").addEventListener("click", () => {
    ls.set("glimpse:rulesAccepted", true);
    const then = afterRules;
    closeRules();
    then?.();
  });
  $("#rules").addEventListener("click", async e => {
    if (e.target.closest("[data-close]")) closeRules();
    if (e.target.id === "unblockAll") {
      state.blocked.clear(); state.hiddenIds.clear();
      ls.set("glimpse:blocked", []); ls.set("glimpse:hiddenPosts", []);
      try { state.posts = screen(await store.list()); } catch (_) {}
      buildWall(false);
      closeRules();
      toast("Everyone's posts are showing again");
    }
  });

  // Report
  const reportForm = $("#reportForm");
  let reporting = null;
  function closeReport() { $("#report").hidden = true; reporting = null; }
  $("#vReport").addEventListener("click", () => {
    reporting = viewing;
    $("#reportTitle").textContent = "Report this post";
    reportForm.reset();
    $("#reportSend").disabled = true;
    $("#reportUrgent").hidden = true;
    $("#report").hidden = false;
    reportForm.querySelector("input[name=reason]").focus();
  });
  reportForm.addEventListener("change", () => {
    const r = reportForm.querySelector("input[name=reason]:checked");
    $("#reportSend").disabled = !r;
    $("#reportUrgent").hidden = r?.value !== "self-harm";
  });
  reportForm.addEventListener("submit", async e => {
    e.preventDefault();
    const p = reporting, r = reportForm.querySelector("input[name=reason]:checked");
    if (!p || !r) return;
    $("#reportSend").disabled = true;
    if (p.kind === "reply") {                            // reporting a reply, not the post
      try { await store.reportReply(p.post.id, p.rid, r.value, $("#reportNote").value.trim()); }
      catch (err) { toast(err.message); $("#reportSend").disabled = false; return; }
      state.hiddenReplies.add(p.rid);
      ls.set("glimpse:hiddenReplies", [...state.hiddenReplies]);
      p.post._replies = (p.post._replies || []).filter(x => x.id !== p.rid);
      if (viewing === p.post) renderReplies(p.post);
      closeReport();
      toast("Thanks for reporting. That reply is now hidden for you.");
      return;
    }
    try {
      await store.report(p.id, r.value, $("#reportNote").value.trim());
    } catch (err) { toast(err.message); $("#reportSend").disabled = false; return; }
    state.hiddenIds.add(p.id);
    ls.set("glimpse:hiddenPosts", [...state.hiddenIds]);
    state.posts = screen(state.posts);
    closeReport();
    closeViewer();
    buildWall(false);
    toast("Thanks for reporting. That post is now hidden for you.");
  });
  $("#report").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeReport(); });

  // Block: hide everything from this person, on this device
  $("#vBlock").addEventListener("click", () => {
    const p = viewing, name = p.author && p.author !== "Anonymous" ? p.author : "this person";
    if (!confirm(`Hide all posts from ${name}? You won't see their posts on this device. You can undo this from Community rules.`)) return;
    state.blocked.add(blockKey(p));
    ls.set("glimpse:blocked", [...state.blocked]);
    state.posts = screen(state.posts);
    closeViewer();
    buildWall(false);
    toast(`Posts from ${name} are hidden`);
  });
  /* ---------------------------------------------------------
     20. CREATIVE POSTING: photo filters, video trimming,
         voice notes, link-preview images
     --------------------------------------------------------- */

  // ----- Photo filters (pixel recipes; each theme has a matching look) -----
  const PHOTO_FILTERS = [
    { id: "none", label: "Original", themes: [] },
    { id: "noir", label: "Noir", themes: ["noir", "dark"] },
    { id: "vintage", label: "Vintage", themes: ["gallery", "light"] },
    { id: "neon", label: "Neon", themes: ["neon", "neotokyo"] },
    { id: "aurora", label: "Aurora", themes: ["aurora", "universe"] },
    { id: "ocean", label: "Ocean", themes: ["ocean"] },
    { id: "sakura", label: "Sakura", themes: ["sakura"] },
    { id: "golden", label: "Golden", themes: ["sahara"] },
    { id: "jungle", label: "Jungle", themes: ["amazon"] },
  ];
  const c255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  function filterFn(id) {
    const vignette = (x, y, w, h, k) => { const dx = x / w - 0.5, dy = y / h - 0.5; return 1 - k * (dx * dx + dy * dy) * 2; };
    const sat = (r, g, b, s) => { const L = 0.299 * r + 0.587 * g + 0.114 * b; return [L + (r - L) * s, L + (g - L) * s, L + (b - L) * s]; };
    const per = fn => (d, w, h) => {
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
        const [r, g, b] = fn(d[i], d[i + 1], d[i + 2], x, y, w, h);
        d[i] = c255(r); d[i + 1] = c255(g); d[i + 2] = c255(b);
      }
    };
    switch (id) {
      case "noir": return per((r, g, b, x, y, w, h) => {
        let L = 0.299 * r + 0.587 * g + 0.114 * b;
        L = ((L - 128) * 1.4 + 128 + (Math.random() - 0.5) * 18) * vignette(x, y, w, h, 0.45);
        return [L, L, L];
      });
      case "vintage": return per((r, g, b, x, y, w, h) => {
        const v = vignette(x, y, w, h, 0.3);
        return [(20 + (0.393 * r + 0.769 * g + 0.189 * b) * 0.85) * v, (18 + (0.349 * r + 0.686 * g + 0.168 * b) * 0.85) * v, (14 + (0.272 * r + 0.534 * g + 0.131 * b) * 0.85) * v];
      });
      case "neon": return per((r, g, b) => {
        const t = Math.min(1, Math.max(0, ((0.299 * r + 0.587 * g + 0.114 * b) / 255 - 0.5) * 1.2 + 0.5));
        const A = [26, 6, 56], M = [255, 43, 214], Z = [127, 246, 255];
        const mix = (p, q, k) => p.map((v, i) => v + (q[i] - v) * k);
        return t < 0.5 ? mix(A, M, t * 2) : mix(M, Z, (t - 0.5) * 2);
      });
      case "aurora": return per((r, g, b) => sat(r * 0.85, g * 1.04 + 8, b * 1.12 + 18, 1.15));
      case "ocean": return per((r, g, b) => sat(r * 0.78, g * 0.98 + 8, b * 1.15 + 24, 1.05));
      case "sakura": return per((r, g, b) => [r * 0.94 + 26, g * 0.88 + 12, b * 0.92 + 26]);
      case "golden": return per((r, g, b) => { const [R, G, B] = sat(r, g, b, 1.1); return [(R * 1.12 + 14 - 128) * 1.06 + 128, G * 1.0 + 4, B * 0.8]; });
      case "jungle": return per((r, g, b) => sat(r * 0.88, g * 1.1 + 6, b * 0.86, 1.18));
      default: return null;
    }
  }
  function setupFilters() {
    const box = $("#filters"), src = prepared?.source;
    if (!src) return;
    const theme = document.documentElement.dataset.theme;
    box.innerHTML = PHOTO_FILTERS.map(f => {
      const match = f.themes.includes(theme);
      return `<button type="button" class="filter" role="radio" aria-checked="${f.id === photoFilter}" data-filter="${f.id}"${match ? ' title="Matches your theme"' : ""}>
        <canvas width="72" height="72"></canvas><span>${f.label}${match ? " ✨" : ""}</span></button>`;
    }).join("");
    // little previews of each look
    const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight, side = Math.min(sw, sh);
    box.querySelectorAll(".filter").forEach(btn => {
      const cv = btn.querySelector("canvas"), g = cv.getContext("2d");
      g.drawImage(src, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, 72, 72);
      const fn = filterFn(btn.dataset.filter);
      if (fn) { const img = g.getImageData(0, 0, 72, 72); fn(img.data, 72, 72); g.putImageData(img, 0, 0); }
    });
    box.hidden = false;
  }
  $("#filters").addEventListener("click", async e => {
    const b = e.target.closest(".filter");
    if (!b || !prepared?.source) return;
    photoFilter = b.dataset.filter;
    $$("#filters .filter").forEach(x => x.setAttribute("aria-checked", String(x === b)));
    const t = await toJpeg(prepared.source, THUMB_MAX_PX, 0.85, filterFn(photoFilter));
    const img = $("#dropPreview img");
    if (img) { const old = img.src; img.src = URL.createObjectURL(t.blob); if (old !== prepared.previewUrl) URL.revokeObjectURL(old); }
  });

  // ----- Video trimmer: choose which 30 seconds to post -----
  function setupTrim() {
    const d = prepared.duration, start = $("#trimStart"), len = $("#trimLen");
    len.max = String(Math.min(MAX_VIDEO_SECONDS, Math.floor(d)));
    len.value = len.max;
    start.max = String(Math.max(0, d - Number(len.value)).toFixed(1));
    start.value = "0";
    $("#trimTitle").textContent = `This video is ${fmtDur(d)} long. Choose up to ${MAX_VIDEO_SECONDS} seconds to post:`;
    $("#trim").hidden = false;
    const vid = $("#dropPreview video");
    if (vid) vid.addEventListener("timeupdate", () => { const [a, b] = prepared?.clip || [0, 0]; if (vid.currentTime >= b || vid.currentTime < a - 0.3) vid.currentTime = a; });
    updateTrim(true);
  }
  function updateTrim(seek) {
    if (!prepared?.clip) return;
    const d = prepared.duration, start = $("#trimStart"), len = $("#trimLen");
    const L = Number(len.value);
    start.max = String(Math.max(0, d - L).toFixed(1));
    const a = Math.min(Number(start.value), d - L);
    prepared.clip = [Math.max(0, a), Math.max(0, a) + L];
    $("#trimRange").textContent = `${fmtDur(prepared.clip[0])} – ${fmtDur(prepared.clip[1])} (${Math.round(L)} seconds)`;
    const meta = $("#dropPreview .meta"); if (meta) meta.textContent = fmtDur(L);
    const vid = $("#dropPreview video");
    if (vid && seek) vid.currentTime = prepared.clip[0];
  }
  $("#trimStart").addEventListener("input", () => updateTrim(true));
  $("#trimLen").addEventListener("input", () => updateTrim(false));

  // ----- Voice notes: record (or upload) up to 30 seconds -----
  let rec = null;
  const recBtn = $("#recBtn"), recStatus = $("#recStatus"), recWave = $("#recWave");
  function recorderUI(mode) {
    $("#recorder").dataset.mode = mode;
    recBtn.setAttribute("aria-label", mode === "recording" ? "Stop recording" : "Start recording");
    $("#recorder").hidden = mode === "done";
    $("#recDone").hidden = mode !== "done";
    $("#recAgain").hidden = mode !== "done";
    $("#recOr").textContent = mode === "done" ? "· or" : "or";
    if (mode === "idle") recStatus.textContent = "Tap the red button to record up to 30 seconds.";
    if (mode === "busy") recStatus.textContent = "Preparing your voice note…";
    if (mode === "done" && voicePrepared) {
      $("#recDone").innerHTML = voicePlayerHTML({ ...voicePrepared, url: voicePrepared.previewUrl, author: authorName.value || "you", id: "preview" });
      bindVoicePlayer($("#recDone .vplayer"), voicePrepared, false);
    }
  }
  function clearVoice() {
    if (voicePrepared?.previewUrl) URL.revokeObjectURL(voicePrepared.previewUrl);
    voicePrepared = null;
    $("#recDone").innerHTML = "";
    $("#audioInput").value = "";
    recorderUI("idle");
    const g = recWave.getContext("2d"); g.clearRect(0, 0, recWave.width, recWave.height);
    updatePostBtn();
  }
  async function prepareVoice(blob, name = "voice-note") {
    if (blob.size > 12e6) throw new Error("That recording is too large (12 MB at most).");
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("This browser can't read audio files.");
    const ac = new AC();
    let audio;
    try { audio = await ac.decodeAudioData(await blob.arrayBuffer()); }
    catch (_) { throw new Error("Couldn't read that audio. Try an M4A, MP3 or WAV file."); }
    finally { ac.close?.(); }
    const d = audio.duration;
    if (d > MAX_VIDEO_SECONDS + 0.5) throw new Error(`That's ${Math.round(d)} seconds long. Voice notes can be up to ${MAX_VIDEO_SECONDS} seconds.`);
    if (d < 0.4) throw new Error("That recording is too short.");
    const ch = audio.getChannelData(0), N = 48, step = Math.max(1, Math.floor(ch.length / N));
    let peaks = [];
    for (let i = 0; i < N; i++) { let m = 0; for (let j = i * step, end = Math.min(ch.length, (i + 1) * step); j < end; j += 8) m = Math.max(m, Math.abs(ch[j])); peaks.push(m); }
    const max = Math.max(...peaks, 0.01);
    peaks = peaks.map(v => Math.round(Math.pow(v / max, 0.8) * 100) / 100);
    const t = blob.type || "audio/webm";
    const ext = /mp4|m4a|aac/.test(t) ? "m4a" : /ogg/.test(t) ? "ogg" : /mpeg|mp3/.test(t) ? "mp3" : /wav/.test(t) ? "wav" : "weba";
    return { kind: "voice", media: new File([blob], `${name}.${ext}`, { type: t }), mediaName: `${name}.${ext}`, duration: Math.round(d * 100) / 100, peaks, previewUrl: URL.createObjectURL(blob) };
  }
  async function startRecording() {
    errorEl.textContent = "";
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { errorEl.textContent = "Recording isn't available in this browser. Upload an audio file instead."; return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (_) { errorEl.textContent = "Glimpse needs permission to use your microphone. Allow it in your browser or phone settings, or upload an audio file."; return; }
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find(m => MediaRecorder.isTypeSupported?.(m)) || "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC(), an = ac.createAnalyser();
    an.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(an);
    rec = { mr, stream, ac, an, t0: performance.now(), levels: [], raf: 0, timer: 0 };
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      const r = rec; rec = null;
      stream.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(r.raf); clearTimeout(r.timer); ac.close?.();
      recorderUI("busy");
      try { voicePrepared = await prepareVoice(new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" })); recorderUI("done"); }
      catch (err) { errorEl.textContent = err.message; recorderUI("idle"); }
      updatePostBtn();
    };
    mr.start(250);
    rec.timer = setTimeout(stopRecording, MAX_VIDEO_SECONDS * 1000);
    recorderUI("recording");
    drawLevels();
  }
  function stopRecording() { if (rec && rec.mr.state !== "inactive") rec.mr.stop(); }
  function drawLevels() {
    if (!rec) return;
    const g = recWave.getContext("2d"), W = recWave.width, H = recWave.height;
    const buf = new Uint8Array(rec.an.fftSize);
    rec.an.getByteTimeDomainData(buf);
    let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2;
    rec.levels.push(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    const secs = (performance.now() - rec.t0) / 1000;
    recStatus.textContent = `Recording… ${fmtDur(secs)} / 0:${MAX_VIDEO_SECONDS}. Tap again to stop.`;
    g.clearRect(0, 0, W, H);
    const bars = Math.floor(W / 7), from = Math.max(0, rec.levels.length - bars);
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--danger").trim() || "#e5334b";
    rec.levels.slice(from).forEach((v, i) => { const bh = Math.max(3, v * H); g.fillRect(i * 7, (H - bh) / 2, 4, bh); });
    rec.raf = requestAnimationFrame(drawLevels);
  }
  recBtn.addEventListener("click", () => (rec ? stopRecording() : startRecording()));
  $("#recAgain").addEventListener("click", clearVoice);
  $("#audioInput").addEventListener("change", async () => {
    const f = $("#audioInput").files[0];
    if (!f) return;
    stopRecording();
    errorEl.textContent = "";
    recorderUI("busy");
    try { voicePrepared = await prepareVoice(f, (f.name || "voice").replace(/\.[^.]+$/, "")); recorderUI("done"); }
    catch (err) { errorEl.textContent = err.message; recorderUI("idle"); }
    updatePostBtn();
  });

  // ----- "Answer today's question" -----
  $("#promptText").textContent = PROMPTS[todayPrompt()];
  function answerToday() {
    const go = () => { openComposer(); setKind("thought"); $("#promptToggle").checked = true; thoughtText.focus(); };
    if (rulesAccepted()) go(); else openRules(go);
  }

  // ----- Link-preview image (1200×630), drawn at upload time -----
  async function makeOgImage(d) {
    const W = 1200, H = 630;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const ui = '"Bricolage Grotesque", system-ui, sans-serif', serif = 'Fraunces, Georgia, serif';
    const wrap = (text, maxW, font, maxLines) => {
      g.font = font;
      const words = String(text).split(/\s+/), lines = [];
      let line = "";
      for (const w of words) {
        const t = line ? line + " " + w : w;
        if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
        if (lines.length === maxLines) break;
      }
      if (lines.length < maxLines && line) lines.push(line);
      if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
      return lines;
    };
    const fitText = (text, maxW, maxH, family, weight, start, min) => {
      for (let size = start; size >= min; size -= 4) {
        const lines = wrap(text, maxW, `${weight} ${size}px ${family}`, 20);
        if (lines.length * size * 1.15 <= maxH) return { size, lines };
      }
      return { size: min, lines: wrap(text, maxW, `${weight} ${min}px ${family}`, Math.floor(maxH / (min * 1.15))) };
    };
    const wordmark = (color = "rgba(255,255,255,.9)") => { g.font = `800 34px ${ui}`; g.fillStyle = color; g.textAlign = "right"; g.fillText("glimpse", W - 44, H - 40); g.textAlign = "left"; };
    const cover = img => { const k = Math.max(W / img.width, H / img.height); g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k); };
    const by = d.author || "Anonymous";
    if (d.opensAt) {                                       // sealed: show the capsule, never the contents
      const gr = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.7); gr.addColorStop(0, "#3b2a7a"); gr.addColorStop(1, "#08061a");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const cx = 300, cy = H / 2, cw = 130, ch = 230;
      const cg = g.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0); cg.addColorStop(0, "#7d6ac9"); cg.addColorStop(0.35, "#f3eaff"); cg.addColorStop(1, "#4f3d9c");
      g.shadowColor = "rgba(190,160,255,.8)"; g.shadowBlur = 60; g.fillStyle = cg;
      g.beginPath(); g.roundRect(cx - cw / 2, cy - ch / 2, cw, ch, cw / 2); g.fill(); g.shadowBlur = 0;
      g.fillStyle = "#f4c45c"; g.fillRect(cx - cw / 2 - 8, cy - 14, cw + 16, 28);
      g.fillStyle = "#fff"; g.font = `700 26px ${ui}`; g.fillText("TIME CAPSULE", 500, 230);
      g.font = `800 56px ${ui}`; wrap(`from ${by}`, 640, g.font, 2).forEach((l, i) => g.fillText(l, 500, 300 + i * 64));
      g.fillStyle = "#ffe7ad"; g.font = `500 32px ${ui}`; g.fillText(`Opens ${new Date(d.opensAt).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })}`, 500, 430);
      wordmark();
    } else if (d.type === "photo" || d.type === "video") {
      const img = await createImageBitmap(d.type === "photo" ? d.media : d.thumb);
      cover(img); img.close?.();
      const sh = g.createLinearGradient(0, H * 0.45, 0, H); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.75)");
      g.fillStyle = sh; g.fillRect(0, 0, W, H);
      if (d.type === "video") { g.fillStyle = "rgba(0,0,0,.45)"; g.beginPath(); g.arc(W / 2, H / 2 - 30, 64, 0, Math.PI * 2); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(W / 2 - 18, H / 2 - 64); g.lineTo(W / 2 + 34, H / 2 - 30); g.lineTo(W / 2 - 18, H / 2 + 4); g.fill(); }
      g.fillStyle = "#fff";
      if (d.caption) { g.font = `700 48px ${ui}`; wrap(d.caption, W - 360, g.font, 2).forEach((l, i, a) => g.fillText(l, 48, H - 70 - (a.length - 1 - i) * 56)); }
      g.font = `500 28px ${ui}`; g.globalAlpha = 0.85; g.fillText(by, 48, H - 30); g.globalAlpha = 1;
      wordmark();
    } else if (d.type === "voice") {
      const hue = hashOf(by) % 360;
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, `hsl(${hue},55%,22%)`); gr.addColorStop(1, `hsl(${(hue + 50) % 360},60%,12%)`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const peaks = JSON.parse(d.peaks || "[]"), n = 48, bw = (W - 200) / n;
      g.fillStyle = `hsl(${hue},90%,72%)`;
      for (let i = 0; i < n; i++) { const v = Math.max(0.06, peaks[Math.floor((i / n) * peaks.length)] || 0.2), bh = v * 260; g.beginPath(); g.roundRect(100 + i * bw, 250 - bh / 2, bw * 0.55, bh, 4); g.fill(); }
      g.fillStyle = "#fff"; g.font = `700 30px ${ui}`; g.fillText(`🎙  Voice note · ${fmtDur(d.duration || 0)}`, 100, 90);
      if (d.caption) { g.font = `700 44px ${ui}`; wrap(d.caption, W - 360, g.font, 2).forEach((l, i) => g.fillText(l, 100, 470 + i * 52)); }
      g.font = `500 28px ${ui}`; g.globalAlpha = 0.85; g.fillText(by, 100, H - 40); g.globalAlpha = 1;
      wordmark();
    } else {                                               // quote or thought: the words themselves
      const quote = d.type === "quote";
      const QB = { ink: ["#141210", "#f4efe6", serif, "italic 500"], paper: ["#f3ede2", "#1d1b19", serif, "500"], sun: ["#ffcf3a", "#1d1b19", 'Anton, Impact, sans-serif', "400"], bloom: ["#ffb3c7", "#2a1235", ui, "800"] };
      const TB = { cream: "#fbf3d5", mint: "#d6f0e0", sky: "#d9e7fa", blush: "#fadde1" };
      const [bg, fg, fam, wt] = quote ? (QB[d.style] || QB.ink) : [TB[d.tint] || TB.cream, "#2a2622", ui, "600"];
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const text = d.style === "sun" ? d.text.toUpperCase() : d.text;
      const { size, lines } = fitText(quote ? `“${text}”` : text, W - 160, H - 230, fam, wt, 76, 30);
      g.fillStyle = fg; g.font = `${wt} ${size}px ${fam}`;
      lines.forEach((l, i) => g.fillText(l, 80, 110 + size + i * size * 1.15));
      g.font = `500 30px ${ui}`; g.globalAlpha = 0.75;
      g.fillText(quote ? `– ${d.quoteBy || by}` : by, 80, H - 50); g.globalAlpha = 1;
      wordmark(fg);
    }
    return new Promise(res => cv.toBlob(b => res(b), "image/jpeg", 0.86));
  }

  /* ---------------------------------------------------------
     21. LIVE, WALLS, REPLIES, DELIGHT
     --------------------------------------------------------- */
  state.replyTokens = ls.get("glimpse:replyTokens", {});
  state.hiddenReplies = new Set(ls.get("glimpse:hiddenReplies", []));
  state.prompt = null;                                   // "See answers" filter for the daily question
  state.wallName = "";

  // ----- Private walls -----
  const wallHosts = () => ls.get("glimpse:wallHosts", {});
  function wallHostToken() { return WALL ? wallHosts()[WALL] || null : null; }
  const myWalls = () => ls.get("glimpse:walls", []);
  function rememberWall(slug, name, host = false) {
    const list = myWalls().filter(w => w.slug !== slug);
    list.unshift({ slug, name, host: host || !!wallHosts()[slug] });
    ls.set("glimpse:walls", list.slice(0, 20));
  }
  const wallURL = slug => `${SHARE_ORIGIN}/w/${slug}`;
  function goWall(slug) {
    if (IN_APP || !location.protocol.startsWith("http")) { ls.set("glimpse:currentWall", slug || ""); location.reload(); }
    else location.href = slug ? `/w/${slug}` : "/";
  }
  const wallMenu = $("#wallMenu"), wallBtn = $("#wallBtn");
  function renderWallMenu() {
    const walls = myWalls(), server = store?.mode === "server";
    wallMenu.innerHTML = `
      <p class="menu__label">Walls</p>
      <button type="button" role="menuitemradio" aria-checked="${!WALL}" data-wall="">🌍 Everyone <small>the public wall</small></button>
      ${walls.map(w => `<button type="button" role="menuitemradio" aria-checked="${w.slug === WALL}" data-wall="${esc(w.slug)}">🔒 ${esc(w.name)}${w.host ? " <small>host</small>" : ""}</button>`).join("")}
      <hr>
      ${server ? `<button type="button" role="menuitem" data-wall-action="create">＋ Create a private wall</button>` : `<p class="menu__note">Private walls need the server.</p>`}
      ${WALL && server ? `<button type="button" role="menuitem" data-wall-action="share">⌁ Share this wall (QR code)</button>` : ""}
      ${server ? `<button type="button" role="menuitem" data-wall-action="join">↗ Join with a link…</button>` : ""}`;
  }
  wallBtn.addEventListener("click", e => {
    e.stopPropagation();
    const open = wallMenu.hidden;
    if (open) renderWallMenu();
    wallMenu.hidden = !open;
    wallBtn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", e => { if (!wallMenu.hidden && !wallMenu.contains(e.target)) { wallMenu.hidden = true; wallBtn.setAttribute("aria-expanded", "false"); } });
  wallMenu.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    wallMenu.hidden = true;
    if (b.dataset.wall !== undefined) { if (b.dataset.wall !== WALL) goWall(b.dataset.wall); return; }
    const act = b.dataset.wallAction;
    if (act === "create") { if (rulesAccepted()) openWallCreate(); else openRules(openWallCreate); }
    if (act === "share") openWallShare();
    if (act === "join") {
      const link = prompt("Paste the wall's link:");
      const slug = (String(link || "").match(/\/w\/([a-z0-9]{6,20})/) || [])[1];
      if (slug) goWall(slug); else if (link) toast("That doesn't look like a Glimpse wall link.");
    }
  });

  function openWallCreate() {
    const themes = Object.entries(THEMES).filter(([k]) => k !== "noir" && k !== "neotokyo");
    $("#wallThemes").innerHTML = themes.map(([k, n], i) => `<label class="theme-pick"><input type="radio" name="wallTheme" value="${k}" ${k === (currentTheme() || "light") || (!i && !THEMES[currentTheme()]) ? "checked" : ""}><span>${esc(n)}</span></label>`).join("");
    $("#wallNameInput").value = "";
    $("#wallError").textContent = "";
    $("#wallCreate").hidden = false;
    $("#wallNameInput").focus();
  }
  $("#wallCreateForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#wallNameInput").value.trim();
    const theme = $("#wallCreateForm input[name=wallTheme]:checked")?.value || "light";
    if (name.length < 2) { $("#wallError").textContent = "Give your wall a name."; return; }
    $("#wallCreateBtn").disabled = true;
    try {
      const { wall, hostToken } = await store.createWall(name, theme);
      ls.set("glimpse:wallHosts", { ...wallHosts(), [wall.slug]: hostToken });
      rememberWall(wall.slug, wall.name, true);
      ls.set("glimpse:shareOnArrival", wall.slug);
      goWall(wall.slug);
    } catch (err) { $("#wallError").textContent = err.message; }
    finally { $("#wallCreateBtn").disabled = false; }
  });
  $("#wallCreate").addEventListener("click", e => { if (e.target.closest("[data-close]")) $("#wallCreate").hidden = true; });

  // QR code for the wall's link, drawn on a canvas
  function drawQR(canvasEl, text) {
    const qr = window.qrcode(0, "M");
    qr.addData(text); qr.make();
    const n = qr.getModuleCount(), quiet = 4, cell = Math.floor(320 / (n + quiet * 2)), size = cell * (n + quiet * 2);
    canvasEl.width = canvasEl.height = size;
    const g = canvasEl.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, size, size);
    g.fillStyle = "#111";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  }
  function openWallShare() {
    if (!WALL) return;
    const url = wallURL(WALL);
    $("#wallShareTitle").textContent = state.wallName || "Your wall";
    $("#wallLink").value = url;
    try { drawQR($("#wallQR"), url); } catch (_) { $("#wallQR").hidden = true; }
    $("#wallShareHost").hidden = !wallHostToken();
    $("#wallShare").hidden = false;
  }
  $("#wallShare").addEventListener("click", async e => {
    if (e.target.closest("[data-close]")) { $("#wallShare").hidden = true; return; }
    const url = $("#wallLink").value;
    if (e.target.closest("#wallCopy")) { try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch (_) { $("#wallLink").select(); } }
    if (e.target.closest("#wallNativeShare")) { try { await navigator.share({ title: state.wallName, text: `Add your photos, videos and thoughts to ${state.wallName}`, url }); } catch (_) {} }
    if (e.target.closest("#wallDownload")) {
      const a = document.createElement("a");
      a.href = $("#wallQR").toDataURL("image/png");
      a.download = `${(state.wallName || "glimpse-wall").replace(/[^\w-]+/g, "-")}-qr.png`;
      a.click();
    }
  });

  // ----- Live updates (Server-Sent Events) -----
  const live = { es: null, connected: false, seed: null };
  function connectLive() {
    if (store.mode !== "server" || !window.EventSource) return;
    const es = (live.es = new EventSource(`${API}/api/stream${wallQS()}`));
    const on = (ev, fn) => es.addEventListener(ev, e => { try { fn(JSON.parse(e.data)); } catch (err) { console.warn(ev, err); } });
    on("hello", d => { live.seed = d.seed; live.connected = true; });
    on("post", d => onLivePost(absolute(d)));
    on("update", onLiveUpdate);
    on("remove", d => onLiveRemove(d.id));
    on("reply", onLiveReply);
    on("unreply", onLiveUnreply);
    on("presence", renderPresence);
    es.onerror = () => { live.connected = false; };
  }
  // A new post takes over a few spots on the wall and flies in (no reshuffle)
  function setCardPost(c, post, arrive) {
    c.post = post; c.ar = aspect(post);
    const el = c.el;
    el.className = `card card--${post.sealed ? "sealed" : post.type}`;
    el.dataset.id = post.id;
    el.setAttribute("aria-label", label(post));
    el.style.setProperty("--ar", c.ar.toFixed(3));
    el.innerHTML = `<div class="card__inner">${cardHTML(post)}${placardHTML(post)}</div>`;
    if (arrive && !reduceMotion) { el.classList.add("arrive"); el.addEventListener("animationend", () => el.classList.remove("arrive"), { once: true }); }
  }
  function injectPost(post) {
    const counts = new Map();
    cards.forEach(c => counts.set(c.post.id, (counts.get(c.post.id) || 0) + 1));
    const n = clamp(Math.round(cards.length / Math.max(1, state.posts.length)), 2, 14);
    cards.slice().sort((a, b) => counts.get(b.post.id) - counts.get(a.post.id) || Math.random() - 0.5).slice(0, n)
      .forEach(c => setCardPost(c, post, true));
    applyFilter();
    render(true);
  }
  let livePillTimer = 0;
  function onLivePost(post) {
    if (state.posts.some(p => p.id === post.id) || !screen([post]).length) return;
    state.posts.unshift(post);
    if (!cards.length) buildWall(false); else injectPost(post);
    timelineSetup();
    const pill = $("#newPill");
    pill.textContent = `✨ ${post.author || "Someone"} just added ${TYPE_NAMES[post.type] || "a post"}. See it`;
    pill.dataset.live = post.id;
    pill.hidden = false;
    clearTimeout(livePillTimer);
    livePillTimer = setTimeout(() => { if (pill.dataset.live === post.id) pill.hidden = true; }, 8000);
    Sound.sfx("arrive");
  }
  $("#newPill").addEventListener("click", e => {
    const id = e.currentTarget.dataset.live;
    if (!id) return;
    e.stopImmediatePropagation();
    e.currentTarget.hidden = true;
    delete e.currentTarget.dataset.live;
    glideTo(c => c.post.id === id);
  }, true);
  function onLiveUpdate({ id, likes, reactions }) {
    const p = postById(id);
    if (!p) return;
    if (likes !== undefined) p.likes = likes;
    if (reactions) p.reactions = reactions;
    refreshCards(id);
    if (viewing === p) { if (reactions) renderReacts(); else renderLike(); }
  }
  function onLiveRemove(id) {
    if (!postById(id)) return;
    state.posts = state.posts.filter(p => p.id !== id);
    if (viewing?.id === id) { closeViewer(); toast("That post was removed."); }
    if (!state.posts.length) { buildWall(false); return; }
    cards.filter(c => c.post.id === id).forEach(c => setCardPost(c, state.posts[Math.floor(Math.random() * state.posts.length)], false));
    applyFilter(); render(true); timelineSetup();
  }
  function onLiveReply({ postId, reply, replyCount }) {
    const p = postById(postId);
    if (!p) return;
    p.replyCount = replyCount;
    refreshCards(postId);
    if (viewing === p && p._replies && !p._replies.some(r => r.id === reply.id) && screenReplies([reply]).length) { p._replies.push(reply); renderReplies(p); }
  }
  function onLiveUnreply({ postId, replyId, replyCount }) {
    const p = postById(postId);
    if (!p) return;
    p.replyCount = replyCount;
    refreshCards(postId);
    if (viewing === p && p._replies) { p._replies = p._replies.filter(r => r.id !== replyId); renderReplies(p); }
  }

  // Everyone else on this wall, as soft drifting lights
  function renderPresence({ count, seeds }) {
    const others = (seeds || []).filter(s => s !== live.seed).slice(0, 30);
    const here = $("#hereCount");
    here.hidden = count < 2;
    here.textContent = `${count} here now`;
    const box = $("#visitors"), have = new Map([...box.children].map(el => [el.dataset.seed, el]));
    for (const seed of others) {
      if (have.has(seed)) { have.delete(seed); continue; }
      const h = parseInt(seed, 16) || 0, i = document.createElement("i");
      i.dataset.seed = seed;
      i.style.setProperty("--h", String(h % 360));
      i.style.setProperty("--x", `${8 + ((h >> 3) % 84)}%`);
      i.style.setProperty("--y", `${12 + ((h >> 9) % 70)}%`);
      i.style.setProperty("--dx", `${((h >> 5) % 160) - 80}px`);
      i.style.setProperty("--dy", `${((h >> 11) % 120) - 60}px`);
      i.style.setProperty("--t", `${14 + (h % 12)}s`);
      i.title = "Someone else is here";
      box.appendChild(i);
    }
    have.forEach(el => { el.classList.add("leaving"); setTimeout(() => el.remove(), 900); });
  }

  // ----- Replies on thoughts -----
  const screenReplies = list => list.filter(r => !state.hiddenReplies.has(r.id) && !state.blocked.has(r.authorId || `name:${r.author || ""}`));
  async function loadReplies(p) {
    const box = $("#vReplies"), list = $("#vReplyList");
    box.hidden = p.type !== "thought" || !!p.sealed;
    $("#replyText").value = ""; $("#replySend").disabled = true;
    if (box.hidden) return;
    list.innerHTML = `<li class="replies__empty">Loading replies…</li>`;
    try {
      const items = screenReplies(await store.replies(p.id));
      if (viewing !== p) return;
      p._replies = items;
      renderReplies(p);
    } catch (err) { list.innerHTML = `<li class="replies__empty">${esc(err.message)}</li>`; }
  }
  function renderReplies(p) {
    const list = $("#vReplyList"), items = p._replies || [], host = !!wallHostToken();
    list.innerHTML = items.length ? items.map(r => `<li class="reply" data-rid="${esc(r.id)}">
        <span class="avatar" style="--hue:${hashOf(r.author || "") % 360}">${esc(initialOf(r.author))}</span>
        <div class="reply__body">
          <p class="reply__meta"><strong>${esc(r.author || "Anonymous")}</strong> ${stampHTML(r)}</p>
          <p class="reply__text">${esc(r.text)}</p>
        </div>
        ${state.replyTokens[r.id] || host ? `<button type="button" class="text-btn" data-reply-delete>Delete</button>` : `<button type="button" class="text-btn text-btn--quiet" data-reply-report>Report</button>`}
      </li>`).join("") : `<li class="replies__empty">No replies yet. Say something kind.</li>`;
  }
  $("#replyText").addEventListener("input", () => { $("#replySend").disabled = !$("#replyText").value.trim(); });
  $("#replyForm").addEventListener("submit", async e => {
    e.preventDefault();
    const p = viewing, text = $("#replyText").value.trim();
    if (!p || !text) return;
    if (!rulesAccepted()) { openRules(() => $("#replyForm").requestSubmit()); return; }
    $("#replySend").disabled = true;
    try {
      const { reply, deleteToken } = await store.addReply(p.id, text, ls.get("glimpse:name", "") || "Anonymous");
      state.replyTokens[reply.id] = deleteToken;
      ls.set("glimpse:replyTokens", state.replyTokens);
      p._replies = p._replies || [];
      if (!p._replies.some(r => r.id === reply.id)) p._replies.push(reply);
      p.replyCount = Math.max(p.replyCount || 0, p._replies.length);
      renderReplies(p); refreshCards(p.id);
      $("#replyText").value = "";
      $("#vReplyList").lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (err) { toast(err.message); $("#replySend").disabled = false; }
  });
  $("#vReplyList").addEventListener("click", async e => {
    const li = e.target.closest(".reply"), p = viewing;
    if (!li || !p) return;
    const rid = li.dataset.rid;
    if (e.target.closest("[data-reply-delete]")) {
      if (!confirm("Delete this reply?")) return;
      try {
        await store.removeReply(p.id, rid, state.replyTokens[rid]);
        p._replies = p._replies.filter(r => r.id !== rid);
        p.replyCount = Math.max(0, (p.replyCount || 1) - 1);
        renderReplies(p); refreshCards(p.id);
      } catch (err) { toast(err.message); }
    }
    if (e.target.closest("[data-reply-report]")) {
      reporting = { kind: "reply", post: p, rid };
      reportForm.reset();
      $("#reportTitle").textContent = "Report this reply";
      $("#reportSend").disabled = true; $("#reportUrgent").hidden = true;
      $("#report").hidden = false;
    }
  });

  // ----- Share a post -----
  $("#vShare").addEventListener("click", async () => {
    const p = viewing;
    if (!p) return;
    const url = `${SHARE_ORIGIN}/p/${p.id}`, title = `${p.author || "Someone"} on Glimpse`;
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (err) { if (err.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast("Link copied. Paste it anywhere to share."); }
    catch (_) { prompt("Copy this link:", url); }
  });

  // ----- Tap the world: creatures react, and every theme answers with a little ripple -----
  function sceneTap(x, y) {
    if (reduceMotion) return;
    const r = document.createElement("span");
    r.className = "tap-ripple";
    r.style.left = x + "px"; r.style.top = y + "px";
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 900);
    SCENES[currentTheme()]?.tap?.(x, y);
  }

  // ----- On this day -----
  function onThisDay() {
    const key = `glimpse:otd:${WALL}:${new Date().toDateString()}`;
    if (ls.get(key, false) || !state.posts.length) return;
    const now = Date.now(), DAY = 864e5;
    const spans = [[365, DAY, "a year ago today"], [30, DAY, "a month ago today"], [7, DAY / 2, "a week ago today"]];
    for (const [days, slack, words] of spans) {
      const target = now - days * DAY;
      const hits = state.posts.filter(p => !p.sealed && Math.abs(p.createdAt - target) < slack);
      if (!hits.length) continue;
      const p = hits[Math.floor(Math.random() * hits.length)];
      const box = $("#otd");
      $("#otdText").innerHTML = `<strong>On this day</strong>, ${words}, ${esc(p.author || "someone")} shared ${TYPE_NAMES[p.type] || "a post"}.`;
      box.hidden = false;
      $("#otdGo").onclick = () => {
        box.hidden = true; ls.set(key, true);
        const open = () => { glideTo(c => c.post.id === p.id, { instant: true }); setTimeout(() => openViewer(p.id), reduceMotion ? 50 : 1300); };
        if (reduceMotion || !cards.length) { glideTo(c => c.post.id === p.id); setTimeout(() => openViewer(p.id), 900); }
        else startFx("timewarp", null, { dir: -1, onMid: open });
      };
      $("#otdClose").onclick = () => { box.hidden = true; ls.set(key, true); };
      return;
    }
  }

  // ----- Today's question (in the Discover panel) -----
  function setupQuestion() {
    $("#qText").textContent = PROMPTS[todayPrompt()];
    $("#qAnswer").addEventListener("click", answerToday);
    $("#qSee").addEventListener("click", () => {
      state.prompt = state.prompt === null ? todayPrompt() : null;
      $("#qSee").setAttribute("aria-pressed", String(state.prompt !== null));
      $("#qSee").textContent = state.prompt !== null ? "Show everything" : "See answers";
      setFilter({ type: state.prompt !== null ? "thought" : "all" }, { effect: state.prompt !== null });
    });
  }

  // ----- Calm mode: pause the motion everywhere -----
  function setCalm(on) {
    calm = on;
    ls.set("glimpse:calm", on);
    reduceMotion = prefersReduced || calm;
    document.documentElement.classList.toggle("calm", calm);
    $("#calmToggle").setAttribute("aria-checked", String(calm));
    if (calm && fx) endFx();
    const t = currentTheme();
    if (SCENES[t]) { SCENES[t].stop(); SCENES[t].start(); }
  }
  $("#calmToggle").addEventListener("click", e => { e.stopPropagation(); setCalm(!calm); toast(calm ? "Calm mode on: animations paused" : "Calm mode off"); });
  document.documentElement.classList.toggle("calm", calm);
  $("#calmToggle").setAttribute("aria-checked", String(calm));

  /* ---------------------------------------------------------
     10. THEME, NOTICE, POLLING, BOOT
     --------------------------------------------------------- */
  // Themes: light, dark, gallery (framed art on a museum wall) and universe (live space background)
  const THEMES = {
    light: "Light", dark: "Dark", gallery: "Gallery", universe: "Universe", amazon: "Amazon",
    ocean: "Deep Ocean", aurora: "Aurora", sakura: "Sakura Dusk", neon: "Neon City", sahara: "Sahara Night",
    noir: "Noir", neotokyo: "Neo Tokyo",
  };

  // Every theme change is a little trip through time (direction follows the menu order)
  function travelTo(theme, { years = null, after } = {}) {
    const cur = currentTheme();
    if (theme === cur) { after?.(); return; }
    if (reduceMotion || !cards.length) { setTheme(theme); after?.(); return; }
    const keys = Object.keys(THEMES);
    const dir = years ? Math.sign(years[1] - years[0]) || 1 : keys.indexOf(theme) >= keys.indexOf(cur) ? 1 : -1;
    startFx("timewarp", null, { dir, years, onMid: () => { setTheme(theme); after?.(); } });
  }
  const themeBtn = $("#themeBtn");
  const themeMenu = $("#themeMenu");
  function setTheme(t) {
    if (!THEMES[t]) t = "light";
    document.documentElement.dataset.theme = t;
    themeBtn.setAttribute("aria-label", `Theme: ${THEMES[t]}`);
    for (const [name, scene] of Object.entries(SCENES)) if (name !== t) scene.stop();
    SCENES[t]?.start();
    Sound.play(t);
    $$("[data-theme-choice]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.themeChoice === t)));
    ls.set("glimpse:theme", t);
  }
  function toggleThemeMenu(open) {
    themeMenu.hidden = !open;
    themeBtn.setAttribute("aria-expanded", String(open));
    if (open) themeMenu.querySelector("[aria-checked='true']")?.focus();
  }
  setTheme(ls.get("glimpse:theme", null) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  themeBtn.addEventListener("click", e => { e.stopPropagation(); toggleThemeMenu(themeMenu.hidden); });
  themeMenu.addEventListener("click", e => {
    const b = e.target.closest("[data-theme-choice]");
    if (!b) return;
    const choice = b.dataset.themeChoice;
    // Picking a theme by hand leaves time travel
    if (state.when !== "all" && !Object.values(TIME_THEMES).includes(choice)) {
      state.when = "all";
      $$("#timeChips .chip").forEach(ch => ch.setAttribute("aria-pressed", String(ch.dataset.when === "all")));
      applyFilter();
    }
    travelTo(choice);
    toggleThemeMenu(false);
    themeBtn.focus();
  });
  themeMenu.addEventListener("keydown", e => {
    const items = $$("[data-theme-choice]", themeMenu);
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === "ArrowUp")   { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === "Escape")    { e.stopPropagation(); toggleThemeMenu(false); themeBtn.focus(); }
  });
  document.addEventListener("click", e => { if (!themeMenu.hidden && !themeMenu.contains(e.target)) toggleThemeMenu(false); });

  $("#noticeClose").addEventListener("click", () => { $("#notice").hidden = true; ls.set("glimpse:noticeClosed", true); });

  // Server mode: check for other people's posts and offer to show them
  let pending = null;
  async function poll() {
    if (live.connected) return;
    try {
      const latest = screen(await store.list());
      const known = new Set(state.posts.map(p => p.id));
      const fresh = latest.filter(p => !known.has(p.id));
      const byId = new Map(latest.map(p => [p.id, p]));
      for (const p of state.posts) {
        const fresh = byId.get(p.id);
        if (!fresh) continue;
        p.likes = fresh.likes;
        if (p.type === "thought" && JSON.stringify(fresh.reactions || {}) !== JSON.stringify(p.reactions || {})) {
          p.reactions = fresh.reactions || {};
          refreshCards(p.id);
          if (viewing === p) renderReacts();
        }
      }
      const pill = $("#newPill");
      if (fresh.length) {
        pending = latest;
        pill.textContent = `${fresh.length} new post${fresh.length > 1 ? "s" : ""}. Show them`;
        pill.hidden = false;
      }
    } catch (_) { /* try again next time */ }
  }
  $("#newPill").addEventListener("click", e => {
    if (!pending) return;
    const known = new Set(state.posts.map(p => p.id));
    const newest = pending.find(p => !known.has(p.id));
    state.posts = pending; pending = null;
    e.currentTarget.hidden = true;
    buildWall(false);
    if (newest) glideTo(c => c.post.id === newest.id);
  });

  // Android app: the back button closes what's open before leaving the app
  window.Capacitor?.Plugins?.App?.addListener?.("backButton", () => {
    if (fx) endFx();
    else if (!$("#report").hidden) closeReport();
    else if (!$("#rules").hidden) closeRules();
    else if (!$("#wallShare").hidden) $("#wallShare").hidden = true;
    else if (!$("#wallCreate").hidden) $("#wallCreate").hidden = true;
    else if (!$("#viewer").hidden) closeViewer();
    else if (!$("#composer").hidden) closeComposer();
    else if (!$("#themeMenu").hidden) toggleThemeMenu(false);
    else if (state.until || state.when !== "all" || state.type !== "all" || state.query) { resetTimeline(); setFilter({ type: "all", query: "" }); if (state.when !== "all") setWhen("all"); }
    else window.Capacitor.Plugins.App.exitApp();
  });

  // Website: make it installable and quick to reopen (not needed inside the app)
  if ("serviceWorker" in navigator && location.protocol === "https:" && !IN_APP) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  async function boot() {
    // Phones: start with Discover folded so the wall gets the screen
    if (innerWidth < 700) { $("#discover").classList.add("collapsed"); $("#discoverToggle").setAttribute("aria-expanded", "false"); }
    store = await pickStore();
    if (store.mode === "local" && (IN_APP || API)) {
      $("#notice p").innerHTML = "<strong>Can't reach the wall.</strong> You're offline or the server is down. Posts you add now stay on this phone.";
      $("#notice").hidden = false;
    } else if (store.mode === "local" && !ls.get("glimpse:noticeClosed", false)) $("#notice").hidden = false;
    // Opening a shared post link (/p/<id>): find which wall it lives on
    const deepId = (location.pathname.match(/^\/p\/([\w-]{8,64})\/?$/) || [])[1] || new URLSearchParams(location.search).get("post");
    if (deepId && store.mode === "server") {
      try { const dp = await store.get(deepId); if (dp.wall) WALL = dp.wall; } catch (err) { toast(err.message); }
    }
    // Private wall: its name, its theme on your first visit
    if (WALL) {
      try {
        const info = await store.wallInfo(WALL);
        state.wallName = info.name;
        rememberWall(WALL, info.name);
        if (!ls.get(`glimpse:wallTheme:${WALL}`, null)) { ls.set(`glimpse:wallTheme:${WALL}`, info.theme); setTheme(info.theme); }
        document.title = `${info.name} · Glimpse`;
        $("#empty p").textContent = `Welcome to ${info.name}. Add the first post!`;
      } catch (err) {
        toast(err.message);
        WALL = ""; ls.set("glimpse:currentWall", "");
        if (/^\/w\//.test(location.pathname)) history.replaceState(null, "", "/");
      }
    }
    $("#wallName").textContent = WALL ? state.wallName : "Everyone";
    try {
      state.posts = screen(await store.list());
    } catch (err) {
      toast(err.message);
      state.posts = [];
    }
    // The wall bursts into view with a firework (or fades in if motion is reduced)
    buildWall(reduceMotion);
    if (!reduceMotion) startFx("fireworks", "all", { intro: true });
    requestAnimationFrame(tick);
    if (store.mode === "server") { setInterval(poll, POLL_MS); connectLive(); }
    if (location.hash === "#rules") openRules();
    setupQuestion();
    if (deepId && postById(deepId)) {
      setTimeout(() => { glideTo(c => c.post.id === deepId, { instant: true }); openViewer(deepId); }, reduceMotion ? 50 : 2000);
    } else if (deepId) toast("This post isn't available any more.");
    else setTimeout(onThisDay, 3500);
    if (WALL && ls.get("glimpse:shareOnArrival", "") === WALL) { ls.set("glimpse:shareOnArrival", ""); setTimeout(openWallShare, reduceMotion ? 100 : 2600); }
  }
  boot();
})();
