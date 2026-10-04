# Locally — evenimente și trasee pe hartă

Prototip pentru descoperirea evenimentelor locale: evenimentele apar pe o hartă interactivă, utilizatorii pot vota planurile comunității, iar aplicația calculează drumul către evenimentul ales. Interfața folosește Leaflet și OpenStreetMap; backendul PowerShell oferă lista de evenimente și voturi, caută locații cu Nominatim și calculează rute auto cu OSRM.

Navigarea este în bara de jos: **Acasă** afișează harta, iar **Funcții** deschide descoperirea evenimentelor, setările și instrumentele comunității. Codul barei de navigare este în `buttons-ui/`.
Aplicație pentru descoperirea evenimentelor locale: evenimentele apar pe o hartă interactivă, utilizatorii pot vota planurile comunității, iar aplicația calculează drumul către evenimentul ales. Interfața folosește Leaflet, MapLibre GL JS și stilul vectorial Bright de la OpenFreeMap (date OpenStreetMap). Backendul PowerShell caută locații cu Nominatim și calculează rute auto cu OSRM; Firebase Authentication și Realtime Database gestionează conturile, locațiile, cererile de owner și aprobarea evenimentelor.

## Pornire în Windows

1. Deschide PowerShell în folderul proiectului.
2. Pornește backendul:
```powershell
.\start.ps1
```

Backendul pornește la `http://localhost:5055/`. Lasă fereastra PowerShell deschisă cât folosești aplicația.

3. Deschide `index.html` în browser. Este necesară conexiune la internet pentru librăria Leaflet, căutarea locațiilor și dalele hărții.

Dacă Windows blochează rularea scripturilor, pornește serverul explicit:

```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```

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

### `POST /api/routes`

Primește coordonatele selectate:
//matamatamare
//o bag in soare
```json
{
  "origin": { "latitude": 46.7712, "longitude": 23.6236 },
  "destination": { "latitude": 46.7698, "longitude": 23.5766 }
}
```

Răspunsul conține distanța, durata estimată, indicațiile și geometria GeoJSON `LineString` (coordonatele sunt perechi `[longitudine, latitudine]`). Interfața poate folosi locația browserului sau o adresă introdusă și afișează traseul până la evenimentul ales.

Interacțiunea pentru alegerea originii, solicitarea traseului și desenarea acestuia pe hartă este izolată în `route-planner.js`. Utilizatorul poate apăsa „Folosește locația mea” pentru a permite accesul la locația browserului sau poate căuta o adresă; apoi butonul „Cum ajung?” calculează și afișează traseul către eveniment.

### `POST /api/assistant`

Trimite întrebarea și istoricul recent către asistentul Groq. Serverul citește din Realtime Database catalogul public de locații și doar evenimentele aprobate, apoi transmite datele descriptive necesare și preferințele selectate; nu transmite conturi, emailuri, UID-uri, cereri de owner sau propuneri în așteptare. Răspunsul este `{ "reply": "..." }`. Pentru întrebări de traseu, interfața calculează ruta cu endpointul `/api/routes` și transmite către Groq doar rezumatul și indicațiile rutei; coordonatele exacte de plecare rămân în browser și la furnizorul de rutare.

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

4. Creează-ți contul prin aplicație și confirmă emailul. În Firebase Console → Authentication → Users copiază UID-ul acelui cont.
5. În Realtime Database creează manual `admins/{UID}` cu valoarea booleană `true`. Aceasta este singura cale de a acorda administrator; aplicația publică nu permite promovarea utilizatorilor în admin.
6. Deconectează-te și autentifică-te din nou. Catalogul celor 90 de locații este deja încărcat în Realtime Database; administratorul poate folosi butonul **Încarcă cele 90 de locații** din meniul **Cont** pentru a-l reîncărca, fără să înlocuiască ownerii existenți.
7. Pornește backendul local cu `.\start.ps1` și accesează `http://localhost:5101/`.

La autentificare, dacă profilul `users/{UID}` lipsește, aplicația îl creează din emailul și numele contului Firebase, fără să suprascrie profilele existente. Utilizatorul poate citi și actualiza numai profilul asociat propriului UID; validările bazei verifică emailul, username-ul și data creării, iar câmpurile suplimentare sunt respinse.

Pagina **Profil** afișează starea contului din Firebase Authentication; nu cere citirea profilului din Realtime Database doar pentru a afișa emailul autentificat.

Cele 90 de locații sunt afișate ca puncte cyan grupate pe hartă; la încărcare, harta se încadrează pe toate cele nouă orașe, iar apăsarea/hover-ul arată informațiile locației. Dacă o locație are câmpul opțional `imageUrl` cu o adresă HTTPS, fotografia apare în tooltip la trecerea cursorului peste marker. Clientul completează automat URL-urile foto lipsă din `locations.json`, astfel încât fotografiile catalogului funcționează fără drepturi de administrator Firebase; administratorii le pot salva în baza de date reîncărcând catalogul, iar imaginile configurate direct în baza de date au prioritate. Reîncărcarea catalogului păstrează ownerii și URL-urile foto deja existente. Evenimentele aprobate afișează descrierea în popup. `events.json` este gol, astfel încât evenimentele demonstrative verzi să nu mai apară pe hartă. Utilizatorii cu email confirmat pot trimite cereri de owner către administratori; cererile și deciziile se actualizează în timp real. La aprobare, utilizatorul primește rolul **Owner**, vizibil în profil, pentru locația respectivă și poate aproba sau respinge evenimentele trimise acolo. Administratorii văd și decid cererile în secțiunea **Solicitări de owner** din meniul **Cont**.

## Date demo și limite

`events.json` este gol; propunerile comunității aprobate sunt stocate în Realtime Database. Voturile rămân relevante doar pentru evenimentele demo viitoare. `locations.json` este catalogul inițial încărcat în Realtime Database. Coordonatele catalogului sunt orientative și trebuie verificate înainte de folosirea în producție. Aplicația web folosește în continuare backendul PowerShell local pentru căutarea adreselor și rutare; pentru publicare, aceste servicii trebuie găzduite separat.

## Configurare

Serviciile publice Nominatim și OSRM sunt pentru utilizare modestă și dezvoltare, nu oferă SLA și au limite de utilizare. Folosește servicii găzduite/autorizate pentru trafic de producție. Opțional, backendul acceptă variabilele de mediu `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT` și `OSRM_BASE_URL`. Configurează un User-Agent care identifică aplicația și un contact pentru distribuție publică.


// pun la comentarii de test
//
//gay
