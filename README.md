# AgentPunks

10 000 punks pixel sur **BNB Chain**, en **DN404** (1 token = 1 punk, ERC-20 + NFT ERC-721 miroir).
Seuls les **agents IA** avec un **Agent ID .ai** (SPACE ID, Binance Agentic Wallet) peuvent minter.

- 8 888 punks sur une courbe de prix : 0.000625 → 0.01 BNB (×16). La courbe complète lève ~22,22 BNB.
- Chaque paiement est coupé en deux : **50 % pour l'équipe**, **50 % bloqués pour le pool**.
- Quand le punk #8 888 est vendu : 1 112 unités + la moitié pool (~11,1 BNB) → pool PancakeSwap V2 au dernier prix de la courbe. LP envoyés à `0x…dEaD` : bloqués pour toujours.
- Max 100 punks par wallet. Pas de revente à la courbe. Personne ne peut mettre d'unités dans la paire avant la graduation.
- L'ancien projet GridPunks (grille + énigmes) est gardé dans la branche `gridpunks-v1`.

## Structure

```
contracts/AgentPunks.sol    le contrat (DN404 + courbe + graduation)
test/AgentPunks.test.js     tests Hardhat, dont une vente complète + graduation sur un vrai pool Uniswap V2
scripts/deploy.js           déploie (adresses BNB intégrées) + écrit l'adresse dans site/config.json
scripts/open.js             ouvre le mint (une seule fois, impossible de le mettre en pause)
scripts/withdraw.js         envoie la moitié équipe vers le wallet TEAM
site/                       le site (Vercel) + /api/meta/<id> (metadata NFT) + punks.mjs (CLI agents) + skill.md
```

Adresses BNB utilisées (vérifiées dans deux projets agent-only existants) :
SPACE ID Agent ID `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` · PancakeSwap V2 factory `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` · WBNB `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`.

## Lancement

1. `npm install` puis `npx hardhat test` (9 tests doivent passer).
2. `.env` : `copy .env.example .env` → `PRIVATE_KEY` (wallet neuf avec un peu de BNB pour le gas), `SITE_URL`, `TEAM` (wallet qui reçoit ta moitié).
3. `npx hardhat run scripts/deploy.js --network bsc`
4. `git add site/config.json` · `git commit -m "contract"` · `git push` → Vercel met le site à jour.
5. Vérifie le contrat sur BscScan (conseillé : les agents et les acheteurs lisent le code).
6. Jour J : `npx hardhat run scripts/open.js --network bsc`
7. Retirer ta moitié quand tu veux : `npx hardhat run scripts/withdraw.js --network bsc`

## Ce que rapporte la moitié équipe

| Punks vendus | BNB levés | Ta moitié |
|---|---|---|
| 1 000 | 0,68 | 0,34 BNB |
| 2 222 (25 %) | 1,71 | 0,85 BNB |
| 4 444 (50 %) | 4,44 | 2,22 BNB |
| 6 666 (75 %) | 9,52 | 4,76 BNB |
| 8 888 (sold out) | 22,22 | 11,11 BNB |

Le prix monte lentement au début : la moitié de l'argent arrive dans le dernier quart de la courbe.

## À savoir

- Les métadonnées NFT viennent de `/api/meta/<id>` sur le site (image fixe + animation). Si le site tombe, les images ne s'affichent plus : garde Vercel actif.
- Le CLI `punks.mjs` utilise `baw contract-call preview/execute` (Binance Agentic Wallet). Testé ici sans `baw` (lecture seule) : à tester avec un vrai Agentic Wallet avant d'annoncer.
- Vendre des tokens au public peut être encadré par la loi selon les pays. Renseigne-toi avant de lancer.
