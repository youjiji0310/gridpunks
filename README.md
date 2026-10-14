# GridPunks

10 000 punks pixel cachés dans une grille 100 × 100 sur **Robinhood Chain** (EVM L2, chain ID 4663).
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
```

## Lancement (dans l'ordre)

1. **Installer et tester**
   ```
   npm install
   npx hardhat test
   ```
2. **Site sur Vercel d'abord** (il faut son URL pour le tokenURI) : déploie le dossier `site/` (Root Directory = `site`). Sans adresse de contrat, le site tourne en mode preview avec des cases de démo.
3. **Wallet de déploiement** : crée un wallet neuf, mets-y un peu d'ETH sur Robinhood Chain (le déploiement consomme ~1.9 M gas, quelques centimes sur L2).
4. **.env**
   ```
   cp .env.example .env    # PRIVATE_KEY + SITE_URL (ex. https://gridpunks.vercel.app)
   ```
5. **Déployer** (le mint est fermé au départ)
   ```
   npx hardhat run scripts/deploy.js --network robinhood
   ```
   `site/config.json` reçoit l'adresse du contrat → redéploie le site sur Vercel.
6. **Vérifier le contrat** sur robinhoodchain.blockscout.com (optionnel mais conseillé).
7. **Test réel** : ouvre le mint, minte 1 case depuis un autre wallet, vérifie la révélation, puis `https://<site>/api/meta/<id>`.
   ```
   npx hardhat run scripts/open.js --network robinhood
   ```
8. **Retirer les fonds** quand tu veux :
   ```
   npx hardhat run scripts/withdraw.js --network robinhood
   ```

## Coûts mesurés (tests locaux)

| Action | Gas |
|---|---|
| Déploiement | ~1 880 000 |
| Mint 1 case | ~168 000 |
| Mint 20 cases | ~1 150 000 |

## Ce qu'il faut savoir

- **Aléatoire** : le punk est tiré à partir du hash du bloc précédent, de l'heure, de l'adresse et d'un compteur. Les contrats ne peuvent pas minter (`msg.sender == tx.origin`), ce qui bloque l'astuce « simuler et annuler jusqu'à tomber sur un rare ». Ce n'est pas un VRF : le séquenceur de Robinhood Chain pourrait en théorie influencer le tirage. Pour un mint à 0.0003 ETH c'est acceptable ; pour plus de garanties il faudrait un oracle (Chainlink VRF ou équivalent) s'il est dispo sur la chaîne.
- **Provenance** : le sha256 de `traits.json` est enregistré dans le contrat au déploiement ; le site l'affiche et vérifie qu'il correspond.
- **Prix en ETH** : 0.0003 ETH ≈ 0.75 $ aujourd'hui ; modifiable avec `setPrice`.
- **RPC** : le RPC public de Robinhood est limité en débit. Si le mint marche fort, mets un RPC dédié (Quicknode, Alchemy…) dans `site/config.json` et `RPC_URL`.
- **Nom** : « GridPunks » est provisoire ; change-le dans le contrat (avant déploiement), `site/config.json`, `index.html`.
