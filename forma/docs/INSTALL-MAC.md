# Forma på Mac

Forma findes som en rigtig Mac-app (Apple silicon og Intel, macOS 12 eller
nyere). Den kræver ikke SideStore og udløber ikke.

**Download:** <https://github.com/mmgrevsen/Ai-agent/releases/download/forma-macos-latest/Forma-macOS.zip>

## Installér

1. Hent zip-filen og dobbeltklik på den. Så kommer **Forma** frem.
2. Træk **Forma** over i **Programmer**.
3. Dobbeltklik på Forma. Første gang siger macOS, at den ikke kan bekræfte
   udvikleren (appen er ikke betalt-signeret hos Apple). Klik **Udført**.
4. Åbn **Systemindstillinger → Anonymitet og sikkerhed**, rul ned og klik
   **Åbn alligevel** ud for Forma, og bekræft med din adgangskode.
5. Herefter åbner Forma normalt.

Alternativt i Terminal (gør det samme som trin 3–4):

```bash
xattr -dr com.apple.quarantine /Applications/Forma.app
```

## Godt at vide

* Mac-appen har sine egne data. Uden en server (Supabase) synkroniseres
  den ikke med telefonen.
* Indholdsopdateringer (programmer, fødevarer, beskeder) kommer automatisk
  ligesom på telefonen.
* Apple Health og Siri-genvejene findes kun på iPhone.
* Billeder af mad og næringsdeklarationer virker også på Mac'en og
  genkendes på Mac'en. Mac-appen kan ikke åbne kameraet. Tryk **Choose
  photo**, og vælg et billede, fx et du har AirDroppet fra iPhonen.
* Ny version af selve appen: hent zip-filen igen og erstat Forma i
  Programmer. Dine data bevares.
