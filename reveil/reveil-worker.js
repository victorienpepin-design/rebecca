// Détection : même chaîne que l'entraînement (mel -> plongement -> petit modèle), dans un fil séparé.
importScripts("ort.wasm.min.js");
const CONTEXTE = 480, BLOC = 1280, MEL = 76, PLONG = 16, REPOS = 25;
let sMel, sEmb, sMot, nomEntree, seuil = 0.5, entree = null;
let brut = new Float32Array(BLOC + CONTEXTE), mels = [], plong = [], avant = 0, repos = 0, file = [], occupe = false;

function remiseAZero() {
  brut = new Float32Array(BLOC + CONTEXTE);
  mels = []; for (let i = 0; i < MEL; i++) mels.push(new Float32Array(32).fill(1));
  plong = []; avant = 0;
}

async function trame(bloc) {
  const t0 = performance.now();
  brut.copyWithin(0, BLOC);
  for (let i = 0; i < BLOC; i++) brut[CONTEXTE + i] = Math.max(-32768, Math.min(32767, bloc[i] * 32767));
  const m = (await sMel.run({ input: new ort.Tensor("float32", brut, [1, BLOC + CONTEXTE]) })).output;
  const nb = m.dims[2], d = m.data;
  for (let i = 0; i < nb; i++) {
    const f = new Float32Array(32);
    for (let j = 0; j < 32; j++) f[j] = d[i * 32 + j] / 10 + 2;
    mels.push(f);
  }
  mels.splice(0, mels.length - MEL);
  const x = new Float32Array(MEL * 32);
  for (let i = 0; i < MEL; i++) x.set(mels[i], i * 32);
  const e = await sEmb.run({ input_1: new ort.Tensor("float32", x, [1, MEL, 32, 1]) });
  plong.push(Float32Array.from(e[sEmb.outputNames[0]].data));
  if (plong.length > PLONG) plong.shift();
  let score = 0;
  if (plong.length === PLONG) {
    for (let i = 0; i < PLONG; i++) entree.set(plong[i], i * 96);
    const r = await sMot.run({ [nomEntree]: new ort.Tensor("float32", entree, [1, PLONG, 96]) });
    score = r[sMot.outputNames[0]].data[0];
  }
  if (repos > 0) repos--;
  const detecte = repos === 0 && score >= seuil && avant >= seuil;
  avant = score;
  if (detecte) repos = REPOS;
  postMessage({ type: "score", score, ms: performance.now() - t0, detecte });
}

async function vider() {
  if (occupe) return;
  occupe = true;
  try {
    while (file.length) {
      if (file.length > 25) { file = []; remiseAZero(); break; }   // appareil trop occupé : on repart proprement
      await trame(file.shift());
    }
  } catch (e) {
    postMessage({ type: "erreur", message: String(e && e.message || e) });
  }
  occupe = false;
}

onmessage = async e => {
  const m = e.data;
  if (m.type === "init") {
    try {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = m.base;
      const o = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
      [sMel, sEmb, sMot] = await Promise.all([m.base + "melspectrogram.onnx", m.base + "embedding_model.onnx", m.base + m.modele].map(u => ort.InferenceSession.create(u, o)));
      nomEntree = sMot.inputNames[0];
      entree = new Float32Array(PLONG * 96);
      seuil = m.seuil;
      remiseAZero();
      postMessage({ type: "pret" });
    } catch (err) {
      postMessage({ type: "erreur", message: String(err && err.message || err) });
    }
  } else if (m.type === "port") {
    m.port.onmessage = ev => { file.push(ev.data); vider(); };
  } else if (m.type === "seuil") {
    seuil = m.seuil;
  } else if (m.type === "raz") {
    file = []; remiseAZero(); repos = 0;
  }
};
