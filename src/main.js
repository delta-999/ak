import './style.css';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('search-status');
const countEl = document.getElementById('results-count');
const resultsEl = document.getElementById('results');
const noResultsEl = document.getElementById('no-results');
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

// ─── Hamburger ────────────────────────────────────────────────────────────────

hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
document.addEventListener('click', (e) => {
  if (!e.target.closest('.navbar')) navLinks.classList.remove('open');
});

// ─── Worker setup ─────────────────────────────────────────────────────────────

const worker = new Worker(new URL('./searchWorker.js', import.meta.url), { type: 'module' });

let workerReady = false;          // true after INDEX complete
let pendingQuery = null;          // query typed before index was ready
let searchIdCounter = 0;          // increments per search; stale results are discarded
let latestSearchId = 0;

worker.onmessage = (e) => {
  const { type } = e.data;

  if (type === 'INDEXED') {
    workerReady = true;
    setStatus('');
    searchInput.disabled = false;
    searchBtn.disabled = false;
    searchInput.placeholder = 'Enter name, roll number or electoral number…';

    // Fire any query the user typed while indexing
    if (pendingQuery !== null) {
      triggerSearch(pendingQuery);
      pendingQuery = null;
    }
    return;
  }

  if (type === 'RESULTS') {
    // Discard stale responses (user kept typing)
    if (e.data.id !== latestSearchId) return;
    renderResults(e.data.results, e.data.query);
  }
};

// ─── Lazy-load voter data then index ─────────────────────────────────────────
// Only starts after the page has painted (requestIdleCallback / setTimeout fallback)

function loadAndIndex() {
  setStatus('⏳ Loading voter data…');
  searchInput.disabled = true;
  searchBtn.disabled = true;
  searchInput.placeholder = 'Loading voter data, please wait…';

  // Dynamic import — Vite will code-split this into a separate chunk
  import('./voterData.js').then(({ default: voters }) => {
    setStatus('🔍 Building search index…');
    worker.postMessage({ type: 'INDEX', voters });
  });
}

// Wait until after first paint before loading the heavy data file
if ('requestIdleCallback' in window) {
  requestIdleCallback(loadAndIndex, { timeout: 3000 });
} else {
  setTimeout(loadAndIndex, 200);
}

// ─── Debounced search ─────────────────────────────────────────────────────────

let debounceTimer = null;
const DEBOUNCE_MS = 280;

function onInput() {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();

  if (!q) {
    clearResults();
    return;
  }

  showSearchingSpinner();

  debounceTimer = setTimeout(() => {
    if (!workerReady) {
      pendingQuery = q;   // will be fired once index is ready
      return;
    }
    triggerSearch(q);
  }, DEBOUNCE_MS);
}

function triggerSearch(query) {
  searchIdCounter += 1;
  latestSearchId = searchIdCounter;
  worker.postMessage({ type: 'SEARCH', query, id: searchIdCounter });
}

searchInput.addEventListener('input', onInput);
searchBtn.addEventListener('click', () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  if (!q) return;
  showSearchingSpinner();
  if (!workerReady) { pendingQuery = q; return; }
  triggerSearch(q);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(debounceTimer);
    const q = searchInput.value.trim();
    if (!q) return;
    showSearchingSpinner();
    if (!workerReady) { pendingQuery = q; return; }
    triggerSearch(q);
  }
});

// ─── Render ───────────────────────────────────────────────────────────────────

const MAX_DISPLAY = 100;

function renderResults(results, query) {
  hideSpinner();
  resultsEl.innerHTML = '';
  noResultsEl.style.display = 'none';
  countEl.textContent = '';

  if (!results.length) {
    noResultsEl.style.display = 'block';
    return;
  }

  const shown = results.slice(0, MAX_DISPLAY);
  countEl.textContent = `${results.length > MAX_DISPLAY ? `Showing top ${MAX_DISPLAY} of ${results.length}` : results.length} record(s) found`;

  // Build DOM via DocumentFragment for one reflow
  const frag = document.createDocumentFragment();
  for (const v of shown) {
    const card = document.createElement('div');
    card.className = 'voter-card';
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="voter-name">${highlight(v.name, query)}</div>
      <div class="voter-details">
        <div class="voter-row"><span>Electoral No.</span><strong>${v.electoralNumber}</strong></div>
        <div class="voter-row"><span>Roll No.</span><strong>${v.rollNumber}</strong></div>
        <div class="voter-row"><span>Date of Enrolment</span><strong>${v.dateOfEnrolment}</strong></div>
        <div class="voter-row"><span>Bar Association</span><strong>${v.barAssociation}</strong></div>
        <div class="voter-row"><span>Judgship</span><strong>${v.judgship}</strong></div>
      </div>`;
    frag.appendChild(card);
  }
  resultsEl.appendChild(frag);
}

/** Wrap matched query words in <mark> for visual highlight */
function highlight(name, query) {
  const words = query.trim().toUpperCase().split(/\s+/).filter(Boolean);
  let result = escapeHtml(name);
  for (const word of words) {
    const escaped = escapeHtml(word);
    result = result.replace(
      new RegExp(`(${escaped})`, 'gi'),
      '<mark>$1</mark>'
    );
  }
  return result;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function clearResults() {
  hideSpinner();
  resultsEl.innerHTML = '';
  noResultsEl.style.display = 'none';
  countEl.textContent = '';
}

// ─── Status / spinner helpers ─────────────────────────────────────────────────

function setStatus(msg) {
  statusEl.textContent = msg;
  statusEl.style.display = msg ? 'block' : 'none';
}

function showSearchingSpinner() {
  statusEl.innerHTML = '<span class="spinner"></span> Searching…';
  statusEl.style.display = 'flex';
}

function hideSpinner() {
  statusEl.style.display = 'none';
  statusEl.innerHTML = '';
}