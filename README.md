# Locally — evenimente și trasee pe hartă

Prototip pentru descoperirea evenimentelor locale: evenimentele apar pe o hartă interactivă, utilizatorii pot vota planurile comunității, iar aplicația calculează drumul către evenimentul ales. Interfața folosește Leaflet și OpenStreetMap; backendul PowerShell oferă lista de evenimente și voturi, caută locații cu Nominatim și calculează rute auto cu OSRM.

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

## Date demo și limite

`events.json` conține evenimente demonstrative în Cluj-Napoca. Voturile anonime sunt identificate cu un ID păstrat în browser și nu reprezintă autentificare sigură; datele fișierelor locale sunt pentru prototip, nu pentru utilizare concurentă sau producție. Eticheta „Promovat” este doar o demonstrație a planului paid: nu există încă plăți, notificări push, conturi de organizator sau moderare. Acestea necesită autentificare, infrastructură de persistență și integrarea unui furnizor de plăți/notificări.

## Configurare

Serviciile publice Nominatim și OSRM sunt pentru utilizare modestă și dezvoltare, nu oferă SLA și au limite de utilizare. Folosește servicii găzduite/autorizate pentru trafic de producție. Opțional, backendul acceptă variabilele de mediu `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT` și `OSRM_BASE_URL`. Configurează un User-Agent care identifică aplicația și un contact pentru distribuție publică.
