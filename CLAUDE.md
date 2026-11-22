# Family World Window – notes for Claude

A personal webcam wall: live views, local time and weather from the places
that matter to one family. Built as a vibe-coding **learning project**, so
explain changes in plain language and keep the code readable for a beginner.

Live site: https://epkoski-cmd.github.io/world-windows/ (GitHub Pages, `main` branch root).
Ideas and next steps live in `IDEAS.md`.

## Who uses it
- Family and friends, **mostly on phones**, opening links sent through **WhatsApp**.
- Test every feature at phone width and think about how a link looks when pasted into a chat.

## How the code is laid out
- Plain HTML, CSS and JavaScript. No frameworks, no build step, no npm.
- `cams.js` – the camera catalogue (`CAMS`) and the family wall (`DEFAULT_PLACES`).
  Catalogue `id`s appear in share links: **never rename or remove one**.
- `app.js` – tiles, edit mode, saving, share links, the add-a-place dialog, clocks, weather.
- `style.css` – dark theme; edit-only controls show under `body.editing`.
- `index.html` – page shell, footer attributions, GoatCounter visit counter.

## Rules learned the hard way
- **Bump `?v=N` in `index.html`** (CSS and both scripts) whenever a file changes,
  or browsers keep the old version. Open pages compare their `app.js?v=` with
  the live `index.html` and reload themselves once when it's newer.
- **No `confirm()` or `prompt()` pop-ups**: phone browsers block them silently.
  Use a tap-again confirmation instead (see the Restore tile).
- **Share links must stay short and readable**: plain URL for the family wall,
  otherwise `#p=...`. Avoid `* _ ~` in links (WhatsApp turns them into formatting).
  Old `#w=` links must keep working.
- **An empty saved wall falls back to the family places.**
- **Privacy**: no personal descriptions on tiles (e.g. who lives where).
  Walls live only in the visitor's browser; never send them to a server.
- Insert user-supplied text with `textContent` (the `el()` helper), never `innerHTML`.
- Only use cameras whose owners allow embedding. Don't work around blocked
  images or embeds (e.g. spoofed referers).
- **Never remove a dead camera**: give it `replacedBy: "<new id>"` so old walls
  and links switch to the new one. Check a YouTube stream is live with
  `curl -s -A "Mozilla/5.0" "https://www.youtube.com/watch?v=ID" | grep -o '"isLiveNow":[a-z]*'`.
- Check that a YouTube preview picture shows the real current view
  (`livePreview: true`) or it gets dimmed and labelled as a channel picture.

## Data sources
- Weather and city search: Open-Meteo (no key).
- Finnish road cams: Fintraffic Digitraffic (CC BY 4.0). Skip presets ending in `09`
  (road surface). Offline cams return a 9897-byte placeholder.
- YouTube live streams load only after "Watch live" is pressed, to limit ads.
- Windy Webcams API v3: free key `WINDY_KEY` in `app.js`, visible on purpose,
  restricted to `github.io`. Picture URLs can expire, so they're fetched fresh on
  load and every 10 min (one batched `webcamIds=` request). Each picture links
  back to its Windy page; footer credits windy.com. The key is refused on
  `localhost`, so test Windy tiles on the live site (or feed the page saved answers).

## Daily camera check
- `.github/workflows/check-cameras.yml` runs `scripts/check_cameras.py` every
  morning. If a camera has stopped, it opens a `dead-camera` issue (or comments on
  the open one). Run it by hand: `gh workflow run check-cameras.yml`; add
  `-f include_replaced=true` for a test run that always finds the old Jersey City stream.
- GitHub pauses scheduled workflows after 60 days without commits; re-enable under Actions.
- YouTube answers GitHub's computers with "Sign in to confirm you're not a bot",
  so YouTube streams show as "couldn't be checked" there. Don't work around that
  check; the proper fix is the YouTube Data API (see IDEAS.md).

## Working on it
- Run locally: `python3 -m http.server 8080` in this folder, then open http://localhost:8080.
  (The preview tool can't start Python in ~/Documents, so start it from the shell
  and attach the preview to the URL.)
- Test in the browser pane at desktop **and** phone width before committing.
- Deploy: commit and push to `main`, then wait for the Pages run (`gh run watch`).
- Git identity in this repo uses the GitHub noreply email.
