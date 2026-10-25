# Installér Forma på iPhone (uden App Store)

Appen bygges automatisk af GitHub på en Mac i skyen, hver gang koden i
`forma/app` ændres. Resultatet er en usigneret `.ipa`-fil (en zip-fil med
appen). Den signeres og installeres med jeres eget gratis Apple-ID.

## 1. Hent appen

1. Gå til <https://github.com/mmgrevsen/Ai-agent/actions/workflows/forma-ios-unsigned.yml>.
2. Klik på den øverste kørsel med grønt flueben.
3. Under **Artifacts** nederst: download **Forma-unsigned-ipa** og pak zip'en
   ud. Så har du `Forma-unsigned.ipa`.

(Vil du bygge igen manuelt: klik **Run workflow** på samme side.)

## 2. Installér med Sideloadly (på Mac)

1. Hent Sideloadly fra <https://sideloadly.io> og installér det.
2. Sæt iPhonen i Mac'en med kabel, lås den op og tryk **Stol på denne computer**.
3. Åbn Sideloadly, træk `Forma-unsigned.ipa` ind i vinduet.
4. Skriv dit Apple-ID i feltet og tryk **Start**. Log ind med din
   Apple-adgangskode (og kode fra to-faktor) når der spørges.

Hver af jer bruger sit eget Apple-ID og sin egen iPhone.

## 3. Første gang på iPhonen

1. **Indstillinger → Anonymitet & sikkerhed → Udviklertilstand** → slå til,
   genstart, bekræft.
2. **Indstillinger → Generelt → VPN og enhedsadministration** → tryk på dit
   Apple-ID under *Udviklerapp* → **Stol på**.
3. Åbn Forma.

## Godt at vide

* **Appen udløber efter 7 dage** med et gratis Apple-ID. Geninstallér samme
  måde (data på telefonen bevares, så længe appen ikke slettes). Sideloadly
  kan sættes til at forny automatisk, når telefonen og Mac'en er på samme wifi.
* Et gratis Apple-ID kan have højst 3 sideloadede apps ad gangen.
* Apple Health kan i nogle tilfælde afvises af gratis signering. Hvis
  installationen fejler pga. HealthKit, så sig til.
* Uden en Supabase-opsætning kører appen kun lokalt på telefonen (ingen
  synkronisering, ingen AI-coach). Alt andet virker.
* Alternativ til Sideloadly: AltStore (<https://altstore.io>), som kan
  forny appen automatisk via AltServer på Mac'en.
* Varig løsning uden 7-dages grænse: Apple Developer Program (99 USD/år),
  så kan appen deles via TestFlight.
