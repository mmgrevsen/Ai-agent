// Værktøjer, som AI'en kan bruge under samtalen. AI'en bestemmer, HVORNÅR de
// skal bruges; koden her bestemmer, HVAD der faktisk sker. Al kontrol af
// datoer, tider og ydelser foregår her – ikke i AI'en.

const tekst = (beskrivelse) => ({ type: "string", description: beskrivelse });

export function vaerktoejsdefinitioner(kunde) {
  const ydelsesIder = kunde.ydelser.map((y) => y.id);
  const vaerktoejer = [
    {
      name: "tjek_ledige_tider",
      description: "Finder ledige tider til en ydelse. Brug det, før du foreslår en tid. Giver højst 6 tider tilbage.",
      input_schema: {
        type: "object",
        properties: {
          ydelse_id: { type: "string", enum: ydelsesIder, description: "Id for ydelsen." },
          dato: tekst('Bestemt dato som "ÅÅÅÅ-MM-DD", eller "" for de første ledige dage.'),
          tidligst: tekst('Tidligste klokkeslæt som "TT:MM", fx "12:00" for eftermiddag, eller "".'),
        },
        required: ["ydelse_id", "dato", "tidligst"],
        additionalProperties: false,
      },
    },
    {
      name: "opret_booking",
      description: "Booker en tid. Brug det først, når kunden har bekræftet ydelse, dato, tid, navn og telefonnummer.",
      input_schema: {
        type: "object",
        properties: {
          ydelse_id: { type: "string", enum: ydelsesIder },
          dato: tekst('"ÅÅÅÅ-MM-DD"'),
          tid: tekst('"TT:MM"'),
          navn: tekst("Kundens navn."),
          telefon: tekst("Kundens telefonnummer, kun cifre."),
          bil: tekst('Bilens mærke og model, eller "" hvis ukendt.'),
          note: tekst('Andet virksomheden bør vide, eller "".'),
        },
        required: ["ydelse_id", "dato", "tid", "navn", "telefon", "bil", "note"],
        additionalProperties: false,
      },
    },
    {
      name: "gem_besked",
      description: "Gemmer en besked til virksomheden, som ringer kunden op. Brug det, når du ikke selv kan løse kundens ærinde.",
      input_schema: {
        type: "object",
        properties: {
          navn: tekst("Kundens navn."),
          telefon: tekst("Kundens telefonnummer, kun cifre."),
          aerinde: tekst("Kort beskrivelse af, hvad kunden ønsker."),
          haster: { type: "boolean", description: "Om kunden har brug for svar i dag." },
        },
        required: ["navn", "telefon", "aerinde", "haster"],
        additionalProperties: false,
      },
    },
    {
      name: "afslut_opkald",
      description: "Lægger på efter din afskedshilsen. Brug det, når samtalen er slut.",
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  ];
  if (kunde.viderestilling?.muligt) {
    vaerktoejer.push({
      name: "stil_videre",
      description: "Stiller kunden videre til en medarbejder.",
      input_schema: {
        type: "object",
        properties: { grund: tekst("Hvorfor kunden skal tale med en medarbejder.") },
        required: ["grund"],
        additionalProperties: false,
      },
    });
  }
  // strict: true sikrer, at AI'ens input altid passer til skemaet.
  return vaerktoejer.map((v) => ({ ...v, strict: true }));
}

// Kører et værktøj. Kaster en fejl med en forståelig besked, hvis noget er galt –
// den sendes tilbage til AI'en, så den kan rette sig selv over for kunden.
export function koerVaerktoej(navn, input, { kalender, opkald }) {
  switch (navn) {
    case "tjek_ledige_tider": {
      if (input.dato && !erDato(input.dato)) throw new Error('Datoen skal skrives som "ÅÅÅÅ-MM-DD".');
      if (input.tidligst && !erTid(input.tidligst)) throw new Error('Klokkeslæt skal skrives som "TT:MM".');
      const tider = kalender.ledigeTider({ ydelseId: input.ydelse_id, dato: input.dato, tidligst: input.tidligst });
      return tider.length
        ? { ledige_tider: tider }
        : { ledige_tider: [], besked: "Ingen ledige tider i den periode. Prøv en anden dag eller uden tidskrav." };
    }
    case "opret_booking": {
      if (!erDato(input.dato) || !erTid(input.tid)) throw new Error('Brug dato "ÅÅÅÅ-MM-DD" og tid "TT:MM".');
      const telefon = rensTelefon(input.telefon);
      if (!input.navn.trim()) throw new Error("Kundens navn mangler.");
      const booking = kalender.book({
        ydelseId: input.ydelse_id, dato: input.dato, tid: input.tid,
        navn: input.navn.trim(), telefon, bil: input.bil.trim(), note: input.note.trim(),
      });
      opkald.haendelser.push({ type: "booking", ...booking });
      return { ok: true, booking_id: booking.id, ydelse: booking.ydelse, dag: booking.dag, tid: booking.tid, pris: booking.pris };
    }
    case "gem_besked": {
      const besked = {
        type: "besked", tidspunkt: new Date().toISOString(),
        navn: input.navn.trim(), telefon: rensTelefon(input.telefon), aerinde: input.aerinde.trim(), haster: input.haster,
      };
      opkald.haendelser.push(besked);
      return { ok: true, besked: "Beskeden er gemt og sendt til virksomheden." };
    }
    case "stil_videre": {
      opkald.haendelser.push({ type: "viderestilling", grund: input.grund });
      return { ok: true, besked: "Kunden stilles videre, når du har sagt det til kunden." };
    }
    case "afslut_opkald": {
      opkald.afsluttet = true;
      return { ok: true };
    }
    default:
      throw new Error(`Ukendt værktøj "${navn}".`);
  }
}

function erDato(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function erTid(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// Danske numre har 8 cifre; +45 eller 0045 foran fjernes.
function rensTelefon(nummer) {
  let cifre = nummer.replace(/\D/g, "");
  if (cifre.length === 10 && cifre.startsWith("45")) cifre = cifre.slice(2);
  if (cifre.length === 12 && cifre.startsWith("0045")) cifre = cifre.slice(4);
  if (cifre.length !== 8) throw new Error(`Telefonnummeret "${nummer}" har ikke 8 cifre. Spørg kunden igen.`);
  return cifre;
}
