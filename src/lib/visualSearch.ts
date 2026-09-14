/**
 * Visual similarity for photo search — runs entirely in the browser.
 *
 * MobileNet (TensorFlow.js) turns an image into a 1280-number "fingerprint"
 * (embedding). Two images that look alike — same silhouette, colour, pattern
 * — end up with fingerprints that point the same way, so cosine similarity
 * between them is a usable "how similar" score.
 *
 * Everything here is lazy: the ~3 MB model and TF.js are downloaded the first
 * time a shopper actually uses photo search, never on page load. Product
 * fingerprints are cached in IndexedDB so a repeat search is instant.
 */

import type { MobileNet } from "@tensorflow-models/mobilenet";

export interface Candidate {
  id: string;
  imageUrl: string;
}

export interface RankedCandidate extends Candidate {
  /** Cosine similarity, 0–1 (higher = more alike). */
  score: number;
}

const EMBED_DIM_VERSION = "mnv2a05"; // bump if the model changes; invalidates the cache
const DB_NAME = "kayals-visual-search";
const STORE = "embeddings";
const CONCURRENCY = 3;

/* ------------------------------------------------------------------ */
/* Model                                                                */
/* ------------------------------------------------------------------ */

let modelPromise: Promise<MobileNet> | null = null;

const loadModel = (): Promise<MobileNet> => {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const mobilenet = await import("@tensorflow-models/mobilenet");
      // v2 @ alpha 0.5: about a third of the weight of the full model, and
      // plenty for "does this look like that" — we never need the labels.
      return mobilenet.load({ version: 2, alpha: 0.5 });
    })().catch((err) => {
      modelPromise = null; // let the next attempt retry
      throw err;
    });
  }
  return modelPromise;
};

/** Warm the model in the background (e.g. as soon as the search modal opens). */
export const preloadVisualSearch = () => {
  loadModel().catch(() => undefined);
};

const l2normalize = (v: Float32Array): Float32Array => {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
};

export const embedImage = async (
  source: HTMLImageElement | HTMLCanvasElement | ImageData,
): Promise<Float32Array> => {
  const model = await loadModel();
  const tensor = model.infer(source, true); // penultimate layer → embedding
  try {
    const data = (await tensor.data()) as Float32Array;
    return l2normalize(data);
  } finally {
    tensor.dispose();
  }
};

const cosine = (a: Float32Array, b: Float32Array): number => {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both are unit vectors
};

/* ------------------------------------------------------------------ */
/* Image loading                                                        */
/* ------------------------------------------------------------------ */

const wpUrl = ((import.meta.env.VITE_WORDPRESS_URL as string | undefined) || "").replace(/\/+$/, "");

/**
 * WordPress's resized filenames depend on each image's aspect ratio, so they
 * can't be derived from the full-size URL. The Homepage Builder plugin
 * (≥ 1.3) answers "medium-size URL for these product ids" in one request —
 * ~20× less to download than the originals. Without it we analyse the
 * full-size images, which still works, just slower.
 */
export const resolveThumbnails = async (productIds: string[]): Promise<Record<string, string>> => {
  if (!wpUrl || productIds.length === 0) return {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${wpUrl}/wp-json/kayals/v1/thumbs?ids=${productIds.join(",")}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return {};
    const body = (await res.json()) as Record<string, string>;
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
};

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    // Needed for canvas/tensor access when the image is on another origin.
    // Same-origin (storefront + WordPress on kayalslifestyle.com) needs nothing.
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });

/** In `npm run dev` the images live on another origin; route them through the Vite proxy (see vite.config.ts). */
const devSameOrigin = (url: string) =>
  import.meta.env.DEV && wpUrl && url.startsWith(wpUrl) ? `/__img${url.slice(wpUrl.length)}` : url;

const loadProductImage = (url: string): Promise<HTMLImageElement> => loadImage(devSameOrigin(url));

/* ------------------------------------------------------------------ */
/* IndexedDB cache                                                      */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null); // private mode / blocked storage — just don't cache
    }
  });
  return dbPromise;
};

const cacheKey = (url: string) => `${EMBED_DIM_VERSION}:${url}`;

const cacheGet = async (url: string): Promise<Float32Array | null> => {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(cacheKey(url));
      req.onsuccess = () => resolve(req.result instanceof Float32Array ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const cachePut = async (url: string, embedding: Float32Array) => {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(embedding, cacheKey(url));
  } catch {
    /* cache is best-effort */
  }
};

/* ------------------------------------------------------------------ */
/* Ranking                                                              */
/* ------------------------------------------------------------------ */

const embedProduct = async (url: string): Promise<Float32Array | null> => {
  const cached = await cacheGet(url);
  if (cached) return cached;
  try {
    const img = await loadProductImage(url);
    const embedding = await embedImage(img);
    void cachePut(url, embedding);
    return embedding;
  } catch (err) {
    console.warn("Visual search: skipping image", url, err);
    return null;
  }
};

/**
 * Score every candidate against the shopper's photo and return them most
 * similar first. Candidates whose image can't be analysed keep their
 * original order at the end (score 0) rather than vanishing.
 */
export const rankBySimilarity = async (
  query: HTMLImageElement | HTMLCanvasElement,
  candidates: Candidate[],
  onProgress?: (done: number, total: number) => void,
): Promise<RankedCandidate[]> => {
  const queryEmbedding = await embedImage(query);

  const scores = new Map<string, number>();
  let done = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < candidates.length) {
      const c = candidates[cursor++];
      const emb = await embedProduct(c.imageUrl);
      if (emb) scores.set(c.id, cosine(queryEmbedding, emb));
      done++;
      onProgress?.(done, candidates.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));

  return candidates
    .map((c, index) => ({ ...c, score: scores.get(c.id) ?? 0, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ index: _index, ...rest }) => rest);
};

/* ------------------------------------------------------------------ */
/* Whole-catalogue search (index built in WP admin, plugin ≥ 1.4)       */
/* ------------------------------------------------------------------ */

const INDEX_MODEL = "mobilenet-v2-a0.50"; // must match the plugin's INDEX_MODEL

interface CatalogIndex {
  version: string;
  dim: number;
  ids: string[];
  /** int8 fingerprints, `ids.length × dim`, each row a unit vector × 127 */
  data: Int8Array;
  /**
   * Catalogue mean fingerprint. Every product photo shares a lot — a model
   * standing in a room — and that common part dominates raw similarity.
   * Subtracting the mean (a standard retrieval trick) leaves the part that
   * differs between products: the garment.
   */
  mean: Float32Array;
  /** |row/127 − mean| per product, so centred cosine costs one dot product. */
  rowNorm: Float32Array;
}

const withStats = (raw: Omit<CatalogIndex, "mean" | "rowNorm">): CatalogIndex => {
  const { dim, ids, data } = raw;
  const n = ids.length;
  const mean = new Float32Array(dim);
  for (let i = 0; i < n; i++) {
    const off = i * dim;
    for (let j = 0; j < dim; j++) mean[j] += data[off + j];
  }
  for (let j = 0; j < dim; j++) mean[j] /= n * 127;
  const rowNorm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const off = i * dim;
    let sum = 0;
    for (let j = 0; j < dim; j++) {
      const d = data[off + j] / 127 - mean[j];
      sum += d * d;
    }
    rowNorm[i] = Math.sqrt(sum) || 1;
  }
  return { ...raw, mean, rowNorm };
};

let indexPromise: Promise<CatalogIndex | null> | null = null;

const decodeBase64 = (b64: string): Int8Array => {
  const bin = atob(b64);
  const out = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = (bin.charCodeAt(i) << 24) >> 24;
  return out;
};

type StoredIndex = Omit<CatalogIndex, "mean" | "rowNorm">;

const indexCacheGet = async (key: string): Promise<StoredIndex | null> => {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as StoredIndex) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const indexCachePut = async (key: string, index: StoredIndex) => {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(index, key);
  } catch {
    /* best effort */
  }
};

/**
 * The plugin says which index version is current; the file itself is
 * downloaded once per version and kept in IndexedDB (~1 MB for ~700
 * products). Resolves null when the plugin is old or the index isn't built.
 */
export const loadCatalogIndex = (): Promise<CatalogIndex | null> => {
  if (!indexPromise) {
    indexPromise = (async () => {
      if (!wpUrl) return null;
      const meta = await fetch(`${wpUrl}/wp-json/kayals/v1/image-index`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!meta?.built || !meta.url || meta.model !== INDEX_MODEL) return null;

      const key = `index:${meta.version}`;
      const cached = await indexCacheGet(key);
      if (cached?.data instanceof Int8Array) return withStats(cached);

      const file = await fetch(devSameOrigin(meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!file?.ids?.length || !file.data || file.model !== INDEX_MODEL) return null;
      const index: StoredIndex = { version: file.version, dim: file.dim, ids: file.ids, data: decodeBase64(file.data) };
      if (index.data.length !== index.ids.length * index.dim) return null;
      void indexCachePut(key, index);
      return withStats(index);
    })().catch((err) => {
      console.warn("Catalogue image index unavailable:", err);
      indexPromise = null;
      return null;
    });
  }
  return indexPromise;
};

export interface CatalogMatch {
  id: string;
  score: number;
}

/** Centre crop that keeps `keep` of each side — trims page chrome, arrows, borders. */
const centreCrop = (src: HTMLImageElement | HTMLCanvasElement, keep: number): HTMLCanvasElement => {
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  const cw = Math.round(w * keep);
  const ch = Math.round(h * keep);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext("2d")!.drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
  return canvas;
};

/**
 * Compare the shopper's photo with every indexed product; best matches first.
 * The query is fingerprinted twice (full frame + 80% centre) and averaged, so
 * a screenshot with buttons or a photo with a busy edge still keys on the
 * garment in the middle.
 */
export const searchCatalog = async (
  query: HTMLImageElement | HTMLCanvasElement,
  index: CatalogIndex,
  topK = 24,
): Promise<CatalogMatch[]> => {
  const { dim, ids, data, mean, rowNorm } = index;

  const full = await embedImage(query);
  const crop = await embedImage(centreCrop(query, 0.8));
  const q = new Float32Array(dim);
  let norm = 0;
  for (let j = 0; j < dim; j++) {
    q[j] = (full[j] + crop[j]) / 2 - mean[j];
    norm += q[j] * q[j];
  }
  norm = Math.sqrt(norm) || 1;
  let qDotMean = 0;
  for (let j = 0; j < dim; j++) {
    q[j] /= norm;
    qDotMean += q[j] * mean[j];
  }

  const scores: CatalogMatch[] = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    let dot = 0;
    const off = i * dim;
    for (let j = 0; j < dim; j++) dot += q[j] * data[off + j];
    // q · (v/127 − mean) / |v/127 − mean|
    scores[i] = { id: ids[i], score: (dot / 127 - qDotMean) / rowNorm[i] };
  }
  return scores.sort((a, b) => b.score - a.score).slice(0, topK);
};

/** Product cards for the matches, in match order (plugin ≥ 1.4). */
export const fetchProductCards = async <T,>(ids: string[]): Promise<T[]> => {
  if (!wpUrl || ids.length === 0) return [];
  const res = await fetch(`${wpUrl}/wp-json/kayals/v1/products?ids=${ids.join(",")}`);
  if (!res.ok) throw new Error(`products lookup failed (${res.status})`);
  const body = await res.json();
  return Array.isArray(body?.products) ? (body.products as T[]) : [];
};
