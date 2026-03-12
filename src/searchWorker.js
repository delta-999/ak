/**
 * searchWorker.js
 * ---------------
 * Runs entirely off the main thread.
 *
 * Messages IN  (from main):
 *   { type: 'INDEX', voters: [...] }   — build the index
 *   { type: 'SEARCH', query: string, id: number }  — run a search
 *
 * Messages OUT (to main):
 *   { type: 'INDEXED' }                — index ready
 *   { type: 'RESULTS', results: [...], query: string, id: number }
 */

// ─── Trie ────────────────────────────────────────────────────────────────────

class TrieNode {
    constructor() {
        this.children = {};
        // Store voter indices (into the flat array) rather than full objects
        // to keep memory lean.
        this.indices = [];
    }
}

class Trie {
    constructor() {
        this.root = new TrieNode();
    }

    insert(word, voterIndex) {
        let node = this.root;
        for (const ch of word) {
            if (!node.children[ch]) node.children[ch] = new TrieNode();
            node = node.children[ch];
            // Cap to 500 per node to bound memory on very common prefixes
            if (node.indices.length < 500) node.indices.push(voterIndex);
        }
    }

    /** Returns Set of voter indices that have a word starting with `prefix` */
    getPrefixIndices(prefix) {
        let node = this.root;
        for (const ch of prefix) {
            if (!node.children[ch]) return new Set();
            node = node.children[ch];
        }
        return new Set(node.indices);
    }
}

// ─── State ───────────────────────────────────────────────────────────────────

let voters = [];
let trie = null;
// Map from electoralNumber string / rollNumber string → voter index for O(1) exact lookup
let exactMap = new Map();

// ─── Index builder ───────────────────────────────────────────────────────────

function buildIndex(voterList) {
    voters = voterList;
    trie = new Trie();
    exactMap = new Map();

    for (let i = 0; i < voters.length; i++) {
        const v = voters[i];

        // Index every word in the name
        const nameNorm = v.name.toUpperCase();
        const words = nameNorm.split(/\s+/);
        for (const word of words) {
            if (word.length >= 1) trie.insert(word, i);
        }

        // Also index full normalised name as a prefix (for "starts-with full name")
        trie.insert(nameNorm.replace(/\s+/g, ' ').trim(), i);

        // Exact maps for number lookups
        exactMap.set(String(v.electoralNumber), i);
        exactMap.set(v.rollNumber.toUpperCase(), i);
    }
}

// ─── Scorer ──────────────────────────────────────────────────────────────────
/**
 * Score a voter against a normalised query string.
 * Higher score = better match. Returns 0 if no match.
 *
 * Scoring tiers (no overlap — each tier is mutually exclusive):
 *   100 : exact full name match
 *    80 : name starts with query
 *    60 : every query word is a prefix of a name word (all words matched)
 *    40 : at least one query word is a prefix of a name word
 *    20 : name contains query as a substring (fallback)
 *     0 : no match
 */
function score(voter, queryNorm, queryWords) {
    const name = voter.name.toUpperCase();

    if (name === queryNorm) return 100;
    if (name.startsWith(queryNorm)) return 80;

    // Check if all query words match as prefixes of name words
    const nameWords = name.split(/\s+/);
    let allMatched = true;
    let anyMatched = false;
    for (const qw of queryWords) {
        const matched = nameWords.some(nw => nw.startsWith(qw));
        if (matched) anyMatched = true;
        else allMatched = false;
    }
    if (allMatched && queryWords.length > 0) return 60;
    if (anyMatched) return 40;
    if (name.includes(queryNorm)) return 20;

    return 0;
}

// ─── Search ──────────────────────────────────────────────────────────────────

function search(rawQuery) {
    if (!trie) return [];

    const queryNorm = rawQuery.toUpperCase().trim();
    if (!queryNorm) return [];

    // Fast path: exact electoral number or roll number
    const exactIdx = exactMap.get(queryNorm);
    if (exactIdx !== undefined) {
        return [{ ...voters[exactIdx], _score: 100 }];
    }

    const queryWords = queryNorm.split(/\s+/).filter(Boolean);

    // Gather candidates via Trie for each query word — intersect if multiple words
    let candidateSet = null;
    for (const qw of queryWords) {
        const wordSet = trie.getPrefixIndices(qw);
        if (candidateSet === null) {
            candidateSet = wordSet;
        } else {
            // Intersection: keep only indices present in both sets
            for (const idx of candidateSet) {
                if (!wordSet.has(idx)) candidateSet.delete(idx);
            }
        }
        if (candidateSet.size === 0) break;
    }

    // Fallback: if intersection is empty, union all words (partial match)
    if (!candidateSet || candidateSet.size === 0) {
        candidateSet = new Set();
        for (const qw of queryWords) {
            for (const idx of trie.getPrefixIndices(qw)) {
                candidateSet.add(idx);
            }
        }
    }

    // Score and sort candidates
    const results = [];
    for (const idx of candidateSet) {
        const v = voters[idx];
        const s = score(v, queryNorm, queryWords);
        if (s > 0) results.push({ ...v, _score: s });
    }

    results.sort((a, b) => b._score - a._score || a.name.localeCompare(b.name));

    // Cap at 100 results for rendering performance
    return results.slice(0, 100);
}

// ─── Message handler ─────────────────────────────────────────────────────────

self.onmessage = (e) => {
    const { type } = e.data;

    if (type === 'INDEX') {
        buildIndex(e.data.voters);
        self.postMessage({ type: 'INDEXED' });
        return;
    }

    if (type === 'SEARCH') {
        const results = search(e.data.query);
        self.postMessage({ type: 'RESULTS', results, query: e.data.query, id: e.data.id });
    }
};