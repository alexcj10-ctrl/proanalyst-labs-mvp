# Interfaccia italiana

Le traduzioni modificabili sono in `web/src/i18n/`:

- `ui.it.json`: interfaccia, accessibilità, stati vuoti, metodologia e notifiche.
- `tactics.it.json`: testi dei 24 scenari e profili tattici.
- `errors.it.json`: errori API, autenticazione, rete e salvataggio.
- `index.js`: applicazione delle traduzioni ai soli campi destinati alla lettura.

Le frasi inglesi sono le chiavi di traduzione, non il testo visualizzato.
`catalog.json` resta l'esportazione esatta di `backend/sequences.py`: non duplicare
o tradurre identificatori, fasi interne, varianti, formazioni o nomi dei video.
Quando si aggiunge un testo tattico alla fonte Python, esportare il catalogo e
aggiungere la traduzione corrispondente; i test segnalano le traduzioni mancanti.

La cronologia preesistente conserva chiavi, date e contenuti nel localStorage.
In lettura, lo scenario viene associato al catalogo italiano tramite `scenario_id`.
Anche i preferiti mantengono gli identificatori originali. Le date sono visualizzate
in formato italiano e il documento HTML dichiara `lang="it"`.

Verifiche: build, lint, 10 test JavaScript, 5 test Python e 4 test Chrome
(desktop/mobile, tutte le 24 analisi, vecchia cronologia inglese, accesso staff,
errori e statistiche dinamiche). I test browser con risposte simulate sono fixture
di test esplicite: l'applicazione continua a utilizzare le vere Vercel Functions.

Il whitepaper originale contiene 16 pagine in inglese ed è conservato senza
modifiche. Anche introduzione e video tattici restano invariati: la localizzazione
non altera eventuali scritte o audio incorporati nei file multimediali.

La versione italiana è verificata anche sul dominio pubblico Vercel, con
riproduzione e seek dei 24 video e autenticazione staff reale.
