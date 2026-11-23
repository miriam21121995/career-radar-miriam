# V46 — primo deploy via GitHub

## Situazione di partenza
- Produzione attuale dichiarata dall'utente: backend V25, frontend V45.
- Il branch `feature/v46-geografia-catalogo` contiene backend V26, frontend V46 e le configurazioni Wrangler.
- Cloudflare collega lo stesso repository a due Worker, con directory root separate: `backend` e `frontend`.
- NON è stato effettuato alcun merge o deployment in questa preparazione.

## Verifiche prima del merge
1. Conservare l'export JSON dei dati personali dal browser, senza caricarlo su GitHub.
2. Verificare su Cloudflare che il frontend sia collegato al repo `miriam21121995/career-radar-miriam`, production branch `main`, root directory `frontend`, deploy `npx wrangler deploy`.
3. Verificare che il backend sia collegato al medesimo repo, branch `main`, root directory `backend`, deploy `npx wrangler deploy`.
4. Verificare che `ADMIN_TOKEN` sia configurato nei Secrets del Worker backend, **senza rivelarlo**.
5. Verificare in Settings / Bindings che l'API utilizzi `DB` associato a `career-radar-db`.
6. Verificare trigger schedulato `*/30 * * * *`.
7. Eseguire i test `node tests/geography.test.cjs`, `node tests/sync.test.cjs`, `node tests/catalog.test.cjs`.

## Primo deploy
- Il merge in `main` può avviare **entrambi** i deployment Cloudflare in automatico.
- Eseguire il merge solo con approvazione esplicita della proprietaria, dopo i backup.
- Controllare esiti di entrambe le build da Cloudflare.

## Smoke test post-deploy
- GET `https://career-radar-api.miriam-cpnh.workers.dev/api/status` → `ok: true`.
- GET `https://career-radar-api.miriam-cpnh.workers.dev/api/companies` → catalogo aziende (attese ~260).
- Aprire `https://career-radar-miriam.miriam-cpnh.workers.dev`.
- Verificare: annunci, filtri geografici, remote, aziende senza feed, CV Studio, preferiti, refresh.
- Verificare conservazione di note/CV/backup JSON nel browser.

## Rollback
Se uno dei due deploy fallisce o produce regressioni, ripubblicare il precedente commit su `main` o usare la cronologia deployment del Worker Cloudflare, verificando che la configurazione D1 e i Secrets rimangano corretti. Non cancellare D1.
