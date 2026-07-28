# Tool Hub

A local GUI for your content automation tools — analytics dashboard, script runner, and lead magnet generator.

## Quick Start

### 1. Start the API server (on your local machine)
```bash
cd backend
pip install fastapi uvicorn pydantic
python3 start.py
# → http://localhost:8080
```

### 2. Open the frontend
Open `frontend/index.html` in your browser, or deploy to Vercel:

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy
vercel --prod
```

### 3. Configure the API URL
In the frontend, go to **Config** tab and set the backend URL (default: `http://localhost:8080`).

## Features

### 📊 Analytics Dashboard
- Post stats by platform, type, and category
- Daily activity chart (last 14 days)
- Recent posts table

### 🔧 Tool Hub
- Auto-discovers all scripts in `~/.hermes/scripts/`
- Shows descriptions, function signatures, metadata
- Run any script directly from the browser
- Filter by category and search

### ⚡ Lead Magnet Generator
- Generate "Bitcoin for Beginners" PDF from your story pool
- 5 sections with curated content
- Affiliate links included
- Auto-uploads for sharing

## Architecture

- **Frontend**: Static SPA (HTML/CSS/JS) → deployable to Vercel
- **Backend**: FastAPI server → runs locally on your machine
- The frontend communicates with the backend via a configurable API URL

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | Post analytics |
| GET | `/api/tools` | List all scripts |
| GET | `/api/tools/{name}` | Script details |
| POST | `/api/tools/{name}/run` | Run a script |
| POST | `/api/generate-lead-magnet` | Generate PDF |
| GET | `/api/logs` | Recent logs |
