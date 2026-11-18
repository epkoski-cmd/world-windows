// ============================================================
//  CAMERA CATALOGUE — every camera the site knows about.
// ============================================================
//
// When someone adds a place, the site suggests the cameras from
// this list that are closest to it (and, for places in Finland,
// the nearest Fintraffic road weather cameras automatically).
//
// Each camera has:
//   id       – short unique name, used in share links (never change it!)
//   where    – where the camera actually is
//   lat, lon – the camera's location, used to measure distance
//   caption  – what it shows and whose camera it is
//   type     – "youtube" (live stream, needs `video`)
//              or "image" (still picture reloaded every 10 min, needs `url`)
//
// To add a camera: find a YouTube live stream, copy the part after
// "watch?v=" in its address, and add a new entry below.

const CAMS = [
  // ---------- Finland ----------
  { id: "helsinki-lauttasaari", where: "Lauttasaari, Helsinki", lat: 60.1555, lon: 24.8705,
    caption: "Sea view · Larukite", type: "youtube", video: "o45aDp57IM8" },
  { id: "espoo-nuuksio", where: "Nuuksio, Espoo", lat: 60.29, lon: 24.55,
    caption: "Forest feeding spot · Feel The Nature", type: "youtube", video: "JWta8Urznhw" },
  { id: "helsinki-south-harbour", where: "South Harbour, Helsinki", lat: 60.1665, lon: 24.9565,
    caption: "Harbour · Port of Helsinki", type: "youtube", video: "CvOB-Is_yYU" },
  { id: "ristiina-road13", where: "Road 13, Ostolahti", lat: 61.4533, lon: 27.2646,
    caption: "Road cam · Fintraffic", type: "image", url: "https://weathercam.digitraffic.fi/C0350501.jpg" },

  // ---------- Estonia ----------
  { id: "kuressaare-square", where: "Kuressaare town square", lat: 58.2528, lon: 22.4845,
    caption: "Town square · Saarte Hääl", type: "youtube", video: "DSVZvGa4ZOw" },
  { id: "tallinn-citycam", where: "Tallinn", lat: 59.437, lon: 24.7536,
    caption: "City view · Digital.Tallinn", type: "youtube", video: "VhVgZi2lGv0" },

  // ---------- Spain ----------
  { id: "rincon-victoria-beach", where: "Rincón de la Victoria", lat: 36.717, lon: -4.278,
    caption: "Beach cam · Malaga Live Cam", type: "youtube", video: "Ib0xbFBU9Wg" },
  { id: "sabinillas-beach", where: "Sabinillas, Manilva", lat: 36.369, lon: -5.228,
    caption: "Beach cam · SabinillasBeach", type: "youtube", video: "9nOjBJE9AUU" },

  // ---------- Asia ----------
  { id: "tokyo-shibuya", where: "Shibuya, Tokyo", lat: 35.6595, lon: 139.7005,
    caption: "Shibuya Scramble Crossing · FNN", type: "youtube", video: "dfVK7ld38Ys" },
  { id: "seoul-han-river", where: "Han River, Seoul", lat: 37.53, lon: 126.94,
    caption: "Han River · Han River Live 365", type: "youtube", video: "5gVrWGRZo9s" },

  // ---------- USA ----------
  { id: "weehawken-lincoln-harbor", where: "Lincoln Harbor, Weehawken", lat: 40.7616, lon: -74.0237,
    caption: "Hudson waterfront · EarthCam", type: "youtube", video: "sixP_dAJ8D4" },
  { id: "seaside-heights", where: "Seaside Heights, NJ", lat: 39.944, lon: -74.073,
    caption: "Beach & boardwalk · EarthCam", type: "youtube", video: "OBgCrw-IyhE" },
  { id: "sf-bay-bridge", where: "Bay Bridge, San Francisco", lat: 37.7983, lon: -122.3778,
    caption: "Bay Bridge · ABC7 News", type: "youtube", video: "CXYr04BWvmc" },
];

// The wall someone sees the first time they open the site
// (before they edit anything or open a shared link).
// cam can be a catalogue id, or null for "no camera".
const DEFAULT_PLACES = [
  { name: "Espoo",         lat: 60.2055, lon: 24.6559,   tz: "Europe/Helsinki",     cam: "helsinki-lauttasaari" },
  { name: "Ristiina",      lat: 61.5059, lon: 27.2563,   tz: "Europe/Helsinki",     cam: "ristiina-road13" },
  { name: "Tokyo",         lat: 35.6595, lon: 139.7005,  tz: "Asia/Tokyo",          cam: "tokyo-shibuya" },
  { name: "Seoul",         lat: 37.5665, lon: 126.978,   tz: "Asia/Seoul",          cam: "seoul-han-river" },
  { name: "Torremolinos",  lat: 36.6219, lon: -4.4999,   tz: "Europe/Madrid",       cam: "rincon-victoria-beach" },
  { name: "Jersey City",   lat: 40.7178, lon: -74.0431,  tz: "America/New_York",    cam: "weehawken-lincoln-harbor" },
  { name: "San Francisco", lat: 37.7749, lon: -122.4194, tz: "America/Los_Angeles", cam: "sf-bay-bridge" },
];
