"""Check that the cameras in cams.js still work.

Run by GitHub once a day (see .github/workflows/check-cameras.yml), or by hand:

    python3 scripts/check_cameras.py

- YouTube streams: the stream's YouTube page says "isLiveNow":true while it's live.
  (A browser visiting our site isn't allowed to read YouTube pages, so this
  check has to run here instead.)
- Fintraffic road cams: an offline camera sends a 9897-byte "Image not
  available" picture instead of a real one.

Prints a short report. If a camera has stopped, it also writes the report to
camera-report.md and exits with code 1, so the workflow knows to open an issue.
"""

import re
import sys
import urllib.request

# With --include-replaced, also check cameras that already have a replacement
# (handy for testing: the old Jersey City stream has ended, so it always fails)
INCLUDE_REPLACED = "--include-replaced" in sys.argv

OFFLINE_PICTURE_SIZE = 9897


def fetch(url):
    request = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en",
        # Skip YouTube's cookie-consent page
        "Cookie": "CONSENT=YES+1",
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


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


def check(camera):
    """Returns "ok", "stopped" or "unknown" (couldn't tell), plus a note."""
    try:
        if camera["type"] == "youtube":
            page = fetch(f"https://www.youtube.com/watch?v={camera['video']}").decode("utf-8", "replace")
            live = re.search(r'"isLiveNow":(true|false)', page)
            if not live:
                return "unknown", "YouTube's page didn't say whether it's live"
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
    for camera in read_cameras():
        if camera["replacedBy"] and not INCLUDE_REPLACED:
            continue
        status, note = check(camera)
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
