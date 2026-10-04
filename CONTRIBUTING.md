# Ghid de colaborare

## Împărțirea muncii pentru șase persoane

Fiecare sarcină are un responsabil principal. Responsabilul coordonează schimbările din fișierele sale și verifică Pull Request-urile care le ating. Înainte de a modifica fișierul altui responsabil, coordonați schimbarea cu acesta.

| Responsabil | Zonă principală |
| --- | --- |
| 1 | Interfață și structură HTML: `index.html` |
| 2 | Stiluri, aspect și responsive: `styles.css` |
| 3 | Interacțiuni și hartă în browser: `app.js` |
| 4 | API și logică backend: `server.ps1` |
| 5 | Datele evenimentelor: `events.json` |
| 6 | Teste, documentație și verificarea Pull Request-urilor: `tests/`, `README.md`, `CONTRIBUTING.md`, `.github/` |

`app.js` este folosit de mai multe funcționalități, așa că o singură persoană îl modifică la un moment dat. Dacă apare o schimbare care necesită atingerea mai multor zone, stabiliți împreună responsabilul integrator și includeți toate fișierele necesare într-un singur Pull Request.

## Fluxul de lucru

1. Instalați Git și folosiți repository-ul comun al echipei. Clonați-l o singură dată:

   ```powershell
   git clone <URL-ul-repository-ului>
   cd fomo-project-main
   ```

2. Începeți fiecare sarcină din versiunea actualizată a ramurii `main`:

   ```powershell
   git switch main
   git pull
   git switch -c feature/descriere-scurta
   ```

   Folosiți prefixul `fix/` pentru remedieri și `docs/` pentru documentație.

3. Modificați numai fișierele necesare sarcinii. Rulați verificarea locală:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\smoke-test.ps1
   ```

   Apoi porniți aplicația conform pașilor din `README.md` și verificați manual funcționalitatea schimbată.

4. Salvați și publicați numai fișierele relevante:

   ```powershell
   git add <fișier1> <fișier2>
   git commit -m "Descrie schimbarea"
   git push -u origin feature/descriere-scurta
   ```

5. Deschideți un Pull Request către `main`. Completați lista de verificare din formular, așteptați verificarea automată și cereți unui coleg să revizuiască schimbarea. Integrați prin Pull Request, nu prin push direct pe `main`.

6. Înainte de a continua lucrul după ce `main` s-a schimbat, actualizați ramura:

   ```powershell
   git switch main
   git pull
   git switch feature/descriere-scurta
   git merge main
   ```

   Dacă apar conflicte, rezolvați-le împreună cu responsabilul fișierului și rulați din nou verificările înainte de a actualiza Pull Request-ul.

## Setări recomandate pentru repository-ul GitHub

Un administrator al repository-ului trebuie să configureze protecția ramurii `main` astfel încât:

- schimbările să intre numai prin Pull Request;
- să fie necesară cel puțin o aprobare de la un coleg;
- verificarea `FOMO smoke tests` să fie obligatorie înainte de integrare;
- să fie blocate ștergerea și force-push-ul pe `main`.

Aceste setări se fac în GitHub după crearea repository-ului echipei; fișierele proiectului nu le pot activa singure.

## Reguli care evită problemele

- O sarcină și un Pull Request ar trebui să facă o schimbare clară, ușor de verificat.
- Anunțați echipa înainte să modificați fișierul deținut de alt responsabil.
- Nu trimiteți `votes.json`: este date locale generate la rulare și este exclus prin `.gitignore`.
- Nu comiteți parole, tokenuri sau date personale.
- Dacă schimbați API-ul ori pașii de pornire, actualizați documentația și verificați clientul în browser.
