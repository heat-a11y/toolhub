#!/usr/bin/env python3
"""Generate static JSON snapshot of all Tool Hub data for GitHub Pages frontend."""
import json, os, sys, sqlite3, subprocess, re
from datetime import datetime
from pathlib import Path

SCRIPTS_DIR = os.path.expanduser("~/.hermes/scripts")
DB_PATH = os.path.expanduser("~/.hermes/scripts/.post_log.db")
OUTPUT_PATH = os.path.expanduser("~/toolhub/frontend/data.json")

# 1. Post analytics stats
def get_stats():
    if not os.path.exists(DB_PATH):
        return {"total": 0, "success": 0, "failures": 0, "by_platform": {}, "by_category": {}, "by_type": {}, "daily": [], "recent": []}
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        platform TEXT NOT NULL,
        post_id TEXT,
        post_type TEXT NOT NULL,
        category TEXT,
        stories TEXT,
        status TEXT NOT NULL,
        error TEXT
    )""")
    conn.commit()
    cutoff = datetime.now().timestamp() - 30 * 86400
    cutoff_str = datetime.fromtimestamp(cutoff).isoformat()
    rows = conn.execute("SELECT * FROM posts WHERE timestamp >= ? ORDER BY timestamp DESC", [cutoff_str]).fetchall()
    conn.close()
    total = len(rows)
    success_count = sum(1 for r in rows if r["status"] == "success")
    by_platform, by_category, by_type = {}, {}, {}
    daily = {}
    for r in rows:
        p = r["platform"]
        by_platform[p] = by_platform.get(p, 0) + 1
        cat = r["category"] or "unknown"
        by_category[cat] = by_category.get(cat, 0) + 1
        t = r["post_type"]
        by_type[t] = by_type.get(t, 0) + 1
        day = r["timestamp"][:10] if r["timestamp"] else "unknown"
        if day not in daily:
            daily[day] = {"date": day, "total": 0, "success": 0, "failures": 0}
        daily[day]["total"] += 1
        if r["status"] == "success":
            daily[day]["success"] += 1
        else:
            daily[day]["failures"] += 1
    return {
        "total": total, "success": success_count, "failures": total - success_count,
        "by_platform": by_platform, "by_category": by_category, "by_type": by_type,
        "days": 30,
        "daily": sorted(daily.values(), key=lambda x: x["date"], reverse=True)[:14],
        "recent": [dict(r) for r in rows[:20]]
    }

# 2. Scan scripts
def scan_scripts():
    if not os.path.isdir(SCRIPTS_DIR):
        return []
    tools = []
    exclude = ["__pycache__", ".pyc", ".bak", "stories/", "__init__"]
    for fname in sorted(os.listdir(SCRIPTS_DIR)):
        if any(p in fname for p in exclude) or not fname.endswith(".py"):
            continue
        fpath = os.path.join(SCRIPTS_DIR, fname)
        stat = os.stat(fpath)
        with open(fpath, "r", errors="ignore") as f:
            content = f.read(2000)
        doc_match = re.search(r'"""(.+?)"""', content, re.DOTALL)
        description = doc_match.group(1).strip().split("\n")[0][:200] if doc_match else ""
        category = "utility"
        fl = fname.lower()
        if "post" in fl or "reel" in fl or "daily_" in fl:
            category = "posting"
        elif "lead" in fl or "magnet" in fl:
            category = "content"
        elif "log" in fl or "stats" in fl:
            category = "analytics"
        elif "host" in fl or "upload" in fl:
            category = "utility"
        elif "generate" in fl:
            category = "content"
        elif "content_" in fl or "selector" in fl:
            category = "content"
        elif "engagement" in fl or "affiliate" in fl:
            category = "posting"
        elif "ai_polish" in fl:
            category = "utility"
        elif "quota" in fl:
            category = "utility"
        tools.append({
            "name": fname.replace(".py", ""),
            "filename": fname,
            "description": description[:150],
            "category": category,
            "size_kb": round(stat.st_size / 1024, 1),
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })
    return tools

# 3. Cron jobs
def get_cron():
    try:
        result = subprocess.run(["hermes", "cron", "list"], capture_output=True, text=True, timeout=15)
        if result.returncode == 0:
            jobs = []
            blocks = re.split(r'\n\s*\n', result.stdout)
            for block in blocks:
                block = block.strip()
                if not block or block.startswith('┌') or block.startswith('└') or block.startswith('│'):
                    continue
                lines = block.split('\n')
                if not lines:
                    continue
                first = lines[0].strip()
                m = re.match(r'(\S+)\s+\[(\w+)\]', first)
                if not m:
                    continue
                job = {"job_id": m.group(1), "state": m.group(2)}
                for line in lines[1:]:
                    line = line.strip()
                    if ':' in line:
                        key, val = line.split(':', 1)
                        key = key.strip().lower().replace(' ', '_')
                        val = val.strip()
                        job[key] = val
                        if key == 'last_run' and '  ' in val:
                            parts = val.rsplit('  ', 1)
                            job['last_run'] = parts[0].strip()
                            job['last_status'] = parts[1].strip()
                jobs.append(job)
            return jobs
    except:
        pass
    return []

# 4. PDF library
PDF_TOPICS = [
    {"id": "whitepaper", "title": "Bitcoin Whitepaper Explained", "subtitle": "Simple breakdown of Satoshi's vision", "color": "#F7931A"},
    {"id": "austrian", "title": "Austrian Economics & Bitcoin", "subtitle": "Why the Austrian School predicted Bitcoin", "color": "#B47814"},
    {"id": "investing", "title": "Bitcoin Investment Playbook", "subtitle": "Strategies for the intelligent accumulator", "color": "#22C55E"},
    {"id": "security", "title": "Bitcoin Security Guide", "subtitle": "Self-custody done right", "color": "#6366F1"},
    {"id": "future", "title": "Bitcoin & The Future of Money", "subtitle": "How digital gold is reshaping the world", "color": "#14B478"},
    {"id": "mining", "title": "Bitcoin Mining Decoded", "subtitle": "How new coins are created", "color": "#FFA032"},
    {"id": "vsgold", "title": "Bitcoin vs Gold", "subtitle": "Why digital gold is winning", "color": "#FFD700"},
    {"id": "freedom", "title": "Bitcoin & Financial Freedom", "subtitle": "Opting out of the debt-based system", "color": "#DC3232"},
    {"id": "history", "title": "Bitcoin History Timeline", "subtitle": "From whitepaper to worldwide adoption", "color": "#B464C8"},
    {"id": "myths", "title": "Bitcoin Myths Debunked", "subtitle": "Separating fact from FUD", "color": "#3296FF"},
    {"id": "glossary", "title": "The Bitcoin Glossary", "subtitle": "100+ terms every Bitcoiner should know", "color": "#3CB4DC"},
    {"id": "maxi", "title": "The Bitcoin Maxi Manifesto", "subtitle": "Why only Bitcoin matters", "color": "#F7931A"},
]

snapshot = {
    "generated_at": datetime.now().isoformat(),
    "stats": get_stats(),
    "tools": scan_scripts(),
    "cron": get_cron(),
    "pdf_topics": PDF_TOPICS,
    "pdf_count": len(PDF_TOPICS),
}

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
with open(OUTPUT_PATH, "w") as f:
    json.dump(snapshot, f, indent=2)
print(f"✅ Snapshot written: {OUTPUT_PATH}")
print(f"   Stats: {snapshot['stats']['total']} posts, {len(snapshot['tools'])} tools, {len(snapshot['cron'])} cron jobs")
print(f"   Size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB")