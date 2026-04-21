"""
fetch_jobs.py — Daily job fetcher.

Pulls jobs from free JSON APIs (RemoteOK, Remotive, Arbeitnow) and RSS feeds
(WeWorkRemotely), normalizes them to a common schema, filters by keywords,
deduplicates, and writes to data/jobs.json.

No API keys needed. Run via GitHub Actions (see .github/workflows/fetch-jobs.yml).

Usage:
    python scripts/fetch_jobs.py
"""

import json
import re
import sys
import time
import hashlib
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SOURCES_FILE = DATA_DIR / "sources.json"
OUTPUT_FILE = DATA_DIR / "jobs.json"

USER_AGENT = "job-hub-fetcher/1.0 (+https://github.com)"


def http_get(url, timeout=30):
    """HTTP GET with a user agent; returns bytes or raises."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json, application/rss+xml, */*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def strip_html(text):
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</p>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&#39;", "'", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def make_id(source_id, url):
    h = hashlib.sha1(f"{source_id}:{url}".encode()).hexdigest()[:12]
    return f"{source_id}-{h}"


# ---------- Source adapters ----------

def fetch_remoteok(source):
    """RemoteOK returns a JSON array; first element is a legal notice (skip)."""
    data = json.loads(http_get(source["url"]).decode("utf-8", errors="ignore"))
    out = []
    for j in data[1:] if data else []:
        url = j.get("url") or f"https://remoteok.com/remote-jobs/{j.get('id','')}"
        out.append({
            "id": make_id(source["id"], url),
            "title": j.get("position") or j.get("title") or "",
            "company": j.get("company") or "",
            "location": j.get("location") or "Remote",
            "url": url,
            "source": source["name"],
            "posted": (j.get("date") or "")[:10],
            "description": strip_html(j.get("description") or ""),
            "tags": j.get("tags") or []
        })
    return out


def fetch_remotive(source):
    data = json.loads(http_get(source["url"]).decode("utf-8", errors="ignore"))
    out = []
    for j in data.get("jobs", []):
        url = j.get("url") or ""
        out.append({
            "id": make_id(source["id"], url),
            "title": j.get("title") or "",
            "company": j.get("company_name") or "",
            "location": j.get("candidate_required_location") or "Remote",
            "url": url,
            "source": source["name"],
            "posted": (j.get("publication_date") or "")[:10],
            "description": strip_html(j.get("description") or ""),
            "tags": j.get("tags") or []
        })
    return out


def fetch_arbeitnow(source):
    data = json.loads(http_get(source["url"]).decode("utf-8", errors="ignore"))
    out = []
    for j in data.get("data", []):
        url = j.get("url") or ""
        out.append({
            "id": make_id(source["id"], url),
            "title": j.get("title") or "",
            "company": j.get("company_name") or "",
            "location": j.get("location") or (", ".join(j.get("tags") or []) or ""),
            "url": url,
            "source": source["name"],
            "posted": (j.get("created_at") or "")[:10] if j.get("created_at") else "",
            "description": strip_html(j.get("description") or ""),
            "tags": j.get("tags") or []
        })
    return out


def fetch_rss(source):
    """Parse a standard RSS 2.0 feed."""
    xml = http_get(source["url"])
    root = ET.fromstring(xml)
    channel = root.find("channel")
    if channel is None:
        return []
    out = []
    for item in channel.findall("item"):
        url = (item.findtext("link") or "").strip()
        title_raw = (item.findtext("title") or "").strip()
        description = strip_html(item.findtext("description") or "")
        pub_date = item.findtext("pubDate") or ""
        posted = ""
        try:
            posted = time.strftime("%Y-%m-%d", time.strptime(pub_date[:-6].strip(), "%a, %d %b %Y %H:%M:%S"))
        except Exception:
            posted = ""

        # WWR titles look like "Company: Title"
        company, title = "", title_raw
        if ": " in title_raw:
            company, title = title_raw.split(": ", 1)

        out.append({
            "id": make_id(source["id"], url),
            "title": title.strip(),
            "company": company.strip(),
            "location": "Remote",
            "url": url,
            "source": source["name"],
            "posted": posted,
            "description": description,
            "tags": []
        })
    return out


def fetch_himalayas(source):
    data = json.loads(http_get(source["url"]).decode("utf-8", errors="ignore"))
    out = []
    for j in data.get("jobs", []):
        url = j.get("applicationLink") or j.get("url") or ""
        out.append({
            "id": make_id(source["id"], url),
            "title": j.get("title") or "",
            "company": (j.get("company") or {}).get("name") or "",
            "location": j.get("locationRestrictions") or "Remote",
            "url": url,
            "source": source["name"],
            "posted": (j.get("createdAt") or "")[:10],
            "description": strip_html(j.get("description") or ""),
            "tags": j.get("skills") or []
        })
    return out


def fetch_jobicy(source):
    data = json.loads(http_get(source["url"]).decode("utf-8", errors="ignore"))
    out = []
    for j in data.get("jobs", []):
        url = j.get("url") or ""
        out.append({
            "id": make_id(source["id"], url),
            "title": j.get("jobTitle") or "",
            "company": j.get("companyName") or "",
            "location": j.get("jobGeo") or "Remote",
            "url": url,
            "source": source["name"],
            "posted": (j.get("pubDate") or "")[:10],
            "description": strip_html(j.get("jobExcerpt") or j.get("jobDescription") or ""),
            "tags": j.get("jobType") or []
        })
    return out


ADAPTERS = {
    "json_api_remoteok": fetch_remoteok,
    "json_api_remotive": fetch_remotive,
    "json_api_arbeitnow": fetch_arbeitnow,
    "json_api_himalayas": fetch_himalayas,
    "json_api_jobicy": fetch_jobicy,
    "rss": fetch_rss,
}


def route_adapter(source):
    """Pick the adapter based on source id + type."""
    if source["type"] == "rss":
        return fetch_rss
    if source["id"] == "remoteok":
        return fetch_remoteok
    if source["id"] == "remotive":
        return fetch_remotive
    if source["id"] == "arbeitnow":
        return fetch_arbeitnow
    if source["id"] == "himalayas":
        return fetch_himalayas
    if source["id"] == "jobicy":
        return fetch_jobicy
    return None


# ---------- Filtering ----------

def passes_filters(job, cfg):
    kws = [k.lower() for k in cfg.get("keywords", [])]
    excl = [k.lower() for k in cfg.get("exclude_keywords", [])]
    hay = f"{job.get('title','')} {job.get('description','')} {' '.join(job.get('tags',[]))}".lower()
    if kws and not any(k in hay for k in kws):
        return False
    if excl and any(k in hay for k in excl):
        return False
    if cfg.get("remote_only"):
        loc = (job.get("location") or "").lower()
        if "remote" not in loc and "anywhere" not in loc and "worldwide" not in loc:
            return False
    max_age = cfg.get("max_age_days")
    if max_age and job.get("posted"):
        try:
            posted = datetime.strptime(job["posted"], "%Y-%m-%d")
            age = (datetime.utcnow() - posted).days
            if age > max_age:
                return False
        except Exception:
            pass
    return True


# ---------- Main ----------

def main():
    if not SOURCES_FILE.exists():
        print(f"Missing {SOURCES_FILE}", file=sys.stderr)
        sys.exit(1)

    cfg = json.loads(SOURCES_FILE.read_text())
    all_jobs = []
    per_src_cap = cfg.get("max_jobs_per_source", 50)

    for source in cfg.get("sources", []):
        if not source.get("enabled", True):
            continue
        adapter = route_adapter(source)
        if not adapter:
            print(f"No adapter for source {source['id']}", file=sys.stderr)
            continue
        print(f"Fetching {source['name']}…")
        try:
            jobs = adapter(source)
        except (urllib.error.HTTPError, urllib.error.URLError, ET.ParseError, json.JSONDecodeError) as e:
            print(f"  FAILED: {e}", file=sys.stderr)
            continue

        kept = [j for j in jobs if passes_filters(j, cfg)][:per_src_cap]
        print(f"  {len(jobs)} raw → {len(kept)} after filters")
        all_jobs.extend(kept)

    # Dedupe by URL, then by normalized (title, company) to drop cross-source duplicates
    seen_urls = set()
    seen_title_co = set()
    deduped = []
    for j in all_jobs:
        url_key = (j.get("url") or j.get("id") or "").lower()
        tc_key = (
            re.sub(r"[^a-z0-9]", "", (j.get("title") or "").lower()) + "|" +
            re.sub(r"[^a-z0-9]", "", (j.get("company") or "").lower())
        )
        if url_key and url_key in seen_urls:
            continue
        if len(tc_key) > 4 and tc_key in seen_title_co:
            continue
        if url_key:
            seen_urls.add(url_key)
        if len(tc_key) > 4:
            seen_title_co.add(tc_key)
        deduped.append(j)

    # Sort: newest first
    deduped.sort(key=lambda j: j.get("posted") or "", reverse=True)

    output = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "count": len(deduped),
        "jobs": deduped
    }
    OUTPUT_FILE.write_text(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"\nWrote {len(deduped)} jobs to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
