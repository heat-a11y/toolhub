"""Tool Hub API — local backend server for the Tool Hub frontend.

Runs locally on the user's machine and provides access to:
- Post analytics from post_logger's SQLite DB
- Lead magnet PDF generation
- Auto-discovery and execution of scripts in ~/.hermes/scripts/

Usage: uvicorn main:app --host 0.0.0.0 --port 8080
"""

import os, sys, json, re, importlib.util, subprocess, textwrap
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Tool Hub API", version="1.0.0")

# Allow the frontend (wherever hosted) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCRIPTS_DIR = os.path.expanduser("~/.hermes/scripts")
DB_PATH = os.path.expanduser("~/.hermes/scripts/.post_log.db")
OUTPUT_DIR = os.path.expanduser("~")

# ── Helpers ──

def get_db_stats(days: int = 30, platform: Optional[str] = None) -> dict:
    """Read post analytics from SQLite DB."""
    if not os.path.exists(DB_PATH):
        return {
            "error": "No analytics database found. Run a post first.",
            "total": 0, "success": 0, "failures": 0,
            "by_platform": {}, "by_category": {}, "by_type": {},
            "recent": [], "daily": []
        }

    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Ensure table exists
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

    cutoff = datetime.now().timestamp() - days * 86400
    cutoff_str = datetime.fromtimestamp(cutoff).isoformat()

    query = "SELECT * FROM posts WHERE timestamp >= ?"
    params = [cutoff_str]
    if platform:
        query += " AND platform = ?"
        params.append(platform)

    rows = conn.execute(query + " ORDER BY timestamp DESC", params).fetchall()
    conn.close()

    total = len(rows)
    success = sum(1 for r in rows if r["status"] == "success")
    by_platform = {}
    by_category = {}
    by_type = {}
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
        "total": total,
        "success": success,
        "failures": total - success,
        "by_platform": by_platform,
        "by_category": by_category,
        "by_type": by_type,
        "days": days,
        "daily": sorted(daily.values(), key=lambda x: x["date"], reverse=True)[:14],
        "recent": [dict(r) for r in rows[:20]]
    }


def scan_scripts() -> list[dict]:
    """Auto-discover scripts in ~/.hermes/scripts/ and extract metadata."""
    if not os.path.isdir(SCRIPTS_DIR):
        return []

    tools = []
    exclude_patterns = ["__pycache__", ".pyc", ".bak", "stories/", "__init__"]

    for fname in sorted(os.listdir(SCRIPTS_DIR)):
        if any(pat in fname for pat in exclude_patterns):
            continue
        if not fname.endswith(".py"):
            continue

        fpath = os.path.join(SCRIPTS_DIR, fname)
        stat = os.stat(fpath)

        # Read docstring / first few lines for description
        description = ""
        category = "utility"
        with open(fpath, "r", errors="ignore") as f:
            content = f.read(2000)

        # Extract docstring
        doc_match = re.search(r'"""(.+?)"""', content, re.DOTALL)
        if doc_match:
            description = doc_match.group(1).strip().split("\n")[0][:200]
        else:
            # Use first comment line
            first_line = content.split("\n")[0] if content else ""
            description = first_line.replace("#", "").strip()[:200] if first_line.startswith("#") else ""

        # Categorize by content
        if "post" in fname.lower() or "reel" in fname.lower() or "daily_" in fname.lower():
            category = "posting"
        elif "lead" in fname.lower() or "magnet" in fname.lower():
            category = "content"
        elif "analytics" in fname.lower() or "log" in fname.lower() or "stats" in fname.lower():
            category = "analytics"
        elif "host" in fname.lower() or "upload" in fname.lower():
            category = "utility"
        elif "pinterest" in fname.lower():
            category = "social"
        elif "generate" in fname.lower() or "gen_" in fname.lower():
            category = "content"
        elif "content_" in fname.lower() or "selector" in fname.lower():
            category = "content"
        elif "engagement" in fname.lower() or "affiliate" in fname.lower():
            category = "posting"

        tools.append({
            "name": fname.replace(".py", ""),
            "filename": fname,
            "path": fpath,
            "description": description[:150],
            "category": category,
            "size_kb": round(stat.st_size / 1024, 1),
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })

    return tools


def get_script_help(script_name: str) -> dict:
    """Get detailed info about a script by importing or inspecting it."""
    fpath = os.path.join(SCRIPTS_DIR, f"{script_name}.py")
    if not os.path.exists(fpath):
        fpath = os.path.join(SCRIPTS_DIR, script_name)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail=f"Script '{script_name}' not found")

    with open(fpath, "r", errors="ignore") as f:
        content = f.read()

    # Full docstring
    docstring = ""
    doc_match = re.search(r'"""(.+?)"""', content, re.DOTALL)
    if doc_match:
        docstring = doc_match.group(1).strip()

    # Find functions
    functions = re.findall(r'^def (\w+)\((.*?)\):', content, re.MULTILINE)
    funcs = [{"name": f[0], "args": f[1][:100]} for f in functions if not f[0].startswith("_")]

    # Find config/settings
    configs = re.findall(r'^(\w+)\s*=\s*(?:os\.environ|open|")', content, re.MULTILINE)
    config_vars = [c for c in configs if c.isupper()][:20]

    return {
        "name": script_name,
        "path": fpath,
        "docstring": docstring,
        "functions": funcs[:30],
        "config_vars": config_vars,
        "line_count": len(content.split("\n")),
        "size_kb": round(os.path.getsize(fpath) / 1024, 1),
    }


# ── API Endpoints ──

@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat()}


@app.get("/api/stats")
def stats(
    days: int = Query(30, description="Number of days to look back"),
    platform: Optional[str] = Query(None, description="Filter by platform"),
):
    """Get post analytics from the SQLite database."""
    return get_db_stats(days=days, platform=platform)


@app.get("/api/tools")
def list_tools():
    """Auto-discover all available scripts/tools."""
    return {"tools": scan_scripts()}


@app.get("/api/tools/{name}")
def tool_info(name: str):
    """Get detailed info about a specific tool/script."""
    return get_script_help(name)


@app.get("/api/config")
def get_config():
    """Get environment/config info about the local machine."""
    return {
        "scripts_dir": SCRIPTS_DIR,
        "db_exists": os.path.exists(DB_PATH),
        "hostname": os.uname().nodename,
        "python_version": sys.version,
    }


# ── Run endpoint — executes a script in a subprocess ──

class RunRequest(BaseModel):
    args: str = ""
    timeout: int = 120

@app.post("/api/tools/{name}/run")
def run_tool(name: str, req: RunRequest):
    """Run a script from ~/.hermes/scripts/ and return its output."""
    fpath = os.path.join(SCRIPTS_DIR, f"{name}.py")
    if not os.path.exists(fpath):
        fpath = os.path.join(SCRIPTS_DIR, name)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail=f"Script '{name}' not found")

    cmd = [sys.executable, fpath]
    if req.args:
        cmd.extend(req.args.split())

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=req.timeout,
            cwd=SCRIPTS_DIR,
        )
        return {
            "exit_code": result.returncode,
            "stdout": result.stdout[-5000:] if len(result.stdout) > 5000 else result.stdout,
            "stderr": result.stderr[-2000:] if len(result.stderr) > 2000 else result.stderr,
            "success": result.returncode == 0,
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail=f"Script timed out after {req.timeout}s")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Generate lead magnet PDF ──

@app.post("/api/generate-lead-magnet")
def generate_lead_magnet():
    """Generate the Bitcoin for Beginners lead magnet PDF."""
    try:
        sys.path.insert(0, SCRIPTS_DIR)
        from generate_lead_magnet import generate_pdf
        pdf_path, share_url = generate_pdf()
        return {
            "success": True,
            "path": pdf_path,
            "url": share_url,
            "size_kb": round(os.path.getsize(pdf_path) / 1024, 1) if os.path.exists(pdf_path) else 0,
        }
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }


# ── PDF Library — 12 lead magnet variations ──

PDF_TOPICS_LIST = [
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

class PdfTopicRequest(BaseModel):
    upload: bool = False

@app.get("/api/pdf-library")
def list_pdf_topics():
    """List all available PDF lead magnet topics."""
    return {"topics": PDF_TOPICS_LIST, "count": len(PDF_TOPICS_LIST)}

@app.post("/api/pdf-library/{topic_id}")
def generate_pdf_topic(topic_id: str, req: PdfTopicRequest = PdfTopicRequest()):
    """Generate a PDF for the given topic ID."""
    try:
        sys.path.insert(0, SCRIPTS_DIR)
        from generate_pdf_library import generate_pdf
        pdf_path, share_url = generate_pdf(topic_id, upload=req.upload)
        return {
            "success": True,
            "topic_id": topic_id,
            "path": pdf_path,
            "url": share_url,
            "size_kb": round(os.path.getsize(pdf_path) / 1024, 1) if os.path.exists(pdf_path) else 0,
        }
    except Exception as e:
        import traceback
        return {
            "success": False,
            "topic_id": topic_id,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }

@app.post("/api/pdf-library/generate/all")
def generate_all_pdfs(req: PdfTopicRequest = PdfTopicRequest()):
    """Generate all 12 PDFs."""
    try:
        sys.path.insert(0, SCRIPTS_DIR)
        from generate_pdf_library import generate_all
        results = generate_all(upload=req.upload)
        return {"success": True, "results": results, "total": len(results)}
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}


# ── Cron jobs ──

@app.get("/api/cron")
def list_cron():
    """List all scheduled cron jobs with their status."""
    try:
        import subprocess, re
        result = subprocess.run(
            ["hermes", "cron", "list"],
            capture_output=True, text=True, timeout=15,
            cwd=os.path.expanduser("~")
        )
        if result.returncode == 0:
            output = result.stdout
            jobs = []
            # Parse the table format
            blocks = re.split(r'\n\s*\n', output)
            for block in blocks:
                block = block.strip()
                if not block or block.startswith('┌') or block.startswith('└') or block.startswith('│'):
                    continue
                lines = block.split('\n')
                if not lines:
                    continue
                first = lines[0].strip()
                if not first:
                    continue
                # Check if first line has job_id
                m = re.match(r'(\S+)\s+\[(\w+)\]', first)
                if not m:
                    continue
                job_id = m.group(1)
                state = m.group(2)
                job = {"job_id": job_id, "state": state}
                for line in lines[1:]:
                    line = line.strip()
                    if ':' in line:
                        key, val = line.split(':', 1)
                        key = key.strip().lower().replace(' ', '_')
                        val = val.strip()
                        job[key] = val
                        # Parse last_run if present
                        if key == 'last_run' and '  ' in val:
                            parts = val.rsplit('  ', 1)
                            job['last_run'] = parts[0].strip()
                            job['last_status'] = parts[1].strip()
                jobs.append(job)
            return {"jobs": jobs}
    except Exception as e:
        print(f"Cron parse error: {e}")
    return {"jobs": [], "error": "Could not fetch cron jobs"}


# ── Run post logger stats ──

@app.get("/api/logs")
def get_logs(
    days: int = Query(7, description="Number of days to look back"),
    limit: int = Query(50, description="Max log entries"),
):
    """Get recent post logs from the SQLite database."""
    if not os.path.exists(DB_PATH):
        return {"logs": [], "total": 0}

    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Ensure table exists
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

    cutoff = datetime.now().timestamp() - days * 86400
    cutoff_str = datetime.fromtimestamp(cutoff).isoformat()

    rows = conn.execute(
        "SELECT * FROM posts WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?",
        (cutoff_str, limit)
    ).fetchall()
    conn.close()

    return {"logs": [dict(r) for r in rows], "total": len(rows)}


if __name__ == "__main__":
    import uvicorn
    print("🚀 Tool Hub API running on http://localhost:8080")
    print("   API docs: http://localhost:8080/docs")
    uvicorn.run(app, host="0.0.0.0", port=8080)
