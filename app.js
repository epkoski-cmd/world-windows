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
//
// A place can also have a second camera, `cam2` (same kinds, but never null).
// The tile then lets you swipe between the two views.

// The cameras of a place, in order: [cam] or [cam, cam2]
function placeCams(place) {
  return place.cam2 ? [place.cam, place.cam2] : [place.cam];
}

// Do two places show the same camera(s)?
function sameCams(a, b) {
  return sameCam(a.cam, b.cam) && sameCam(a.cam2, b.cam2);
}

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

// Places are packed small for saving: [name, lat, lon, timeZone, cam, cam2]
// (cam2 only when the place has a second camera)
function pack(places) {
  const rows = places.map((p) => {
    const row = [p.name, +p.lat.toFixed(4), +p.lon.toFixed(4), p.tz, p.cam];
    if (p.cam2) row.push(p.cam2);
    return row;
  });
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
    .map(([name, lat, lon, tz, cam, cam2]) => {
      const place = {
        name: name.slice(0, 60), lat: +lat, lon: +lon,
        tz: isValidTimeZone(tz) ? tz : "UTC",
        cam: cam ?? null,
      };
      if (cam2) place.cam2 = cam2;
      return place;
    });
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
//     and a second camera, if it has one, goes on the end:  ...,camera,camera2
//     (the "/" in time zones is written as ".", cameras are a catalogue id,
//      yt.VIDEO_ID, fi.FINTRAFFIC_ID, windy.WEBCAM_ID, or empty for no camera)
// Characters like * _ ~ are avoided: WhatsApp would turn them into formatting.

const enc = (s) => encodeURIComponent(s).replace(/%20/g, "+");
const dec = (s) => decodeURIComponent(s.replace(/\+/g, " "));

function sameCam(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function isFamilyPlace(p) {
  return DEFAULT_PLACES.some((d) => d.name === p.name && sameCams(d, p));
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
    .map((p) => {
      if (isFamilyPlace(p)) return enc(p.name);
      const fields = [enc(p.name), p.lat.toFixed(2), p.lon.toFixed(2), p.tz.replace(/\//g, "."), camToText(p.cam)];
      if (p.cam2) fields.push(camToText(p.cam2));
      return fields.join(",");
    })
    .join("/");
}

function fromLink(text) {
  return text.split("/").filter(Boolean).map((token) => {
    const [name, lat, lon, tz, cam, cam2] = token.split(",").map(dec);
    if (lat === undefined) {
      const family = DEFAULT_PLACES.find((d) => d.name.toLowerCase() === name.toLowerCase());
      return family ? { ...family } : null;
    }
    if (!isFinite(lat) || !isFinite(lon)) return null;
    const zone = (tz || "").replace(/\./g, "/");
    const place = {
      name: name.slice(0, 60), lat: +lat, lon: +lon,
      tz: isValidTimeZone(zone) ? zone : "UTC",
      cam: camFromText(cam),
    };
    if (cam2) place.cam2 = camFromText(cam2);
    return place;
  }).filter(Boolean);
}

// The address to share: the plain site for the family wall, otherwise a short link
function shareAddress() {
  const base = location.origin + location.pathname;
  const isFamilyWall =
    places.length === DEFAULT_PLACES.length && places.every((p, i) =>
      p.name === DEFAULT_PLACES[i].name && sameCams(p, DEFAULT_PLACES[i]));
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

// Each camera on a tile is a "slot": its camera, its picture area (view),
// its own timers, and its own day/night picture choice. A place with two
// cameras has two slots; `slot.place` leads back to the place.
let allSlots = []; // every slot on the wall now, so render() can stop their timers

function makeView(slot) {
  const { place, cam } = slot;
  const view = (slot.view = el("div", "view"));

  if (cam && cam.type === "youtube") {
    showYoutubePreview(slot);
  } else if (cam && cam.type === "image") {
    // Still camera: add ?t=… so the browser fetches a fresh copy, not a cached one
    const img = document.createElement("img");
    img.alt = `Camera near ${place.name}`;
    // (but not while someone is looking at the earlier daylight picture)
    const reload = () => { if (!slot.showDaylight) img.src = `${cam.url}?t=${Date.now()}`; };
    reload();
    slot.timers.push(setInterval(reload, 10 * 60 * 1000));
    view.append(img, el("span", "badge", "Updates every 10 min"));
    // Finnish road cams keep 24 hours of pictures, so at night a button
    // can show the one taken around midday (see showRoadCamPicture)
    if (roadCamPreset(cam)) {
      const dayNight = el("button", "close-live day-night");
      dayNight.hidden = true;
      dayNight.addEventListener("click", () => {
        slot.showDaylight = !slot.showDaylight;
        showRoadCamPicture(slot);
      });
      view.append(dayNight);
    }
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
      slot.showDaylight = !slot.showDaylight;
      showWindyPicture(slot);
    });
    view.append(link, el("span", "badge", "Loading picture…"), dayNight);
  } else {
    // No camera: a sky that follows day/night and the weather
    view.classList.add("sky");
    view.append(el("span", "sky-icon", "…"));
  }
  // Cameras that still show something after dark get a little label at night
  if (cam && cam.lit) {
    const tag = el("span", "night-tag", "🌙 Lit at night");
    tag.hidden = true; // shown by pickCameraForTimeOfDay once we know it's night
    view.append(tag);
  }
  return view;
}

// YouTube tiles start as a still preview. The video (and any ads the stream
// owner has switched on) only loads when someone presses "Watch live".
function showYoutubePreview(slot) {
  const { place, cam, view } = slot;
  slot.timers.forEach(clearInterval);
  slot.timers = [];
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
  slot.timers.push(setInterval(load, 5 * 60 * 1000));

  const play = el("button", "watch-live", "▶ Watch live");
  play.addEventListener("click", () => playYoutube(slot));

  // Many channels show a promo picture instead of the current view
  // (a sunny summer photo at midnight). Dim those so nobody is fooled.
  const badge = cam.livePreview
    ? el("span", "badge", "Preview · updates every 5 min")
    : el("span", "badge", "Channel picture · not the current view");
  if (!cam.livePreview) img.classList.add("promo");

  view.append(img, badge, play);
  if (cam.lit) {
    const tag = el("span", "night-tag", "🌙 Lit at night");
    tag.hidden = place.isDay !== false;
    view.append(tag);
  }
}

function playYoutube(slot) {
  const { place, cam, view } = slot;
  slot.timers.forEach(clearInterval);
  slot.timers = [];
  // mute=1 is needed for autoplay; playsinline keeps it in the tile on phones
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube.com/embed/${cam.video}?autoplay=1&mute=1&playsinline=1&rel=0`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.title = `Live view near ${place.name}`;

  const close = el("button", "close-live", "✕ Stop");
  close.title = "Stop the video and go back to the preview";
  close.addEventListener("click", () => showYoutubePreview(slot));

  view.replaceChildren(iframe, close);
}

// ---------- Two cameras: swipe between them ----------
//
// The two views sit side by side in a strip that scrolls sideways and snaps
// to one whole view at a time (CSS scroll-snap does the swiping for us).
// Dots underneath say which one you're looking at; tapping a dot jumps to it.
// On computers with a mouse, arrow buttons appear when you point at the tile.

function makeSwiper(place) {
  const box = el("div", "swiper");
  const strip = el("div", "views");
  place.slots.forEach((slot) => strip.append(slot.view));

  const dots = el("div", "dots");
  place.slots.forEach((slot, i) => {
    const dot = el("button", "dot");
    dot.title = `Camera ${i + 1}`;
    dot.setAttribute("aria-label", `Show camera ${i + 1}`);
    dot.addEventListener("click", () => scrollToSlot(place, i));
    dots.append(dot);
  });

  const prev = el("button", "arrow prev", "‹");
  prev.setAttribute("aria-label", "Previous camera");
  prev.addEventListener("click", () => scrollToSlot(place, place.shown - 1));
  const next = el("button", "arrow next", "›");
  next.setAttribute("aria-label", "Next camera");
  next.addEventListener("click", () => scrollToSlot(place, place.shown + 1));

  // Which view is in the middle now? (Changes halfway through a swipe.)
  strip.addEventListener("scroll", () => {
    const i = Math.round(strip.scrollLeft / strip.clientWidth);
    if (i !== place.shown) showingSlot(place, i);
  }, { passive: true });

  box.append(strip, dots, prev, next);
  place.strip = strip;
  place.swiper = box;
  return box;
}

function scrollToSlot(place, i, smooth = true) {
  if (!place.strip || i < 0 || i >= place.slots.length) return;
  place.strip.scrollTo({ left: i * place.strip.clientWidth, behavior: smooth ? "smooth" : "instant" });
}

// Called when a different camera comes into view (or when the tile is built)
function showingSlot(place, i) {
  const leaving = place.slots[place.shown];
  place.shown = i;
  // A live video on the camera we swiped away from: stop it (saves data, and any ads)
  if (leaving && leaving !== place.slots[i] && leaving.view.querySelector("iframe")) {
    showYoutubePreview(leaving);
  }
  if (place.swiper) {
    place.swiper.querySelectorAll(".dot").forEach((d, n) => d.classList.toggle("on", n === i));
    place.swiper.querySelector(".prev").hidden = i === 0;
    place.swiper.querySelector(".next").hidden = i === place.slots.length - 1;
  }
  // The caption under the tile describes the camera you're looking at
  if (place.el) place.el.querySelector(".caption").textContent = cameraCaption(place, place.slots[i].cam);
}

// ---------- Night cameras ----------
//
// Some cameras still show something after dark (city lights, a lit harbour);
// they have `lit: true` in cams.js. At night, a tile with two cameras starts
// on its lit one, and in the morning it goes back to the first camera.
// This only happens when day turns to night (or back), so if someone swipes
// to the other camera, it stays there.
function pickCameraForTimeOfDay(place) {
  const isNight = place.isDay === false;
  place.slots.forEach((slot) => {
    const tag = slot.view.querySelector(".night-tag");
    if (tag) tag.hidden = !isNight;
  });
  if (place.slots.length < 2 || place.pickedFor === place.isDay) return;
  place.pickedFor = place.isDay; // remembered, so we only switch once
  const lit = place.slots.findIndex((slot) => slot.cam.lit);
  const wanted = isNight && lit >= 0 ? lit : 0;
  if (wanted !== place.shown) scrollToSlot(place, wanted, false);
}

function makeTile(place, index) {
  const tile = el("article", "tile");
  // One slot per camera. A second camera we can't show (e.g. a broken link) is skipped.
  place.slots = placeCams(place)
    .map((cam) => resolveCam(cam))
    .filter((cam, i) => i === 0 || cam)
    .map((cam) => ({ place, cam, timers: [] }));
  place.slots.forEach((slot) => makeView(slot));
  allSlots.push(...place.slots);
  // Which camera is in view: kept when the wall is redrawn (e.g. after editing)
  place.shown = Math.min(place.shown || 0, place.slots.length - 1);
  place.swiper = null;
  place.strip = null;
  tile.append(place.slots.length > 1 ? makeSwiper(place) : place.slots[0].view);

  const info = el("div", "info");
  info.append(
    el("div", "name", place.name),
    el("div", "time", "--:--"),
    el("div", "weather", "Loading weather…"),
    el("div", "day-note"),
    el("div", "sun"),
    el("div", "caption"),
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
  const two = place.slots.length > 1;
  btn("◀", "Move left", () => movePlace(index, -1), index === 0);
  btn("▶", "Move right", () => movePlace(index, +1), index === places.length - 1);
  // With two cameras, this changes the one you're looking at
  btn(two ? "Change this camera" : "Change camera", "Pick a different camera for this place",
    () => openChangeDialog(index, place.shown));
  if (place.cam && !place.cam2) {
    btn("+ 2nd camera", "Add a second camera to swipe to", () => openChangeDialog(index, 1));
  }
  btn("✕ Remove", "Remove this place", () => removePlace(index));
  info.append(controls);

  tile.append(info);
  place.el = info;
  place.tile = tile; // remembered, so the sunrise strip can point at it
  showingSlot(place, place.shown);
  return tile;
}

function render() {
  // Stop timers of the old tiles before throwing them away
  allSlots.forEach((slot) => slot.timers.forEach(clearInterval));
  allSlots = [];
  wall.replaceChildren();

  places.forEach((place, i) => wall.append(makeTile(place, i)));
  // Two-camera tiles that were showing their second camera: scroll back to it.
  // (Waits a moment, until the browser knows how wide the tiles are.)
  requestAnimationFrame(() =>
    places.forEach((p) => { if (p.shown > 0) scrollToSlot(p, p.shown, false); }),
  );

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
// ...and which of its cameras: 0 = the first, 1 = the second (or a new second one)
let changingSlot = 0;

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

// "Change camera" or "+ 2nd camera" on a tile: skip the search and go
// straight to the camera choices. `slot` says which camera: 0 or 1.
function openChangeDialog(i, slot) {
  const p = places[i];
  changingIndex = i;
  changingSlot = slot;
  const addingSecond = slot === 1 && !p.cam2;
  dialogTitle.textContent = addingSecond ? "Add a second camera" : "Change camera";
  addConfirm.textContent = addingSecond ? "Add camera" : "Save";
  dialog.showModal();
  // Places don't remember their country, but Finnish time zones mean Finland
  // (that's what decides whether to suggest Fintraffic road cams)
  const inFinland = p.tz === "Europe/Helsinki" || p.tz === "Europe/Mariehamn";
  chooseCity(
    { name: p.name, latitude: p.lat, longitude: p.lon, timezone: p.tz, country_code: inFinland ? "FI" : "" },
    // The camera it has now (undefined when adding a second one: nothing to keep)
    slot === 1 ? p.cam2 : p.cam,
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

  // When the place has (or is getting) two cameras, don't offer the other one again
  const place = changingIndex === null ? null : places[changingIndex];
  const otherCam = place ? placeCams(place)[1 - changingSlot] : null;
  const isOtherCam = (value) => Boolean(otherCam) && sameCam(value, otherCam);

  // Pick 5 to show: the nearest, but at most 2 road cams, so other views get a turn.
  // (If there aren't enough other cameras, more road cams fill the gaps.)
  const all = options.filter((o) => o.km < 300 && !isOtherCam(o.value));
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
    const sub = [`${Math.round(o.km)} km away`, o.cam.lit && "lit at night", thumb && thumb.note]
      .filter(Boolean).join(" · ");
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
  // "No camera" means something different when a place has two cameras
  if (place && changingSlot === 1 && !place.cam2) {
    radio("No second camera", "Keep just the one camera", null, noCamChecked);
  } else if (place && place.cam2) {
    radio("Remove this camera", "The other camera stays", null, false);
  } else {
    radio("No camera", "Shows the sky: day or night, and the weather", null, noCamChecked);
  }
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
    setPlaceCam(p, changingSlot, cam);
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

// Put a camera (or null: none) in place of camera 0 or 1 of a place
function setPlaceCam(p, slot, cam) {
  if (slot === 1) {
    if (cam) {
      p.cam2 = cam;
      p.shown = 1; // show the new camera straight away
    } else {
      delete p.cam2;
    }
  } else if (cam === null && p.cam2) {
    // First camera removed: the second one moves up
    p.cam = p.cam2;
    delete p.cam2;
  } else {
    p.cam = cam;
  }
}

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
  updateSunrise();
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
      place.sunLine = { className: sun.className, text: sun.textContent };

      // Middle of today's daylight (halfway from sunrise to sunset): the
      // brightest moment, used to pick a road cam's "Daylight view" picture.
      // Missing in polar night, when the sun doesn't rise at all.
      const rise = Date.parse(w.daily.sunrise[0] + "Z");
      const set = Date.parse(w.daily.sunset[0] + "Z");
      place.midday = set > rise ? (rise + set) / 2 - w.utc_offset_seconds * 1000 : null;

      // Remember today's and tomorrow's sunrise as real moments in time, for
      // the "Sunrise somewhere" strip. Open-Meteo gives local clock times
      // ("08:41"), so we take away the place's offset from UTC to compare them.
      place.sunrises = w.daily.sunrise
        .map((t) => ({ local: t, at: Date.parse(t + "Z") - w.utc_offset_seconds * 1000 }))
        .filter((s) => !Number.isNaN(s.at)); // polar night: no sunrise at all

      // Night or day decides which buttons and pictures each camera shows
      place.isDay = isDay;
      place.slots.forEach((slot) => {
        // Sky tiles (no camera) follow day/night and show the weather icon
        if (slot.view.classList.contains("sky")) {
          slot.view.classList.toggle("night", !isDay);
          slot.view.querySelector(".sky-icon").textContent = icon;
        }
        showWindyPicture(slot);
        showRoadCamPicture(slot);
      });
      pickCameraForTimeOfDay(place);
    });
    updateSunrise();
  } catch (err) {
    console.error("Weather failed:", err);
    forPlaces.forEach((p) => (p.el.querySelector(".weather").textContent = "Weather unavailable"));
  }
}

setInterval(updateWeather, 15 * 60 * 1000);

// ============================================================
//  Sunrise somewhere
// ============================================================
//
// A strip under the header points at the place on the wall where the sun
// rises next. While it's actually rising (from 15 minutes before until
// 30 minutes after), that tile glows gold and the strip says so.
// Runs with the clocks, every 15 seconds; the times come from the weather.

const RISING_BEFORE = 15 * 60 * 1000;
const RISING_AFTER = 30 * 60 * 1000;
const sunriseStrip = document.getElementById("sunrise-strip");
let sunriseTarget = null; // the place the strip points at

// "in 25 min", "in 2 h 10 min"
function inHowLong(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `in ${h} h ${min % 60} min` : `in ${h} h`;
}

function updateSunrise() {
  const now = Date.now();
  const rising = [];
  let next = null; // { place, at }

  places.forEach((place) => {
    if (!place.tile || !place.sunrises) return; // weather not loaded yet
    const risingNow = place.sunrises.find((s) => now >= s.at - RISING_BEFORE && now <= s.at + RISING_AFTER);
    place.tile.classList.toggle("sunrise-now", !!risingNow);
    const sun = place.el.querySelector(".sun");
    if (risingNow) {
      rising.push(place);
      sun.className = "sun rising";
      sun.textContent = `🌅 Sun rising now · ${hhmm(risingNow.local)}`;
      return;
    }
    // Sunrise over: put back the usual sunrise/sunset line from the weather
    if (sun.classList.contains("rising")) {
      sun.className = place.sunLine.className;
      sun.textContent = place.sunLine.text;
    }
    const upcoming = place.sunrises.find((s) => s.at > now);
    if (upcoming && (!next || upcoming.at < next.at)) next = { place, at: upcoming.at };
  });

  if (rising.length) {
    const names = rising.map((p) => p.name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
    sunriseStrip.textContent = `🌅 The sun is rising in ${list} right now`;
    sunriseTarget = rising[0];
  } else if (next) {
    sunriseStrip.textContent = `🌅 Next sunrise on your wall: ${next.place.name}, ${inHowLong(next.at - now)}`;
    sunriseTarget = next.place;
  } else {
    sunriseTarget = null;
  }
  sunriseStrip.classList.toggle("now", rising.length > 0);
  sunriseStrip.hidden = !sunriseTarget;
}

// Tap the strip: scroll to that tile and make it flash briefly
sunriseStrip.addEventListener("click", () => {
  const tile = sunriseTarget && sunriseTarget.tile;
  if (!tile || !tile.isConnected) return;
  tile.scrollIntoView({ behavior: "smooth", block: "center" });
  tile.classList.remove("flash");
  void tile.offsetWidth; // restart the animation if tapped twice
  tile.classList.add("flash");
});

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
  const slots = allSlots.filter((slot) => slot.cam && slot.cam.type === "windy");
  if (slots.length === 0) return;
  const ids = [...new Set(slots.map((slot) => slot.cam.windy))].join(",");

  let webcams = [];
  try {
    const data = await windyRequest(`webcamIds=${ids}&include=images,location,urls&limit=50`);
    webcams = data.webcams || [];
  } catch (err) {
    console.error("Windy failed:", err);
  }

  slots.forEach((slot) => {
    const { place, cam, view } = slot;
    if (!view.isConnected) return; // this tile was redrawn meanwhile
    const w = webcams.find((c) => String(c.webcamId) === cam.windy);
    if (!w || !w.images) {
      view.querySelector(".badge").textContent = "Picture not available right now";
      return;
    }

    slot.windyCam = w; // remembered, so the weather can switch day/night pictures
    view.querySelector("a").href = w.urls.detail;
    showWindyPicture(slot);

    // Cameras added by link or search only know their number until now
    if (!CAMS.some((c) => c.windy === cam.windy)) {
      Object.assign(cam, {
        caption: `${w.title} · via Windy`,
        lat: w.location.latitude,
        lon: w.location.longitude,
      });
      showingSlot(place, place.shown); // refresh the caption
    }
  });
}

setInterval(updateWindy, 10 * 60 * 1000);

// Which Windy picture to show. Always the newest one first, even at night:
// a dark picture tells you it's night there right now, which is the point.
// At night a button lets you peek at the last daylight picture instead.
function showWindyPicture(slot) {
  const { place, view } = slot;
  const w = slot.windyCam;
  const img = view.querySelector("img");
  if (!w || !img) return; // not a Windy camera, or its picture hasn't arrived yet
  const badge = view.querySelector(".badge");
  const button = view.querySelector(".day-night");

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
  if (isNight && slot.showDaylight) {
    img.src = w.images.daylight.preview;
    badge.textContent = "☀ Earlier daylight view · not now";
    button.textContent = "See it now";
  } else {
    img.src = w.images.current.preview;
    badge.textContent = `${isNight ? "🌙 " : ""}Picture from ${time} · Windy`;
    button.textContent = "☀ Daylight view";
  }
}

// ============================================================
//  Road cams at night (Fintraffic keeps 24 hours of pictures)
// ============================================================
//
// Like Windy tiles: the newest (dark) picture stays first, so you can see it's
// night there. A "Daylight view" button shows the picture from around the
// middle of the most recent day instead. The 24-hour list is only fetched
// when someone presses the button.

// "C1053902" for a Fintraffic road cam, otherwise null
function roadCamPreset(cam) {
  const m = cam && cam.url && cam.url.match(/weathercam\.digitraffic\.fi\/(C\d{7})\.jpg/);
  return m ? m[1] : null;
}

const OFFLINE_PICTURE_BYTES = 9897; // Fintraffic's "camera offline" placeholder

async function daylightRoadPicture(slot) {
  const preset = roadCamPreset(slot.cam);
  // Most recent midday that has already happened (before sunrise: yesterday's)
  let target = slot.place.midday;
  if (target > Date.now()) target -= 24 * 3600 * 1000;

  const station = preset.slice(0, 6); // pictures are listed per station: C10539
  const data = await (await fetch(`https://tie.digitraffic.fi/api/weathercam/v1/stations/${station}/history`)).json();
  const history = (data.presets.find((p) => p.id === preset) || {}).history || [];
  let best = null;
  history.forEach((h) => {
    if (h.sizeBytes === OFFLINE_PICTURE_BYTES) return;
    const off = Math.abs(Date.parse(h.lastModified) - target);
    if (!best || off < best.off) best = { off, url: h.imageUrl, taken: new Date(h.lastModified) };
  });
  // More than 2 hours away from midday isn't really a daylight picture
  return best && best.off < 2 * 3600 * 1000 ? best : null;
}

async function showRoadCamPicture(slot) {
  const { place, view } = slot;
  const button = view.querySelector(".day-night");
  if (!roadCamPreset(slot.cam) || !button) return;
  const img = view.querySelector("img");
  const badge = view.querySelector(".badge");

  const isNight = place.isDay === false && place.midday;
  button.hidden = !isNight;
  if (!isNight) slot.showDaylight = false; // morning came: back to the live picture

  if (isNight && slot.showDaylight) {
    button.textContent = "Loading…";
    try {
      slot.daylightPic ??= await daylightRoadPicture(slot);
    } catch (err) {
      console.error("Road cam history failed:", err);
    }
    if (!slot.showDaylight) return; // pressed again while loading
    const pic = slot.daylightPic;
    if (!pic) {
      slot.showDaylight = false;
      toast("No daylight picture from this camera in the last day.");
      return showRoadCamPicture(slot);
    }
    const time = pic.taken.toLocaleTimeString("en-GB", { timeZone: place.tz, hour: "2-digit", minute: "2-digit" });
    const day = pic.taken.toLocaleDateString("en-GB", { timeZone: place.tz, weekday: "short" });
    img.src = pic.url;
    badge.textContent = `☀ Earlier daylight view · ${day} ${time}`;
    button.textContent = "See it now";
  } else {
    // Only reload if we were showing the daylight picture, so it's not fetched twice
    if (img.src.includes("versionId=")) img.src = `${slot.cam.url}?t=${Date.now()}`;
    slot.daylightPic = null; // pick a fresh one next time
    badge.textContent = `${isNight ? "🌙 " : ""}Updates every 10 min`;
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
