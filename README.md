# Locally — evenimente și trasee pe hartă

Prototip pentru descoperirea evenimentelor locale: evenimentele apar pe o hartă interactivă, utilizatorii pot vota planurile comunității, iar ruta auto către evenimente și locații este afișată în aplicație. Transportul public se deschide în Google Maps. Interfața folosește Leaflet și OpenStreetMap; backendul PowerShell oferă lista de evenimente și voturi și caută locații cu Nominatim.

Navigarea este în bara de jos: **Acasă** afișează harta, iar **Funcții** deschide descoperirea evenimentelor, setările și instrumentele comunității. Codul barei de navigare este în `buttons-ui/`.
Aplicație pentru descoperirea evenimentelor locale: evenimentele apar pe o hartă interactivă Leaflet cu dale raster OpenStreetMap, utilizatorii pot confirma participarea, iar ruta auto către evenimente și locații este afișată în aplicație. Transportul public se deschide în Google Maps. Backendul PowerShell caută locații cu Nominatim; Firebase Authentication și Realtime Database gestionează conturile, locațiile, cererile de owner și evenimentele comunității.

## Pornire în Windows

1. Deschide PowerShell în folderul proiectului.
2. Pornește backendul:
```powershell
.\start.ps1
```

Backendul pornește la `http://localhost:5101/`. Lasă fereastra PowerShell deschisă cât folosești aplicația.

3. Deschide `http://localhost:5101/` sau pornește `index.html` prin VS Code Live Server. Pentru căutarea adreselor și rutarea locală, păstrează backendul pornit pe portul `5101`; aplicația detectează automat Live Server local și trimite cererile API către backend. Pe GitHub Pages, harta și evenimentele comunității se încarcă fără backendul local; Groq și funcțiile API locale nu sunt disponibile acolo. Deschiderea directă a paginii cu `file://` poate fi limitată de browser; folosește Live Server. Este necesară conexiune la internet pentru librăria Leaflet, căutarea locațiilor și dalele hărții.

Dacă Windows blochează rularea scripturilor, pornește serverul explicit:

```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```

Fiecare coleg trebuie să pornească propriul backend local după ce descarcă sau actualizează codul. Verifică `http://localhost:5101/health`; răspunsul trebuie să fie `{"status":"ok"}`. Dacă ruta nu pornește, verifică mesajul afișat în aplicație și confirmă că backendul rulează pe portul `5101` și că există conexiune la internet pentru serviciul OSRM.

## Lucrul în echipă

Instrucțiunile pentru împărțirea muncii, ramuri Git și verificarea modificărilor sunt în [CONTRIBUTING.md](./CONTRIBUTING.md). Pentru a rula verificarea API-ului local, cu PowerShell deschis în folderul proiectului, execută:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\smoke-test.ps1
```

Aceeași verificare rulează automat la fiecare Pull Request și la push pe ramura `main`, folosind GitHub Actions. Nu este nevoie de servicii externe pentru test.

## API

### `GET /health`

Verifică dacă backendul rulează și întoarce `{"status":"ok"}`.

### `GET /api/events?voterId=...`

Întoarce evenimentele din `events.json`, numărul de voturi și dacă utilizatorul cu `voterId` a votat deja.

### `POST /api/events/{id}/votes`

Primește `{"voterId":"..."}` și adaugă sau retrage votul. Voturile sunt salvate local în `votes.json`.

### `GET /api/search?q=Cluj-Napoca`

Caută până la cinci locații prin Nominatim și întoarce numele și coordonatele lor. Backendul cache-uiește căutările și limitează cererile către Nominatim la cel mult una pe secundă, conform politicii serviciului public.

### Trasee auto și transport public

Butonul „Cum ajung?” calculează ruta prin OSRM și afișează pe harta FOMO doar linia și marcajele de plecare/destinație, fără panou cu detalii despre mașină sau durată. Ruta poate fi anulată fără a șterge originea selectată. Butonul „Transport public” deschide Google Maps cu indicațiile de autobuz/tren. Poți apăsa „Folosește locația mea” sau căuta o adresă pentru a seta plecarea; cheia Google Maps API nu este necesară. Pe GitHub Pages, calculul rutei și căutarea adresei folosesc direct serviciile publice OSRM și Nominatim, astfel încât funcția de rută nu depinde de backendul local. Serviciile publice pot avea limite sau indisponibilități; când folosești GitHub Pages, coordonatele plecării și destinației sunt trimise către OSRM, iar textul adresei căutate către Nominatim.

### Ridesharing: Uber și integrarea viitoare Bolt

„Cheamă o cursă” apare pe cardurile evenimentelor și în popup-urile locațiilor. Uber se deschide prin universal deep link cu destinația și punctul de plecare selectat, atunci când sunt disponibile; utilizatorul verifică ruta, tariful și confirmă cursa în Uber. FOMO nu rezervă cursa, nu procesează plăți și nu estimează prețuri.

Opțiunea Bolt este afișată ca integrare de parteneriat, dar rămâne dezactivată până când există documentație oficială verificată și acces aprobat la deeplink/API. Nu presupunem că există contract sau disponibilitate a serviciului.

Pentru o integrare de parteneriat la scară, extinde `ride-sharing.js` cu un adaptor pentru fiecare furnizor, iar backendul să solicite oferte și să creeze rezervări doar prin API-uri oficiale server-to-server. Cheile și tokenurile de partener trebuie păstrate numai pe server; fiecare cerere ar trebui să solicite consimțământ explicit pentru transmiterea locației, să evite stocarea coordonatelor și să trateze cotațiile ca expirabile. Confirmarea rezervării, anulările, erorile furnizorului și reconcilierea plăților trebuie implementate înainte de a prezenta o comandă ca fiind finalizată.

### `POST /api/assistant`

Trimite întrebarea și istoricul recent către asistentul Groq. Serverul adaugă evenimentele disponibile și preferințele selectate, iar răspunsul este `{ "reply": "..." }`. Pentru întrebări de traseu, interfața trimite către Groq doar numele evenimentului și locația asociată, dacă sunt disponibile; butonul „Cum ajung?” afișează ruta auto în FOMO, iar transportul public se deschide în Google Maps.

Comportamentul asistentului este ghidat prin instrucțiunile din `server.ps1`, nu prin reantrenarea modelului. Acesta poate căuta cele 90 de locații după oraș, nume și categorie, recomanda evenimente aprobate și interpreta traseul recent; datele sunt citite la fiecare întrebare. Dacă Realtime Database nu este disponibilă, endpointul întoarce o eroare în loc să răspundă folosind date incomplete. Asistentul nu poate actualiza voturi sau setări în locul utilizatorului.

Asistentul este disponibil din butonul „Întreabă FOMO”. Pentru a-l configura, setează cheia numai în sesiunea PowerShell în care pornești serverul:

```powershell
$env:GROQ_API_KEY = Read-Host "GROQ_API_KEY"
$env:GROQ_MODEL = "openai/gpt-oss-120b"
.\start.ps1
```

`GROQ_MODEL` este opțional și implicit este `openai/gpt-oss-120b`. Nu salva cheia în fișierele proiectului și nu o trimite din browser. Dacă cheia lipsește, endpointul întoarce `503`; dacă Groq nu răspunde, întoarce `502`.

## Firebase: conturi, locații și moderare

Conturile folosesc Firebase Authentication, iar profilurile, locațiile și evenimentele sunt stocate în **Firebase Realtime Database**. Configurația folosește planul Spark gratuit și nu depinde de Firestore, Cloud Functions sau facturarea Blaze. Regulile din `database.rules.json` limitează accesul la solicitările și evenimentele la utilizatorul care le-a trimis, ownerul aprobat al locației și administrator.

Proiectul Web și ID-ul proiectului sunt deja setate în `firebase-config.js` și `.firebaserc`. Configurația Firebase Web este publică; nu pune parole sau chei service-account în cod.

Pentru inițializare:

1. În Firebase Console, Authentication → Sign-in method, activează **Email/Password**. În Authentication → Settings → Authorized domains, adaugă `localhost`.
2. Instanța gratuită Realtime Database `fomo-68a85-default-rtdb` a fost creată în regiunea **United States (us-central1)**. URL-ul ei este `https://fomo-68a85-default-rtdb.firebaseio.com`, deja setat în `firebase-config.js`. Realtime Database este disponibil pe Spark; Cloud Functions și Blaze nu sunt folosite.
3. Autentifică Firebase CLI și publică regulile Realtime Database. Regulile trebuie republicate și după orice modificare a fișierului `database.rules.json`:

   ```powershell
   npx --yes firebase-tools@latest login
   npx --yes firebase-tools@latest deploy --only database --project fomo-68a85
   ```

4. Creează contul administratorului `user-vld` prin aplicație și confirmă emailul. În Firebase Console → Authentication → Users copiază UID-ul exact al acelui cont.
5. În Realtime Database creează manual `admins/{UID}` cu valoarea booleană `true` numai pentru UID-ul lui `user-vld`. Nu adăuga alți UID-uri aici dacă solicitările trebuie să fie vizibile doar acestui cont. Aceasta este singura cale de a acorda administrator; aplicația publică nu permite promovarea utilizatorilor în admin.
6. Deconectează-te și autentifică-te din nou. Catalogul celor 90 de locații este deja încărcat în Realtime Database; administratorul poate folosi butonul **Încarcă cele 90 de locații** din meniul **Cont** pentru a-l reîncărca, fără să înlocuiască ownerii existenți.
7. Pornește backendul local cu `.\start.ps1` și accesează `http://localhost:5101/`.

La autentificare, dacă profilul `users/{UID}` lipsește, aplicația îl creează din emailul și numele contului Firebase, fără să suprascrie profilele existente. Utilizatorul poate citi și actualiza numai profilul asociat propriului UID; validările bazei verifică emailul, username-ul și data creării, iar câmpurile suplimentare sunt respinse.

Pagina **Profil** afișează starea contului din Firebase Authentication; nu cere citirea profilului din Realtime Database doar pentru a afișa emailul autentificat.

Cele 90 de locații sunt afișate ca puncte cyan grupate pe hartă; la încărcare, harta se încadrează pe toate cele nouă orașe, iar apăsarea/hover-ul arată informațiile locației. Dacă o locație are câmpul opțional `imageUrl` cu o adresă HTTPS, fotografia apare în tooltip la trecerea cursorului peste marker. Clientul completează automat URL-urile foto lipsă din `locations.json`, astfel încât fotografiile catalogului funcționează fără drepturi de administrator Firebase; administratorii le pot salva în baza de date reîncărcând catalogul, iar imaginile configurate direct în baza de date au prioritate. Reîncărcarea catalogului păstrează ownerii și URL-urile foto deja existente. Popupurile evenimentelor și ale locațiilor gazdă afișează detaliile evenimentului, iar locația este recunoscută prin ID, numele locației sau coordonate apropiate; contorul și popupurile rămân actualizate după confirmarea participării. `events.json` este gol, astfel încât evenimentele demonstrative verzi să nu mai apară pe hartă. Utilizatorii cu email confirmat pot trimite cereri de owner către administratorul `user-vld`, cu denumirea legală, forma juridică, țara, CUI/CIF, numărul din Registrul Comerțului și sediul social al firmei. Cererile și deciziile se actualizează în timp real; fila **Cont** afișează un badge cu cererile în așteptare, iar numai UID-ul administratorului `QM6bRLP4OMZRo6CBNe6JkqClMrf1` le poate aproba sau respinge. La aprobare, utilizatorul primește rolul **Owner**, vizibil în profil, pentru locația respectivă și poate solicita promovarea evenimentelor aprobate. Propunerile noi de evenimente ajung în inboxul din **Funcții → Evenimente → Propune un eveniment**; `user-vld` le poate verifica pe toate, iar ownerii pot verifica doar evenimentele trimise pentru locațiile lor.

În popupul fiecărui eveniment, data și intervalul apar împreună, urmate de preț, numărul participanților, status, descriere, butonul de participare, linkul de bilete și câte un singur set de acțiuni pentru traseu și cursă.

Propunerile noi includ tipul, locația, ziua și intervalul orar, prețul biletului în RON (0 pentru intrare gratuită) și, pentru evenimente cu plată, un link HTTPS către pagina de bilete a organizatorului. FOMO nu procesează plata și deschide linkul extern numai după validarea HTTPS. Evenimentele apar imediat pe hartă ca **În verificare**; ownerul locației sau `user-vld` le poate aproba ori respinge. Cererile de participare la evenimentele comunității și evenimentele din `events.json` se salvează în `eventAttendance/{eventId}/{uid}`; numărul total este vizibil public pentru afișarea contorului, dar numai utilizatorul autentificat cu email confirmat își poate adăuga sau șterge propria participare. Contorul din marker, card și popup se actualizează în timp real, markerul este gri când nu există participanți și se mărește odată cu numărul acestora. Linkul **Cumpără bilet** apare când evenimentul are un URL HTTPS valid. Evenimentele dispar din hartă și listă după ora de sfârșit. Căutarea permite filtrele Socializare, Ateliere, Caritate, Expoziții și artă, Sport, Sănătate și wellbeing și Muzică și divertisment, plus sortarea după participare, ora apropiată sau preț și filtrarea după tipul locației. Ownerul unui eveniment aprobat cu bilet plătit poate deschide pagina de promovare demo, care calculează orientativ 5% și trimite o cerere de verificare administratorului; pagina nu procesează și nu încasează bani. Administratorul confirmă manual promovarea după verificare.

În **Funcții → Cont**, UID-ul `user-vld` trebuie să fie singurul cu valoarea `true` în `admins/{UID}` dacă mesajele de solicitare Owner trebuie să apară doar acelui cont. Acesta primește badge pe fila Cont și poate confirma/respinge cererile după verificarea documentelor firmei; la aprobare, UID-ul solicitantului este asociat locației ca owner.

## Date demo și limite

`events.json` este gol; propunerile comunității aprobate sunt stocate în Realtime Database. Voturile rămân relevante doar pentru evenimentele demo viitoare. `locations.json` este catalogul inițial încărcat în Realtime Database. Coordonatele catalogului sunt orientative și trebuie verificate înainte de folosirea în producție. Aplicația web folosește în continuare backendul PowerShell local pentru căutarea adreselor și rutare; pentru publicare, aceste servicii trebuie găzduite separat.

## Configurare

Serviciul public Nominatim este pentru utilizare modestă și dezvoltare, nu oferă SLA și are limite de utilizare. Folosește un serviciu găzduit/autorizat pentru trafic de producție. Opțional, backendul acceptă variabilele de mediu `NOMINATIM_BASE_URL` și `NOMINATIM_USER_AGENT`. Configurează un User-Agent care identifică aplicația și un contact pentru distribuție publică.
