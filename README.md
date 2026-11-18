# Family World Window

Live views, local time and weather from the places that matter to you.

Pick a few places around the world, and each one gets a tile with a live
camera nearby, the local time, the weather, and when the sun rises or sets.
Press **Edit** to add, remove or reorder places, and **Share** to copy a link
that opens exactly your wall.

## How it works

- Plain HTML, CSS and JavaScript – no build step, no frameworks.
- `cams.js` – the camera catalogue and the default wall.
- `app.js` – tiles, edit mode, share links, clocks and weather.
- The wall is stored in the page address (`#w=…`), so sharing needs no accounts.

## Data sources

- Weather and place search: [Open-Meteo](https://open-meteo.com/)
- Finnish road weather cameras: [Fintraffic Digitraffic](https://www.digitraffic.fi/) (CC BY 4.0)
- Live streams are embedded from their owners' YouTube channels.

## Running it locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080 (YouTube embeds don't play from a `file://` page).
