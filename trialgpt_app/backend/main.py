from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
import uuid
import asyncio
import time
import re
from typing import List, Optional, Dict, Any
from datetime import datetime

# --- Search Dependencies ---
from rank_bm25 import BM25Okapi
import pandas as pd

app = FastAPI(title="TrialGPT API", version="1.0.0")

# Allow CORS
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration & Paths ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.abspath(os.path.join(BASE_DIR, "../../dataset"))

# --- In-Memory Storage ---
JOBS: Dict[str, Dict[str, Any]] = {}
SEARCH_INDICES: Dict[str, Any] = {} # {'sigir': {'bm25': ..., 'corpus': [], 'nct_ids': []}}
PATIENT_REGISTRY: Dict[str, Any] = {} # Cache for patients to look up text by ID

# --- Pydantic Models ---

class Patient(BaseModel):
    id: str
    text: str
    dataset: str

class StartJobRequest(BaseModel):
    patient_id: str
    dataset: Optional[str] = "sigir"

class JobStage(BaseModel):
    stage: str
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    error_message: Optional[str] = None

class JobStatusResponse(BaseModel):
    job_id: str
    patient_id: str
    status: str
    current_stage: str
    progress_pct: float
    stages: List[JobStage]
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    has_composition: bool = False
    has_retrieval: bool = False
    has_evaluation: bool = False
    has_matches: bool = False

class ValidationSearchRequest(BaseModel):
    patient_id: str
    top_k: int = 50
    eligibility_filters: Optional[Dict[str, Any]] = None

# --- Helper Functions for Search ---

def simple_tokenize(text: str):
    """Simple regex tokenizer to avoid NLTK download issues."""
    return re.findall(r'\w+', text.lower())

def load_dataset_index(dataset: str):
    """
    Lazy load the BM25 index and corpus for a dataset.
    Supported: 'sigir' (files present), 'trec_2021', 'trec_2022' (if files present)
    """
    if dataset in SEARCH_INDICES:
        return SEARCH_INDICES[dataset]
    
    start_time = time.time()
    corpus_file = os.path.join(DATASET_PATH, dataset, "corpus.jsonl")
    
    if not os.path.exists(corpus_file):
        print(f"Corpus file not found for {dataset}: {corpus_file}")
        return None

    corpus_docs = []
    nct_ids = []
    tokenized_corpus = []

    print(f"Loading corpus for {dataset}...")
    try:
        with open(corpus_file, 'r') as f:
            for line in f:
                if not line.strip(): continue
                data = json.loads(line)
                
                nct_id = data.get("_id")
                title = data.get("title", "")
                text = data.get("text", "")
                
                # Combine fields for indexing
                full_text = f"{title} {text}"
                
                # Metadata for filtering
                metadata = data.get("metadata", {})
                
                corpus_docs.append({
                    "nct_id": nct_id,
                    "title": title,
                    "text": text,
                    "metadata": metadata
                })
                nct_ids.append(nct_id)
                tokenized_corpus.append(simple_tokenize(full_text))
        
        print(f"Building BM25 index for {len(corpus_docs)} documents...")
        bm25 = BM25Okapi(tokenized_corpus)
        
        # Load Qrels for ground truth if available
        qrels = {}
        qrels_path = os.path.join(DATASET_PATH, dataset, "qrels", "test.tsv")
        # Try different qrels paths or formats if standard fails in future
        if os.path.exists(qrels_path):
            try:
                # Assuming TSV: topic_id 0 doc_id relevance
                df = pd.read_csv(qrels_path, sep='\t', header=None, names=["topic_id", "iter", "doc_id", "rel"])
                # Group by topic_id (patient_id)
                # Note: sigir patient IDs in queries.jsonl are like "sigir-201410", but in qrels might be "201410" or "sigir-201410".
                # We need to normalize.
                for _, row in df.iterrows():
                    tid = str(row['topic_id'])
                    did = str(row['doc_id'])
                    rel = int(row['rel'])
                    if rel > 0:
                        if tid not in qrels: qrels[tid] = set()
                        qrels[tid].add(did)
            except Exception as e:
                print(f"Failed to load qrels: {e}")

        SEARCH_INDICES[dataset] = {
            "bm25": bm25,
            "corpus": corpus_docs,
            "nct_ids": nct_ids,
            "qrels": qrels
        }
        print(f"Index built for {dataset} in {time.time() - start_time:.2f}s")
        return SEARCH_INDICES[dataset]
    except Exception as e:
        print(f"Error loading index: {e}")
        return None

def normalize_qrels_id(dataset: str, patient_id: str):
    """
    Match patient_id format to qrels format.
    SIGIR: patient 'sigir-201410' -> qrels '201410'? Or 'sigir-201410'?
    Let's check the qrels file content later if needed. For now, try both.
    """
    return patient_id

def check_eligibility(trial_meta, filters):
    """
    Basic filtering based on metadata text/fields.
    Returns True if eligible, False otherwise.
    """
    if not filters: return True
    
    # 1. Gender Filter
    req_gender = filters.get("gender")
    if req_gender:
        # Check if trial EXCLUDES this gender
        # This is hard with unstructured text. 
        # Heuristic: If trial says "Female" and user is "Male", exclude?
        # Metadata often has: "inclusion_criteria": "... Feale ..."
        # For this demo, we'll skip complex gender parsing to avoid false negatives.
        pass

    # 2. Age Filter
    req_age = filters.get("patient_age")
    if req_age is not None:
        # Try to find age range in inclusion criteria text
        # Example: "Age 18-65" or "Age >= 18"
        # This is complex to parse via regex reliably.
        pass
        
    # 3. Healthy Volunteers
    req_healthy = filters.get("healthy_volunteers_only")
    if req_healthy:
        # Check for 'healthy' keyword in inclusion
        inc = trial_meta.get("inclusion_criteria", "").lower()
        if "healthy" not in inc:
            return False # Very strict, but demo-able

    return True

# --- API Routes ---

@app.get("/api/patients/{dataset}", response_model=List[Patient])
async def get_patients(dataset: str):
    dataset_folder = dataset.lower().replace(" ", "_")
    file_path = os.path.join(DATASET_PATH, dataset_folder, "queries.jsonl")
    
    patients = []
    if os.path.exists(file_path):
        try:
             with open(file_path, 'r') as f:
                for line in f:
                    if not line.strip(): continue
                    data = json.loads(line)
                    # Normalize ID
                    pid = data.get("_id") or data.get("id") or data.get("topic_id")
                    pid = str(pid)
                    text = data.get("text") or data.get("query") or data.get("description")
                    if pid and text:
                        patients.append(Patient(id=pid, text=str(text), dataset=dataset_folder))
                        # Cache for later lookup
                        PATIENT_REGISTRY[pid] = text
        except Exception as e:
            print(f"Error reading patients: {e}")
            
    return patients

@app.post("/api/v1/validation/search")
async def validation_search(request: ValidationSearchRequest):
    start_ts = time.time()
    
    # 1. Determine Dataset from Patient ID (heuristic)
    # sigir-2014..., trec-2021...
    dataset = "sigir" # Default
    if "trec" in request.patient_id.lower():
        if "2021" in request.patient_id: dataset = "trec_2021"
        elif "2022" in request.patient_id: dataset = "trec_2022"
    elif "sigir" in request.patient_id.lower():
        dataset = "sigir"
        
    # 2. Load Index
    index_data = load_dataset_index(dataset)
    
    if not index_data:
        # Fallback Mock if index fails (e.g. file missing)
        return {
            "patient_id": request.patient_id,
            "status": "Index not found - Simulated Mode",
            "search_results": [],
            "ground_truth_comparison": {},
            "total_time": 0.0
        }

    # 3. Get Patient Text
    patient_text = PATIENT_REGISTRY.get(request.patient_id, "")
    if not patient_text:
        # Try to re-fetch if not in registry (e.g. server restarted)
         # (Skipping re-fetch logic for brevity, assuming standard flow)
         patient_text = "Patient text placeholder" 

    # 4. Run Retrieval (BM25)
    tokenized_query = simple_tokenize(patient_text)
    doc_scores = index_data["bm25"].get_scores(tokenized_query)
    
    # Get top 2*K candidates (to allow for some filtering)
    top_n = request.top_k * 2
    top_indices = sorted(range(len(doc_scores)), key=lambda i: doc_scores[i], reverse=True)[:top_n]
    
    results = []
    found_ids = set()
    
    # 5. Filter and Format
    for idx in top_indices:
        if len(results) >= request.top_k: break
        
        doc = index_data["corpus"][idx]
        score = doc_scores[idx]
        
        # Apply Filters
        if request.eligibility_filters:
            if not check_eligibility(doc["metadata"], request.eligibility_filters):
                continue
                
        # Mock Evaluation Details (Simulating LLM Output for UI)
        evaluation_details = [
            {
                "id": "1",
                "type": "Inclusion",
                "status": "Met",
                "confidence": "95%",
                "description": "Patient must have documented history of monomorphic ventricular tachycardia.",
                "evidence": "During the current hospitalization, the patient experienced an acute episode of monomorphic ventricular tachycardia documented on telemetry overnight.",
                "reasoning": "Patient record explicitly mentions 'acute episode of monomorphic ventricular tachycardia' which matches the inclusion criteria."
            },
            {
                "id": "2",
                "type": "Inclusion", 
                "status": "Not Enough Information", 
                "confidence": "40%",
                "description": "Sustained monomorphic VT documented on 12-lead ECG or rhythm strip terminated by pharmacologic means or DC cardioversion",
                "evidence": "The patient spontaneously returned to sinus rhythm within one minute.",
                "reasoning": "Patient had sustained monomorphic VT documented on telemetry (rhythm strip), but it spontaneously converted rather than being terminated by pharmacologic means or DC cardioversion. The note does not explicitly state if DC cardioversion or pharmacologic termination was used."
            },
             {
                "id": "3",
                "type": "Exclusion",
                "status": "Not Met", 
                "confidence": "90%",
                "description": "History of hypersensitivity to amiodarone.",
                "evidence": "No allergies recorded.",
                "reasoning": "Patient record states 'No allergies recorded', so exclusion criteria for hypersensitivity is not met (patient is eligible)."
            },
            {
                "id": "4",
                "type": "Inclusion",
                "status": "Not Enough Information",
                "confidence": "30%",
                "description": "≥3 episodes of VT treated with antitachycardia pacing (ATP), at least one of which was symptomatic",
                "evidence": "N/A",
                "reasoning": "No mention of antitachycardia pacing (ATP) history in the provided text."
            }
        ]

        results.append({
            "trial_id": doc["nct_id"],
            "title": doc["title"],
            "score": float(score),
            "snippet": doc["text"][:200] + "...",
            "metadata": doc["metadata"],
            "evaluation_details": evaluation_details # Added mock details
        })
        found_ids.add(doc["nct_id"])

    # 6. Calculate Ground Truth Metrics
    gt_comparison = {}
    qrels = index_data.get("qrels", {})
    
    # Check both raw ID and prefixed ID
    # e.g. qrels might have "201410" but patient is "sigir-201410"
    raw_id = request.patient_id.replace("sigir-", "").replace("trec-", "")
    gt_set = qrels.get(request.patient_id) or qrels.get(raw_id)    
    
    if gt_set:
        matches = found_ids.intersection(gt_set)
        gt_comparison = {
            "total_ground_truth": len(gt_set),
            "full_matches_in_gt": len(gt_set), # Assuming all are relevant
            "matches_found": len(matches),
            "recall": len(matches) / len(gt_set) if len(gt_set) > 0 else 0.0,
            "missed_matches": list(gt_set - found_ids)[:5] # Show top 5 missed
        }
    else:
        gt_comparison = {"note": "No ground truth found for this patient"}

    total_time = time.time() - start_ts

    return {
        "patient_id": request.patient_id,
        "patient_summary": patient_text[:100] + "...",
        "embedding_time_ms": 100.0, # Simulated since we use BM25
        "data_source_status": {
            "mysql_exists": False,
            "opensearch_exists": True, # Emulating
            "mysql_tables": {},
            "opensearch_index": f"clinical_trial_{dataset}"
        },
        "search_results": results,
        "search_time": total_time,
        "index_searched": f"{dataset}_bm25",
        "dataset_filter": dataset,
        "eligibility_filters_applied": request.eligibility_filters,
        "ground_truth_comparison": gt_comparison,
        "total_time": total_time
    }

# --- Job Endpoints (Keep existing simulated job logic for Pipeline View) ---
# ... (Re-including the previous simulated endpoints for p2t jobs so they don't break) ...

@app.post("/api/v1/jobs/p2t", response_model=JobStatusResponse)
async def start_job(request: StartJobRequest, background_tasks: BackgroundTasks):
    job_id = f"job-{uuid.uuid4()}"
    new_job = {
        "job_id": job_id,
        "patient_id": request.patient_id,
        "status": "pending",
        "current_stage": "compose",
        "progress_pct": 0.0,
        "stages": [
            {"stage": "compose", "status": "pending"},
            {"stage": "retrieve", "status": "pending"},
            {"stage": "evaluate", "status": "pending"},
            {"stage": "rank", "status": "pending"},
        ],
        "created_at": datetime.now().isoformat(),
        "has_composition": False,
        "has_retrieval": False,
        "has_evaluation": False,
        "has_matches": False,
        "data_compose": None,
        "data_retrieve": None,
        "data_evaluate": None,
        "data_rank": None
    }
    JOBS[job_id] = new_job
    background_tasks.add_task(simulate_job_progress, job_id, request.patient_id)
    return new_job

@app.get("/api/v1/jobs/p2t/job-{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    jid = f"job-{job_id}" if not job_id.startswith("job-") else job_id
    if jid not in JOBS: raise HTTPException(status_code=404, detail="Job not found")
    return JOBS[jid]

@app.get("/api/v1/jobs/p2t/job-{job_id}/matches", response_model=Any)
async def get_matches_result(job_id: str):
    jid = f"job-{job_id}" if not job_id.startswith("job-") else job_id
    if jid not in JOBS: raise HTTPException(status_code=404, detail="Match data not found")
    return JOBS[jid]["data_rank"]

# Async Simulation (Compact version)
async def simulate_job_progress(job_id: str, patient_id: str):
    job = JOBS[job_id]
    job["status"] = "running"
    
    # 1. Compose
    job["stages"][0]["status"] = "running"
    await asyncio.sleep(1)
    job["stages"][0]["status"] = "completed"
    job["progress_pct"] = 25.0
    
    # 2. Retrieve
    job["stages"][1]["status"] = "running"
    await asyncio.sleep(1) 
    job["stages"][1]["status"] = "completed"
    job["progress_pct"] = 50.0

    # 3. Evaluate
    job["stages"][2]["status"] = "running"
    await asyncio.sleep(1)
    job["stages"][2]["status"] = "completed"
    job["progress_pct"] = 75.0

    # 4. Rank
    job["stages"][3]["status"] = "running"
    await asyncio.sleep(1)
    job["stages"][3]["status"] = "completed"
    job["progress_pct"] = 100.0
    
    job["status"] = "completed"
    job["current_stage"] = "completed"
    
    # Populate Mock Rank Results (so frontend doesn't crash)
    job["data_rank"] = {
        "job_id": job_id,
        "patient_id": patient_id,
        "ranked_matches": [
             {
                 "trial_id": "NCT00000000",
                 "final_rank": 1,
                 "final_score": 0.99,
                 "retrieval_score": 0.95,
                 "eligibility_score": 0.9,
                 "eligible": True,
                 "inclusion_met": "All",
                 "exclusion_violated": "None",
                 "trial_title": "Simulated Result for Pipeline View",
                 "trial_phase": "Phase 3",
                 "trial_conditions": "N/A"
             }
        ],
        "total_evaluated": 1,
        "total_eligible": 1,
        "total_time_seconds": 4.0
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
