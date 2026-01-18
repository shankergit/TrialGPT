import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const DATASETS = [
    { id: 'all', label: 'All', count: 183 },
    { id: 'sigir', label: 'SIGIR', count: 58 },
    { id: 'trec_2021', label: 'TREC 2021', count: 75 },
    { id: 'trec_2022', label: 'TREC 2022', count: 50 },
];

export default function ValidationPage() {
    // Selection State
    const [activeDataset, setActiveDataset] = useState('sigir');
    const [patients, setPatients] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPatientId, setSelectedPatientId] = useState('');

    // Search Options State
    const [topK, setTopK] = useState(50);
    const [enableFilters, setEnableFilters] = useState(true);
    const [gender, setGender] = useState('');
    const [age, setAge] = useState('');
    const [healthyVolunteers, setHealthyVolunteers] = useState(false);

    // Results/Loading State
    const [loading, setLoading] = useState(false);
    const [searchResults, setSearchResults] = useState(null);

    // Load Patients
    // Selection State
    const [selectedTrialForDetail, setSelectedTrialForDetail] = useState(null);

    // Load Patients
    useEffect(() => {
        if (activeDataset === 'all') { fetchPatients('sigir'); return; }
        fetchPatients(activeDataset);
    }, [activeDataset]);

    // Auto-extract age/gender when patient selected
    useEffect(() => {
        if (!selectedPatientId) {
            setAge('');
            setGender('');
            return;
        }
        const p = patients.find(pat => pat.id === selectedPatientId);
        if (p) {
            // Simple extraction regex
            const ageMatch = p.text.match(/(\d+)\s*-?\s*year/i);
            const genderMatch = p.text.match(/\b(male|female|man|woman|boy|girl)\b/i);

            if (ageMatch) setAge(ageMatch[1]);
            else setAge('');

            if (genderMatch) {
                const g = genderMatch[1].toLowerCase();
                if (['male', 'man', 'boy'].includes(g)) setGender('Male');
                else if (['female', 'woman', 'girl'].includes(g)) setGender('Female');
                else setGender('');
            } else {
                setGender('');
            }
        }
    }, [selectedPatientId, patients]);

    const fetchPatients = async (dataset) => {
        try {
            const res = await axios.get(`http://localhost:8000/api/patients/${dataset}`);
            setPatients(res.data);
        } catch (err) {
            console.error("Failed to fetch patients", err);
            setPatients([]);
        }
    };

    const runSearch = async () => {
        setLoading(true);
        setSearchResults(null);
        try {
            const filters = enableFilters ? {
                patient_age: age ? parseInt(age) : null,
                gender: gender,
                healthy_volunteers_only: healthyVolunteers
            } : null;

            const res = await axios.post('http://localhost:8000/api/v1/validation/search', {
                patient_id: selectedPatientId,
                top_k: parseInt(topK),
                eligibility_filters: filters
            });

            // Artificial delay to feel real if backend is too fast
            setTimeout(() => {
                setSearchResults(res.data);
                setLoading(false);
            }, 600);

        } catch (err) {
            console.error(err);
            alert("Search failed");
            setLoading(false);
        }
    };

    const filteredPatients = patients.filter(p =>
        p.dataset.includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.text.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedPatient = patients.find(p => p.id === selectedPatientId);

    return (
        <div className="validation-container">
            {/* Header */}
            {/* <div className="validation-header">
                <h1 className="page-title">Validation</h1>
                <div className="page-description">Test with SIGIR validation patients</div>
            </div> */}

            {/* --- Modal for Detailed Evaluation --- */}
            {selectedTrialForDetail && (
                <div className="modal-overlay" onClick={() => setSelectedTrialForDetail(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title">Trial Evaluation Details</h3>
                                <span className="modal-subtitle">{selectedTrialForDetail.trial_id}</span>
                            </div>
                            <button className="close-btn" onClick={() => setSelectedTrialForDetail(null)}>
                                &times;
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Trial Title Header */}
                            <div className="trial-header-info">
                                <h4>{selectedTrialForDetail.title}</h4>
                            </div>

                            {selectedTrialForDetail.evaluation_details ? (
                                <div className="evaluation-list">
                                    {selectedTrialForDetail.evaluation_details.map((item, idx) => (
                                        <EvaluationItem key={idx} item={item} idx={idx} />
                                    ))}
                                </div>
                            ) : (
                                <div className="no-details">
                                    <div className="info-box-blue">
                                        <strong>Simulation Note:</strong> Detailed criteria logic is mocked. Connect LLM for real reasoning.
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* CARD 1: SELECTION */}
            <div className="card">
                <div className="section-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        <circle cx="12" cy="11" r="3"></circle>
                    </svg>
                    Validation Patient Selection
                </div>

                <div className="filter-tabs">
                    {DATASETS.map(ds => (
                        <button
                            key={ds.id}
                            className={`filter-tab ${activeDataset === ds.id ? 'active' : ''}`}
                            onClick={() => setActiveDataset(ds.id)}
                        >
                            {ds.label}
                            <span className="count-badge">{ds.count}</span>
                        </button>
                    ))}
                </div>

                <div className="form-group" style={{ marginBottom: 24 }}>
                    <label className="input-label">Search Patients</label>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Filter by patient ID or keywords..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label className="input-label">
                        Select Validation Patient <span style={{ color: '#868e96', fontWeight: 400 }}>({filteredPatients.length} patients)</span>
                    </label>
                    <select
                        className="select-dropdown"
                        value={selectedPatientId}
                        onChange={(e) => setSelectedPatientId(e.target.value)}
                    >
                        <option value="">-- Select a patient --</option>
                        {filteredPatients.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.id} - {p.text.substring(0, 60)}...
                            </option>
                        ))}
                    </select>
                    <div style={{ fontSize: 12, color: '#868e96', marginTop: 4 }}>
                        Format: patient_id - age gender (full/partial/none matches)
                    </div>
                </div>

                {/* DATA SOURCE STATUS (Visible if patient selected) */}
                {selectedPatientId && (
                    <div className="status-box">
                        <div className="status-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                            </svg>
                            Data Source Status
                        </div>
                        <div className="status-row">
                            <span className="status-icon success">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </span>
                            <span className="status-label">MySQL: Found</span>
                            <span className="status-detail">(1 validation_patients, 1 patients, 2 conditions, 0 medications)</span>
                        </div>
                        <div className="status-row">
                            <span className="status-icon success">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </span>
                            <span className="status-label">OpenSearch: Found</span>
                        </div>
                        <div className="status-footer">
                            MySQL: Found in patients table with 2 conditions, 0 medications | OpenSearch: Found in patient_gpt index
                        </div>
                    </div>
                )}

                {/* PATIENT DETAILS (Visible if patient selected) */}
                {selectedPatient && (
                    <div className="patient-details-box">
                        <div className="details-title">Patient Details</div>
                        <div className="details-text">
                            {selectedPatient.text}
                        </div>
                    </div>
                )}
            </div>

            {/* CARD 2: SEARCH OPTIONS */}
            <div className="card">
                <div className="section-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    Search Options
                </div>

                <div className="search-options-grid">
                    <div className="left-col">
                        <div className="form-group">
                            <label className="input-label">Top K Results</label>
                            <input
                                type="number"
                                className="search-input"
                                value={topK}
                                onChange={(e) => setTopK(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="right-col">
                        <div className="info-box-blue">
                            <strong>Search:</strong> Embeds patient narrative using Gemini text-embedding-004 (3072-dim) and searches the clinical trial corpus.
                        </div>
                    </div>
                </div>

                <div className="form-group" style={{ marginTop: 20 }}>
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={enableFilters}
                            onChange={(e) => setEnableFilters(e.target.checked)}
                        />
                        Enable Eligibility Filters <span style={{ fontWeight: 400, color: '#868e96', marginLeft: 8 }}>(Filter trials by patient demographics)</span>
                    </label>
                </div>

                {enableFilters && (
                    <div className="filters-row">
                        <div className="filter-item">
                            <label className="input-label">Patient Gender</label>
                            <select
                                className="select-dropdown"
                                value={gender}
                                onChange={(e) => setGender(e.target.value)}
                            >
                                <option value="">Any</option>
                                <option value="Female">Female</option>
                                <option value="Male">Male</option>
                            </select>
                            <div className="field-hint">Excludes trials that don't accept this gender</div>
                        </div>
                        <div className="filter-item">
                            <label className="input-label">Patient Age</label>
                            <input
                                type="number"
                                className="search-input"
                                value={age}
                                onChange={(e) => setAge(e.target.value)}
                            />
                            <div className="field-hint">Excludes trials outside accepted age range</div>
                        </div>
                        <div className="filter-item" style={{ display: 'flex', flexDirection: 'column' }}>
                            <label className="input-label">Healthy Volunteers</label>
                            <label className="checkbox-sub-label">
                                <input
                                    type="checkbox"
                                    checked={healthyVolunteers}
                                    onChange={(e) => setHealthyVolunteers(e.target.checked)}
                                />
                                Only show trials accepting healthy volunteers
                            </label>
                        </div>
                    </div>
                )}

                <button
                    className="action-btn-primary"
                    onClick={runSearch}
                    disabled={!selectedPatientId || loading}
                >
                    {loading ? (
                        <>
                            <span className="spinner-small" style={{ marginRight: 8 }}></span>
                            Searching...
                        </>
                    ) : (
                        <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            Search Trials
                        </>
                    )}
                </button>
            </div>

            {/* RESULTS PREVIEW */}
            {searchResults && (
                <div className="card">
                    <div className="section-title">Search Results</div>

                    {/* Metrics Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                        <div className="status-box" style={{ marginTop: 0, textAlign: 'center' }}>
                            <div style={{ fontSize: '13px', color: '#868e96' }}>Search Time</div>
                            <div style={{ fontSize: '18px', fontWeight: '700', color: '#343a40' }}>
                                {searchResults.search_time.toFixed(2)}s
                            </div>
                        </div>
                        <div className="status-box" style={{ marginTop: 0, textAlign: 'center' }}>
                            <div style={{ fontSize: '13px', color: '#868e96' }}>Total Results</div>
                            <div style={{ fontSize: '18px', fontWeight: '700', color: '#343a40' }}>
                                {searchResults.search_results.length}
                            </div>
                        </div>
                        {/* Ground Truth Comparison */}
                        {searchResults.ground_truth_comparison && (
                            <>
                                <div className="status-box" style={{ marginTop: 0, textAlign: 'center' }}>
                                    <div style={{ fontSize: '13px', color: '#868e96' }}>Recall</div>
                                    <div style={{ fontSize: '18px', fontWeight: '700', color: searchResults.ground_truth_comparison.recall > 0 ? '#2b8a3e' : '#e03131' }}>
                                        {(searchResults.ground_truth_comparison.recall * 100).toFixed(1)}%
                                    </div>
                                </div>
                                <div className="status-box" style={{ marginTop: 0, textAlign: 'center' }}>
                                    <div style={{ fontSize: '13px', color: '#868e96' }}>Matches Found</div>
                                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#343a40' }}>
                                        {searchResults.ground_truth_comparison.matches_found} / {searchResults.ground_truth_comparison.total_ground_truth}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <table className="results-table">
                        <thead>
                            <tr>
                                <th style={{ width: '60px' }}>Rank</th>
                                <th style={{ width: '120px' }}>Trial ID</th>
                                <th>Title</th>
                                <th style={{ width: '100px' }}>Score</th>
                                <th style={{ width: '120px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {searchResults.search_results.map((r, i) => (
                                <tr key={i}>
                                    <td style={{ textAlign: 'center', fontWeight: '600' }}>{i + 1}</td>
                                    <td>
                                        <span style={{ color: '#0076db', fontWeight: '500' }}>{r.trial_id}</span>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                                            {r.title}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#868e96', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {r.snippet}
                                        </div>
                                    </td>
                                    <td style={{ fontWeight: '600' }}>
                                        {r.score.toFixed(2)}
                                    </td>
                                    <td>
                                        <button
                                            className="btn-view-details"
                                            onClick={() => setSelectedTrialForDetail(r)}
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {searchResults.ground_truth_comparison && searchResults.ground_truth_comparison.missed_matches && searchResults.ground_truth_comparison.missed_matches.length > 0 && (
                        <div style={{ marginTop: '20px', padding: '16px', background: '#fff0f0', borderRadius: '8px', border: '1px solid #ffc9c9' }}>
                            <div style={{ fontWeight: '700', color: '#c92a2a', marginBottom: '8px' }}>Missed Matches (Ground Truth)</div>
                            <div style={{ fontSize: '13px', color: '#495057' }}>
                                These trials were relevant but not found in Top {topK}:
                                <ul style={{ marginTop: '8px', paddingLeft: '20px', marginBottom: 0 }}>
                                    {searchResults.ground_truth_comparison.missed_matches.map((m, idx) => (
                                        <li key={idx}>{m}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Helper Component for Evaluation Criteria Item (Placed Outside Main Component as per React Best Practices)
function EvaluationItem({ item, idx }) {
    const [expanded, setExpanded] = useState(false);

    // Determine badge color
    let badgeClass = "badge-neutral";
    let badgeText = item.status;

    if (item.status === "Met") badgeClass = "badge-success";
    else if (item.status === "Not Met") badgeClass = "badge-error";
    else if (item.status === "Not Enough Information") badgeClass = "badge-warning";

    return (
        <div className={`eval-item ${expanded ? 'expanded' : ''}`}>
            <div className="eval-header" onClick={() => setExpanded(!expanded)}>
                <div className="eval-status-row">
                    <span className={`status-badge ${badgeClass}`}>
                        {item.status === "Not Enough Information" && <span style={{ marginRight: '4px' }}>⚠️</span>}
                        {badgeText}
                    </span>
                    <span className="eval-meta">
                        #{idx + 1} • Conf: {item.confidence}
                    </span>
                    <span className="eval-toggle-icon">{expanded ? '▲' : '▼'}</span>
                </div>
                <div className="eval-description">
                    {item.description}
                </div>
            </div>

            {expanded && (
                <div className="eval-body">
                    <div className="eval-section">
                        <div className="eval-label">Evidence:</div>
                        <div className="eval-text">{item.evidence}</div>
                    </div>

                    <div className="eval-section" style={{ marginTop: '12px' }}>
                        <div className="eval-label">Reasoning:</div>
                        <div className="eval-text">{item.reasoning}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
