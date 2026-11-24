"""Suggest a replacement for each camera that has stopped working.

Run by the daily camera check (.github/workflows/check-cameras.yml) right
after scripts/check_cameras.py has found a stopped camera. It reads
camera-stopped.json and, for each stopped camera, looks for a working one
nearby:

- YouTube streams: asks the YouTube Data API (key in YOUTUBE_API_KEY) for
  live streams near the camera's spot and with the place's name, and keeps
  only ones that are live right now and allowed on other sites.
- Fintraffic road cams: the nearest road cam that isn't offline.

Then it edits the files the way we would by hand:
- adds the new camera to cams.js, right below the old one,
- gives the old camera `replacedBy: "<new id>"` (it is never removed),
- bumps ?v= in index.html so browsers load the new cams.js.

It writes fix-pr.md (the pull request text) and fix-branch.txt (a branch
name). The workflow turns those into a pull request, so nothing reaches the
site until someone has looked at the suggestion and pressed Merge.
"""

import gzip
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "").strip()
SEARCH_RADIUS_KM = 50
OFFLINE_PICTURE_SIZE = 9897  # Fintraffic's "Image not available" picture


def fetch(url, headers=None):
    # Digitraffic only answers clients that accept gzip-packed answers
    request = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip", **(headers or {})})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read()
        if response.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
        return data


def youtube(endpoint, **params):
    """Ask the YouTube Data API. The key goes in a header, never in the address."""
    url = f"https://www.googleapis.com/youtube/v3/{endpoint}?" + urllib.parse.urlencode(params)
    return json.loads(fetch(url, headers={"X-Goog-Api-Key": YOUTUBE_API_KEY}))


def distance_km(lat1, lon1, lat2, lon2):
    """Distance between two spots on the globe, in kilometres."""
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 6371 * 2 * math.asin(math.sqrt(a))


# ---------- Finding a replacement ----------

def youtube_candidates(camera, videos_in_use):
    """Live YouTube streams near the camera, best first."""
    found = []  # video ids, in the order the searches return them
    searches = [
        # Streams whose owner tagged them with a spot near ours
        {"location": f"{camera['lat']},{camera['lon']}", "locationRadius": f"{SEARCH_RADIUS_KM}km"},
    ]
    # Streams with the place's name, e.g. "Weehawken live cam"
    # ("Lincoln Harbor, Weehawken" -> "Weehawken" and the whole name)
    names = [camera["where"].split(",")[-1].strip(), camera["where"]]
    for name in dict.fromkeys(names):
        searches.append({"q": f"{name} live cam"})
    for extra in searches:
        try:
            answer = youtube("search", part="id", type="video", eventType="live",
                             videoEmbeddable="true", maxResults=10, **extra)
        except Exception as error:
            print(f"  a YouTube search didn't work ({error})")
            continue
        for item in answer.get("items", []):
            video_id = item["id"]["videoId"]
            if video_id not in found and video_id not in videos_in_use:
                found.append(video_id)
    if not found:
        return []

    # Look closer at each one: is it really live, may we show it, where is it?
    answer = youtube("videos", part="snippet,status,recordingDetails", id=",".join(found[:50]))
    candidates = []
    for item in answer.get("items", []):
        if item["snippet"].get("liveBroadcastContent") != "live":
            continue
        if not item["status"].get("embeddable", True):
            continue
        where = (item.get("recordingDetails") or {}).get("location") or {}
        km = None
        if "latitude" in where and "longitude" in where:
            km = distance_km(camera["lat"], camera["lon"], where["latitude"], where["longitude"])
            if km > SEARCH_RADIUS_KM:
                continue
        candidates.append({
            "video": item["id"],
            "title": item["snippet"]["title"],
            "channel": item["snippet"]["channelTitle"],
            "lat": where.get("latitude"),
            "lon": where.get("longitude"),
            "km": km,
        })
    # Streams with a known spot first, nearest first; then the rest in search order
    candidates.sort(key=lambda c: (c["km"] is None, c["km"] or 0))
    return candidates


def road_cam_candidates(camera, urls_in_use):
    """Working Fintraffic road cams, nearest first."""
    stations = json.loads(fetch("https://tie.digitraffic.fi/api/weathercam/v1/stations"))
    nearby = []
    for station in stations["features"]:
        lon, lat = station["geometry"]["coordinates"][:2]
        km = distance_km(camera["lat"], camera["lon"], lat, lon)
        if km > SEARCH_RADIUS_KM or station["properties"].get("collectionStatus") != "GATHERING":
            continue
        for preset in station["properties"].get("presets", []):
            # Presets ending in 09 point at the road surface
            if preset["id"].endswith("09") or not preset.get("inCollection", True):
                continue
            url = f"https://weathercam.digitraffic.fi/{preset['id']}.jpg"
            if url not in urls_in_use:
                nearby.append({"url": url, "name": station["properties"]["name"],
                               "lat": lat, "lon": lon, "km": km})
    nearby.sort(key=lambda c: c["km"])
    working = []
    for candidate in nearby:
        try:
            if len(fetch(candidate["url"])) != OFFLINE_PICTURE_SIZE:
                working.append(candidate)
        except Exception:
            pass
        if len(working) == 5:
            break
    return working


def road_name(station_name):
    """'kt51_Inkoo' -> 'Road 51, Inkoo'"""
    match = re.match(r"(?:vt|kt|st|mt|yt)(\d+)_(.+)", station_name)
    if match:
        return f"Road {match.group(1)}, {match.group(2).replace('_', ' ')}"
    return station_name.replace("_", " ")


# ---------- Editing the files ----------

def new_id(old_id, ids_in_use):
    """'weehawken-lincoln-harbor' -> 'weehawken-lincoln-harbor-2' (or -3, ...)"""
    base = re.sub(r"-\d+$", "", old_id)
    number = 2
    while f"{base}-{number}" in ids_in_use:
        number += 1
    return f"{base}-{number}"


def clean(text):
    """Make text safe to put between double quotes in cams.js."""
    return text.replace("\\", "").replace('"', "'").strip()


def add_replacement(cams_text, old_id, entry_text, replacement_id):
    """Put the new entry below the old one and point the old one at it."""
    match = re.search(r'\{\s*id:\s*"' + re.escape(old_id) + r'"[^}]*\}', cams_text)
    old_entry = match.group(0)
    if "replacedBy:" in old_entry:
        updated = re.sub(r'replacedBy:\s*"[^"]*"', f'replacedBy: "{replacement_id}"', old_entry)
    else:
        updated = old_entry[:-1].rstrip() + f',\n    replacedBy: "{replacement_id}" }}'
    return cams_text.replace(old_entry, updated + ",\n" + entry_text.rstrip(","), 1)


def main():
    stopped = json.load(open("camera-stopped.json", encoding="utf-8"))
    cams_text = open("cams.js", encoding="utf-8").read()
    ids_in_use = set(re.findall(r'\bid:\s*"([^"]+)"', cams_text))
    videos_in_use = set(re.findall(r'video:\s*"([^"]+)"', cams_text))
    urls_in_use = set(re.findall(r'url:\s*"([^"]+)"', cams_text))

    fixed, not_fixed, pr = [], [], []
    for camera in stopped:
        print(f"Looking for a replacement for {camera['id']} ({camera['where']})")
        replacement_id = new_id(camera["id"], ids_in_use)
        try:
            if camera["type"] == "youtube" and YOUTUBE_API_KEY:
                candidates = youtube_candidates(camera, videos_in_use)
            elif camera["type"] == "image" and "digitraffic" in (camera["url"] or ""):
                candidates = road_cam_candidates(camera, urls_in_use)
            else:
                candidates = []
        except Exception as error:
            print(f"  couldn't search ({error})")
            candidates = []
        if not candidates:
            print("  nothing found")
            not_fixed.append(camera["id"])
            continue

        best = candidates[0]
        lat = round(best["lat"], 4) if best["lat"] is not None else camera["lat"]
        lon = round(best["lon"], 4) if best["lon"] is not None else camera["lon"]
        if camera["type"] == "youtube":
            # Same name if it's right there; "Near ..." if it's further away
            where = camera["where"] if (best["km"] or 0) < 1 else f"Near {camera['where']}"
            entry = (f'  {{ id: "{replacement_id}", where: "{clean(where)}", lat: {lat}, lon: {lon},\n'
                     f'    caption: "Live view · {clean(best["channel"])}", type: "youtube", video: "{best["video"]}" }},')
            link = lambda c: f"https://www.youtube.com/watch?v={c['video']}"
            describe = lambda c: f"{c['title']} · {c['channel']}"
            videos_in_use.add(best["video"])
        else:
            entry = (f'  {{ id: "{replacement_id}", where: "{clean(road_name(best["name"]))}", lat: {lat}, lon: {lon},\n'
                     f'    caption: "Road cam · Fintraffic", type: "image", url: "{best["url"]}" }},')
            link = lambda c: c["url"]
            describe = lambda c: road_name(c["name"])
            urls_in_use.add(best["url"])
        cams_text = add_replacement(cams_text, camera["id"], entry, replacement_id)
        ids_in_use.add(replacement_id)
        fixed.append(camera["id"])
        print(f"  suggesting {replacement_id}: {link(best)}")

        distance = lambda c: f"{c['km']:.0f} km away" if c["km"] is not None else "distance unknown"
        pr += [f"### {camera['where']}", "",
               f"**{camera['id']}** has stopped. Suggested replacement **{replacement_id}**:",
               f"{describe(best)} ({distance(best)})", link(best), ""]
        if len(candidates) > 1:
            pr += ["Other choices:", ""]
            pr += [f"- {describe(c)} ({distance(c)}): {link(c)}" for c in candidates[1:5]]
            pr += [""]

    if not fixed:
        print("No replacements found.")
        return 0

    open("cams.js", "w", encoding="utf-8").write(cams_text)
    # Bump ?v= in index.html so browsers load the new cams.js
    index = open("index.html", encoding="utf-8").read()
    index = re.sub(r"\?v=(\d+)", lambda m: f"?v={int(m.group(1)) + 1}", index)
    open("index.html", "w", encoding="utf-8").write(index)

    body = ["The daily camera check found a stopped camera and a working one nearby.",
            "Nothing changes on the site until this is merged.", "", *pr,
            "**Before merging**, open the link and check that it shows a real view "
            "and a good one. To use one of the other choices instead, edit `video:` "
            "(or `url:`) in `cams.js` on this branch. Also worth tidying in `cams.js`: "
            "the `where` and `caption` text.", "",
            "The old camera stays in `cams.js` with `replacedBy`, so old walls and "
            "share links switch to the new one."]
    if not_fixed:
        body += ["", "No replacement found for: " + ", ".join(not_fixed) + " (needs a hand-picked one)."]
    open("fix-pr.md", "w", encoding="utf-8").write("\n".join(body) + "\n")
    open("fix-branch.txt", "w", encoding="utf-8").write("fix-camera/" + "--".join(fixed) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
