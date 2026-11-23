# Career Radar Miriam

Piattaforma personale per Job Intelligence, Company Discovery, monitoraggio delle offerte e gestione candidature.

## Struttura

- `backend/worker.js`: Cloudflare Worker API (baseline V25)
- `frontend/index.html`: dashboard (baseline V45)
- `docs/STATUS.md`: stato del progetto e prossime verifiche

## Produzione

- Frontend: https://career-radar-miriam.miriam-cpnh.workers.dev
- API: https://career-radar-api.miriam-cpnh.workers.dev
- Database Cloudflare D1: `career-radar-db`

**IMPORTANTE**: questo repository è inizialmente un archivio del codice, NON è collegato al deployment automatico. Il deploy richiede test e approvazione.

**Sicurezza**: non pubblicare ADMIN_TOKEN, altre credenziali, CV personali, backup D1 o file contenenti dati personali.

## Baseline ricevuta

Codice backend V25 e frontend V45 forniti il 23/11/2026. Le versioni V26 (backend) e V46 (frontend) erano state preparate, ma non risulta confermato il loro deploy. Verificare sempre l'allineamento fra GitHub e Cloudflare prima delle modifiche.