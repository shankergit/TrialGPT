# TrialGPT Project - Knowledge Transfer & Migration Guide

## 🚨 MIGRATION CHECKLIST (READ FIRST)
**To resume work on the new machine, follow these exact steps:**

1.  **Git Branch**: Use the **`transfer-clean`** branch.
    ```bash
    git clone https://github.com/shankergit/TrialGPT.git
    cd TrialGPT
    git checkout transfer-clean
    ```
    *(Note: This branch contains all code/config but EXCLUDES the large `dataset/` folder to fit GitHub limits.)*

2.  **Data Transfer (CRITICAL)**:
    *   You **MUST manually copy** the `dataset/` folder from your old machine (or backup) to the root of this repo on the new machine.
    *   Required Path: `TrialGPT/dataset/`
    *   Expected Subfolders: `sigir/`, `trec_2021/`, `trec_2022/`.

3.  **Environment Variables**:
    *   Create a `.env` file in `trialgpt_app/backend/` (or set in terminal).
    *   Required: `OPENAI_API_KEY=sk-...` (Needed for future LLM integration).

4.  **Dependencies**:
    *   **Backend**: `pip install -r requirements.txt` (or manually: `fastapi uvicorn rank_bm25 pandas openai`)
    *   **Frontend**: `cd trialgpt_app/frontend && npm install`

---

## 1. Project Overview
**Name:** TrialGPT (HealthAnalyticsPOC)
**Purpose:** A Patient-to-Clinical-Trial Matching System using LLMS.
**Goal:** Automate the screening of patients against clinical trial eligibility criteria (Inclusion/Exclusion) using a multi-stage pipeline (Retrieval -> Evaluation -> Ranking).

## 2. Architecture

### Backend (`trialgpt_app/backend`)
*   **Framework:** FastAPI (Python).
*   **Entry Point:** `main.py`.
*   **Key Capabilities:**
    *   **Patient Data:** Loads patient narratives (SIGIR, TREC datasets).
    *   **Retrieval:** Uses `rank_bm25` for Keyword search and simulated dense retrieval.
    *   **Search Engine:** Local In-Memory Index (built from `dataset/sigir/corpus.jsonl`).
    *   **API Endpoints:**
        *   `GET /api/patients/{dataset}`: Fetches patient list.
        *   `POST /api/v1/validation/search`: (Primary) Runs the matching pipeline. Logic currently calculates retrieval scores and "Ground Truth" recall.
        *   `POST /api/v1/jobs/p2t`: (Legacy/Simulated) Async pipeline job simulation.

### Frontend (`trialgpt_app/frontend`)
*   **Framework:** React + Vite.
*   **Core Component:** `ValidationPage.jsx`.
    *   **Features:**
        *   Patient Search & Auto-Selection.
        *   Dynamic Filters (Age, Gender, Healthy Volunteers).
        *   **Real-time** Status Polling (mocked simulation).
        *   **Result Visualization:** detailed table with scores and "Ground Truth Comparison".
        *   **Modal View:** "Trial Evaluation Details" showing evidence/reasoning logic.
*   **Styling:** Custom CSS (`App.css`) matching a specific "Health Analytics" blue/white clean UI.

### Data Structure (`dataset/`)
*   **SIGIR Dataset:**
    *   `queries.jsonl`: Patient narratives.
    *   `corpus.jsonl`: Clinical trial documents (Title, Text, Criteria).
    *   `qrels/test.tsv`: Ground truth relevance labels for validation.

## 3. Current State of Development
*   **Frontend-Backend Connection:** ✅ Active.
*   **Retrieval Logic:** ✅ Real BM25 implementation logic is live in `main.py`.
*   **Evaluation Logic:** ⚠️ Partially Mocked. The UI shows detailed breakdown (Inclusion/Exclusion), but the backend sends static mock data for the *details* (evidence/reasoning) while using real *scores* for ranking.
*   **Next Immediate Step:** Replace the mock `evaluation_details` in `main.py` with actual LLM calls (OpenAI/Gemini) to generate real reasoning.

## 4. How to Run (On New Machine)

### Prerequisites
*   Python 3.9+
*   Node.js & npm

### Setup Steps
1.  **Clone/Copy Repo**: Ensure `dataset/` folder is included (it's large).
2.  **Backend Start**:
    ```bash
    cd trialgpt_app/backend
    pip install fastapi uvicorn rank_bm25 pandas
    python main.py
    # Runs on http://localhost:8000
    ```
3.  **Frontend Start**:
    ```bash
    cd trialgpt_app/frontend
    npm install
    npm run dev
    # Runs on http://localhost:5173
    ```

## 5. Key Files to Know
| File | Purpose |
| :--- | :--- |
| `trialgpt_app/backend/main.py` | **The Brain.** Contains the Search API, Indexing logic, and Mock data structures. |
| `trialgpt_app/frontend/src/components/ValidationPage.jsx` | **The UI.** Handles all user interaction, filtering, and result display. |

## 6. AI Context & Pending Tasks
**Crucial Context for Future AI Agents:**

1.  **UI Requirements (From Zoom Transcript):**
    *   The **"Trial Evaluation Details"** modal is a critical feature. It MUST show:
        *   **Status Badges:** Green (Met), Red (Not Met), Yellow (Not Enough Info).
        *   **Reasoning & Evidence:** Collapsible sections for *why* a decision was made.
    *   *Current Status:* The Frontend component `ValidationItem` handles this perfectly, but the Backend `main.py` is currently sending **static mock data** for these fields.
    *   *Task:* Connect the backend to an LLM (e.g., GPT-4/Gemini) to generate these JSON objects dynamically for each trial.

2.  **Search Logic Nuance:**
    *   We are currently using strictly **BM25 (Sparse)** retrieval via the `rank_bm25` library in `main.py`.
    *   The UI mentions "Gemini text-embedding-004", but this is currently a **label only**.
    *   *Task:* Implement the actual dense vector search (using `trialgpt_retrieval/` scripts) and combine it with BM25 for true Hybrid Search.

3.  **User Preferences:**
    *   **Theme:** Clean, "Health Analytics" Blue (#0076db) and White.
    *   **Interaction:** Fast response times preferred (hence the current async/mock split).
