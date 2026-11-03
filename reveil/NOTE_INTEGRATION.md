# Intégrer le mot de réveil à Rebecca

## Fichiers à publier
Publie tout le dossier `reveil/` à côté de `index.html` (environ 15 Mo). Rien n'est chargé depuis internet à l'exécution.
Les chemins sont relatifs : le même dossier marche sur GitHub Pages et sur un PC local.

Le moteur a son propre onnxruntime-web (1.23.2) dans un fil séparé : il ne gêne pas celui de la page (1.22.0, encore chargé depuis jsDelivr, à poser en local le jour du passage hors ligne).

Si l'Atelier republie le dépôt en remplaçant tout, il devra conserver `reveil/`.

## Code
```html
<script src="reveil/reveil.js"></script>
<script>
  const reveil = new Reveil({ surDetection: () => lancerDictee() });
  boutonMains.onclick = () => reveil.demarrer();   // obligatoirement sur un toucher
</script>
```
- Avant la dictée et pendant que Rebecca parle : `reveil.pause()`, puis `reveil.reprise()`.
- Pour la dictée, donne `reveil.flux` à `MediaRecorder` au lieu d'ouvrir un deuxième micro : sur iPhone/iPad, un deuxième `getUserMedia` coupe le premier.
- `surEtat(etat, detail)` signale `ecoute`, `coupe` (un toucher relance) et `erreur`.

## Format audio d'entrée
Géré par `reveil-worklet.js` : le micro, quelle que soit sa fréquence, est ramené à 16 kHz mono, par blocs de 1280 échantillons (80 ms), à l'échelle ±32767.
Réglages micro : gain automatique activé, annulation d'écho et réduction de bruit désactivées.

## Seuil conseillé
0,50 (dans `reveil.json`). Une détection demande 2 trames de suite au-dessus du seuil, puis 2 s de pause. Ajuste-le avec `test_reveil.html` sur le vrai appareil.

## Batterie
Le calcul coûte environ 5 ms par trame de 80 ms sur la machine de test, soit environ 6 % d'un cœur. La page de test affiche la valeur réelle de ton appareil.
Le gros poste est l'écran allumé. Estimation non mesurée : de l'ordre de 10 à 15 % par heure sur iPad. Sur support, garde l'appareil branché.

## Micro quand la page sera servie par un PC
- `http://localhost` suffit seulement sur le PC lui-même.
- Depuis une tablette ou un téléphone, le https est obligatoire : sans lui, ni micro ni AudioWorklet.
- Le plus propre : un certificat de la DSI, ou une autorité locale (par exemple mkcert) installée et approuvée sur chaque appareil. Un certificat auto-signé accepté à la main peut empêcher le service worker de Rebecca de fonctionner.
- Le serveur doit envoyer `.wasm` en `application/wasm` et `.mjs` en `text/javascript`.

## Limites
- iPad/iPhone : écran verrouillé ou page en arrière-plan, considère l'écoute comme coupée. La page garde l'écran allumé, mais elle doit rester au premier plan. Rebecca installée sur l'écran d'accueil perd aussi le micro en arrière-plan.
- Android : l'écoute peut tenir écran éteint, sans garantie.
- iOS peut baisser le volume du son tant que le micro est ouvert.
- Non testé sur un vrai iPad ni avec ta vraie voix. Si ta voix passe mal, le meilleur levier est d'ajouter quelques dizaines de vrais enregistrements à l'entraînement.
- Garde le bouton manuel.
- Licence : les négatifs ACAV sont en CC BY-NC-SA 4.0, donc modèle pour un usage non commercial.
