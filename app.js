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

// Key for the Windy Webcams API (free). Anyone can see it here, which is
// normal for a site without a server: Windy only accepts it from github.io
// pages, and if it's ever misused we make a new one at api.windy.com/keys.
const WINDY_KEY = "QZSqtvmzCOG1oaPlge5gxlQmnSJwsSM3";
const WINDY_API = "https://api.windy.com/webcams/api/v3/webcams";

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
//   { windy: "1649025487" }               – any webcam on windy.com
//   null                                  – no camera: show the sky instead

function resolveCam(cam) {
  if (!cam) return null;
  if (typeof cam === "string") {
    const found = CAMS.find((c) => c.id === cam);
    // A camera that stopped working may point to a replacement
    if (found && found.replacedBy) return resolveCam(found.replacedBy);
    return found || null;
  }
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
  if (cam.windy && /^\d{6,12}$/.test(cam.windy)) {
    // Its name and location arrive later, from Windy (see updateWindy)
    return { type: "windy", windy: cam.windy, caption: "Webcam via Windy" };
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
//      yt.VIDEO_ID, fi.FINTRAFFIC_ID, windy.WEBCAM_ID, or empty for no camera)
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
  if (cam.windy) return `windy.${cam.windy}`;
  return "";
}

function camFromText(t) {
  if (!t) return null;
  if (t.startsWith("yt.")) return { yt: t.slice(3) };
  if (t.startsWith("fi.")) return { fi: t.slice(3) };
  if (t.startsWith("windy.")) return { windy: t.slice(6) };
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
  } else if (cam && cam.type === "windy") {
    // Windy pictures: updateWindy() fills in the picture and the badge.
    // Windy asks that every picture links back to the camera's page there.
    const link = el("a", "preview");
    link.href = `https://windy.com/webcams/${cam.windy}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = "Open this webcam on windy.com";
    const img = document.createElement("img");
    img.alt = `Camera near ${place.name}`;
    link.append(img);
    // Shown at night only: switch between the dark picture and the last daylight one
    const dayNight = el("button", "close-live day-night");
    dayNight.hidden = true;
    dayNight.addEventListener("click", () => {
      place.showDaylight = !place.showDaylight;
      showWindyPicture(place);
    });
    view.append(link, el("span", "badge", "Loading picture…"), dayNight);
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
  place.camInfo = cam; // remembered for updateWindy
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
  btn("Change camera", "Pick a different camera for this place", () => openChangeDialog(index));
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
  updateWindy();
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
const dialogTitle = dialog.querySelector("h2");
let chosenCity = null;
// The same dialog also changes the camera of a place already on the wall.
// Then this holds that place's number; when adding a new place it's null.
let changingIndex = null;

function openAddDialog() {
  chosenCity = null;
  changingIndex = null;
  dialogTitle.textContent = "Add a place";
  addConfirm.textContent = "Add to wall";
  searchInput.value = "";
  searchResults.replaceChildren();
  stepSearch.hidden = false;
  stepCamera.hidden = true;
  addConfirm.hidden = true;
  dialog.showModal();
  searchInput.focus();
}

// "Change camera" on a tile: skip the search and go straight to the camera choices
function openChangeDialog(i) {
  const p = places[i];
  changingIndex = i;
  dialogTitle.textContent = "Change camera";
  addConfirm.textContent = "Save";
  dialog.showModal();
  // Places don't remember their country, but Finnish time zones mean Finland
  // (that's what decides whether to suggest Fintraffic road cams)
  const inFinland = p.tz === "Europe/Helsinki" || p.tz === "Europe/Mariehamn";
  chooseCity(
    { name: p.name, latitude: p.lat, longitude: p.lon, timezone: p.tz, country_code: inFinland ? "FI" : "" },
    p.cam,
  );
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

// Fintraffic road cameras (only fetched when someone adds a place in Finland).
// Two lists: where the cameras are, and when each one last took a picture.
let finnishCamsPromise = null;
function finnishRoadCams() {
  const getJson = (url) => fetch(url).then((r) => r.json());
  finnishCamsPromise ??= Promise.all([
    getJson("https://tie.digitraffic.fi/api/weathercam/v1/stations"),
    getJson("https://tie.digitraffic.fi/api/weathercam/v1/stations/data"),
  ]).then(([stations, data]) => {
    // When did each camera last take a picture? e.g. { C0162302: "2026-09-14T02:50:05Z" }
    const lastPicture = {};
    for (const s of data.stations) for (const p of s.presets) lastPicture[p.id] = p.measuredTime;

    return stations.features
      .filter((f) => f.properties.collectionStatus === "GATHERING")
      .map((f) => {
        // Skip presets ending in 09: those point down at the road surface
        const preset = f.properties.presets.find((p) => p.inCollection && !p.id.endsWith("09"));
        if (!preset) return null;
        // Skip cameras with no picture in the last 3 hours: they're offline
        // and would only show Fintraffic's "Image not available" picture
        const taken = new Date(lastPicture[preset.id]);
        if (!(Date.now() - taken < 3 * 3600000)) return null;
        const [lon, lat] = f.geometry.coordinates;
        // "vt13_Ostolahti" → "Ostolahti"
        const where = f.properties.name.replace(/^[a-z]+\d*_/i, "").replace(/_/g, " ");
        return { fi: preset.id, w: where, a: lat, o: lon };
      })
      .filter(Boolean);
  });
  return finnishCamsPromise;
}

// Road cams are useful, but a whole list of motorways isn't much of a view.
function isRoadCam(option) {
  return Boolean(option.value.fi) || Boolean(option.cam.url && option.cam.url.includes("digitraffic"));
}

// Many Windy cameras in Finland are Fintraffic's road cams shown again, with
// titles like "Espoo: Tie 1 - Lommila" or "Espoo › North: Kehä I" (tie = road,
// kehä = ring road). In Finland we already have those from Fintraffic.
function isFinnishRoadOnWindy(title) {
  return /(^|: )(Tie ?\d|Kehä\s)/.test(title);
}

// `current` is the camera a place already has (only when changing its camera),
// so that one starts out selected.
async function chooseCity(r, current) {
  chosenCity = r;
  stepSearch.hidden = true;
  stepCamera.hidden = false;
  // The Save / Add button waits until the camera choices are shown: pressed
  // earlier, nothing would be selected and the place would lose its camera.
  addConfirm.hidden = true;
  nameInput.value = r.name;
  camOptions.replaceChildren(el("p", "hint", "Looking for cameras nearby…"));
  // Is it dark there now? Asked straight away, while we look for cameras.
  const nightCheck = isNightAt(r.latitude, r.longitude);

  // Collect camera suggestions, nearest first
  const options = CAMS.filter((c) => !c.replacedBy).map((c) => ({
    value: c.id, cam: c, km: distanceKm(r.latitude, r.longitude, c.lat, c.lon),
  }));
  if (r.country_code === "FI") {
    try {
      for (const fc of await finnishRoadCams()) {
        // Skip road cams that are already in our own list
        if (CAMS.some((c) => c.url && c.url.includes(fc.fi))) continue;
        options.push({ value: fc, cam: resolveCam(fc), km: distanceKm(r.latitude, r.longitude, fc.a, fc.o) });
      }
    } catch { /* road cams unavailable right now */ }
  }
  // Windy also sends a small picture of each camera, kept here by camera number
  const windyPics = {};
  try {
    for (const o of await windyNearby(r.latitude, r.longitude)) {
      windyPics[o.value.windy] = o.pic;
      // Skip Windy cameras that are already in our own list
      if (CAMS.some((c) => c.windy === o.value.windy)) continue;
      if (r.country_code === "FI" && isFinnishRoadOnWindy(o.cam.caption)) continue;
      options.push(o);
    }
  } catch { /* Windy unavailable right now */ }
  options.sort((a, b) => a.km - b.km);

  // Pick 5 to show: the nearest, but at most 2 road cams, so other views get a turn.
  // (If there aren't enough other cameras, more road cams fill the gaps.)
  const all = options.filter((o) => o.km < 300);
  const nearby = [];
  let roadCams = 0;
  for (const o of all) {
    if (nearby.length === 5) break;
    if (isRoadCam(o)) {
      if (roadCams === 2) continue;
      roadCams++;
    }
    nearby.push(o);
  }
  for (const o of all) {
    if (nearby.length === 5) break;
    if (!nearby.includes(o)) nearby.push(o);
  }
  nearby.sort((a, b) => a.km - b.km);
  // The rest wait behind a "Show more cameras" button
  let more = all.filter((o) => !nearby.includes(o)).slice(0, 15);
  const isNight = await nightCheck;

  camOptions.replaceChildren();
  const radio = (label, sub, value, checked, thumb, parent = camOptions) => {
    const row = el("label", "cam-option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "cam";
    input.checked = checked;
    input.camValue = value;
    row.append(input, el("span", "", label));
    row.title = label; // the full name, in case it's cut short on screen
    if (sub) row.append(el("small", "", sub));
    if (thumb) row.append(thumb);
    parent.append(row);
    return input;
  };
  // One suggested camera: its name, how far away it is, and a small picture
  const suggestion = (o, checked, parent) => {
    const thumb = camThumb(o.cam, windyPics, isNight);
    const sub = [`${Math.round(o.km)} km away`, thumb && thumb.note].filter(Boolean).join(" · ");
    radio(`${o.cam.caption} · ${o.cam.where}`, sub, o.value, checked, thumb && thumb.el, parent);
  };

  // Our camera list is still small, so say so instead of silently showing nothing
  if (nearby.length === 0) {
    camOptions.append(el("p", "notice",
      `No cameras near ${r.name} in our list yet. More are coming. For now, ` +
      `add it without a camera (the tile shows the sky and weather), or paste a YouTube live link.`));
  } else if (nearby[0].km > 50) {
    camOptions.append(el("p", "notice",
      `The closest cameras we know are ${Math.round(nearby[0].km)} km or more from ${r.name}.`));
  }

  // Which choice starts out selected?
  const changing = current !== undefined;
  const isCurrent = (value) => changing && sameCam(value, current);
  const currentIsYoutube = changing && current && current.yt;
  const currentInList = nearby.some((o) => isCurrent(o.value));

  // Changing to a camera that isn't among the suggestions (e.g. one further away):
  // offer to keep it, at the top
  if (changing && current && !currentIsYoutube && !currentInList) {
    const cam = resolveCam(current);
    if (cam) {
      const thumb = camThumb(cam, windyPics, isNight);
      const label = cam.where ? `${cam.caption} · ${cam.where}` : cam.caption;
      radio(label, "The camera it has now", current, true, thumb && thumb.el);
    }
    // It's already at the top, so don't list it again further down
    more = more.filter((o) => !isCurrent(o.value));
  }

  // When adding a place, start with the nearest camera that isn't a road cam
  const firstChoice = nearby.find((o) => !isRoadCam(o)) || nearby[0];
  nearby.forEach((o) => suggestion(o, changing ? isCurrent(o.value) : o === firstChoice));

  // "Show more cameras": the pictures only load when someone asks for them
  if (more.length > 0) {
    const moreBox = el("div", "more-cams");
    const moreButton = el("button", "show-more", `Show ${more.length} more cameras`);
    moreButton.type = "button";
    moreButton.addEventListener("click", () => {
      more.forEach((o) => suggestion(o, false, moreBox));
      moreButton.remove();
    });
    camOptions.append(moreBox, moreButton);
  }
  const ytRadio = radio("My own YouTube live link", "Paste the address of a live stream", "youtube", Boolean(currentIsYoutube));
  const ytInput = el("input", "yt-input");
  ytInput.placeholder = "https://www.youtube.com/watch?v=…";
  if (currentIsYoutube) ytInput.value = `https://www.youtube.com/watch?v=${current.yt}`;
  ytInput.addEventListener("focus", () => (ytRadio.checked = true));
  camOptions.append(ytInput);
  const noCamChecked = changing ? current === null : nearby.length === 0;
  radio("No camera", "Shows the sky: day or night, and the weather", null, noCamChecked);
  addConfirm.hidden = false;
}

// Is it night at this spot right now? (Open-Meteo knows; if it can't say, assume day.)
async function isNightAt(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=is_day`;
    const data = await (await fetch(url)).json();
    return data.current.is_day === 0;
  } catch {
    return false;
  }
}

// A small picture for a camera choice, so people can see the view before picking it.
// Returns { el, note } (note says when the picture isn't the view right now), or null.
// At night, Windy cameras show their last daylight picture, like on the tiles.
function camThumb(cam, windyPics, isNight) {
  const img = document.createElement("img");
  img.className = "cam-thumb";
  img.alt = "";
  // No picture after all: just show the text
  img.addEventListener("error", () => (img.closest("a") || img).remove());

  if (cam.type === "youtube") {
    img.src = `https://i.ytimg.com/vi/${cam.video}/hqdefault_live.jpg`;
    if (cam.livePreview) return { el: img };
    img.classList.add("promo");
    return { el: img, note: "channel picture, not the live view" };
  }
  if (cam.type === "image") {
    img.src = `${cam.url}?t=${Date.now()}`;
    return { el: img };
  }
  const pic = cam.type === "windy" && windyPics[cam.windy];
  if (pic && pic.src) {
    // Windy asks that its pictures link back to the camera's page on windy.com
    const link = el("a", "cam-thumb-link");
    link.href = pic.link;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = "See this webcam bigger on windy.com";
    link.append(img);
    img.src = pic.src;
    if (pic.old) {
      img.classList.add("promo");
      return { el: link, note: "old picture" };
    }
    if (isNight && pic.daylight) {
      img.src = pic.daylight;
      return { el: link, note: "dark now, daylight view" };
    }
    return { el: link };
  }
  return null;
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
  if (changingIndex !== null) {
    // Changing a place already on the wall: keep where it is, update name and camera
    const p = places[changingIndex];
    p.name = nameInput.value.trim() || p.name;
    p.cam = cam;
    dialog.close();
    savePlaces();
    render();
    return;
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

      // Windy tiles switch to their last daylight picture at night
      place.isDay = isDay;
      showWindyPicture(place);
    });
  } catch (err) {
    console.error("Weather failed:", err);
    forPlaces.forEach((p) => (p.el.querySelector(".weather").textContent = "Weather unavailable"));
  }
}

setInterval(updateWeather, 15 * 60 * 1000);

// ============================================================
//  Windy webcams (free API key, see WINDY_KEY at the top)
// ============================================================
//
// Windy picture addresses can expire, so we don't save them. Instead we ask
// Windy for fresh ones when the page opens and again every 10 minutes:
// one request for all the Windy cameras on the wall.

function windyRequest(query) {
  return fetch(`${WINDY_API}?${query}`, { headers: { "x-windy-api-key": WINDY_KEY } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Windy said ${r.status}`))));
}

async function updateWindy() {
  const forPlaces = places.filter((p) => p.camInfo && p.camInfo.type === "windy");
  if (forPlaces.length === 0) return;
  const ids = [...new Set(forPlaces.map((p) => p.camInfo.windy))].join(",");

  let webcams = [];
  try {
    const data = await windyRequest(`webcamIds=${ids}&include=images,location,urls&limit=50`);
    webcams = data.webcams || [];
  } catch (err) {
    console.error("Windy failed:", err);
  }

  forPlaces.forEach((place) => {
    const w = webcams.find((c) => String(c.webcamId) === place.camInfo.windy);
    if (!place.view.querySelector("img")) return; // this tile was redrawn meanwhile
    if (!w || !w.images) {
      place.view.querySelector(".badge").textContent = "Picture not available right now";
      return;
    }

    place.windyCam = w; // remembered, so the weather can switch day/night pictures
    place.view.querySelector("a").href = w.urls.detail;
    showWindyPicture(place);

    // Cameras added by link or search only know their number until now
    if (!CAMS.some((c) => c.windy === place.camInfo.windy)) {
      Object.assign(place.camInfo, {
        caption: `${w.title} · via Windy`,
        lat: w.location.latitude,
        lon: w.location.longitude,
      });
      place.el.querySelector(".caption").textContent = cameraCaption(place, place.camInfo);
    }
  });
}

setInterval(updateWindy, 10 * 60 * 1000);

// Which Windy picture to show. Always the newest one first, even at night:
// a dark picture tells you it's night there right now, which is the point.
// At night a button lets you peek at the last daylight picture instead.
function showWindyPicture(place) {
  const w = place.windyCam;
  const img = place.view.querySelector("img");
  if (!w || !img) return; // not a Windy tile, or its picture hasn't arrived yet
  const badge = place.view.querySelector(".badge");
  const button = place.view.querySelector(".day-night");

  // When was the current picture taken? Shown in the place's own time.
  const taken = new Date(w.lastUpdatedOn);
  const hoursOld = (Date.now() - taken) / 3600000;
  const time = taken.toLocaleTimeString("en-GB", { timeZone: place.tz, hour: "2-digit", minute: "2-digit" });

  if (hoursOld >= 3) {
    // The camera has stopped sending: dim the picture so nobody is fooled
    const day = taken.toLocaleDateString("en-GB", { timeZone: place.tz, weekday: "short", day: "numeric", month: "short" });
    img.src = w.images.current.preview;
    img.classList.add("promo");
    badge.textContent = `Old picture · ${day} ${time}`;
    button.hidden = true;
    return;
  }
  img.classList.remove("promo");

  const isNight = place.isDay === false && w.images.daylight;
  button.hidden = !isNight;
  if (isNight && place.showDaylight) {
    img.src = w.images.daylight.preview;
    badge.textContent = "☀ Earlier daylight view · not now";
    button.textContent = "See it now";
  } else {
    img.src = w.images.current.preview;
    badge.textContent = `${isNight ? "🌙 " : ""}Picture from ${time} · Windy`;
    button.textContent = "☀ Daylight view";
  }
}

// Windy cameras near a place, for the "Add a place" dialog.
// First we look within 100 km. Remote places (e.g. Mendoza) may have only a
// couple of cameras that close, so if fewer than 5 turn up we look again
// within 250 km, the furthest Windy allows.
async function windyNearby(lat, lon) {
  const search = async (km) => {
    const data = await windyRequest(`nearby=${lat.toFixed(4)},${lon.toFixed(4)},${km}&include=location,images,urls&limit=50`);
    return (data.webcams || []).filter((w) => w.status === "active");
  };
  let webcams = await search(100);
  if (webcams.length < 5) webcams = await search(250);
  return webcams
    .map((w) => ({
      value: { windy: String(w.webcamId) },
      cam: { type: "windy", windy: String(w.webcamId), caption: w.title, where: "via Windy" },
      km: distanceKm(lat, lon, w.location.latitude, w.location.longitude),
      pic: {
        src: w.images && w.images.current.thumbnail,
        daylight: w.images && w.images.daylight && w.images.daylight.thumbnail,
        link: w.urls ? w.urls.detail : `https://windy.com/webcams/${w.webcamId}`,
        old: Date.now() - new Date(w.lastUpdatedOn) > 3 * 3600000, // over 3 hours old
      },
    }));
}

// ============================================================
//  Newer version of the site?
// ============================================================
//
// Phones (and WhatsApp's built-in browser) keep a saved copy of the page and
// can show it for a while after we've changed the site. So each time the page
// opens, or comes back on screen, we fetch the newest index.html straight from
// GitHub (skipping any saved copy) and compare its ?v= number with ours.
// If the site is newer, the page reloads itself.

const runningVersion = (document.querySelector('script[src^="app.js"]').getAttribute("src").match(/v=(\d+)/) || [])[1];

async function checkForNewVersion() {
  // Don't reload in the middle of someone's editing
  if (dialog.open || document.body.classList.contains("editing")) return;
  try {
    const html = await (await fetch("index.html", { cache: "no-store" })).text();
    const latest = (html.match(/app\.js\?v=(\d+)/) || [])[1];
    if (!latest || latest === runningVersion) return;
    // Reload only once per new version, so a stubborn saved copy can't
    // make the page reload over and over
    if (sessionStorage.getItem("reloadedFor") === latest) return;
    sessionStorage.setItem("reloadedFor", latest);
    location.reload();
  } catch {
    /* offline, or storage blocked: we'll check again next time */
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkForNewVersion();
});

// ============================================================
//  Start
// ============================================================

render();
checkForNewVersion();
