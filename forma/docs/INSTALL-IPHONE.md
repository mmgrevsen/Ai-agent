# Installér Forma på iPhone (uden App Store)

Forma installeres som en rigtig app med **SideStore** og jeres eget gratis
Apple-ID. Mac'en skal kun bruges første gang. Bagefter fornyer I appen på
telefonen én gang om ugen med et par tryk.

Appen bygges automatisk af GitHub, hver gang koden ændres. Den nyeste udgave
ligger altid her (virker direkte på iPhonen, uden GitHub-login):

**<https://github.com/mmgrevsen/Ai-agent/releases/download/forma-ios-latest/Forma.ipa>**

Hver af jer gør det følgende på sin egen iPhone.

## Det skal I bruge

* iPhone med iOS 15 eller nyere og en adgangskode.
* Wi-Fi. Mobildata virker ikke, når der installeres eller fornyes.
* Mac og USB-kabel (kun første gang).
* Et Apple-ID. Det behøver ikke være det, telefonen bruger. Nogle laver et
  ekstra gratis Apple-ID til formålet.

## 1. iPhone: installér LocalDevVPN

1. Hent **LocalDevVPN** fra App Store:
   <https://apps.apple.com/app/localdevvpn/id6755608044>
2. Åbn den og tryk **Connect**. Tryk **Tillad**, hvis den spørger om
   VPN-konfiguration, og indtast koden.

Den "VPN" sender ingenting ud på internettet. Den lader SideStore tale med
telefonen selv, og den skal være tændt, hver gang I installerer eller
fornyer.

## 2. Mac: installér SideStore med iloader

1. Hent iloader (kun fra dette link):
   <https://github.com/nab138/iloader/releases/latest/download/iloader-darwin-universal.dmg>
   Åbn filen og træk iloader over i Programmer.
   Siger Mac'en, at den ikke kan åbne programmet: **Systemindstillinger →
   Anonymitet og sikkerhed → Åbn alligevel**.
2. Sæt iPhonen i Mac'en med kablet. Tryk **Stol på** på telefonen og
   indtast koden.
3. Åbn iloader og log ind med Apple-ID'et. Pas på store og små bogstaver.
4. Vælg jeres iPhone, og tryk **Install SideStore (Stable)**.

## 3. iPhone: gør SideStore klar

1. **Indstillinger → Generelt → VPN og enhedsadministration**. Tryk på
   Apple-ID'et under *Udviklerapp*, tryk **Stol på**, bekræft og indtast
   koden. Telefonen kan genstarte.
2. **Indstillinger → Anonymitet og sikkerhed** → helt nederst:
   **Udviklertilstand** → slå til. Telefonen genstarter. Bekræft bagefter.
3. Åbn **LocalDevVPN** og tryk **Connect**.
4. Åbn **SideStore** og log ind med det samme Apple-ID som i iloader.
5. Gå til **My Apps** og tryk på **7 DAYS** ud for SideStore. Spørger den om
   et certifikat, så tryk **Yes** eller **Refresh Now**. SideStore lukker og
   kommer igen efter et par sekunder. Det er meningen.

## 4. iPhone: installér Forma

1. Åbn linket øverst i Safari på iPhonen, og tryk **Hent**. Filen lander i
   **Filer → Overførsler**.
2. Tjek at LocalDevVPN er tilsluttet.
3. Åbn SideStore → **My Apps** → tryk **+** øverst → vælg **Forma.ipa**.
4. Når den er færdig, ligger Forma på hjemmeskærmen.

## Hver uge: forny appen

Apps fra et gratis Apple-ID holder 7 dage ad gangen. Én gang om ugen:

1. Vær på Wi-Fi, åbn **LocalDevVPN** og tryk **Connect**.
2. Åbn **SideStore** → **My Apps**.
3. Tryk på dage-tælleren (fx **3 DAYS**) ud for **Forma** og ud for
   **SideStore**.

Tælleren viser, hvor mange dage der er tilbage. Sæt gerne en ugentlig
påmindelse. Glemmer I det, åbner Forma ikke, før den er fornyet. Jeres data
forsvinder ikke.

## Ny version af Forma

Hent linket øverst igen, og installér med **+** i SideStore som i trin 4.
Jeres data bliver liggende. Slet ikke appen først.

## Log mad med et billede

Billedet genkendes på telefonen med Apples egen billedgenkendelse. Det
kræver ingen konto, ingen server og intet internet, og billedet bliver
ikke sendt nogen steder hen.

1. **Nutrition → Add food → Photo → Take photo.**
2. Forma viser, hvad den tror, der er på tallerkenen (fx "Spejlæg · 72 %"),
   med forslag fra Formas fødevaredata. Retter du tidligere har logget,
   står øverst under **Logged before**.
3. Tryk på de retter, der er på tallerkenen. Næringsværdierne kommer fra
   fødevaredataene (Frida/USDA), ikke fra et gæt. Du vælger kun gram.
4. Mangler noget, så søg i feltet under forslagene.
5. Tryk **Log**. Med flere retter kan du gemme dem som et måltid, så du kan
   logge det hele igen med ét tryk (også fra uret).

**Med køkkenvægt (mest præcist):** stil tallerkenen på vægten, nulstil den
med tallerkenen på, og tag billedet, så displayet er med. Forma læser
vægten og bruger den som gram for den første ret, du vælger. Står der kun
et tal uden "g", spørger Forma først (kontakten på kortet "Scale shows").

**Næringsdeklaration:** **Add food → Nutrition label**, og tag et billede
af tabellen lige forfra. Værdierne pr. 100 g udfyldes, og stregkoden læses
fra samme billede, hvis den er med. Tjek tallene, giv varen et navn, og
gem. Næste gang finder stregkoden varen med det samme.

**Godt at vide:**
* Genkendelsen kender cirka 250 slags mad og retter. Den kan tage fejl
  eller ikke vide, hvad det er. Så søger du bare.
* Den gætter ikke mængden. Det gør vægten eller dig.
* Er I logget ind på en Forma-server (Supabase med AI), bruges AI-analysen
  i stedet. Den kan også gætte portioner.

## Log fra Apple Watch og Siri

Forma har to genveje, som virker fra Siri, Genveje-appen og uret (uret
bruger iPhonen i lommen/tasken til at gemme):

* **Log Saved Meal**: logger et gemt måltid (gem et måltid via
  "Save as a meal" efter et madbillede, eller "Save as meal" i dagbogen).
* **Log Recent Food**: logger én portion af en ret, du har logget før.

Måltidet vælges ud fra klokken (morgenmad, frokost, aftensmad, snack).

**Med stemmen:** sig "Hey Siri, log a meal in Forma" (eller "log food in
Forma"), og vælg fra listen. Siri på dansk forstår måske ikke den engelske
sætning. Brug så knappen nedenfor.

**En knap på uret (anbefalet):**

1. Åbn **Genveje** på iPhonen → **+** → **Tilføj handling** → søg "Forma".
2. Vælg **Log Saved Meal**, og tryk på "Meal" for at vælge et bestemt
   måltid (fx "Skyr og bær").
3. Giv genvejen et navn, tryk på **ⓘ** og slå **Vis på Apple Watch** til.
4. På uret: åbn **Genveje**, og tryk på genvejen. Den kan også lægges som
   komplikation på urskiven.

Genvejene kræver, at Forma har været åbnet én gang på telefonen. Det,
du logger fra uret, vises i dagbogen, næste gang Forma åbnes.

## Hvis noget driller

* **"Failed to Sign In … (-80045)" i SideStore**: login-serveren (Anisette)
  driller.
  1. På login-skærmen: tryk **Close** → **Settings** (nederst) →
     **User Customizations** → **ANISETTE** → slå **On-Device Anisette** fra
     (SideStore genstarter). Prøv evt. også **Reset adi.pb**.
  2. **Settings → Anisette Servers** (dukker først op efter trin 1, mellem
     "Reset Pairing File" og "Connection Config") → vælg **jkcoxson** → log
     ind igen med LocalDevVPN tændt.
  3. Hjælper det ikke, så vent 30–60 minutter; Apple blokerer kortvarigt
     efter flere mislykkede forsøg.
* **"JITLess mode is required since iOS 26" i LiveContainer**: åbn
  LiveContainer → Settings → **Import Certificate from SideStore** (forny
  SideStore først). Eller installér Forma direkte i SideStore i stedet.
* **Efter en iOS-opdatering** kan SideStore holde op med at kunne forny.
  Sæt telefonen i Mac'en, åbn iloader og vælg at lægge en ny *pairing file*
  ind for SideStore.
* **Et gratis Apple-ID** kan have højst 3 apps fra SideStore ad gangen
  (SideStore tæller med), og højst 10 forskellige apps pr. uge.
* **Apple Health** er ikke testet med et gratis Apple-ID. Virker det ikke,
  så sig til.
* Uden en Supabase-opsætning kører appen kun på telefonen (ingen
  synkronisering, ingen AI-coach). Resten virker.
* SideStores egen vejledning (engelsk): <https://docs.sidestore.io>

## Alternativ: Sideloadly (7 dage, uden fornyelse på telefonen)

Til en hurtig test kan appen også installeres direkte fra Mac'en med
Sideloadly (<https://sideloadly.io>). Hent `Forma.ipa` fra linket øverst,
sæt iPhonen i, træk filen ind i Sideloadly, skriv Apple-ID'et og tryk
**Start**. Lav derefter trin 3.1 og 3.2 ovenfor. Appen skal installeres
forfra fra Mac'en hver 7. dag.

## Uden 7-dages grænse

Det kræver Apples udviklerkonto (99 USD om året). Så kan appen deles via
TestFlight.
