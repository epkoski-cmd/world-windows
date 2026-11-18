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
//   type     – "youtube" (live stream, needs `video`;
//              add `livePreview: true` if YouTube's preview picture of the
//              stream shows the real current view, not a promo picture)
//              or "image" (still picture reloaded every 10 min, needs `url`)
//
// To add a camera: find a YouTube live stream, copy the part after
// "watch?v=" in its address, and add a new entry below.

const CAMS = [
  // ---------- Finland ----------
  { id: "helsinki-lauttasaari", where: "Lauttasaari, Helsinki", lat: 60.1555, lon: 24.8705,
    caption: "Sea view · Larukite", type: "youtube", video: "o45aDp57IM8", livePreview: true },
  { id: "espoo-nuuksio", where: "Nuuksio, Espoo", lat: 60.29, lon: 24.55,
    caption: "Forest feeding spot · Feel The Nature", type: "youtube", video: "JWta8Urznhw" },
  { id: "helsinki-south-harbour", where: "South Harbour, Helsinki", lat: 60.1665, lon: 24.9565,
    caption: "Harbour · Port of Helsinki", type: "youtube", video: "CvOB-Is_yYU", livePreview: true },
  { id: "ristiina-road13", where: "Road 13, Ostolahti", lat: 61.4533, lon: 27.2646,
    caption: "Road cam · Fintraffic", type: "image", url: "https://weathercam.digitraffic.fi/C0350501.jpg" },
  { id: "kirkkonummi-inkila", where: "Road 50, Inkilä, Kirkkonummi", lat: 60.138, lon: 24.5345,
    caption: "Road cam · Fintraffic", type: "image", url: "https://weathercam.digitraffic.fi/C0158401.jpg" },
  { id: "toholampi-road63", where: "Road 63, Toholampi", lat: 63.7674, lon: 24.2451,
    caption: "Road cam · Fintraffic", type: "image", url: "https://weathercam.digitraffic.fi/C1053902.jpg" },

  // ---------- Estonia ----------
  { id: "kuressaare-square", where: "Kuressaare town square", lat: 58.2528, lon: 22.4845,
    caption: "Town square · Saarte Hääl", type: "youtube", video: "DSVZvGa4ZOw" },
  { id: "tallinn-citycam", where: "Tallinn", lat: 59.437, lon: 24.7536,
    caption: "City view · Digital.Tallinn", type: "youtube", video: "VhVgZi2lGv0" },

  // ---------- Spain ----------
  { id: "rincon-victoria-beach", where: "Rincón de la Victoria", lat: 36.717, lon: -4.278,
    caption: "Beach cam · Malaga Live Cam", type: "youtube", video: "Ib0xbFBU9Wg", livePreview: true },
  { id: "sabinillas-beach", where: "Sabinillas, Manilva", lat: 36.369, lon: -5.228,
    caption: "Beach cam · SabinillasBeach", type: "youtube", video: "9nOjBJE9AUU" },

  // ---------- Asia ----------
  { id: "tokyo-shibuya", where: "Shibuya, Tokyo", lat: 35.6595, lon: 139.7005,
    caption: "Shibuya Scramble Crossing · FNN", type: "youtube", video: "dfVK7ld38Ys" },
  { id: "seoul-han-river", where: "Han River, Seoul", lat: 37.53, lon: 126.94,
    caption: "Han River · Han River Live 365", type: "youtube", video: "5gVrWGRZo9s" },

  // ---------- USA ----------
  { id: "weehawken-lincoln-harbor", where: "Lincoln Harbor, Weehawken", lat: 40.7616, lon: -74.0237,
    caption: "Hudson waterfront · EarthCam", type: "youtube", video: "sixP_dAJ8D4", livePreview: true },
  { id: "seaside-heights", where: "Seaside Heights, NJ", lat: 39.944, lon: -74.073,
    caption: "Beach & boardwalk · EarthCam", type: "youtube", video: "OBgCrw-IyhE" },
  { id: "sf-bay-bridge", where: "Bay Bridge, San Francisco", lat: 37.7983, lon: -122.3778,
    caption: "Bay Bridge · ABC7 News", type: "youtube", video: "CXYr04BWvmc" },
];

// The wall someone sees the first time they open the site
// (before they edit anything or open a shared link).
// cam can be a catalogue id, or null for "no camera".
const DEFAULT_PLACES = [
  { name: "Helsinki",                lat: 60.1695, lon: 24.9355, tz: "Europe/Helsinki",  cam: "helsinki-south-harbour" },
  { name: "Espoo",                   lat: 60.2055, lon: 24.6559, tz: "Europe/Helsinki",  cam: "helsinki-lauttasaari" },
  { name: "Sundsberg, Kirkkonummi",  lat: 60.1539, lon: 24.5696, tz: "Europe/Helsinki",  cam: "kirkkonummi-inkila" },
  { name: "Ristiina",                lat: 61.5059, lon: 27.2563, tz: "Europe/Helsinki",  cam: "ristiina-road13" },
  { name: "Toholammi",               lat: 63.7667, lon: 24.25,   tz: "Europe/Helsinki",  cam: "toholampi-road63" },
  { name: "Kuressaare",              lat: 58.2528, lon: 22.4845, tz: "Europe/Tallinn",   cam: "kuressaare-square" },
  { name: "Torremolinos",            lat: 36.6219, lon: -4.4999, tz: "Europe/Madrid",    cam: "rincon-victoria-beach" },
  { name: "Calahonda",               lat: 36.4928, lon: -4.7172, tz: "Europe/Madrid",    cam: "sabinillas-beach" },
  { name: "Jersey City",             lat: 40.7178, lon: -74.0431, tz: "America/New_York", cam: "weehawken-lincoln-harbor" },
];
