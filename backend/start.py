#!/usr/bin/env python3
"""Start the Tool Hub API server."""
import os, sys

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("TOOLHUB_PORT", "8080"))
    host = os.environ.get("TOOLHUB_HOST", "0.0.0.0")
    print(f"🚀 Tool Hub API → http://{host}:{port}")
    print(f"   Docs → http://{host}:{port}/docs")
    print(f"   Frontend → open toolhub/frontend/index.html in your browser")
    print(f"   (or deploy to Vercel for a hosted version)")
    print()
    uvicorn.run("main:app", host=host, port=port, reload=True)
