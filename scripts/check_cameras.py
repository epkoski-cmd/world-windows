"""Check that the cameras in cams.js still work.

Run by GitHub once a day (see .github/workflows/check-cameras.yml), or by hand:

    python3 scripts/check_cameras.py

- YouTube streams: with a YouTube Data API key (environment variable
  YOUTUBE_API_KEY, kept as a GitHub secret), we ask YouTube's official API
  whether each stream is live and still allowed on other sites. Without a key
  we read the stream's YouTube page instead ("isLiveNow":true). That works
  from a home computer, but YouTube asks GitHub's computers to sign in.
- Fintraffic road cams: an offline camera sends a 9897-byte "Image not
  available" picture instead of a real one.

Prints a short report. If a camera has stopped, it also writes the report to
camera-report.md and exits with code 1, so the workflow knows to open an issue.
"""

import json
import os
import re
import sys
import urllib.request

# With --include-replaced, also check cameras that already have a replacement
# (handy for testing: the old Jersey City stream has ended, so it always fails)
INCLUDE_REPLACED = "--include-replaced" in sys.argv

OFFLINE_PICTURE_SIZE = 9897

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "").strip()


def fetch(url, headers=None):
    request = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en",
        # Skip YouTube's cookie-consent page
        "Cookie": "CONSENT=YES+1",
        **(headers or {}),
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def youtube_api_statuses(video_ids):
    """Ask the YouTube Data API about all our streams in one request.

    Returns {video_id: (status, note)}. The key goes in a header, not the
    address, so it never shows up in logs or error messages.
    """
    url = ("https://www.googleapis.com/youtube/v3/videos"
           "?part=snippet,status&id=" + ",".join(video_ids))
    answer = json.loads(fetch(url, headers={"X-Goog-Api-Key": YOUTUBE_API_KEY}))
    found = {item["id"]: item for item in answer.get("items", [])}
    statuses = {}
    for video_id in video_ids:
        item = found.get(video_id)
        if not item:
            statuses[video_id] = ("stopped", "the video is gone (deleted or made private)")
        elif not item["status"].get("embeddable", True):
            statuses[video_id] = ("stopped", "its owner no longer allows it on other sites")
        elif item["snippet"].get("liveBroadcastContent") == "live":
            statuses[video_id] = ("ok", "live")
        else:
            statuses[video_id] = ("stopped", "the stream isn't live any more")
    return statuses


def read_cameras():
    """Pull each camera's id, type, video/url and replacedBy out of cams.js."""
    text = open("cams.js", encoding="utf-8").read()
    catalogue = text.split("const CAMS = [")[1].split("];")[0]
    cameras = []
    # Each camera starts with `{ id: "..."`
    for entry in re.split(r"\{\s*id:", catalogue)[1:]:
        def field(name):
            match = re.search(name + r':\s*"([^"]*)"', entry)
            return match.group(1) if match else None
        cameras.append({
            "id": re.match(r'\s*"([^"]+)"', entry).group(1),
            "type": field("type"),
            "video": field("video"),
            "url": field("url"),
            "replacedBy": field("replacedBy"),
        })
    return cameras


def check(camera, api_statuses):
    """Returns "ok", "stopped" or "unknown" (couldn't tell), plus a note."""
    try:
        if camera["type"] == "youtube" and camera["video"] in api_statuses:
            return api_statuses[camera["video"]]
        if camera["type"] == "youtube":
            page = fetch(f"https://www.youtube.com/watch?v={camera['video']}").decode("utf-8", "replace")
            live = re.search(r'"isLiveNow":(true|false)', page)
            if not live:
                # Say what YouTube answered instead, to help work out why
                status = re.search(r'"playabilityStatus":\{"status":"([A-Z_]+)"(?:,"reason":"([^"]*)")?', page)
                said = f"{status.group(1)} {status.group(2) or ''}".strip() if status else page[:80].replace("\n", " ")
                return "unknown", f"YouTube's page didn't say whether it's live (it said: {said})"
            if live.group(1) == "true":
                return "ok", "live"
            return "stopped", "the stream isn't live any more"
        if camera["type"] == "image":
            picture = fetch(camera["url"])
            if len(picture) == OFFLINE_PICTURE_SIZE:
                return "stopped", "sends the 'Image not available' picture"
            return "ok", "picture works"
        # Windy cameras are checked by the site itself every time it loads
        return None, None
    except Exception as error:
        return "unknown", f"couldn't load it ({error})"


def main():
    stopped, unknown = [], []
    cameras = [c for c in read_cameras() if INCLUDE_REPLACED or not c["replacedBy"]]

    # With a key, ask the official YouTube API about every stream at once
    api_statuses = {}
    if YOUTUBE_API_KEY:
        videos = [c["video"] for c in cameras if c["type"] == "youtube"]
        try:
            api_statuses = youtube_api_statuses(videos)
            print("Checked YouTube streams with the YouTube Data API.")
        except Exception as error:
            print(f"The YouTube API didn't answer ({error}); reading YouTube pages instead.")
    else:
        print("No YOUTUBE_API_KEY: reading YouTube pages instead.")

    for camera in cameras:
        status, note = check(camera, api_statuses)
        if status is None:
            continue
        print(f"{status:8} {camera['id']}: {note}")
        line = f"- **{camera['id']}**: {note}"
        if camera["type"] == "youtube":
            line += f" (https://www.youtube.com/watch?v={camera['video']})"
        if status == "stopped":
            stopped.append(line)
        elif status == "unknown":
            unknown.append(line)

    if not stopped:
        print("All checked cameras work." if not unknown else "Nothing stopped; some couldn't be checked.")
        return 0

    report = ["These cameras in `cams.js` have stopped working:", "", *stopped, ""]
    if unknown:
        report += ["These couldn't be checked this time:", "", *unknown, ""]
    report += [
        "To fix: find a new camera nearby, add it to `cams.js`, and give the old one",
        '`replacedBy: "<new id>"` so walls and share links switch over. Never remove the old entry.',
    ]
    open("camera-report.md", "w", encoding="utf-8").write("\n".join(report) + "\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
