// Family World Window — a wall of live views from the places that matter to you.
//
// How it fits together:
//   cams.js   – the camera catalogue and the default wall
//   app.js    – this file: builds the tiles, edit mode, sharing, weather
//
// Your wall (the list of places) is remembered in this browser.
// The Share button gives the plain site address for the family wall,
// or a short readable link (#p=Jersey+City/Kuressaare) for any other wall.

const wall = document.getElementById("wall");
const STORAGE_KEY = "worldwindows.places";

// ============================================================
//  Small helpers
// ============================================================

// Distance in km between two points on Earth
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Pull the 11-character video id out of any kind of YouTube address
function youtubeId(text) {
  const m = String(text).match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(text.trim()) ? text.trim() : null;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text; // textContent: safe for any text
  return e;
}

function toast(message) {
  const t = el("div", "toast", message);
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

// ============================================================
//  Cameras: turning a place's `cam` into something we can show
// ============================================================
//
// A place's cam is one of:
//   "tokyo-shibuya"                       – an id from the catalogue (cams.js)
//   { yt: "VIDEO_ID" }                    – someone's own YouTube live link
//   { fi: "C0350501", w: "…", a: lat, o: lon } – a Finnish road cam (Fintraffic)
//   null                                  – no camera: show the sky instead

function resolveCam(cam) {
  if (!cam) return null;
  if (typeof cam === "string") return CAMS.find((c) => c.id === cam) || null;
  if (cam.yt && /^[\w-]{11}$/.test(cam.yt)) {
    return { type: "youtube", video: cam.yt, caption: "YouTube live stream" };
  }
  if (cam.fi && /^C\d{7}$/.test(cam.fi)) {
    return {
      type: "image",
      url: `https://weathercam.digitraffic.fi/${cam.fi}.jpg`,
      caption: "Road cam · Fintraffic",
      where: cam.w, lat: cam.a, lon: cam.o,
    };
  }
  return null;
}

function cameraCaption(place, cam) {
  if (!cam) return "No camera nearby · showing the sky";
  let text = cam.caption;
  if (cam.where) text += ` · ${cam.where}`;
  if (cam.lat !== undefined) {
    const km = distanceKm(place.lat, place.lon, cam.lat, cam.lon);
    if (km >= 10) text +=` (${Math.round(km)} km away)`;
  }
  return text;
}

// ============================================================
//  Saving and loading the wall
// ============================================================

// Places are packed small for the link: [name, lat, lon, timeZone, cam]
function pack(places) {
  const rows = places.map((p) => [p.name, +p.lat.toFixed(4), +p.lon.toFixed(4), p.tz, p.cam]);
  const bytes = new TextEncoder().encode(JSON.stringify(rows));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unpack(code) {
  const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const rows = JSON.parse(new TextDecoder().decode(bytes));
  // Check everything, because links can come from anywhere
  return rows
    .filter((r) => Array.isArray(r) && typeof r[0] === "string" && isFinite(r[1]) && isFinite(r[2]))
    .map(([name, lat, lon, tz, cam]) => ({
      name: name.slice(0, 60), lat: +lat, lon: +lon,
      tz: isValidTimeZone(tz) ? tz : "UTC",
      cam: cam ?? null,
    }));
}

function isValidTimeZone(tz) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; }
  catch { return false; }
}

// ---------- Short, readable share links ----------
//
// A wall in a link looks like:   #p=Jersey+City/Kuressaare/Calahonda
//   • places are separated by "/"
//   • a family place (from DEFAULT_PLACES) is just its name, spaces as "+"
//   • any other place is  name,lat,lon,time.zone,camera
//     e.g.  Puumala,61.52,28.18,Europe.Helsinki,fi.C1053902
//     (the "/" in time zones is written as ".", cameras are a catalogue id,
//      yt.VIDEO_ID, fi.FINTRAFFIC_ID, or empty for no camera)
// Characters like * _ ~ are avoided: WhatsApp would turn them into formatting.

const enc = (s) => encodeURIComponent(s).replace(/%20/g, "+");
const dec = (s) => decodeURIComponent(s.replace(/\+/g, " "));

function sameCam(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function isFamilyPlace(p) {
  return DEFAULT_PLACES.some((d) => d.name === p.name && sameCam(d.cam, p.cam));
}

function camToText(cam) {
  if (!cam) return "";
  if (typeof cam === "string") return cam;
  if (cam.yt) return `yt.${cam.yt}`;
  if (cam.fi) return `fi.${cam.fi}`;
  return "";
}

function camFromText(t) {
  if (!t) return null;
  if (t.startsWith("yt.")) return { yt: t.slice(3) };
  if (t.startsWith("fi.")) return { fi: t.slice(3) };
  return t; // catalogue id
}

function toLink(places) {
  return places
    .map((p) =>
      isFamilyPlace(p)
        ? enc(p.name)
        : [enc(p.name), p.lat.toFixed(2), p.lon.toFixed(2), p.tz.replace(/\//g, "."), camToText(p.cam)].join(","),
    )
    .join("/");
}

function fromLink(text) {
  return text.split("/").filter(Boolean).map((token) => {
    const [name, lat, lon, tz, cam] = token.split(",").map(dec);
    if (lat === undefined) {
      const family = DEFAULT_PLACES.find((d) => d.name.toLowerCase() === name.toLowerCase());
      return family ? { ...family } : null;
    }
    if (!isFinite(lat) || !isFinite(lon)) return null;
    const zone = (tz || "").replace(/\./g, "/");
    return {
      name: name.slice(0, 60), lat: +lat, lon: +lon,
      tz: isValidTimeZone(zone) ? zone : "UTC",
      cam: camFromText(cam),
    };
  }).filter(Boolean);
}

// The address to share: the plain site for the family wall, otherwise a short link
function shareAddress() {
  const base = location.origin + location.pathname;
  const isFamilyWall =
    places.length === DEFAULT_PLACES.length && places.every((p, i) =>
      p.name === DEFAULT_PLACES[i].name && sameCam(p.cam, DEFAULT_PLACES[i].cam));
  return isFamilyWall ? base : `${base}#p=${toLink(places)}`;
}

// The wall this browser has saved as "mine" (or null if none yet)
function savedCode() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function rememberAsMine(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage blocked: fine */ }
}

// true while looking at someone else's wall from a shared link.
// Edits then only change the link, never this browser's own saved wall.
let viewingShared = false;

// A fresh copy of the default wall from cams.js
function familyPlaces() {
  return DEFAULT_PLACES.map((p) => ({ ...p }));
}

// The wall in the address, if there is one: new short links (#p=…)
// or the older long ones (#w=…) that may already have been shared
function wallFromAddress() {
  try {
    const short = location.hash.match(/^#p=(.+)$/);
    if (short) return fromLink(short[1]);
    const long = location.hash.match(/^#w=([\w-]+)$/);
    if (long) return unpack(long[1]);
  } catch (e) { console.warn("Bad link", e); }
  return null;
}

function clearAddress() {
  history.replaceState(null, "", location.pathname);
}

function loadPlaces() {
  viewingShared = false;
  const mine = savedCode();
  let myPlaces = null;
  if (mine) {
    try { myPlaces = unpack(mine); } catch (e) { /* broken: ignore */ }
    if (myPlaces && myPlaces.length === 0) myPlaces = null; // emptied wall → family places
  }

  const shared = wallFromAddress();
  if (shared && shared.length > 0) {
    if (!myPlaces) {
      rememberAsMine(pack(shared)); // first visit: the shared wall becomes theirs
      clearAddress();
    } else if (pack(shared) === pack(myPlaces)) {
      clearAddress(); // it's their own wall anyway
    } else {
      viewingShared = true; // they already have their own wall: keep it safe
    }
    return shared;
  }
  if (location.hash) clearAddress();
  return myPlaces || familyPlaces();
}

// Your own wall is saved in this browser and the address stays clean.
// While viewing someone else's wall, edits only change the address.
function savePlaces() {
  if (viewingShared) {
    history.replaceState(null, "", `${location.pathname}#p=${toLink(places)}`);
  } else {
    rememberAsMine(pack(places));
    clearAddress();
  }
}

let places = loadPlaces();

// ---------- The "you're viewing a shared wall" banner ----------

const banner = document.getElementById("shared-banner");

function updateBanner() {
  banner.hidden = !viewingShared;
}

document.getElementById("save-shared").addEventListener("click", () => {
  viewingShared = false;
  savePlaces();
  updateBanner();
  toast("Saved! This is now your wall in this browser.");
});

document.getElementById("back-to-mine").addEventListener("click", () => {
  const mine = savedCode();
  viewingShared = false;
  places = mine ? unpack(mine) : familyPlaces();
  if (places.length === 0) places = familyPlaces();
  clearAddress();
  render();
});

// Pasting a different link into the same tab only changes the "#…" part,
// which doesn't reload the page, so reload the wall ourselves.
window.addEventListener("hashchange", () => {
  places = loadPlaces();
  render();
});

// ============================================================
//  Building the tiles
// ============================================================

function makeView(place, cam) {
  const view = el("div", "view");

  if (cam && cam.type === "youtube") {
    showYoutubePreview(view, place, cam);
  } else if (cam && cam.type === "image") {
    // Still camera: add ?t=… so the browser fetches a fresh copy, not a cached one
    const img = document.createElement("img");
    img.alt = `Camera near ${place.name}`;
    const reload = () => (img.src = `${cam.url}?t=${Date.now()}`);
    reload();
    place.timers.push(setInterval(reload, 10 * 60 * 1000));
    view.append(img, el("span", "badge", "Updates every 10 min"));
  } else {
    // No camera: a sky that follows day/night and the weather
    view.classList.add("sky");
    view.append(el("span", "sky-icon", "…"));
  }
  return view;
}

// YouTube tiles start as a still preview. The video (and any ads the stream
// owner has switched on) only loads when someone presses "Watch live".
function showYoutubePreview(view, place, cam) {
  (place.timers || []).forEach(clearInterval);
  place.timers = [];
  view.replaceChildren();

  // YouTube keeps a preview frame of each live stream, updated every few minutes.
  // Try the sharp version first; not every stream has one, so fall back.
  const img = document.createElement("img");
  img.alt = `Preview of the live view near ${place.name}`;
  const base = `https://i.ytimg.com/vi/${cam.video}`;
  const load = () => {
    img.dataset.fallback = "";
    img.src = `${base}/maxresdefault_live.jpg?t=${Date.now()}`;
  };
  const fallback = () => {
    if (!img.dataset.fallback) {
      img.dataset.fallback = "1";
      img.src = `${base}/hqdefault_live.jpg?t=${Date.now()}`;
    }
  };
  img.addEventListener("error", fallback);
  // A missing picture sometimes arrives as a tiny 120×90 grey placeholder instead of an error
  img.addEventListener("load", () => { if (img.naturalWidth <= 120) fallback(); });
  load();
  place.timers.push(setInterval(load, 5 * 60 * 1000));

  const play = el("button", "watch-live", "▶ Watch live");
  play.addEventListener("click", () => playYoutube(view, place, cam));

  // Many channels show a promo picture instead of the current view
  // (a sunny summer photo at midnight). Dim those so nobody is fooled.
  const badge = cam.livePreview
    ? el("span", "badge", "Preview · updates every 5 min")
    : el("span", "badge", "Channel picture · not the current view");
  if (!cam.livePreview) img.classList.add("promo");

  view.append(img, badge, play);
}

function playYoutube(view, place, cam) {
  (place.timers || []).forEach(clearInterval);
  place.timers = [];
  // mute=1 is needed for autoplay; playsinline keeps it in the tile on phones
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube.com/embed/${cam.video}?autoplay=1&mute=1&playsinline=1&rel=0`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.title = `Live view near ${place.name}`;

  const close = el("button", "close-live", "✕ Stop");
  close.title = "Stop the video and go back to the preview";
  close.addEventListener("click", () => showYoutubePreview(view, place, cam));

  view.replaceChildren(iframe, close);
}

function makeTile(place, index) {
  const cam = resolveCam(place.cam);
  const tile = el("article", "tile");
  place.timers = [];
  place.view = makeView(place, cam);
  tile.append(place.view);

  const info = el("div", "info");
  info.append(
    el("div", "name", place.name),
    el("div", "time", "--:--"),
    el("div", "weather", "Loading weather…"),
    el("div", "day-note"),
    el("div", "sun"),
    el("div", "caption", cameraCaption(place, cam)),
  );

  // Edit controls (only visible in edit mode)
  const controls = el("div", "edit-controls");
  const btn = (label, title, onClick, disabled) => {
    const b = el("button", "", label);
    b.title = title;
    b.disabled = disabled;
    b.addEventListener("click", onClick);
    controls.append(b);
  };
  btn("◀", "Move left", () => movePlace(index, -1), index === 0);
  btn("▶", "Move right", () => movePlace(index, +1), index === places.length - 1);
  btn("✕ Remove", "Remove this place", () => removePlace(index));
  info.append(controls);

  tile.append(info);
  place.el = info;
  return tile;
}

function render() {
  // Stop timers of the old tiles before throwing them away
  places.forEach((p) => (p.timers || []).forEach(clearInterval));
  wall.replaceChildren();

  places.forEach((place, i) => wall.append(makeTile(place, i)));

  // The "add a place" tile, shown in edit mode
  const add = el("button", "tile add-tile");
  add.append(el("span", "plus", "+"), el("span", "", "Add a place"));
  add.addEventListener("click", openAddDialog);
  wall.append(add);

  // The "restore family places" tile, shown in edit mode
  const restore = el("button", "tile add-tile");
  const restoreLabel = el("span", "", "Restore family places");
  restore.append(el("span", "plus", "↺"), restoreLabel);
  // Ask for a second tap instead of a pop-up: some phone browsers block pop-ups silently
  restore.addEventListener("click", () => {
    if (restore.classList.contains("armed")) return restoreFamilyPlaces();
    restore.classList.add("armed");
    restoreLabel.textContent = "Tap again to replace this wall";
    setTimeout(() => {
      restore.classList.remove("armed");
      restoreLabel.textContent = "Restore family places";
    }, 4000);
  });
  wall.append(restore);

  // An empty wall: say so, and offer the way back (in and out of edit mode)
  if (places.length === 0) {
    const empty = el("div", "tile empty-wall");
    empty.append(el("p", "", "This wall is empty."));
    const again = el("button", "primary", "↺ Restore family places");
    again.addEventListener("click", restoreFamilyPlaces);
    const addOne = el("button", "", "+ Add a place");
    addOne.addEventListener("click", openAddDialog);
    empty.append(again, addOne);
    wall.prepend(empty);
  }

  updateBanner();
  updateClocks();
  updateWeather();
}

function restoreFamilyPlaces() {
  places = familyPlaces();
  savePlaces();
  render();
  toast("Family places restored.");
}

function movePlace(i, step) {
  const [p] = places.splice(i, 1);
  places.splice(i + step, 0, p);
  savePlaces();
  render();
}

function removePlace(i) {
  places.splice(i, 1);
  savePlaces();
  render();
}

// ============================================================
//  Header buttons: Edit and Share
// ============================================================

const editButton = document.getElementById("edit-button");
const shareButton = document.getElementById("share-button");

function setEditing(on) {
  document.body.classList.toggle("editing", on);
  editButton.textContent = on ? "Done" : "Edit";
}

editButton.addEventListener("click", () =>
  setEditing(!document.body.classList.contains("editing")),
);

shareButton.addEventListener("click", async () => {
  const link = shareAddress();
  const isPlain = !link.includes("#");

  // On phones, open the phone's own share menu (WhatsApp, Messages, …)
  const onPhone = matchMedia("(pointer: coarse)").matches;
  if (onPhone && navigator.share) {
    try {
      await navigator.share({ title: "Family World Window", url: link });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // they closed the share menu
    }
  }

  try {
    await navigator.clipboard.writeText(link);
    toast(isPlain ? "Link copied! It opens the family places." : "Link copied! It opens this wall.");
  } catch {
    prompt("Copy this link:", link);
  }
});

// ============================================================
//  Adding a place
// ============================================================

const dialog = document.getElementById("add-dialog");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const stepSearch = document.getElementById("step-search");
const stepCamera = document.getElementById("step-camera");
const nameInput = document.getElementById("name-input");
const camOptions = document.getElementById("cam-options");
const addConfirm = document.getElementById("add-confirm");
let chosenCity = null;

function openAddDialog() {
  chosenCity = null;
  searchInput.value = "";
  searchResults.replaceChildren();
  stepSearch.hidden = false;
  stepCamera.hidden = true;
  addConfirm.hidden = true;
  dialog.showModal();
  searchInput.focus();
}

document.getElementById("add-cancel").addEventListener("click", () => dialog.close());

// Search cities as you type (waits until you pause typing for a moment)
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchCities, 300);
});

async function searchCities() {
  const q = searchInput.value.trim();
  if (q.length < 2) return searchResults.replaceChildren();
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`;
    const data = await (await fetch(url)).json();
    searchResults.replaceChildren();
    for (const r of data.results || []) {
      const b = el("button", "result");
      b.append(
        el("strong", "", r.name),
        el("span", "", " " + [r.admin2, r.admin1, r.country].filter(Boolean).join(", ")),
      );
      b.addEventListener("click", () => chooseCity(r));
      searchResults.append(b);
    }
    if (!data.results) searchResults.append(el("p", "hint", "No places found."));
  } catch {
    searchResults.replaceChildren(el("p", "hint", "Search failed. Check your connection."));
  }
}

// Fintraffic road cameras (only fetched when someone adds a place in Finland)
let finnishCamsPromise = null;
function finnishRoadCams() {
  finnishCamsPromise ??= fetch("https://tie.digitraffic.fi/api/weathercam/v1/stations")
    .then((r) => r.json())
    .then((d) =>
      d.features
        .filter((f) => f.properties.collectionStatus === "GATHERING")
        .map((f) => {
          // Skip presets ending in 09: those point down at the road surface
          const preset = f.properties.presets.find((p) => p.inCollection && !p.id.endsWith("09"));
          const [lon, lat] = f.geometry.coordinates;
          // "vt13_Ostolahti" → "Ostolahti"
          const where = f.properties.name.replace(/^[a-z]+\d*_/i, "").replace(/_/g, " ");
          return preset && { fi: preset.id, w: where, a: lat, o: lon };
        })
        .filter(Boolean),
    );
  return finnishCamsPromise;
}

async function chooseCity(r) {
  chosenCity = r;
  stepSearch.hidden = true;
  stepCamera.hidden = false;
  addConfirm.hidden = false;
  nameInput.value = r.name;
  camOptions.replaceChildren(el("p", "hint", "Looking for cameras nearby…"));

  // Collect camera suggestions, nearest first
  const options = CAMS.map((c) => ({
    value: c.id, cam: c, km: distanceKm(r.latitude, r.longitude, c.lat, c.lon),
  }));
  if (r.country_code === "FI") {
    try {
      for (const fc of await finnishRoadCams()) {
        options.push({ value: fc, cam: resolveCam(fc), km: distanceKm(r.latitude, r.longitude, fc.a, fc.o) });
      }
    } catch { /* road cams unavailable right now */ }
  }
  options.sort((a, b) => a.km - b.km);
  const nearby = options.filter((o) => o.km < 300).slice(0, 5);

  camOptions.replaceChildren();
  const radio = (label, sub, value, checked) => {
    const row = el("label", "cam-option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "cam";
    input.checked = checked;
    input.camValue = value;
    row.append(input, el("span", "", label));
    if (sub) row.append(el("small", "", sub));
    camOptions.append(row);
    return input;
  };

  nearby.forEach((o, i) =>
    radio(`${o.cam.caption} · ${o.cam.where}`, `${Math.round(o.km)} km away`, o.value, i === 0),
  );
  const ytRadio = radio("My own YouTube live link", "Paste the address of a live stream", "youtube", false);
  const ytInput = el("input", "yt-input");
  ytInput.placeholder = "https://www.youtube.com/watch?v=…";
  ytInput.addEventListener("focus", () => (ytRadio.checked = true));
  camOptions.append(ytInput);
  radio("No camera", "Shows the sky: day or night, and the weather", null, nearby.length === 0);
}

addConfirm.addEventListener("click", () => {
  if (!chosenCity) return;
  const picked = camOptions.querySelector("input[type=radio]:checked");
  let cam = picked ? picked.camValue : null;
  if (cam === "youtube") {
    const id = youtubeId(camOptions.querySelector(".yt-input").value);
    if (!id) return toast("That doesn't look like a YouTube link.");
    cam = { yt: id };
  }
  places.push({
    name: nameInput.value.trim() || chosenCity.name,
    lat: chosenCity.latitude,
    lon: chosenCity.longitude,
    tz: chosenCity.timezone,
    cam,
  });
  dialog.close();
  savePlaces();
  render();
});

// ============================================================
//  Clocks
// ============================================================

function dayKey(date, timeZone) {
  return date.toLocaleDateString("en-CA", { timeZone }); // e.g. "2026-11-18"
}

function updateClocks() {
  const now = new Date();
  const myDay = dayKey(now, Intl.DateTimeFormat().resolvedOptions().timeZone);

  places.forEach((place) => {
    const time = now.toLocaleTimeString("en-GB", { timeZone: place.tz, hour: "2-digit", minute: "2-digit" });
    const theirDay = dayKey(now, place.tz);
    let note = now.toLocaleDateString("en-GB", { timeZone: place.tz, weekday: "short" });
    if (theirDay > myDay) note += " · tomorrow";
    if (theirDay < myDay) note += " · yesterday";
    place.el.querySelector(".time").textContent = time;
    place.el.querySelector(".day-note").textContent = note;
  });
}

setInterval(updateClocks, 15 * 1000);

// ============================================================
//  Weather (Open-Meteo: free, no key needed)
// ============================================================

// WMO weather codes → emoji + words
const WEATHER = {
  0: ["☀️", "Clear"], 1: ["🌤️", "Mostly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Cloudy"],
  45: ["🌫️", "Fog"], 48: ["🌫️", "Icy fog"],
  51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌧️", "Heavy drizzle"],
  56: ["🌧️", "Freezing drizzle"], 57: ["🌧️", "Freezing drizzle"],
  61: ["🌧️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
  66: ["🌧️", "Freezing rain"], 67: ["🌧️", "Freezing rain"],
  71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["❄️", "Heavy snow"], 77: ["🌨️", "Snow grains"],
  80: ["🌦️", "Showers"], 81: ["🌧️", "Showers"], 82: ["⛈️", "Heavy showers"],
  85: ["🌨️", "Snow showers"], 86: ["❄️", "Snow showers"],
  95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm, hail"], 99: ["⛈️", "Thunderstorm, hail"],
};

const hhmm = (isoLocal) => isoLocal.slice(11, 16); // "2026-11-18T08:41" → "08:41"

async function updateWeather() {
  if (places.length === 0) return;
  const forPlaces = places; // the list may change while we wait
  const lats = forPlaces.map((p) => p.lat).join(",");
  const lons = forPlaces.map((p) => p.lon).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&forecast_days=2&timezone=auto`;

  try {
    let data = await (await fetch(url)).json();
    if (!Array.isArray(data)) data = [data]; // a single place comes back as one object
    if (forPlaces !== places) return; // wall changed meanwhile; a newer update is coming

    data.forEach((w, i) => {
      const place = forPlaces[i];
      let [icon, words] = WEATHER[w.current.weather_code] || ["", "—"];
      const isDay = w.current.is_day === 1;
      // No sun at night: clear / mostly clear skies get a moon instead
      if (!isDay && w.current.weather_code <= 1) icon = "🌙";
      place.el.querySelector(".weather").textContent = `${icon} ${Math.round(w.current.temperature_2m)}°C · ${words}`;

      // After sunset, the next sunrise is tomorrow's (index 1)
      const nextSunrise = w.current.time > w.daily.sunrise[0] ? w.daily.sunrise[1] : w.daily.sunrise[0];
      const sun = place.el.querySelector(".sun");
      sun.className = `sun ${isDay ? "day" : "night"}`;
      sun.textContent = isDay ? `☀ Sunset ${hhmm(w.daily.sunset[0])}` : `☾ Sunrise ${hhmm(nextSunrise)}`;

      // Sky tiles (no camera) follow day/night and show the weather icon
      if (place.view.classList.contains("sky")) {
        place.view.classList.toggle("night", !isDay);
        place.view.querySelector(".sky-icon").textContent = icon;
      }
    });
  } catch (err) {
    console.error("Weather failed:", err);
    forPlaces.forEach((p) => (p.el.querySelector(".weather").textContent = "Weather unavailable"));
  }
}

setInterval(updateWeather, 15 * 60 * 1000);

// ============================================================
//  Start
// ============================================================

render();
