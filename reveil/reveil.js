// Mot de réveil « Dis Rebecca » : tout tourne dans le navigateur, rien ne quitte l'appareil.
(() => {
  const ICI = new URL(".", document.currentScript.src).href;
  class Reveil {
    // options : seuil, flux (MediaStream déjà ouvert), garderEcran, surDetection(score), surScore(score, ms), surEtat(etat, detail)
    constructor(o = {}) {
      this.o = Object.assign({ modele: "dis_rebecca.onnx", garderEcran: true }, o);
      this.seuilActuel = o.seuil;
      this.fluxPropre = false;
      this.enPause = false;
      this.visible = () => this.retour();
    }
    etat(e, d) { this.etatActuel = e; if (this.o.surEtat) this.o.surEtat(e, d); }
    get flux() { return this.stream; }                     // à réutiliser pour la dictée : iOS coupe le 1er flux si on en ouvre un 2e

    // À appeler dans un geste de l'utilisateur (toucher un bouton).
    async demarrer() {
      if (!window.isSecureContext || !navigator.mediaDevices) { this.etat("erreur", "Le micro exige une page en https (ou localhost)."); throw new Error("https requis"); }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const reprise = this.ctx.resume();
      this.etat("chargement");
      try {
        if (this.seuilActuel == null) this.seuilActuel = (await (await fetch(ICI + "reveil.json")).json()).seuil;
        await this.lancerWorker();
        this.fluxPropre = !this.o.flux;
        this.stream = this.o.flux || await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
        await this.ctx.audioWorklet.addModule(ICI + "reveil-worklet.js");
        this.brancher();
        await Promise.race([reprise, new Promise(ok => setTimeout(ok, 1500))]);
        if (this.ctx.state !== "running") await Promise.race([this.ctx.resume(), new Promise(ok => setTimeout(ok, 1500))]);
        document.addEventListener("visibilitychange", this.visible);
        await this.garderEcran();
        this.etat(this.ctx.state === "running" ? "ecoute" : "coupe", "Touche pour relancer l'écoute.");
      } catch (e) {
        this.arreter();
        this.etat("erreur", e && e.name === "NotAllowedError" ? "Micro refusé : autorise-le dans les réglages du navigateur." : String(e && e.message || e));
        throw e;
      }
    }

    lancerWorker() {
      this.worker = new Worker(ICI + "reveil-worker.js");
      return new Promise((ok, ko) => {
        this.worker.onmessage = e => {
          const m = e.data;
          if (m.type === "pret") ok();
          else if (m.type === "erreur") { if (this.etatActuel === "ecoute") this.etat("erreur", m.message); ko(new Error(m.message)); }
          else if (m.type === "score" && !this.enPause) {
            if (this.o.surScore) this.o.surScore(m.score, m.ms);
            if (m.detecte && this.o.surDetection) this.o.surDetection(m.score);
          }
        };
        this.worker.onerror = e => ko(new Error(e.message || "Moteur de réveil illisible"));
        setTimeout(() => ko(new Error("Le moteur de réveil met trop de temps à charger.")), 60000);
        this.worker.postMessage({ type: "init", base: ICI, modele: this.o.modele, seuil: this.seuilActuel });
      });
    }

    brancher() {
      const c = new MessageChannel();
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.noeud = new AudioWorkletNode(this.ctx, "reveil-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.muet = this.ctx.createGain();
      this.muet.gain.value = 0;
      this.source.connect(this.noeud).connect(this.muet).connect(this.ctx.destination);
      this.noeud.port.postMessage({ port: c.port1 }, [c.port1]);
      this.worker.postMessage({ type: "port", port: c.port2 }, [c.port2]);
      const piste = this.stream.getAudioTracks()[0];
      piste.onended = () => this.etat("coupe", "Micro coupé par l'appareil.");
      this.ctx.onstatechange = () => { if (this.ctx && this.ctx.state !== "running" && this.etatActuel === "ecoute") this.etat("coupe", "Écoute suspendue par l'appareil."); };
    }

    async garderEcran() {
      if (!this.o.garderEcran || !navigator.wakeLock || document.visibilityState !== "visible") return;
      try { this.verrou = await navigator.wakeLock.request("screen"); } catch (e) { /* facultatif */ }
    }

    // Au retour sur la page : relance ce qui peut l'être. Sinon, l'état « coupe » demande un toucher.
    async retour() {
      if (document.visibilityState !== "visible" || !this.ctx) return;
      await this.garderEcran();
      try { await this.ctx.resume(); } catch (e) { /* un toucher sera nécessaire */ }
      const piste = this.stream && this.stream.getAudioTracks()[0];
      if (this.ctx.state === "running" && piste && piste.readyState === "live") {
        this.worker.postMessage({ type: "raz" });
        this.etat("ecoute");
      } else this.etat("coupe", "Touche pour relancer l'écoute.");
    }

    set seuil(v) { this.seuilActuel = v; if (this.worker) this.worker.postMessage({ type: "seuil", seuil: v }); }
    get seuil() { return this.seuilActuel; }

    // pause() pendant la dictée et pendant que Rebecca parle ; reprise() ensuite.
    pause() { this.enPause = true; if (this.noeud) this.noeud.port.postMessage({ actif: false }); }
    reprise() {
      this.enPause = false;
      if (this.worker) this.worker.postMessage({ type: "raz" });
      if (this.noeud) this.noeud.port.postMessage({ actif: true });
    }

    arreter() {
      document.removeEventListener("visibilitychange", this.visible);
      if (this.verrou) { this.verrou.release().catch(() => {}); this.verrou = null; }
      if (this.source) this.source.disconnect();
      if (this.noeud) this.noeud.disconnect();
      if (this.stream && this.fluxPropre) this.stream.getTracks().forEach(p => p.stop());
      if (this.worker) this.worker.terminate();
      if (this.ctx) { this.ctx.onstatechange = null; this.ctx.close().catch(() => {}); }
      this.ctx = this.worker = this.noeud = this.source = this.stream = null;
      this.etat("arret");
    }
  }
  window.Reveil = Reveil;
})();
