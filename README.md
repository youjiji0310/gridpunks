# GridPunks

10 000 punks pixel cachés dans une grille 100 × 100 sur **Ink** (L2 de Kraken, OP Stack, chain ID 57073).
L'acheteur choisit sa case, le contrat tire le punk au hasard au moment du mint et le site le révèle tout de suite.

- Supply 10 000 · Prix **0.0003 ETH** par case · Max 20 cases par transaction · Royalties 10 % (ERC-2981)
- Token id = case : `id = y × 100 + x`
- Même moteur d'art que QuantusPunks (pixel 24×24), traits renommés et collection régénérée (seed `gridpunks-genesis-v1`)
- Les fonds du mint restent dans le contrat ; tu les récupères avec `withdraw`

## Structure

```
contracts/GridPunks.sol   le contrat (ERC-721 + ERC-2981, OpenZeppelin 5)
test/                     tests Hardhat (dont un mint complet des 10 000 cases)
scripts/deploy.js         déploie + écrit l'adresse dans site/config.json
scripts/open.js           ouvre le mint (CLOSE=1 pour fermer)
scripts/withdraw.js       retire les ETH du mint vers ton wallet
scripts/generate.js       régénère traits.json (node scripts/generate.js <seed>)
site/                     site statique + fonction metadata (déployer ce dossier sur Vercel)
  config.json             contract, rpc, chainId… (rempli automatiquement par deploy.js)
  api/meta/[id].js        tokenURI : lit la case on-chain et renvoie le JSON + l'image SVG
  api/collection.js       contractURI : nom, image et royalties de la collection (OpenSea)
```

## Lancement (dans l'ordre)

1. **Installer et tester**
   ```
   npm install
   npx hardhat test
   ```
2. **Site sur Vercel d'abord** (il faut son URL pour le tokenURI) : importe le repo tel quel, sans rien changer (le `vercel.json` à la racine sert le dossier `site/` et les fonctions `/api`). Sans adresse de contrat, le site tourne en mode preview avec des cases de démo.
3. **Wallet de déploiement** : crée un wallet neuf, mets-y un peu d'ETH sur Ink (via un bridge listé sur docs.inkonchain.com). Quelques dollars suffisent pour le déploiement et les énigmes.
4. **.env**
   ```
   cp .env.example .env    # PRIVATE_KEY + SITE_URL (ex. https://gridpunks.vercel.app)
   ```
5. **Déployer** (le mint est fermé au départ)
   ```
   npx hardhat run scripts/deploy.js --network ink
   ```
   `site/config.json` reçoit l'adresse du contrat → redéploie le site sur Vercel.
6. **Vérifier le contrat** sur explorer.inkonchain.com (optionnel mais conseillé).
7. **Test réel** : ouvre le mint, minte 1 case depuis un autre wallet, vérifie la révélation, puis `https://<site>/api/meta/<id>`.
   ```
   npx hardhat run scripts/open.js --network ink
   ```
8. **Retirer les fonds** quand tu veux :
   ```
   npx hardhat run scripts/withdraw.js --network ink
   ```

## Les énigmes (The Vault)

La grille est coupée en **10 zones** de 10 lignes (zone = case / 1000). Chaque zone est scellée par une énigme.

- Celui qui résout l'énigme minte tout de suite dans la zone ; les autres attendent 24 h (réglable).
- La réponse ne quitte jamais le navigateur : elle devient (PBKDF2) une clé privée qui signe l'adresse du joueur. Le contrat ne connaît que l'adresse publique : copier la transaction de quelqu'un ne sert à rien.
- Une 11e énigme, publiée après la dernière zone, débloque le **Golden Punk** (token #10000, 1 sur 1), gratuit pour le premier qui la résout.
- Les réponses sont dans `puzzles/puzzles.enc.json`, chiffré (scrypt + AES-256-GCM). Le mot de passe va dans `.env` → `PUZZLE_PASSWORD`. Ne le partage jamais et ne commit jamais `.env`.

| Zone | Énigme | Type |
|---|---|---|
| 0 | The Front Page | ROT13 (facile) |
| 1 | Two Coats of Paint | Base64 + hex |
| 2 | The First Tweet | Vigenère |
| 3 | Read Me Down | Acrostiche |
| 4 | Dots and Dashes | Morse |
| 5 | Ones and Zeros | Binaire |
| 6 | Aleph Meets Tav | Atbash |
| 7 | The Nine Pages | Whitepaper Bitcoin |
| 8 | Hungry Shift | César + Bitcoin Pizza Day |
| 9 | Three Spells | 3 couches |
| ★ | The Golden Punk | utilise les 10 réponses |

Voir les réponses (pour toi seul) : `node scripts/puzzles.js --answers`

### Jour du lancement

```
npx hardhat run scripts/open.js --network ink                 # ouvre le mint
ZONE=0 HOURS=24 npx hardhat run scripts/release.js --network ink   # publie l'énigme 0
```
PowerShell : `$env:ZONE="0"; $env:HOURS="24"; npx hardhat run scripts/release.js --network ink`

Le script affiche le texte à poster sur X. Publie une zone par jour (0 → 9), puis `ZONE=legend` pour le Golden Punk.
Si une énigme reste bloquée trop longtemps, ouvre la zone à tous plus tôt avec `setZonePublicAt`.

## OpenSea

OpenSea supporte Ink. La collection apparaît d'elle-même après le premier mint (ERC-721 standard + `tokenURI` + `contractURI`).
Ensuite, connecte le wallet de déploiement sur OpenSea pour revendiquer la collection (logo, bannière, liens, royalties).
Si une image ou des traits ne s'affichent pas : bouton « Refresh metadata » sur l'item.

## Coûts mesurés (tests locaux)

| Action | Gas |
|---|---|
| Déploiement | à remesurer (contrat plus gros avec les énigmes) |
| Mint 1 case | ~168 000 |
| Mint 20 cases | ~1 150 000 |

## Ce qu'il faut savoir

- **Aléatoire** : le punk est tiré à partir du hash du bloc précédent, de l'heure, de l'adresse et d'un compteur. Les contrats ne peuvent pas minter (`msg.sender == tx.origin`), ce qui bloque l'astuce « simuler et annuler jusqu'à tomber sur un rare ». Ce n'est pas un VRF : le séquenceur d'Ink pourrait en théorie influencer le tirage. Pour un mint à 0.0003 ETH c'est acceptable ; pour plus de garanties il faudrait un oracle (Chainlink VRF ou équivalent) s'il est dispo sur la chaîne.
- **Provenance** : le sha256 de `traits.json` est enregistré dans le contrat au déploiement ; le site l'affiche et vérifie qu'il correspond.
- **Prix en ETH** : 0.0003 ETH ≈ 0.75 $ aujourd'hui ; modifiable avec `setPrice`.
- **RPC** : le RPC public d'Ink est limité en débit (secours : https://rpc-qnd.inkonchain.com). Si le mint marche fort, mets un RPC dédié (Quicknode, Alchemy…) dans `site/config.json` et `RPC_URL`.
- **Nom** : « GridPunks » est provisoire ; change-le dans le contrat (avant déploiement), `site/config.json`, `index.html`.
