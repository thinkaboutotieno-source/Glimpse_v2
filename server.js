/* ==========================================================
   Glimpse server
   Serves the front end, stores uploads on disk and keeps posts
   in a JSON file. Good for a small community wall; for heavy
   traffic, swap the JSON file for a database and the uploads
   folder for object storage (S3, R2, Cloudinary...).

   Run:  npm install  &&  npm start   →  http://localhost:3000
   ========================================================== */
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
// On a host with a persistent disk, point these at the disk (e.g. DATA_DIR=/var/data/data)
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "posts.json");

const MAX_VIDEO_SECONDS = 30;
const MAX_VIDEO_BYTES = 60 * 1e6;
const MAX_PHOTO_BYTES = 12 * 1e6;     // photos arrive already resized by the browser
const MAX_THUMB_BYTES = 2 * 1e6;
const QUOTE_MAX = 280;
const QUOTE_STYLES = ["ink", "paper", "sun", "bloom"];
const THOUGHT_MAX = 500;
const THOUGHT_TINTS = ["cream", "mint", "sky", "blush"];
const REACTIONS = ["love", "hug", "haha", "wow", "sad", "relate"];
const MAX_VOICE_SECONDS = 30;
const MAX_AUDIO_BYTES = 12 * 1e6;
const REPLY_MAX = 280;
const PROMPT_COUNT = 60;              // daily questions (the list lives in public/script.js)
const WALL_THEMES = ["light", "dark", "gallery", "universe", "amazon", "ocean", "aurora", "sakura", "neon", "sahara", "noir", "neotokyo"];
const POSTS_PER_10_MIN = 30;          // per IP address
const REACTIONS_PER_10_MIN = 300;     // per IP address

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ----- Tiny JSON "database" ----- */
const SEED = [
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

const SEED_THOUGHTS = [
  ["Moved to a new city three months ago. Today the guy at the coffee stand knew my order. Small thing, felt huge.", "Wanjiru", "mint", { love: 9, hug: 4, relate: 6 }],
  ["Does anyone else rehearse conversations in the shower that never end up happening?", "Anonymous", "cream", { haha: 14, relate: 21 }],
  ["Finished my first 10K this morning. A year ago I couldn't run to the bus stop.", "Otieno", "sky", { love: 12, wow: 5 }],
  ["Missing my grandmother's cooking today. Trying her recipe tonight and I'll probably get it wrong.", "Anonymous", "blush", { hug: 11, sad: 3, love: 7 }],
];
const seedThoughts = now => SEED_THOUGHTS.map(([text, author, tint, reactions], i) => ({
  id: "sample-thought-" + i, type: "thought", author, text, tint, reactions, likes: 0, createdAt: now - [0.15, 1.6, 4, 11][i] * 864e5,
}));

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (_) {
    const now = Date.now();
    const posts = SEED.map(([text, quoteBy, style], i) => ({
      id: "sample-" + i, type: "quote", author: "Glimpse", text, quoteBy, style,
      likes: 3 + ((i * 7) % 20), createdAt: now - (i + 1) * 2.4 * 864e5,
    })).concat(seedThoughts(now));
    save(posts);
    return posts;
  }
}
function save(list = posts) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, DB_FILE);               // atomic replace
}
let posts = load();
// Walls created before thoughts existed get the sample thoughts once
const THOUGHTS_MARKER = path.join(DATA_DIR, ".thoughts-seeded");
if (!fs.existsSync(THOUGHTS_MARKER)) {
  if (!posts.some(p => p.type === "thought")) { posts.push(...seedThoughts(Date.now())); save(); }
  fs.writeFileSync(THOUGHTS_MARKER, "1");
}

// Time capsules stay sealed: until they open, nobody gets their contents (not even the poster)
/* ----- Moderation basics -----
   Each poster gets an anonymous ID derived from a random device ID their browser/app keeps
   (or their IP if missing). It lets people block someone and lets you ban them, without
   storing who they are. */
const SECRET_FILE = path.join(DATA_DIR, ".secret");
const SECRET = process.env.GLIMPSE_SECRET || (() => {
  try { return fs.readFileSync(SECRET_FILE, "utf8").trim(); }
  catch (_) { const s = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(SECRET_FILE, s); return s; }
})();
const keyFor = (deviceId, ip) => crypto.createHash("sha256").update(SECRET + "|" + (String(deviceId || "").slice(0, 80) || "ip:" + ip)).digest("hex");
const publicIdFor = key => key ? crypto.createHash("sha256").update("pub|" + key).digest("hex").slice(0, 16) : undefined;
const REPORT_HIDE_THRESHOLD = Number(process.env.REPORT_HIDE_THRESHOLD) || 3;
const REPORT_REASONS = ["spam", "harassment", "sexual", "violence", "self-harm", "illegal", "other"];
const BANS_FILE = path.join(DATA_DIR, "bans.json");
let bans = new Set((() => { try { return JSON.parse(fs.readFileSync(BANS_FILE, "utf8")); } catch (_) { return []; } })());
const saveBans = () => fs.writeFileSync(BANS_FILE, JSON.stringify([...bans], null, 2));

// What the public sees: no tokens, keys or reports, and sealed capsules stay sealed
const publicPost = ({ tokenHash, ip, authorKey, reports, hidden, replies, ...p }) => {
  const authorId = publicIdFor(authorKey);
  const replyCount = (replies || []).filter(r => !r.hidden).length;
  if (replyCount) p.replyCount = replyCount;
  if (p.opensAt && p.opensAt > Date.now()) {
    return { id: p.id, type: p.type, author: p.author, authorId, createdAt: p.createdAt, opensAt: p.opensAt, sealed: true, likes: p.likes || 0, width: p.width, height: p.height, wall: p.wall, og: p.og };
  }
  return { ...p, authorId };
};
const publicReply = ({ tokenHash, authorKey, reports, hidden, ...r }) => ({ ...r, authorId: publicIdFor(authorKey) });
const isSealed = p => p.opensAt && p.opensAt > Date.now();
const MAX_CAPSULE_YEARS = 10;
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
// Like clean(), but keeps line breaks (for thoughts)
const cleanText = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
  .replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const httpError = (status, message) => Object.assign(new Error(message), { status });

/* ----- Uploads ----- */
const EXT = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
  "video/mp4": ".mp4", "video/x-m4v": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
  "video/3gpp": ".3gp", "video/x-matroska": ".mkv",
  "audio/webm": ".weba", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac",
  "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav",
};
const EXT_BY_NAME = { mp4: ".mp4", m4v: ".mp4", mov: ".mov", webm: ".webm", "3gp": ".3gp", mkv: ".mkv", jpg: ".jpg", jpeg: ".jpg", png: ".png", webp: ".webp",
  weba: ".weba", ogg: ".ogg", oga: ".ogg", m4a: ".m4a", aac: ".aac", mp3: ".mp3", wav: ".wav" };
const baseType = file => String(file.mimetype || "").split(";")[0].trim().toLowerCase();
// Use the browser's type, or the file name when the type is missing/generic
function extFor(file) {
  if (EXT[baseType(file)]) return EXT[baseType(file)];
  const ext = (file.originalname.split(".").pop() || "").toLowerCase();
  return EXT_BY_NAME[ext] || null;
}
const isAudioFile = file => baseType(file).startsWith("audio/") || /\.(weba|ogg|oga|m4a|aac|mp3|wav)$/i.test(file.originalname);
const isVideoFile = file => !isAudioFile(file) && (baseType(file).startsWith("video/") || /\.(mp4|m4v|mov|webm|3gp|mkv)$/i.test(file.originalname));
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + (extFor(file) || "")),
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 3, fields: 30 },
  fileFilter: (req, file, cb) => {
    const okMedia = file.fieldname === "media" && extFor(file);
    const okThumb = (file.fieldname === "thumb" || file.fieldname === "og") && baseType(file) === "image/jpeg";
    if (okMedia || okThumb) return cb(null, true);
    console.warn(`Rejected upload: field=${file.fieldname} type=${file.mimetype} name=${file.originalname}`);
    cb(httpError(400, "That file type isn't supported. Use JPG, PNG, WebP, MP4, MOV, WebM, or an audio file (M4A, MP3, WebM, OGG, WAV)."));
  },
});

// Reads the real video length with ffprobe when it's installed.
function probeDuration(file) {
  return new Promise(resolve => {
    execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeout: 15000 }, (err, out) => {
      const d = parseFloat(out);
      resolve(err || !isFinite(d) ? null : d);
    });
  });
}
let hasFfprobe = false;
execFile("ffprobe", ["-version"], err => {
  hasFfprobe = !err;
  if (!hasFfprobe) console.warn("ffprobe not found: video length is checked in the browser only. Install ffmpeg to check it on the server too.");
});

/* ----- Private walls -----
   A wall is a separate, unlisted space (a wedding, a class, an event). Anyone with its link can
   view and post; the person who made it gets a host key to remove posts from it. */
const WALLS_FILE = path.join(DATA_DIR, "walls.json");
let walls = (() => { try { return JSON.parse(fs.readFileSync(WALLS_FILE, "utf8")); } catch (_) { return {}; } })();
const saveWalls = () => { const tmp = WALLS_FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(walls, null, 2)); fs.renameSync(tmp, WALLS_FILE); };
const SLUG_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const newSlug = () => Array.from(crypto.randomBytes(10), b => SLUG_CHARS[b % SLUG_CHARS.length]).join("");
const wallOf = req => {
  const slug = String(req.query.wall || req.body?.wall || "").trim();
  if (!slug) return "";
  if (!walls[slug]) throw httpError(404, "That wall doesn't exist (check the link).");
  return slug;
};
const isWallHost = (slug, req) => {
  const w = slug && walls[slug];
  const t = String(req.get("X-Wall-Token") || "");
  return !!(w && t && sha256(t) === w.hostHash);
};

/* ----- Live updates (Server-Sent Events) ----- */
const streams = new Set();
function broadcast(wall, event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of streams) if (c.wall === (wall || "")) c.res.write(msg);
}
let presenceTimer = null;
function presenceSoon() {                     // tell everyone how many people are here (batched)
  clearTimeout(presenceTimer);
  presenceTimer = setTimeout(() => {
    const byWall = {};
    for (const c of streams) (byWall[c.wall] = byWall[c.wall] || []).push(c.seed);
    for (const [wall, seeds] of Object.entries(byWall)) broadcast(wall, "presence", { count: seeds.length, seeds: seeds.slice(0, 40) });
  }, 400);
}

/* ----- Simple per-IP rate limit for new posts ----- */
function makeLimiter(max, message) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now(), win = 10 * 60 * 1000;
    const list = (hits.get(req.ip) || []).filter(t => now - t < win);
    if (list.length >= max) return res.status(429).json({ error: message });
    list.push(now); hits.set(req.ip, list);
    next();
  };
}
const rateLimit = makeLimiter(POSTS_PER_10_MIN, "You're posting very fast. Wait a few minutes and try again.");
const reactLimit = makeLimiter(REACTIONS_PER_10_MIN, "That's a lot of reactions. Wait a few minutes and try again.");

/* ----- App ----- */
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));

// Let the Android app (and any sites you list in ALLOWED_ORIGINS) call the API
const ALLOWED = new Set(["https://localhost", "capacitor://localhost", "http://localhost",
  ...String(process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean)]);
app.use("/api", (req, res, next) => {
  const origin = req.get("Origin");
  if (origin && ALLOWED.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, X-Delete-Token, X-Admin-Token, X-Wall-Token");
    res.set("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
app.use(express.static(path.join(ROOT, "public"), {
  setHeaders: (res, file) => { if (file.endsWith("sw.js") || file.endsWith("config.js")) res.set("Cache-Control", "no-cache"); },
}));
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d", immutable: true, setHeaders: r => r.set("Cross-Origin-Resource-Policy", "cross-origin") }));


// For the host's health checks
app.get("/api/health", (req, res) => res.json({ ok: true, posts: posts.length }));

app.get("/api/posts", (req, res, next) => {
  try {
    const wall = wallOf(req);
    res.json(posts.filter(p => !p.hidden && (p.wall || "") === wall).map(publicPost));
  } catch (err) { next(err); }
});

// One post (used when someone opens a share link)
app.get("/api/posts/:id", (req, res) => {
  const p = posts.find(x => x.id === req.params.id && !x.hidden);
  if (!p) return res.status(404).json({ error: "This post isn't available any more." });
  res.json(publicPost(p));
});

// Live stream: new posts, likes/reactions/replies, removals, and who's here
app.get("/api/stream", (req, res, next) => {
  let wall;
  try { wall = wallOf(req); } catch (err) { return next(err); }
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders?.();
  res.write("retry: 4000\n\n");
  const client = { res, wall, seed: crypto.randomBytes(3).toString("hex") };
  streams.add(client);
  res.write(`event: hello\ndata: ${JSON.stringify({ seed: client.seed })}\n\n`);
  presenceSoon();
  const beat = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => { clearInterval(beat); streams.delete(client); presenceSoon(); });
});

// Walls
const wallLimit = makeLimiter(6, "You've made several walls already. Try again in a few minutes.");
app.post("/api/walls", wallLimit, (req, res) => {
  const name = clean(req.body?.name, 60);
  if (name.length < 2) return res.status(400).json({ error: "Give your wall a name." });
  if (req.body?.agreed !== "1" && req.body?.agreed !== true) return res.status(400).json({ error: "Please accept the community rules first." });
  const theme = WALL_THEMES.includes(req.body?.theme) ? req.body.theme : "light";
  let slug; do slug = newSlug(); while (walls[slug]);
  const hostToken = crypto.randomBytes(18).toString("hex");
  walls[slug] = { name, theme, createdAt: Date.now(), hostHash: sha256(hostToken), by: keyFor(req.body?.deviceId, req.ip) };
  saveWalls();
  res.status(201).json({ wall: { slug, name, theme }, hostToken });
});
app.get("/api/walls/:slug", (req, res) => {
  const w = walls[req.params.slug];
  if (!w) return res.status(404).json({ error: "That wall doesn't exist (check the link)." });
  res.json({ slug: req.params.slug, name: w.name, theme: w.theme, createdAt: w.createdAt, posts: posts.filter(p => p.wall === req.params.slug && !p.hidden).length });
});

app.post("/api/posts", rateLimit, upload.fields([{ name: "media", maxCount: 1 }, { name: "thumb", maxCount: 1 }, { name: "og", maxCount: 1 }]), async (req, res, next) => {
  const media = req.files?.media?.[0];
  const thumb = req.files?.thumb?.[0];
  const og = req.files?.og?.[0];
  const cleanup = () => [media, thumb, og].forEach(f => f && fs.unlink(f.path, () => {}));

  try {
    const b = req.body;
    const type = b.type;
    if (!["photo", "video", "voice", "quote", "thought"].includes(type)) throw httpError(400, "Choose a photo, video, voice note, quote or thought to post.");
    const wall = wallOf(req);

    if (b.agreed !== "1") throw httpError(400, "Please accept the community rules before posting.");
    const authorKey = keyFor(b.deviceId, req.ip);
    const ipKey = keyFor("", req.ip);
    if (bans.has(authorKey) || bans.has(ipKey)) throw httpError(403, "You can't post on this wall.");

    const post = {
      id: crypto.randomUUID(),
      type,
      author: clean(b.author, 40) || "Anonymous",
      authorKey,
      ip: ipKey,
      likes: 0,
      createdAt: Date.now(),
    };
    if (wall) post.wall = wall;
    if (og) {
      if (og.size > MAX_THUMB_BYTES) throw httpError(413, "The preview image is too large.");
      post.og = "/uploads/" + og.filename;
    }

    if (type === "voice") {
      if (!media || !isAudioFile(media)) throw httpError(400, "Record or choose a voice note first.");
      if (media.size > MAX_AUDIO_BYTES) throw httpError(413, "That voice note is too large.");
      if (thumb) fs.unlink(thumb.path, () => {});
      const probed = hasFfprobe ? await probeDuration(media.path) : null;
      const duration = probed ?? Number(b.duration);
      if (!(duration > 0)) throw httpError(400, "Couldn't read the length of that recording.");
      if (duration > MAX_VOICE_SECONDS + 0.5) throw httpError(400, `Voice notes can be ${MAX_VOICE_SECONDS} seconds at most.`);
      post.duration = Math.round(duration * 100) / 100;
      post.url = "/uploads/" + media.filename;
      post.caption = clean(b.caption, 140);
      let peaks = [];
      try { peaks = JSON.parse(b.peaks || "[]"); } catch (_) {}
      post.peaks = (Array.isArray(peaks) ? peaks : []).slice(0, 64).map(v => Math.round(clamp(Number(v) || 0, 0, 1) * 100) / 100);
    } else if (type === "thought") {
      if (media || thumb) throw httpError(400, "Thoughts can't include files.");
      post.text = cleanText(b.text, THOUGHT_MAX);
      if (post.text.length < 2) throw httpError(400, "Write your thought before posting.");
      post.tint = THOUGHT_TINTS.includes(b.tint) ? b.tint : "cream";
      post.reactions = {};
      const prompt = Number(b.prompt);
      if (b.prompt !== undefined && b.prompt !== "" && Number.isInteger(prompt) && prompt >= 0 && prompt < PROMPT_COUNT) post.prompt = prompt;
    } else if (type === "quote") {
      if (media || thumb) throw httpError(400, "Quotes can't include files.");
      post.text = clean(b.text, QUOTE_MAX);
      if (post.text.length < 2) throw httpError(400, "Write a quote before posting.");
      post.quoteBy = clean(b.quoteBy, 60);
      post.style = QUOTE_STYLES.includes(b.style) ? b.style : "ink";
    } else {
      if (!media || !thumb) throw httpError(400, "The upload was incomplete. Choose the file again.");
      const isVideo = isVideoFile(media);
      if (isVideo !== (type === "video")) throw httpError(400, `That file doesn't look like a ${type}.`);
      if (!isVideo && media.size > MAX_PHOTO_BYTES) throw httpError(413, "That photo is too large.");
      if (thumb.size > MAX_THUMB_BYTES) throw httpError(413, "The preview image is too large.");

      post.caption = clean(b.caption, 140);
      post.width = Math.round(clamp(Number(b.width) || 0, 0, 10000));
      post.height = Math.round(clamp(Number(b.height) || 0, 0, 10000));
      post.url = "/uploads/" + media.filename;
      post.thumb = "/uploads/" + thumb.filename;

      if (isVideo) {
        const probed = hasFfprobe ? await probeDuration(media.path) : null;
        const duration = probed ?? Number(b.duration);
        if (!(duration > 0)) throw httpError(400, "Couldn't read the length of that video. Try an MP4 file.");
        // Longer videos can be posted as a chosen 30-second clip
        const cs = Number(b.clipStart), ce = Number(b.clipEnd);
        if (b.clipEnd !== undefined && b.clipEnd !== "") {
          if (!(cs >= 0 && ce > cs && ce - cs <= MAX_VIDEO_SECONDS + 0.5 && ce <= duration + 0.75)) throw httpError(400, `Pick a clip of up to ${MAX_VIDEO_SECONDS} seconds.`);
          post.clip = [Math.round(cs * 100) / 100, Math.round(Math.min(ce, duration) * 100) / 100];
        } else if (duration > MAX_VIDEO_SECONDS + 0.5) {
          throw httpError(400, `This video is ${Math.round(duration)} seconds long. Pick a ${MAX_VIDEO_SECONDS}-second clip from it.`);
        }
        post.duration = Math.round(duration * 100) / 100;
      }
    }

    if (b.opensAt) {
      const opensAt = Number(b.opensAt);
      if (!(opensAt > Date.now() + 30 * 1000)) throw httpError(400, "Pick an opening time in the future for your time capsule.");
      if (opensAt > Date.now() + MAX_CAPSULE_YEARS * 365.25 * 864e5) throw httpError(400, `Time capsules can stay sealed for up to ${MAX_CAPSULE_YEARS} years.`);
      post.opensAt = Math.round(opensAt);
    }

    const token = crypto.randomBytes(18).toString("hex");
    post.tokenHash = sha256(token);
    posts.unshift(post);
    save();
    const pub = publicPost(post);
    broadcast(post.wall, "post", pub);
    res.status(201).json({ post: pub, deleteToken: token });
  } catch (err) {
    cleanup();
    console.warn("Post rejected:", err.message);
    next(err);
  }
});

app.post("/api/posts/:id/like", (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  if (isSealed(p)) return res.status(403).json({ error: "This time capsule is still sealed." });
  const delta = req.body?.delta === -1 ? -1 : 1;
  p.likes = Math.max(0, (p.likes || 0) + delta);
  save();
  broadcast(p.wall, "update", { id: p.id, likes: p.likes });
  res.json({ likes: p.likes });
});

// One reaction per person per thought: the browser sends what it adds and what it removes
app.post("/api/posts/:id/react", reactLimit, (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  if (p.type !== "thought") return res.status(400).json({ error: "Only thoughts take reactions." });
  if (isSealed(p)) return res.status(403).json({ error: "This time capsule is still sealed." });
  const { add, remove } = req.body || {};
  p.reactions = p.reactions || {};
  if (REACTIONS.includes(remove)) p.reactions[remove] = Math.max(0, (p.reactions[remove] || 0) - 1);
  if (REACTIONS.includes(add)) p.reactions[add] = (p.reactions[add] || 0) + 1;
  save();
  broadcast(p.wall, "update", { id: p.id, reactions: p.reactions });
  res.json({ reactions: p.reactions });
});

// Report a post. Enough reports from different people hide it until an admin reviews it.
const reportLimit = makeLimiter(30, "You've sent a lot of reports. Wait a few minutes and try again.");
app.post("/api/posts/:id/report", reportLimit, (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  const reason = REPORT_REASONS.includes(req.body?.reason) ? req.body.reason : "other";
  const by = keyFor(req.body?.deviceId, req.ip);
  p.reports = p.reports || [];
  if (!p.reports.some(r => r.by === by)) {
    p.reports.push({ reason, note: clean(req.body?.note, 300), at: Date.now(), by });
    if (new Set(p.reports.map(r => r.by)).size >= REPORT_HIDE_THRESHOLD && !p.hidden) { p.hidden = true; broadcast(p.wall, "remove", { id: p.id }); }
    save();
    console.warn(`Post ${p.id} reported (${reason}); ${p.reports.length} report(s)${p.hidden ? ", now hidden" : ""}.`);
  }
  res.json({ ok: true });
});

/* ----- Replies (on thoughts) ----- */
const replyLimit = makeLimiter(40, "You're replying very fast. Wait a few minutes and try again.");
const findPost = id => posts.find(x => x.id === id && !x.hidden);
app.get("/api/posts/:id/replies", (req, res) => {
  const p = findPost(req.params.id);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  if (isSealed(p)) return res.json([]);
  res.json((p.replies || []).filter(r => !r.hidden).map(publicReply));
});
app.post("/api/posts/:id/replies", replyLimit, (req, res) => {
  const p = findPost(req.params.id);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  if (p.type !== "thought") return res.status(400).json({ error: "Only thoughts take replies." });
  if (isSealed(p)) return res.status(403).json({ error: "This time capsule is still sealed." });
  const b = req.body || {};
  if (b.agreed !== "1") return res.status(400).json({ error: "Please accept the community rules first." });
  const authorKey = keyFor(b.deviceId, req.ip);
  if (bans.has(authorKey) || bans.has(keyFor("", req.ip))) return res.status(403).json({ error: "You can't post on this wall." });
  const text = cleanText(b.text, REPLY_MAX);
  if (text.length < 1) return res.status(400).json({ error: "Write a reply first." });
  if ((p.replies || []).length >= 500) return res.status(400).json({ error: "This thought has too many replies already." });
  const token = crypto.randomBytes(18).toString("hex");
  const reply = { id: crypto.randomUUID(), author: clean(b.author, 40) || "Anonymous", authorKey, text, createdAt: Date.now(), tokenHash: sha256(token) };
  (p.replies = p.replies || []).push(reply);
  save();
  const pub = publicReply(reply);
  broadcast(p.wall, "reply", { postId: p.id, reply: pub, replyCount: p.replies.filter(r => !r.hidden).length });
  res.status(201).json({ reply: pub, deleteToken: token });
});
app.delete("/api/posts/:id/replies/:rid", (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  const r = p?.replies?.find(x => x.id === req.params.rid);
  if (!r) return res.status(404).json({ error: "That reply no longer exists." });
  const token = req.get("X-Delete-Token") || "";
  const ok = sha256(token) === r.tokenHash || isWallHost(p.wall, req) || (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN);
  if (!ok) return res.status(403).json({ error: "Only the person who wrote this can delete it." });
  p.replies = p.replies.filter(x => x !== r);
  save();
  broadcast(p.wall, "unreply", { postId: p.id, replyId: r.id, replyCount: p.replies.filter(x => !x.hidden).length });
  res.status(204).end();
});
app.post("/api/posts/:id/replies/:rid/report", reportLimit, (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  const r = p?.replies?.find(x => x.id === req.params.rid);
  if (!r) return res.status(404).json({ error: "That reply no longer exists." });
  const by = keyFor(req.body?.deviceId, req.ip);
  r.reports = r.reports || [];
  if (!r.reports.some(x => x.by === by)) {
    r.reports.push({ reason: REPORT_REASONS.includes(req.body?.reason) ? req.body.reason : "other", note: clean(req.body?.note, 300), at: Date.now(), by });
    if (new Set(r.reports.map(x => x.by)).size >= REPORT_HIDE_THRESHOLD && !r.hidden) {
      r.hidden = true;
      broadcast(p.wall, "unreply", { postId: p.id, replyId: r.id, replyCount: p.replies.filter(x => !x.hidden).length });
    }
    save();
  }
  res.json({ ok: true });
});

/* ----- Share pages: /p/<post> and /w/<wall> get link previews (Open Graph) ----- */
const INDEX_FILE = path.join(ROOT, "public", "index.html");
const attr = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function sharePage(req, res, { title, description, image }) {
  const origin = `${req.protocol}://${req.get("host")}`;
  const tags = [
    `<base href="/">`,
    `<meta property="og:site_name" content="Glimpse">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:url" content="${attr(origin + req.originalUrl)}">`,
    image ? `<meta property="og:image" content="${attr(origin + image)}">` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="description" content="${attr(description)}">`,
  ].join("\n  ");
  const html = fs.readFileSync(INDEX_FILE, "utf8")
    .replace("<head>", `<head>\n  ${tags}`)
    .replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`);
  res.set("Cache-Control", "no-cache").type("html").send(html);
}
const TYPE_WORD = { photo: "a photo", video: "a video", voice: "a voice note", quote: "a quote", thought: "a thought" };
app.get("/p/:id", (req, res) => {
  const p = findPost(req.params.id);
  if (!p) return sharePage(req, res, { title: "Glimpse", description: "This post isn't available any more." });
  const where = p.wall && walls[p.wall] ? ` on ${walls[p.wall].name}` : " on Glimpse";
  if (isSealed(p)) {
    return sharePage(req, res, { title: `A time capsule from ${p.author}`, description: `Sealed until ${new Date(p.opensAt).toUTCString().slice(5, 16)}. Open Glimpse to watch the countdown.`, image: p.og });
  }
  const text = p.text || p.caption || "";
  sharePage(req, res, {
    title: `${p.author} shared ${TYPE_WORD[p.type] || "a post"}${where}`,
    description: text ? (text.length > 160 ? text.slice(0, 157) + "…" : text) : "Open Glimpse to see it.",
    image: p.og || p.thumb,
  });
});
app.get("/w/:slug", (req, res) => {
  const w = walls[req.params.slug];
  if (!w) return sharePage(req, res, { title: "Glimpse", description: "This wall doesn't exist. Check the link." });
  sharePage(req, res, { title: `${w.name} · Glimpse`, description: `Add your photos, videos, voice notes and thoughts to ${w.name}.` });
});

/* ----- Admin (needs ADMIN_TOKEN) ----- */
function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_TOKEN) return res.status(503).json({ error: "Set ADMIN_TOKEN on the server to use moderation." });
  const given = String(req.get("X-Admin-Token") || "");
  const a = Buffer.from(sha256(given)), b = Buffer.from(sha256(process.env.ADMIN_TOKEN));
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Wrong admin token." });
  next();
}
const removeFiles = p => { for (const u of [p.url, p.thumb, p.og]) if (u) fs.unlink(path.join(UPLOAD_DIR, path.basename(u)), () => {}); };

// Everything that needs a look: reported or hidden posts, most-reported first (full contents, even sealed)
app.get("/api/admin/queue", requireAdmin, (req, res) => {
  const queue = posts.filter(p => p.hidden || (p.reports && p.reports.length))
    .map(({ tokenHash, ip, authorKey, reports = [], ...p }) => ({
      ...p, authorId: publicIdFor(authorKey),
      reports: reports.map(({ by, ...r }) => r),
      reporters: new Set(reports.map(r => r.by)).size,
      postsByAuthor: posts.filter(x => x.authorKey && x.authorKey === authorKey).length,
    }))
    .map(p => ({ ...p, replies: undefined, wallName: p.wall && walls[p.wall] ? walls[p.wall].name : "" }))
    .sort((a, b) => b.reporters - a.reporters || b.createdAt - a.createdAt);
  const replies = [];
  for (const p of posts) for (const r of p.replies || []) {
    if (!r.hidden && !(r.reports && r.reports.length)) continue;
    replies.push({
      postId: p.id, postText: p.text, id: r.id, author: r.author, text: r.text, createdAt: r.createdAt, hidden: !!r.hidden,
      authorId: publicIdFor(r.authorKey), reports: (r.reports || []).map(({ by, ...x }) => x), reporters: new Set((r.reports || []).map(x => x.by)).size,
    });
  }
  replies.sort((a, b) => b.reporters - a.reporters);
  res.json({ queue, replies, bans: bans.size, total: posts.length, walls: Object.keys(walls).length, threshold: REPORT_HIDE_THRESHOLD });
});
app.post("/api/admin/posts/:id/:action", requireAdmin, (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  const action = req.params.action;
  if (action === "keep") {
    p.reports = []; p.hidden = false;
  } else if (action === "remove") {
    posts = posts.filter(x => x !== p); removeFiles(p);
    broadcast(p.wall, "remove", { id: p.id });
  } else if (action === "ban") {
    if (p.authorKey) bans.add(p.authorKey);
    // IP bans are off by default: phone networks share one IP among many people
    if (p.ip && process.env.BAN_BY_IP === "true") bans.add(p.ip);
    saveBans();
    const gone = posts.filter(x => (p.authorKey && x.authorKey === p.authorKey) || x === p);
    gone.forEach(removeFiles);
    gone.forEach(x => broadcast(x.wall, "remove", { id: x.id }));
    posts = posts.filter(x => !gone.includes(x));
    save();
    return res.json({ ok: true, removed: gone.length });
  } else return res.status(400).json({ error: "Unknown action." });
  save();
  res.json({ ok: true });
});
app.post("/api/admin/replies/:postId/:rid/:action", requireAdmin, (req, res) => {
  const p = posts.find(x => x.id === req.params.postId);
  const r = p?.replies?.find(x => x.id === req.params.rid);
  if (!r) return res.status(404).json({ error: "That reply no longer exists." });
  const action = req.params.action;
  if (action === "keep") { r.reports = []; r.hidden = false; }
  else if (action === "remove" || action === "ban") {
    if (action === "ban" && r.authorKey) { bans.add(r.authorKey); saveBans(); }
    p.replies = p.replies.filter(x => x !== r);
    broadcast(p.wall, "unreply", { postId: p.id, replyId: r.id, replyCount: p.replies.filter(x => !x.hidden).length });
  } else return res.status(400).json({ error: "Unknown action." });
  save();
  res.json({ ok: true });
});
app.post("/api/admin/unban-all", requireAdmin, (req, res) => { bans = new Set(); saveBans(); res.json({ ok: true }); });

app.delete("/api/posts/:id", (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  const token = req.get("X-Delete-Token") || "";
  const adminOk = process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
  const ownerOk = p.tokenHash && sha256(token) === p.tokenHash;
  if (!adminOk && !ownerOk && !isWallHost(p.wall, req)) {
    return res.status(403).json({ error: "Only the person who posted this can delete it." });
  }
  posts = posts.filter(x => x !== p);
  save();
  removeFiles(p);
  broadcast(p.wall, "remove", { id: p.id });
  res.status(204).end();
});

// Errors (including multer's file-size errors) come back as friendly JSON
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE"
      ? `That file is too large. Videos can be up to ${MAX_VIDEO_BYTES / 1e6} MB.`
      : "The upload couldn't be read. Try again.";
    return res.status(413).json({ error: msg });
  }
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "That's too long." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server. Try again." });
});

function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

app.listen(PORT, () => console.log(`Glimpse is running at http://localhost:${PORT}`));
