# Locally — evenimente și trasee pe hartă

Prototip pentru descoperirea evenimentelor locale: evenimentele apar pe o hartă interactivă, utilizatorii pot vota planurile comunității, iar aplicația calculează drumul către evenimentul ales. Interfața folosește Leaflet, MapLibre GL JS și stilul vectorial Bright de la OpenFreeMap (date OpenStreetMap); backendul PowerShell oferă lista de evenimente și voturi, caută locații cu Nominatim și calculează rute auto cu OSRM.

## Pornire în Windows

1. Deschide PowerShell în folderul proiectului.
2. Pornește backendul:
//matamata 
```powershell
.\start.ps1
```

Backendul pornește la `http://localhost:5101/`. Lasă fereastra PowerShell deschisă cât folosești aplicația.

3. Deschide `http://localhost:5101/` în browser. Serverul local servește interfața și API-ul de pe aceeași origine, astfel încât browserul să poată cere permisiunea pentru locația curentă. Este necesară conexiune la internet pentru librăria Leaflet, căutarea locațiilor și dalele hărții.

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

```json
{
  "origin": { "latitude": 46.7712, "longitude": 23.6236 },
  "destination": { "latitude": 46.7698, "longitude": 23.5766 }
}
```

Răspunsul conține distanța, durata estimată, indicațiile și geometria GeoJSON `LineString` (coordonatele sunt perechi `[longitudine, latitudine]`). Interfața poate folosi locația browserului sau o adresă introdusă și afișează traseul până la evenimentul ales.

Interacțiunea pentru alegerea originii, solicitarea traseului și desenarea acestuia pe hartă este izolată în `route-planner.js`. Utilizatorul poate apăsa „Folosește locația mea” pentru a permite accesul la locația browserului sau poate căuta o adresă; apoi butonul „Cum ajung?” calculează și afișează traseul către eveniment.

### `POST /api/assistant`

Trimite întrebarea și istoricul recent către asistentul Groq. Serverul adaugă evenimentele disponibile și preferințele selectate, iar răspunsul este `{ "reply": "..." }`. Pentru întrebări de traseu, interfața calculează ruta cu endpointul `/api/routes` și transmite către Groq doar rezumatul și indicațiile rutei; coordonatele exacte de plecare rămân în browser și la furnizorul de rutare.

Comportamentul asistentului este ghidat prin instrucțiunile din `server.ps1`, nu prin reantrenarea modelului. Acesta poate recomanda evenimentele din context, explica funcțiile prototipului și interpreta traseul recent; nu poate actualiza voturi sau setări în locul utilizatorului și nu vede propunerile salvate doar în browser.

Asistentul este disponibil din butonul „Întreabă FOMO”. Pentru a-l configura, setează cheia numai în sesiunea PowerShell în care pornești serverul:

```powershell
$env:GROQ_API_KEY = Read-Host "GROQ_API_KEY"
$env:GROQ_MODEL = "openai/gpt-oss-120b"
.\start.ps1
```

`GROQ_MODEL` este opțional și implicit este `openai/gpt-oss-120b`. Nu salva cheia în fișierele proiectului și nu o trimite din browser. Dacă cheia lipsește, endpointul întoarce `503`; dacă Groq nu răspunde, întoarce `502`.

## Date demo și limite

`events.json` conține evenimente demonstrative în Cluj-Napoca. Voturile anonime sunt identificate cu un ID păstrat în browser și nu reprezintă autentificare sigură; datele fișierelor locale sunt pentru prototip, nu pentru utilizare concurentă sau producție. Eticheta „Promovat” este doar o demonstrație a planului paid: nu există încă plăți, notificări push, conturi de organizator sau moderare. Acestea necesită autentificare, infrastructură de persistență și integrarea unui furnizor de plăți/notificări.

## Configurare

Serviciile publice Nominatim și OSRM sunt pentru utilizare modestă și dezvoltare, nu oferă SLA și au limite de utilizare. Folosește servicii găzduite/autorizate pentru trafic de producție. Opțional, backendul acceptă variabilele de mediu `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT` și `OSRM_BASE_URL`. Configurează un User-Agent care identifică aplicația și un contact pentru distribuție publică.
