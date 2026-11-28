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
//              or "windy" (a still webcam picture from windy.com, needs
//              `windy`: the number at the end of the camera's windy.com address)
//   lit      – (optional) true if the view is still worth seeing after dark
//              (city lights, a lit harbour). At night, a place with two cameras
//              starts on its lit one. Only set it after checking a night picture!
//   replacedBy – (optional) id of the camera to show instead, when this one
//              has stopped working. Old walls and links then still show a view.
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
    caption: "Harbour · Port of Helsinki", type: "youtube", video: "CvOB-Is_yYU", livePreview: true, lit: true },
  { id: "ristiina-road13", where: "Road 13, Ostolahti", lat: 61.4533, lon: 27.2646,
    caption: "Road cam · Fintraffic", type: "image", url: "https://weathercam.digitraffic.fi/C0350501.jpg" },
  { id: "kirkkonummi-inkila", where: "Road 50, Inkilä, Kirkkonummi", lat: 60.138, lon: 24.5345,
    caption: "Road cam · Fintraffic", type: "image", url: "https://weathercam.digitraffic.fi/C0158401.jpg" },
  { id: "toholampi-road63", where: "Road 63, Toholampi", lat: 63.7674, lon: 24.2451,
    caption: "Road cam · Fintraffic", type: "image", url: "https://weathercam.digitraffic.fi/C1053902.jpg" },
  { id: "espoo-ringside-golf", where: "Ringside Golf, Espoo", lat: 60.2769, lon: 24.7408,
    caption: "Golf course · via Windy", type: "windy", windy: "1793919283" },
  { id: "kokkola-ohtakari", where: "Ohtakari, Kokkola", lat: 64.0894, lon: 23.4068,
    caption: "Seashore · via Windy", type: "windy", windy: "1616135607" },

  // ---------- Estonia ----------
  { id: "kuressaare-square", where: "Kuressaare town square", lat: 58.2528, lon: 22.4845,
    caption: "Town square · Saarte Hääl", type: "youtube", video: "DSVZvGa4ZOw", lit: true },
  { id: "kuressaare-muratsi", where: "Muratsi, near Kuressaare", lat: 58.2306, lon: 22.5758,
    caption: "Seaside · via Windy", type: "windy", windy: "1793875438" },
  { id: "tallinn-citycam", where: "Tallinn", lat: 59.437, lon: 24.7536,
    caption: "City view · Digital.Tallinn", type: "youtube", video: "VhVgZi2lGv0" },

  // ---------- Spain ----------
  { id: "rincon-victoria-beach", where: "Rincón de la Victoria", lat: 36.717, lon: -4.278,
    caption: "Beach cam · Malaga Live Cam", type: "youtube", video: "Ib0xbFBU9Wg", livePreview: true,
    replacedBy: "rincon-victoria-beach-2" },
  { id: "rincon-victoria-beach-2", where: "Rincón de la Victoria", lat: 36.717, lon: -4.278,
    caption: "Live view · Malaga Live Cam", type: "youtube", video: "m0yQLdqvnpg" },
  { id: "sabinillas-beach", where: "Sabinillas, Manilva", lat: 36.369, lon: -5.228,
    caption: "Beach cam · SabinillasBeach", type: "youtube", video: "9nOjBJE9AUU" },
  { id: "sabinillas-promenade", where: "Sabinillas, Manilva", lat: 36.3691, lon: -5.2247,
    caption: "Beach promenade · SabinillasBeach via Windy", type: "windy", windy: "1793908811" },
  { id: "fuengirola-beach", where: "Fuengirola", lat: 36.535, lon: -4.6232,
    caption: "Beach promenade · costawebcams via Windy", type: "windy", windy: "1649025487" },
  { id: "malaga-caleta", where: "La Caleta & Malagueta, Málaga", lat: 36.7226, lon: -4.3967,
    caption: "Sea and beach promenade · via Windy", type: "windy", windy: "1658397367" },

  // ---------- Asia ----------
  { id: "tokyo-shibuya", where: "Shibuya, Tokyo", lat: 35.6595, lon: 139.7005,
    caption: "Shibuya Scramble Crossing · FNN", type: "youtube", video: "dfVK7ld38Ys" },
  { id: "seoul-han-river", where: "Han River, Seoul", lat: 37.53, lon: 126.94,
    caption: "Han River · Han River Live 365", type: "youtube", video: "5gVrWGRZo9s" },

  // ---------- USA ----------
  // This stream ended in Nov 2026; walls that still use it get the 17th Street view
  { id: "weehawken-lincoln-harbor", where: "Lincoln Harbor, Weehawken", lat: 40.7616, lon: -74.0237,
    caption: "Hudson waterfront · EarthCam", type: "youtube", video: "sixP_dAJ8D4", livePreview: true,
    replacedBy: "nyc-hudson-17th" },
  { id: "nyc-hudson-17th", where: "17th Street, Manhattan", lat: 40.7445, lon: -74.0085,
    caption: "Hudson River, looking at Jersey City · Craig Nevill-Manning", type: "youtube",
    video: "kE_N1WY7UAY", livePreview: true },
  { id: "seaside-heights", where: "Seaside Heights, NJ", lat: 39.944, lon: -74.073,
    caption: "Beach & boardwalk · EarthCam", type: "youtube", video: "OBgCrw-IyhE",
    replacedBy: "seaside-heights-2" },
  { id: "seaside-heights-2", where: "Seaside Heights, NJ", lat: 39.944, lon: -74.073,
    caption: "Live view · ms36K", type: "youtube", video: "1l-nqyyhzro" },
  { id: "sf-bay-bridge", where: "Bay Bridge, San Francisco", lat: 37.7983, lon: -122.3778,
    caption: "Bay Bridge · ABC7 News", type: "youtube", video: "CXYr04BWvmc" },
];

// The wall someone sees the first time they open the site
// (before they edit anything or open a shared link).
// cam can be a catalogue id, or null for "no camera".
// cam2 (optional) is a second camera you can swipe to on the same tile.
const DEFAULT_PLACES = [
  { name: "Helsinki",                lat: 60.1695, lon: 24.9355, tz: "Europe/Helsinki",  cam: "helsinki-south-harbour", cam2: "helsinki-lauttasaari" },
  { name: "Espoo",                   lat: 60.2055, lon: 24.6559, tz: "Europe/Helsinki",  cam: "espoo-ringside-golf" },
  { name: "Sundsberg, Kirkkonummi",  lat: 60.1539, lon: 24.5696, tz: "Europe/Helsinki",  cam: "kirkkonummi-inkila" },
  { name: "Ristiina",                lat: 61.5059, lon: 27.2563, tz: "Europe/Helsinki",  cam: "ristiina-road13" },
  { name: "Toholampi",               lat: 63.7667, lon: 24.25,   tz: "Europe/Helsinki",  cam: "toholampi-road63" },
  { name: "Kokkola",                 lat: 63.8385, lon: 23.1307, tz: "Europe/Helsinki",  cam: "kokkola-ohtakari" },
  { name: "Kuressaare",              lat: 58.2528, lon: 22.4845, tz: "Europe/Tallinn",   cam: "kuressaare-square", cam2: "kuressaare-muratsi" },
  { name: "Malaga",                  lat: 36.7213, lon: -4.4214, tz: "Europe/Madrid",    cam: "malaga-caleta", cam2: "rincon-victoria-beach" },
  { name: "Jersey City",             lat: 40.7178, lon: -74.0431, tz: "America/New_York", cam: "nyc-hudson-17th" },
];
