# Amministratore unico e catalogo pubblicabile

ProAnalyst Labs mantiene React/Vite su Vercel. Non usa Render né FastAPI in esecuzione.
L’accesso «Entra nella demo» è pubblico e non attribuisce privilegi. L’unico amministratore
è il proprietario configurato nelle variabili server `STAFF_USER` e `STAFF_PASSWORD_HASH`.
Le credenziali staff esistenti sono riutilizzate; non esistono registrazione o promozione di utenti.

## Autenticazione e autorizzazione

- Password verificata tramite scrypt e confronto a tempo costante; 8 tentativi ogni 15 minuti per indirizzo.
- Cookie `__Host-proanalyst_staff`: identificativo casuale a 256 bit, HttpOnly, Secure, SameSite=Strict, Path=/, scadenza 8 ore.
- Lo storage privato contiene soltanto l’hash dell’identificativo di sessione. Ogni sessione deve avere ruolo `admin`, proprietario uguale a quello configurato e impronta delle credenziali attuali.
- Le vecchie sessioni `staff` non vengono elevate. Rotazione delle credenziali, scadenza e logout invalidano l’accesso.
- Tutte le API `admin-*` e `insights` verificano il ruolo lato server e restituiscono **403** agli utenti ordinari, prima di invocare upload o modifiche.
- Tutte le scritture richiedono origine esatta, JSON e metadati Fetch coerenti. Le scritture amministrative e il logout autenticato richiedono anche un token CSRF casuale associato alla sessione, conservato dal client solo in memoria.
- Limiti persistenti e atomici: 60 operazioni amministrative/minuto, 5 nuovi upload/15 minuti; feedback e richieste mantengono il limite di 10/minuto e l’idempotenza.
- Nessuna credenziale, password, token OIDC o chiave Blob di lunga durata è inclusa nel frontend. Cambiare localStorage non attribuisce alcuna autorizzazione.

## Catalogo persistente

`GET /api/catalog` restituisce esclusivamente scenari pubblicati associati a video verificati.
La selezione **Genera** rimane immediata e deterministica sul catalogo già caricato: nessuna
generazione AI, richiesta `/generate` o interrogazione periodica di `/status`.

Il documento privato `content/catalog-v1.json` contiene scenari, registro video e revisione.
In sua assenza i 24 originali e le rispettive traduzioni italiane vengono letti dai file esistenti.
Gli aggiornamenti usano la revisione dell’editor e l’ETag di Blob (`ifMatch`), per impedire
sovrascritture concorrenti. Nessun salvataggio viene dichiarato riuscito prima della conferma dello storage.

Salvare uno scenario produce una **bozza**, anche quando si modifica uno scenario pubblicato.
La pubblicazione è esplicita e richiede un MP4 verificato; due scenari pubblicati non possono
avere la stessa fase, i medesimi sistemi di gioco e la stessa variante. Le fasi disponibili
e le formazioni sono aggiornate dal catalogo; gli identificatori A/B/FA restano tecnici.
Disattivare uno scenario lo rimuove dalla risposta pubblica. Cronologia e preferiti rimangono
conservati sul dispositivo e mostrano uno stato non disponibile per gli scenari disattivati.
La pagina rilegge il catalogo all’apertura, al ritorno nella finestra e dopo le modifiche amministrative.
Un errore di lettura non ripristina un catalogo obsoleto che potrebbe contenere scenari ritirati.

Gli originali possono essere modificati o disattivati ma non eliminati. I file originali
`backend/videos/`, il catalogo Python, il JSON esportato e il manifest dei 24 video restano backup immutati.
I nuovi scenari possono essere eliminati; un video nuovo può essere eliminato solo se non è associato
ad alcuno scenario, comprese le bozze. Una prenotazione persistente impedisce associazioni durante la cancellazione.

## Upload MP4

Il pannello usa `uploadPresigned` di Vercel Blob con multipart. Il percorso è assegnato dal server:
`admin/<preview|production>/<uuid>.mp4`, nello store esistente `proanalyst-demo-videos`.

1. `admin-upload-intent` verifica sessione, CSRF, estensione MP4, MIME, dimensione (massimo 256 MiB), nome e limiti d’uso.
2. `admin-upload-token` verifica ancora sessione/CSRF, intento, percorso esatto, ambiente e scadenza. Delega solamente `put`, per quel percorso e dimensione, per 10 minuti, senza sovrascrittura. Usa OIDC e la chiave pubblica della connessione esistente.
3. Il browser invia i byte **direttamente a Blob**, senza attraversare le Vercel Functions.
4. `admin-upload-complete` controlla metadati reali, store/URL, MIME, dimensione e intestazione ISO BMFF/MP4 con una richiesta Range limitata a 4096 byte. Il file viene aggiunto al registro solo dopo i controlli.

Gli upload non sono pubblicazioni automatiche: occorre associare il video a uno scenario e pubblicarlo.
Lo store video è pubblico, come richiesto per la demo: chi possiede un URL Blob può accedere al file;
disattivare uno scenario lo rimuove dal catalogo dell’app, non revoca URL pubblici già condivisi.
Le bozze, le sessioni, i feedback e le richieste sono invece in uno store **privato**.

## API

| Accesso | Endpoint |
| --- | --- |
| Pubblico | GET catalog, GET session, POST login, POST feedback, POST scenario-requests |
| Amministratore | GET admin-content, GET insights, GET admin-events |
| Amministratore + CSRF | POST admin-scenarios, admin-scenario-status, admin-scenario-delete, admin-video-delete, admin-upload-intent, admin-upload-token, admin-upload-complete, logout |

Gli ambienti preview e produzione conservano documenti e sessioni in store privati distinti.
Le namespace video preview/production impediscono cancellazioni incrociate nello store pubblico condiviso.

## Verifiche

- Build Vite, ESLint e test Node per autenticazione, autorizzazione, CSRF, concorrenza, integrità del catalogo e validazione upload.
- Test Playwright con handler reale e storage isolato: ruoli, editor, bozza/pubblicazione/disattivazione, ripristino sessione, logout, fallimenti del catalogo, desktop e mobile.
- Test originali: tutte le 24 analisi, video associati, fasi/varianti, cronologia, preferiti, demo e risorse.
- `scripts/verify-admin-preview.js`: prova di upload multipart reale, lettura del nuovo scenario da un browser pubblico e rimozione dei soli dati creati dalla verifica.
- `scripts/verify-preview.js --read-only`: riproduzione e ricerca temporale dei 24 MP4; accesso amministratore e statistiche senza inviare feedback di prova in produzione.

Lo stato effettivo dei deploy e delle verifiche live è registrato nei report JSON della cartella `web`.

## Rilascio verificato del 16 novembre 2026

- Codice applicativo: commit `7c86592` sulla branch `migration/react-vite-vercel`, PR #1.
- Preview verificata: https://proanalyst-labs-n648c7cs5-alejandros-projects-a7058275.vercel.app
- Produzione: https://proanalyst-labs-mvp.vercel.app
- Deployment di produzione: `dpl_DZEdQh2qGpWfDcBpGX4hFidwqwM8`, progetto `prj_Mlq2vXazedm3goNlECwBKJhHS9x3`.
- Build, lint, 34 test Node, 7 test browser e 5 test Python superati; audit produzione senza vulnerabilità rilevate.
- Upload multipart reale dalla preview, verifica MP4, riproduzione/seek, pubblicazione senza deploy, visibilità da un browser utente, disattivazione e rimozione dei soli dati di prova: superati.
- Tutte le 10 API amministrative rispondono HTTP 403 agli utenti ordinari, verificato anche sul deployment con configurazione di produzione prima della promozione.
- Riproduzione e seek dei 24 video originali, login, statistiche riservate, logout e layout mobile verificati sia sulla preview sia sul dominio pubblico dopo la promozione.
- Nessuno scenario, video o feedback di prova inserito in produzione. Lo store pubblico è tornato ai 24 video originali dopo le verifiche.

Il problema rilevato nella prima preview (ETag debole di una risposta compressa, incompatibile con `ifMatch`) è stato corretto richiedendo `Accept-Encoding: identity` nella lettura del documento versionato. Il test di regressione controlla sia la scrittura valida sia il rifiuto delle revisioni obsolete.

Evidenze: `web/admin-preview-verification.json`, `web/admin-catalog-verification.json`, `web/admin-production-verification.json`.
