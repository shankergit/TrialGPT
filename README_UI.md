# TrialGPT UI

This directory contains the user interface for TrialGPT.

## Architecture
- **Frontend**: React + Vite (Port 5173)
- **Backend**: FastAPI (Port 8000)

## Prerequisites
- Node.js (v16+)
- Python 3.9+
- OpenAI API Key (for actual validation)

## Setup
1. **Frontend**:
   ```bash
   cd trialgpt_app/frontend
   npm install
   ```

2. **Backend**:
   ```bash
   pip install fastapi uvicorn python-multipart
   ```

## Running the App

**Option 1: Quick Start**
Run the backend and frontend in separate terminals.

**Terminal 1 (Backend):**
```bash
./run_backend.sh
```

**Terminal 2 (Frontend):**
```bash
cd trialgpt_app/frontend
npm run dev
```

Open your browser at [http://localhost:5173](http://localhost:5173).

## Features
- Browse patients from SIGIR, TREC 2021, and TREC 2022 datasets.
- Search/Filter patients.
- Run Validation (Mocked demo mode enabled by default).
