# Opdateringer af Forma

Forma kan opdateres på tre måder. Vælg den letteste, der passer til ændringen.

| Ændring | Hvordan | Ny IPA? |
| --- | --- | --- |
| Træningsprogrammer, øvelser, progression, referencefødevarer, coach-forslag, funktionsknapper, beskeder på Overblik | **Indholdsopdatering** (denne guide, afsnit 1) | Nej |
| AI-coachens og billedgenkendelsens instruktioner | Ret i `forma/supabase/functions/…` og kør `supabase functions deploy` (kræver Supabase-projektet) | Nej |
| Ren Dart-kode: skærme, tekster, logik, nye funktioner uden nye pakker | **Kodeopdatering med Shorebird** (afsnit 2), når den er sat op | Nej |
| Nye pakker/plugins, native iOS-kode, rettigheder (Info.plist, entitlements), app-ikon, Flutter-version, ændringer i databaseskemaet | Ny build | **Ja** |

Uanset metode ændres jeres logget data aldrig: træning, mad, vægt og historik ligger i den lokale database og røres ikke af opdateringer.

---

## 1. Indholdsopdateringer (virker nu)

### Sådan virker det

* Indholdet ligger som JSON-filer i appen:
  * `forma/app/assets/content/programs.json`: programskabeloner, øvelsesvalg pr. bevægelse, sæt, reps, RPE og pauser.
  * `forma/app/assets/content/progression.json`: deload-dybde, plateau-grænse og deload-sæt (inden for sikre grænser).
  * `forma/app/assets/exercises.json`: øvelsesbiblioteket.
  * `forma/app/assets/content/foods.json`: referencefødevarer. Hver fødevare skal have en kilde (`reference`), fx Frida.
  * `forma/app/assets/content/coach.json`: forslag i AI-coachen.
  * `forma/app/assets/content/config.json`: funktionsknapper (`flags`) og en besked på Overblik (`announcement`).
  * `forma/app/assets/content/release.json`: `minAppBuild` og en note til udgivelsen.
* Filerne er bygget ind i appen, så den virker offline fra første start.
* GitHub udgiver en samlet, versioneret fil (`content.json`) på udgivelsen `forma-content-latest`. Det sker automatisk, når filerne ændres på branchen.
* Appen henter nyt indhold på disse tidspunkter:
  * 3 sekunder efter start.
  * Når appen kommer i forgrunden (hvis der er gået 15 minutter siden sidst).
  * Hvert 30. minut, mens den er åben.
  * Når man trykker **Settings → App updates → Check for updates**.
* Før noget bruges, tjekkes det hele:
  * Format.
  * Grænser (fx reps 1–50, deload 80–95 %).
  * At alle øvelser i programmerne findes.
  * At hver fødevare har en kilde.
  * Kontrolsum.
  * Mindste app-build.
* Er noget galt, beholdes det indhold, der virker, og fejlen vises under App updates.
* Det forrige indhold gemmes altid. Hvis appen ikke kan starte to gange i træk med nyt indhold, går den automatisk tilbage til det forrige.
* Øvelser slettes aldrig af en opdatering, så gamle træninger peger altid på noget, der findes.

### Ændr indhold med Claude Code

Bed fx Claude Code om: *"Tilføj hip thrust som førstevalg i hinge-slot i programmerne"* eller *"Vis en besked på Overblik om at billedlogning er klar"*. Claude Code retter i filerne ovenfor.

Hvis ændringen bruger noget, kun en nyere app forstår, skal `minAppBuild` i `release.json` sættes til det build-nummer, der understøtter det.

### Test lokalt

```bash
cd forma/app
dart run tool/build_content.dart --check   # validerer præcis som appen gør
flutter test test/content                  # 30 tests: validering, sync, fejl, rollback
```

### Udgiv

Commit og push til branchen. Workflowet **Forma content update** validerer, tester og udgiver. Telefonerne henter det automatisk, eller med det samme via **Check for updates**.

### Rul tilbage

Vælg én af disse:

* **I appen:** Settings → App updates → **Go back to the previous content**. Det gælder kun den telefon.
* **For alle:** kør workflowet **Forma content update** manuelt (Actions → Run workflow) med `rollback_to` sat til det gamle versionsnummer. Alle versioner ligger som `content-v<version>.json` på udgivelsen. Det gamle indhold udgives som en ny, nyere version, så alle telefoner skifter.
* **Med git:** `git revert` af commit'et og push. Det udgiver det tidligere indhold som en ny version.

Versionsnummeret er udgivelsestidspunktet i UTC (`ååååmmddttmm`), så en senere udgivelse altid vinder.

---

## 2. Kodeopdateringer med Shorebird (kræver én gangs opsætning)

[Shorebird](https://shorebird.dev) sender Dart-ændringer til en installeret app. Appen henter patchen i baggrunden og bruger den ved næste start.

**Undersøgt kompatibilitet (oktober 2026):**
* Shorebird CLI understøtter iOS-releases bygget uden signering (`--no-codesign`). Det passer til vores build, der først signeres af SideStore/LiveContainer på telefonen.
* Flutter 3.47.x er understøttet (3.47.4 er bekræftet i deres release-noter). Hvis 3.47.8 ikke er tilgængelig, så skift `FLUTTER_VERSION` i workflowet til den nyeste understøttede 3.47.x.
* Patches køres af Shorebirds fortolker, så de kræver ikke JIT. Det passer til LiveContainers JIT-løse tilstand.
* Pakken `shorebird_code_push` er MIT-licenseret. Shorebird har en gratis plan.

**Ikke testet endnu:** at patches faktisk indlæses, når appen kører inde i LiveContainer. Det kan først testes på telefonen efter opsætningen nedenfor.

**Hvad en patch kan:** ændre Dart-kode, fx skærme, tekster, logik og nye funktioner der bruger eksisterende pakker.

**Hvad en patch ikke kan:**
* Nye pakker med native kode.
* Ændringer i `ios/`.
* Nye rettigheder.
* Ny Flutter-version.
* Nye assets (billeder, skrifttyper). Indholdsfilerne opdateres i stedet via afsnit 1.

Det kræver en ny IPA.

**Patches skal matche den installerede build:** en patch gælder kun den build, den er lavet til. Efter en ny IPA laves patches til den nye build.

### Engangsopsætning (det skal du gøre)

1. Opret en gratis konto på <https://console.shorebird.dev>.
2. Lav et CI-token:
   * Installer Shorebird på Mac'en: `curl --proto '=https' --tlsv1.2 https://raw.githubusercontent.com/shorebirdtech/install/main/install.sh -sSf | bash`
   * Kør `shorebird login:ci` og kopiér tokenet.
3. På GitHub:
   * Gå til repoet → **Settings → Secrets and variables → Actions → New repository secret**.
   * Navn: `SHOREBIRD_TOKEN`. Værdi: tokenet.
4. GitHub → **Actions → Forma code push setup (one time) → Run workflow**. Det registrerer appen og committer `forma/app/shorebird.yaml`.
5. GitHub → **Actions → Forma iOS (unsigned .ipa) → Run workflow**. Den nye build er en Shorebird-release.
6. Installér den nye `Forma.ipa` på telefonen (samme måde som før). Under **Settings → App updates** står der nu "Code version: Original release".

### Udgiv en kodeopdatering

1. Lav ændringen i Dart-koden, og kør `flutter analyze` og `flutter test`.
2. Push. Workflowet **Forma iOS** bygger nu en ny build, og det er en ny release.

   Vil du sende ændringen til den build, der allerede er installeret, i stedet for at installere en ny IPA:
   * Kør **Actions → Forma code patch (Shorebird) → Run workflow**.
   * Skriv det build-nummer, der står under Settings → App updates → App build.
3. På telefonen: Settings → App updates → **Check for code update**, luk appen helt og åbn den igen.

### Rul en patch tilbage

Gå til Shorebirds konsol (<https://console.shorebird.dev>) → appen → releasen → patchen → **Rollback**. Telefonerne går tilbage til forrige kode ved næste start.

---

## 3. Ny IPA

Push ændringer i `forma/app/` (ud over indholdsfilerne). Workflowet **Forma iOS (unsigned .ipa)** bygger og lægger `Forma.ipa` på det faste link i [INSTALL-IPHONE.md](INSTALL-IPHONE.md). Installér som før. Data bevares, så længe appen ikke slettes først.

## Sikkerhed

* **Ingen hemmeligheder i appen:** indholdsfilen er offentlig, skrivebeskyttet data uden brugeroplysninger, og den hentes over HTTPS.
* **Kun GitHub kan udgive indhold:** det sker med repoets egen `GITHUB_TOKEN`. Shorebird-tokenet ligger kun som GitHub-secret.
* **Indholdet tjekkes i appen før brug:** hele indholdet valideres igen, og kontrolsummen tjekkes.
* **Apple-regler:** appen omgår ikke signering. Den installeres og signeres som før af SideStore/LiveContainer. Kodeopdateringer sker via Shorebirds Apple-kompatible løsning.
