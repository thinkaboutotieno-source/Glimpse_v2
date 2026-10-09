# Glimpse

An infinite, zoomable wall where people post photos, videos of up to 30 seconds, quotes and thoughts.

## Put it online

**See [DEPLOY.md](DEPLOY.md)**: a step-by-step guide to running Glimpse on Render with the included `render.yaml`
(persistent disk, generated admin password, health check). Once your code is on GitHub, you can also use this button
(replace `YOUR-USERNAME`):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/YOUR-USERNAME/glimpse)

## Run it

You need Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000. Everyone who opens that address sees the same wall.

Install **ffmpeg** too if you can (`brew install ffmpeg`, `sudo apt install ffmpeg`, or from ffmpeg.org).
The browser already refuses videos over 30 seconds, but with ffmpeg the server checks the real length
of every upload as well, so nobody can get around the limit.

## Android

Glimpse can be installed on Android two ways: as an installable website (open it in Chrome → **Install app**),
or as a real app built from `android-app/` and published on Google Play. **See [ANDROID.md](ANDROID.md)** for
step-by-step instructions, including how to host the server.

## Project layout

```
server.js          Express server: API, uploads, JSON storage
render.yaml        Render Blueprint (how to run it online; see DEPLOY.md)
public/index.html  Page structure
public/style.css   Styles
public/script.js   Wall, zoom, uploads, viewer
public/config.js   Server address (empty for the website; set by the Android build)
public/vendor/qrcode.js   QR code generator (MIT licence, by Kazuhiko Arase)
data/walls.json    Private walls (created on first use)
public/sw.js       Makes the website installable and quick to reopen
public/manifest.webmanifest, public/icons/   App name, colours and icons
android-app/       The Android app (Capacitor); see ANDROID.md
data/posts.json    Created on first run; all posts live here
uploads/           Created on first run; uploaded files live here
```

## How uploads work

- **Photos** are resized in the browser to 1800px on the long edge before upload, plus a 520px thumbnail for the wall.
- **Videos** are checked in the browser for length (30 s) and size (60 MB). A thumbnail is captured from the first second.
  The server checks type, size and length again.
- **Quotes** are up to 280 characters with four card styles.
- **Thoughts** are personal notes of up to 500 characters (line breaks allowed) in four note colours.
  Others react with ❤️ 🤗 😂 😮 😢 🙌, one reaction per person per thought; tapping it again removes it.
  Change the set in `REACTIONS` in `public/script.js` and the matching list in `server.js`.

Each new post returns a private delete token that is saved in the poster's browser, so only they can delete it.
To delete anything as the site owner, start the server with `ADMIN_TOKEN=some-long-secret npm start` and send that
value in the `X-Delete-Token` header:

```bash
curl -X DELETE -H "X-Delete-Token: some-long-secret" http://localhost:3000/api/posts/POST_ID
```

## Themes

The theme button in the top bar offers twelve themes: **Light**, **Dark**, **Gallery**, **Universe**, **Amazon**, **Deep Ocean**, **Aurora**, **Sakura Dusk**, **Neon City**, **Sahara Night**, **Noir** and **Neo Tokyo**. Every theme change plays a short time-travel transition (a clock vortex and a flash). Gallery hangs every post on a
museum-green wall under soft spotlights: photos get gilded frames with a cream mat, videos get slim black
frames, quotes are framed like prints in oak, and each piece has a museum wall label (artist, title, year, medium).
All gallery styles are in the `GALLERY THEME` section at the end of `public/style.css`. Change `--bg` there
to repaint the wall (for example `#6b2430` for oxblood, or `#f2efe9` for a white-cube gallery).

## Time travel and timestamps

Every post shows when it was added ("3h ago" on the cards, the full date in the viewer and on gallery labels;
Neo Tokyo shows exact futuristic timestamps like `2026.10.07 14:32`).

The **Time travel** control in the Discover panel filters by age and changes era:

- **Past** → posts older than the cutoff, in **Noir** (black and white, rain, a street lamp, film grain). The year counter rolls back to 1947.
- **New** → the newest posts, in **Neo Tokyo** (neon kanji towers, holographic koi, a bullet train). The counter rolls forward to 2087.
- **Now** → all posts, in a random theme (never Noir or Neo Tokyo, and never the one you're already in).

The cutoff is 24 hours ago, unless that would leave one side (nearly) empty; then it's the midpoint of the
posts you're looking at. Plain-language searches work too: "old photos", "latest thoughts", "new videos about
football" set the time, the type and the search words.

## Time capsules

Turn on **Seal as a time capsule** when posting (any type) and pick when it opens: in a week, a month, a year,
at New Year, a custom date, or "in a minute" to try it out. Until then:

- The wall shows a glowing capsule with a live countdown, and the timeline marks it in gold.
- The server never sends a sealed post's contents to anyone, including the person who posted it. Likes and
  reactions are blocked too. Capsules can stay sealed for up to 10 years (`MAX_CAPSULE_YEARS` in `server.js`).
- When the moment arrives, everyone who has the site open sees it burst open with gold and violet fireworks.

## Timeline

The slider at the bottom travels back through the wall's history. Drag left and posts newer than that moment
fade away, a big date appears, and the whole scene ages into sepia the further back you go. Release to glide to
the nearest post from then. Tick marks show when each post was added. "Now" (or "Show all") snaps it back.

## Sound

The speaker button in the top bar turns on ambient sound (off by default; the choice is remembered). Every
theme has its own soundscape, generated live with the Web Audio API, so there are no audio files: rain and a
lonely horn in Noir, crickets and frogs in Amazon, waves, bubbles and whales in Deep Ocean, koto plucks and wind
chimes in Sakura Dusk, a synth bassline in Neon City, a campfire in Sahara Night, and more. The effects have
sounds too (firework booms, the black hole's rumble, the clock ticking up to a time jump, a capsule opening).
Each soundscape is in the `SCAPES` object in `public/script.js`.

## Effects

- **Opening the site:** the wall bursts into view as a firework.
- **Discover filters** each play an effect before landing on a matching post:
  All, Photos and Thoughts → **fireworks**, Quotes → **wormhole**, Videos → **black hole**
  (which also pulls the panels in and shakes the screen).
- Press **Escape** to skip an effect. People who've turned on "reduce motion" in their device settings don't see them.
- To change which filter plays which effect, edit `FILTER_FX` in `public/script.js`. Effect timings and
  colours are in the `EFFECTS` object in the same file.

The **Universe** theme draws a live space background (Milky Way, nebulae, spiral galaxies, twinkling stars).
Zooming the wall flies you through the stars, and fast moves stretch them into warp streaks. Its code is
the `Space` object in `public/script.js`.

The **Amazon** theme is a rainforest at night: layered jungle silhouettes with mist and moonbeams, fireflies
that flash and swerve away from the cursor (zoom to fly through the swarm), glowing poison dart frogs that
blink, croak and hop between branches, and swaying leaves in the corners with frogs sitting on them.
Its code is the `Jungle` object in `public/script.js`. On slow devices it automatically uses fewer fireflies.

The five newest animated themes are built with a small scene kit (`makeScene` in `public/script.js`):

- **Deep Ocean**: glowing jellyfish, plankton that sparkles where the cursor passes or when the wall moves, swaying kelp, light shafts.
- **Aurora**: rippling northern lights over snowy mountains and pine forest, snowfall (nearest flakes over the posts), shooting stars.
- **Sakura Dusk**: sunset over a snow-capped volcano and a pagoda, floating sky lanterns, cherry branches swaying in the corners, tumbling petals.
- **Neon City**: synthwave grid that rushes toward you when you zoom, striped sunset, glowing skyline, flying cars, rain.
- **Sahara Night**: dunes under stars wheeling around the pole star, a camel caravan, shooting stars, a campfire with rising embers.

### Adding another animated theme

1. Add CSS tokens for `:root[data-theme="yourtheme"]` at the end of `public/style.css` (copy the Amazon block).
2. Add a menu button with `data-theme-choice="yourtheme"` in `public/index.html`.
3. Add the name to `THEMES` in `public/script.js`.
4. For a live background, create it with `makeScene("yourtheme", { build() {…}, draw(t, dt) {…} })`
   (see the five examples) and add it to `SCENES`. Pass `front: true` to also draw over the posts on
   `this.fctx`, and `fringe: true` to place swaying corner decorations with `fringeItem()`.

## Live, social and creative features

- **Live updates.** Everyone on a wall is connected to a live stream (`/api/stream`). New posts fly onto everyone's
  screen within a second, likes, reactions and replies update live, and removed posts disappear. Other visitors show
  up as softly drifting lights, with "N here now" in the Discover panel. If the live stream can't connect, the site
  falls back to checking every 20 seconds.
- **Replies on thoughts.** Open a thought to read and write replies (up to 280 characters). Replies can be reported,
  and people can delete their own.
- **Voice notes.** A fifth post type: record up to 30 seconds in the browser (or upload an audio file). Cards show the
  waveform; the viewer has a tappable waveform player. The Android app asks for the microphone only when you tap record.
- **Long videos.** Videos longer than 30 seconds are no longer refused: a trimmer lets you choose which 30 seconds (or
  less) to post. The whole file is uploaded (60 MB limit) and plays only the chosen clip.
- **Photo filters.** Original, Noir, Vintage, Neon, Aurora, Ocean, Sakura, Golden and Jungle; the one matching your
  current theme is marked ✨. Filters are applied in the browser before upload.

## Sharing and private walls

- **Share links.** Every post has a Share button. Links look like `https://your-site/p/<id>` and show a proper
  preview (title, text and a 1200×630 image drawn at upload time) on WhatsApp, X, Facebook, Slack and so on.
  Opening one glides straight to the post. Sealed time capsules only ever preview as a capsule.
- **Private walls.** Under the logo, open the wall menu → **Create a private wall** (for a wedding, class, trip…).
  It gets an unlisted link (`/w/<code>`) and a QR code you can download and print. Anyone with the link can view and
  post. The creator's device becomes the **host** and can remove any post or reply on that wall. Reports from private
  walls still reach your admin page. Wall links can be opened in the Android app via the wall menu → *Join with a link*.

## Little delights

- **Tap the world.** Tapping an empty spot makes a ripple, and the animated themes answer: frogs croak and hop and
  fireflies scatter (Amazon), jellyfish jet away and the plankton lights up (Deep Ocean), a supernova (Universe),
  a gust of petals (Sakura), lightning and thunder (Noir), the koi swim to your finger (Neo Tokyo), and a shooting
  star (Aurora, Sahara).
- **On this day.** If someone posted a year, a month or a week ago today, a card offers to time-travel you there.
- **Today's question.** A daily question (the same for everyone, 60 in rotation) sits at the top of Discover.
  **Answer** opens a thought tagged with the question; **See answers** shows everyone's. Edit the list in `PROMPTS`
  in `public/script.js` (and `PROMPT_COUNT` in `server.js` if you change how many there are).
- **Calm mode.** In the theme menu: pauses every animation (backgrounds become still pictures, effects and
  transitions are skipped). People with "reduce motion" turned on in their device settings get this automatically.

## Moderation

- **Community rules.** People accept the rules before their first post (the server refuses posts without that).
  Anyone can reread them from Discover → *Community rules*, or by opening `yoursite/#rules`.
- **Report.** Every post and reply has a Report button with reasons. The post is hidden for the reporter straight away.
  When `REPORT_HIDE_THRESHOLD` different people (default 3) report a post, it's hidden for everyone until reviewed.
- **Block.** Hides all posts from that person on the blocker's device. People are told apart by an anonymous
  ID (a hashed random device ID), never by name.
- **Admin page.** Start the server with `ADMIN_TOKEN=some-long-secret` and open **`/admin.html`**. For each
  reported post you can **keep it** (dismiss the reports), **remove it**, or **remove and ban the poster**
  (deletes all their posts and stops their device posting). Bans are by device. Set `BAN_BY_IP=true` to also ban
  their IP address, but be careful: phone networks often share one IP among many people.
- **Privacy policy.** `public/privacy.html` is a starting point. Fill in the highlighted parts (your name,
  contact email, date, minimum age) and have it checked for your country before launch.

## Settings worth knowing

| Setting | Where | Default |
| --- | --- | --- |
| Max video length | `MAX_VIDEO_SECONDS` in `server.js` and `public/script.js` | 30 |
| Max video size | `MAX_VIDEO_BYTES` (server), `MAX_VIDEO_MB` (browser) | 60 MB |
| Posts per IP per 10 minutes | `POSTS_PER_10_MIN` in `server.js` | 30 |
| Reactions per IP per 10 minutes | `REACTIONS_PER_10_MIN` in `server.js` | 300 |
| Max thought length | `THOUGHT_MAX` in `server.js` and `public/script.js` | 500 |
| Check for new posts and reactions | `POLL_MS` in `public/script.js` | 20 s |

## Before going public

This is a solid starting point for a small community, but a public site needs a few more things:

- **Moderation.** Reports, blocking and an admin queue are built in (see Moderation above). For a large audience,
  consider adding an automatic image/video screening service as well.
- **Storage.** Move uploads to object storage (S3, Cloudflare R2, Cloudinary) and posts to a real database
  (SQLite, Postgres) once traffic grows. The JSON file is rewritten on every change.
- **Accounts** if you want people to manage their posts across devices.
- **HTTPS**, which most hosts (Render, Railway, Fly.io) provide automatically.
