// Capture du micro : ramène le son à 16 kHz et envoie des blocs de 1280 échantillons (80 ms).
const SORTIE = 16000, BLOC = 1280, ZEROS = 16, PHASES = 64;
class ReveilCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pas = sampleRate / SORTIE;
    this.direct = sampleRate === SORTIE;
    const coupure = Math.min(1, 0.94 / this.pas);
    this.demi = Math.ceil(ZEROS / coupure);
    const n = this.demi * PHASES + 2;
    this.table = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / PHASES, u = Math.PI * x * coupure, r = x / this.demi;
      this.table[i] = coupure * (x === 0 ? 1 : Math.sin(u) / u) * (r >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * r));
    }
    this.tampon = new Float32Array(2 * this.demi + 16384);
    this.n = this.demi;
    this.t = this.demi;
    this.bloc = new Float32Array(BLOC);
    this.k = 0;
    this.actif = true;
    this.vers = null;
    this.port.onmessage = e => {
      if (e.data.port) this.vers = e.data.port;
      if ("actif" in e.data) this.actif = e.data.actif;
    };
  }
  sortir(v) {
    this.bloc[this.k++] = v;
    if (this.k === BLOC) {
      if (this.actif && this.vers) this.vers.postMessage(this.bloc, [this.bloc.buffer]);
      this.bloc = new Float32Array(BLOC);
      this.k = 0;
    }
  }
  process(entrees) {
    const c = entrees[0] && entrees[0][0];
    if (!c) return true;
    if (this.direct) {
      for (let i = 0; i < c.length; i++) this.sortir(c[i]);
      return true;
    }
    this.tampon.set(c, this.n);
    this.n += c.length;
    const T = this.table, D = this.demi, B = this.tampon;
    while (this.t + D + 1 < this.n) {
      const i0 = Math.floor(this.t), f = this.t - i0;
      let s = 0;
      for (let j = 1 - D; j <= D; j++) {
        const d = Math.abs(j - f) * PHASES, a = d | 0;
        s += B[i0 + j] * (T[a] + (d - a) * (T[a + 1] - T[a]));
      }
      this.sortir(s);
      this.t += this.pas;
    }
    const garde = Math.floor(this.t) - D;
    if (garde > 0) {
      B.copyWithin(0, garde, this.n);
      this.n -= garde;
      this.t -= garde;
    }
    return true;
  }
}
registerProcessor("reveil-capture", ReveilCapture);
