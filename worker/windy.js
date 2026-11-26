// Family World Window – Windy helper (a Cloudflare Worker)
//
// The web page used to send the Windy API key itself, so anyone could read it
// in app.js. Now the page asks this small program instead, and this program
// adds the key before passing the question on to Windy. The key lives in
// Cloudflare as a secret called WINDY_KEY (never in this file, never in git).
//
// It only passes on the two questions the page really asks:
//   ?webcamIds=123,456        – fresh pictures for the cameras on a wall
//   ?nearby=60.1695,24.9355,100 – cameras near a town (100 or 250 km)
// Anything else is refused, so nobody can use our key for other things.
//
// It keeps nothing: no walls, no logs of its own. It answers and forgets.

const WINDY_API = "https://api.windy.com/webcams/api/v3/webcams";

// Web pages allowed to use this helper (the live site, and testing at home)
const ALLOWED_ORIGINS = [
  "https://epkoski-cmd.github.io",
  "http://localhost:8080",
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response("This helper only works for Family World Window.", { status: 403 });
    }
    // Tells the browser that our page may read the answer
    const cors = { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };

    if (request.method !== "GET") {
      return new Response("Only GET, please.", { status: 405, headers: cors });
    }

    const query = safeQuery(new URL(request.url).searchParams);
    if (!query) {
      return new Response("That's not a question this helper passes on.", { status: 400, headers: cors });
    }

    const answer = await fetch(`${WINDY_API}?${query}`, {
      headers: { "x-windy-api-key": env.WINDY_KEY },
    });
    return new Response(answer.body, {
      status: answer.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};

// Builds the question for Windy from scratch, using only values we've checked.
// Returns null if the page asked for something we don't recognise.
function safeQuery(params) {
  const extras = "include=images,location,urls&limit=50";

  const ids = params.get("webcamIds");
  // Up to 50 camera numbers, each 6–12 digits, separated by commas
  if (ids && /^\d{6,12}(,\d{6,12}){0,49}$/.test(ids)) {
    return `webcamIds=${ids}&${extras}`;
  }

  const nearby = params.get("nearby");
  // latitude,longitude,distance – e.g. 60.1695,24.9355,100
  if (nearby && /^-?\d{1,3}\.\d{1,4},-?\d{1,3}\.\d{1,4},(100|250)$/.test(nearby)) {
    return `nearby=${nearby}&${extras}`;
  }

  return null;
}
