# Ideas

A running list. Pick one per session; move it to **Done** when it's live.
Write ideas down as soon as they come up, even half-formed ones.

## Next

## Maybe later
- Night cameras for Malaga: look at La Caleta and Rincón after dark (from
  about 19:45 Finnish time) and mark a lit one with `lit: true`.
- Ask the family what they'd want to see.

## Done
- Phase 1: the wall with live views, local time, weather, sunrise and sunset.
- Phase 2: edit mode, saved walls, share links, GitHub Pages.
- "Watch live" button so YouTube ads only come when someone chooses to watch.
- Shared-wall banner, Restore family places, short WhatsApp-friendly links.
- Finnish road cams suggested automatically when adding a Finnish place.
- Notice when no camera is nearby.
- GoatCounter visit stats.
- Windy webcams: a real picture for Calahonda, and nearby-cam
  suggestions for any town (London now finds hundreds).
- Preview pictures next to each camera choice when adding a place.
- Windy tiles at night: the newest (dark) picture first, so you can see it's
  night there; a "Daylight view" button shows the last daylight picture.
- "Change camera" button on each tile in edit mode (also lets you rename the place).
- Better camera suggestions: offline road cams hidden, Windy copies of Finnish
  road cams skipped, at most 2 road cams in the first 5, "Show more cameras".
- First camera choice is the nearest one that isn't a road cam.
- Jersey City: the EarthCam stream ended; now the Hudson River view from
  17th Street. Old walls are moved over with `replacedBy` in cams.js.
- The page reloads itself when a newer version of the site is out.
- Daily camera check on GitHub: YouTube streams still live (YouTube Data API,
  key in a GitHub secret), road cams not offline. A stopped camera opens an
  issue (GitHub emails us).
- Family wall reviewed: Espoo shows Ringside Golf, Kokkola added (Ohtakari
  seashore), Torremolinos and Calahonda became one Malaga tile (La Caleta).
- Remote places: when Windy finds fewer than 5 cameras within 100 km, it
  looks again up to 250 km (e.g. Mendoza).
- Camera check suggests a fix: when a camera stops, it finds a working one
  nearby (live YouTube stream or Fintraffic road cam) and prepares the change
  to `cams.js`. We check it and press Merge.
- Sunrise somewhere: a strip under the header names the next sunrise on the
  wall ("Kokkola, in 2 h 10 min"); while the sun is rising (15 min before to
  30 min after) that tile glows gold. Tap the strip to jump to the tile.
- Day/night for road cams: at night, Fintraffic road cams get a "Daylight view"
  button (like Windy tiles) showing the picture from around midday, taken
  from Fintraffic's 24-hour picture history.
- Two cams per place: swipe between them (dots underneath, arrows with a mouse).
  Edit mode has "+ 2nd camera"; a playing video stops when you swipe away.
  Helsinki (Lauttasaari), Kuressaare (Muratsi) and Malaga (Rincón) got a second one.
- Windy key off the public code: a free Cloudflare Worker (`worker/windy.js`)
  adds the key, kept as a Cloudflare secret. Bonus: Windy tiles work on localhost.
- Night cameras: a camera marked `lit: true` gets a "🌙 Lit at night" label
  after dark, and a two-camera tile starts on its lit one. Lit so far:
  South Harbour (Helsinki) and Kuressaare town square.
