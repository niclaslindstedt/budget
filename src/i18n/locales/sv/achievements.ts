import type { AchievementsCatalog } from "../en/achievements";

const achievements: AchievementsCatalog = {
  star: {
    openList: "Bedrifter",
    unseenOne: "1 ny bedrift",
    unseenOther: "{n} nya bedrifter",
  },
  unlockModal: {
    titleOne: "Bedrift upplåst!",
    titleOther: "{n} bedrifter upplåsta!",
    dismiss: "Grymt!",
  },
  modal: {
    title: "Bedrifter",
    counter: "{unlocked} av {total} upplåsta · {earned} / {max} p",
    intro:
      "Varje funktion i appen är en bedrift. Gör grejen en gång så låses den upp. Fyra nivåer, från precis öppnat appen till böjer den efter dig. Välj den nivå som passar nu.",
    tierPoints: "· {earned} / {max} p",
    tierMasteredWhen: "Nivån klar när:",
    learnMore: "Läs mer",
    locked: "Låst",
    close: "Stäng",
    tier: {
      beginner: {
        title: "Nybörjare",
        subtitle: "Du har precis öppnat appen. Vad gör du?",
        graduation:
          "Du för in rader, sätter etiketter, litar på att de sparas, och hittar runt i appen utan att tänka.",
      },
      intermediate: {
        title: "Medel",
        subtitle: "Du vill att den här ska spegla din riktiga ekonomi.",
        graduation:
          "Varje blad motsvarar ett riktigt konto, återkommande poster täcker dina fasta utgifter, och dina kategorier matchar hur du faktiskt tänker kring utgifter.",
      },
      pro: {
        title: "Proffs",
        subtitle: "Sluta skriva in det banken redan vet.",
        graduation:
          "Nya bankexporter importeras på sekunder och etiketterar sig själva, dina data är krypterade i ett moln du själv styr, och du har slutat hålla en separat manuell kopia vid sidan av.",
      },
      expert: {
        title: "Expert",
        subtitle: "Böj appen efter exakt din situation.",
        graduation: "Appen gör det du vill, inte det dess förval antog.",
      },
    },
  },
  catalog: {
    firstSteps: {
      name: "Första steget",
      condition: "Lägg till din första rad.",
      learnMore:
        "Klicka på den nedersta raden i bladet, skriv en beskrivning, tabba vidare till belopp och datum. Det är en budgetpost — själva grundloopen.",
    },
    localHero: {
      name: "Lokalhjälte",
      condition: "Använd appen som gäst, eller skapa ett konto.",
      learnMore:
        "Gästläget håller dina data bara i den här webbläsaren, okrypterat. Ett konto lägger till ett lösenord som krypterar datan på den här enheten — den lämnar aldrig din maskin.",
    },
    label: {
      name: "Sätt etikett",
      condition: "Tilldela en typ till en rad.",
      learnMore:
        "Typchipet grupperar rader för analys. Bläddra per kategori — startuppsättningen täcker svenska basbehov.",
    },
    checkPlease: {
      name: "Klart!",
      condition: "Bocka av en rads klar-ruta.",
      learnMore:
        "Obockat = prognos, bockat = verkligt. Appen använder detta vid avstämning mot bankimporter senare.",
    },
    timeTraveller: {
      name: "Tidsresenär",
      condition:
        "Upptäck Idag-pillen genom att scrolla bort från den här månaden.",
    },
    secondThoughts: {
      name: "Andra tanken",
      condition: "Ångra en åtgärd.",
      learnMore:
        "⌘Z går tillbaka senaste åtgärden. Varje cellredigering, varje radborttagning, varje inställningsändring är reversibel — ångra är skyddsnätet.",
    },
    houseKeeper: {
      name: "Städpatrullen",
      condition: "Dölj en förvald kategori eller typ du aldrig kommer använda.",
      learnMore:
        "Att dölja är säkrare än att radera tills du vet vad du vill. Allt som dolts kan tas tillbaka från samma vy.",
    },
    preparedMind: {
      name: "Förberedd",
      condition: "Exportera din budget till en JSON-fil.",
      learnMore:
        "En ögonblicksbild du kan släppa tillbaka senare via Importera. Gör det här en gång tidigt så vet du hur.",
    },
    interiorDesigner: {
      name: "Inredningsarkitekt",
      condition: "Byt tema till något annat än standard.",
      learnMore:
        "Teman inkluderar One Dark, One Light, Dracula, GitHub Dark och GitHub Light. Custom-temats variabler i Expert-nivån staplas ovanpå.",
    },
    watchful: {
      name: "Vaksam",
      condition: "Se saldot bygga sig självt för första gången.",
      learnMore:
        "Saldokolumnen är den löpande summan av alla rader ovanför. Du skriver aldrig in i den — den räknas ut från raderna.",
    },
    trustButVerify: {
      name: "Lita och verifiera",
      condition: "Lägg märke till sparindikatorn som bekräftar en sparning.",
    },
    homeScreen: {
      name: "Hemskärm",
      condition: "Installera Budget på din enhet.",
      learnMore:
        "På iPhone och iPad i Safari, delningsmenyn → Lägg till på hemskärmen. På Android och desktop med Chromium, tryck på Installera-knappen i bannern — eller webbläsarens egna installations-tips i adressfältet. När den är installerad körs Budget i ett eget fönster utan webbläsarchrome.",
    },
    shortcut: {
      name: "Genväg",
      condition: "Ändra vad rubriken gör när du trycker på den.",
    },
    bookKeeper: {
      name: "Bokhållare",
      condition: "Skapa ditt första riktiga konto.",
      learnMore:
        "Lägg gärna till bankuppgifter (clearing, kontonummer, IBAN). Nästa nivå — bankimport — använder dem för att para ihop rader automatiskt.",
    },
    tieTheKnot: {
      name: "Knyt bandet",
      condition: "Koppla ett blad till ett konto.",
      learnMore:
        "När kopplat speglar bladets löpande saldo det riktiga saldot och bankimporter hamnar på rätt ställe.",
    },
    payDay: {
      name: "Lönedag",
      condition: "Ändra Månadens start från standardvärdet.",
      learnMore:
        "Om lönen landar den 25:e, sätt 25 — då löper varje månad från 25:e till 24:e istället för per kalendermånad.",
    },
    spreadOut: {
      name: "Sprid ut",
      condition: "Lägg till fler än ett blad.",
      learnMore:
        "Ett blad per konto, ett per mål. Flikarna högst upp växlar mellan dem.",
    },
    birdsEye: {
      name: "Fågelperspektiv",
      condition: "Besök Konto-översikten.",
    },
    shuffler: {
      name: "Omflyttare",
      condition: "Registrera en överföring mellan konton.",
      learnMore:
        "En rad, två effekter: debiterar ett konto och krediterar det andra samma datum. Du slipper skriva in båda halvorna.",
    },
    quietMover: {
      name: "Tyst förflyttning",
      condition: "Flagga en rad som överföring.",
      learnMore:
        "I kombination med Dölj överföringar påverkar interna flyttar fortfarande saldon men försvinner från utgiftstotaler.",
    },
    groundhogDay: {
      name: "Måndag igen",
      condition: "Gör en rad återkommande.",
      learnMore:
        "Lön, hyra, Spotify, gym. Förhandsvisningen visar de tio nästa förekomsterna innan du sparar så du kan dubbelkolla mönstret.",
    },
    earlyBird: {
      name: "Tidig fågel",
      condition:
        "Markera en återkommande serie som primär inkomst så att en tidig lön ändå räknas till nästa budgetmånad.",
      learnMore:
        "När den 25:e infaller på en helg eller röd dag och banken betalar ut några dagar tidigare flyttas raden (och alla överföringar och utgifter samma dag) till nästa budgetmånad — så att april inte plötsligt suger åt sig majlönen. Ange ordinarie lönedag en gång så tillämpas kaskaden retroaktivt på varje förekomst i serien.",
    },
    secondDraft: {
      name: "Andra utkastet",
      condition: "Redigera en återkommande serie.",
    },
    taxonomist: {
      name: "Taxonom",
      condition: "Skapa en egen kategori.",
      learnMore:
        "Kategorier grupperar utgifter för analys. Ge varje en symbol och en färg — den delade 16-färgs-paletten är konsekvent i hela appen.",
    },
    labelMaker: {
      name: "Etikettmakare",
      condition: "Skapa en egen posttyp.",
      learnMore:
        "Typer är etiketterna du sätter på rader. Var och en har en symbol, färg och riktning (+, −, ◆) så väljaren hålls ren.",
    },
    moverShaker: {
      name: "Flyttkarl",
      condition: "Flytta eller kopiera rader mellan månader.",
    },
    splitTheBill: {
      name: "Dela notan",
      condition: "Dela en rad i flera delar.",
      learnMore:
        "När ett enskilt bankuttag buntar ihop olika kategorier (mat + hushåll + present), dela så varje del får sin egen typ.",
    },
    bulkOps: {
      name: "Massåtgärd",
      condition: "Massredigera två eller fler rader i en åtgärd.",
    },
    reckoner: {
      name: "Räknaren",
      condition: "Registrera en saldokorrigering.",
      learnMore:
        "När den löpande summan glider ifrån vad banken visar skriver Sätt saldo en enskild korrigeringsrad daterad idag. Ärlig fix; skriv inte om gammal historik.",
    },
    detective: {
      name: "Detektiv",
      condition: "Sök tvärs över alla blad.",
    },
    numberWhisperer: {
      name: "Sifferviskaren",
      condition: "Anpassa siffer- eller valutaformatet.",
    },
    rearranger: {
      name: "Omarrangerare",
      condition: "Sortera om kolumnerna i ett blad.",
    },
    polyglot: {
      name: "Polyglott",
      condition: "Byt appens språk.",
    },
    tidyAndQuiet: {
      name: "Snyggt & tyst",
      condition: "Slå på Dölj överföringar.",
    },
    swiper: {
      name: "Svepare",
      condition: "Svep åt vänster eller höger för att byta blad.",
    },
    importExport: {
      name: "Import / Export",
      condition: "Importera ditt första kontoutdrag.",
      learnMore:
        "Appen känner igen Skandiabanken, Swedbank, Bank Norwegian eller ICA Banken. Släpp .xlsx- eller .csv-filen från banken och välj konto.",
    },
    dedupe: {
      name: "Dubblettjägare",
      condition:
        "Importera ett kontoutdrag igen; importören hoppar över dubbletterna.",
    },
    archaeologist: {
      name: "Arkeolog",
      condition:
        "Skriv över en importerad historikposts beskrivning eller typ.",
      learnMore:
        "Öppna historikvyn, klicka på en rad, ändra etikett. Användbart när en stökig handlare har ett bra namn begravt i banktexten.",
    },
    patternRecognition: {
      name: "Mönsterläsare",
      condition: "Skriv din första matchningsregel.",
      learnMore:
        "*App Store* → typ 'App'. Varje gammal och kommande App Store-debitering etiketterar sig själv. Regler kan också filtrera på beloppsintervall eller överföringsflagga.",
    },
    elephantsRemember: {
      name: "Elefanter glömmer aldrig",
      condition: "Befordra en handlare — typen sitter kvar till nästa gång.",
    },
    matchmaker: {
      name: "Matchmakare",
      condition: "Stäm av en serie — regeln sitter kvar till nästa månad.",
    },
    twoSidedCoin: {
      name: "Tvåsidigt mynt",
      condition: "Slå ihop ett spegelpar till en enda överföring.",
    },
    doppelganger: {
      name: "Dubbelgångare",
      condition: "Slå ihop ett dubblettpar från Hitta dubbletter.",
      learnMore:
        "Bladrubrikens ⋯-meny → Hitta dubbletter. Letar efter par i den aktiva budgeten med samma datum, samma kategori och ungefär samma belopp och slår ihop dem till en rad — bankposten vinner när en sådan finns, annars behåller raden med tydligare etikett sin plats.",
    },
    cleanSplit: {
      name: "Ren delning",
      condition: "Dela en bankhistorikpost över flera typer.",
    },
    cloudWalker: {
      name: "Molnvandrare",
      condition: "Anslut en molnbackend (Dropbox, Google Drive eller Mapp).",
      learnMore:
        "Bara-webbläsare-data bor på den här enheten. Anslut ett moln så följer din budget med dig mellan enheter.",
    },
    paranoidMode: {
      name: "Paranoid",
      condition: "Slå på totalkryptering.",
      learnMore:
        "AES-GCM, 256-bitars nyckel, 600 000 PBKDF2-iterationer. Molnet ser bara chiffer.",
    },
    snapshotter: {
      name: "Återställare",
      condition: "Återställ en molnsäkerhetskopia.",
    },
    airplaneMode: {
      name: "Flygplansläge",
      condition: "Redigera offline; appen återansluter elegant.",
    },
    rekindled: {
      name: "Återupptagen",
      condition: "Återauktorisera en molnbackend.",
    },
    lockUp: {
      name: "Lås",
      condition: "Ändra tidsgränsen för inaktiv utloggning.",
    },
    spreadsheetSensei: {
      name: "Kalkylbladsmästare",
      condition: "Exportera ett blad till CSV eller Excel.",
    },
    sealedEnvelope: {
      name: "Förseglat kuvert",
      condition: "Exportera din budget som krypterad JSON.",
    },
    timeMachine: {
      name: "Tidsmaskin",
      condition: "Hoppa till en punkt i åtgärdshistoriken.",
    },
    freshPull: {
      name: "Färska tag",
      condition: "Dra ner från sidans topp för att uppdatera.",
      learnMore:
        "När du drar skickar Budget först eventuella osparade lokala ändringar till din molnbackend, sedan hämtas senaste kopian — så uppdateringar från en annan enhet eller en annan flik dyker upp utan att du laddar om sidan.",
    },
    spellbinder: {
      name: "Trollkarl",
      condition: "Skriv din första beloppsformel.",
      learnMore:
        "Skriv = och en formel. lon * 0.05 sparar 5% av inkomsten; min(hyra, 12000) sätter ett tak på en överföring. Formeln räknas om när inmatningarna ändras.",
    },
    variablesUnleashed: {
      name: "Variabler släppta",
      condition: "Infoga en variabelpill från formelhjälpen.",
    },
    crossWired: {
      name: "Korskopplad",
      condition: "Referera ett annat blad inuti en formel.",
    },
    compoundInterest: {
      name: "Sammansatt",
      condition: "Bygg en sammansatt post med flera delar.",
    },
    calendarBender: {
      name: "Kalenderböjare",
      condition:
        "Använd sista-dagen-i-månaden eller ett eget återkommandeintervall.",
    },
    dateShifter: {
      name: "Datumknuffare",
      condition: "Knuffa en återkommande serie med fältet Förskjut dagar med.",
    },
    auditor: {
      name: "Revisor",
      condition: "Läs täckningsrapporten.",
    },
    fineSieve: {
      name: "Finmaskig sil",
      condition:
        "Skriv en matchningsregel med belopps- eller överföringsfilter.",
    },
    themeWizard: {
      name: "Temaskaparen",
      condition: "Byt till det Anpassade temat.",
    },
    fontFanatic: {
      name: "Typsnittsfanatiker",
      condition: "Byt typsnittsfamilj.",
    },
    stillness: {
      name: "Stillhet",
      condition: "Slå på Minska rörelse.",
    },
    household: {
      name: "Hushåll",
      condition: "Lägg till ett till användarkonto på den här enheten.",
    },
    shapeShifter: {
      name: "Formskiftare",
      condition: "Byt lagringsbackend.",
    },
    underTheHood: {
      name: "Under huven",
      condition: "Slå på Utvecklarläget.",
    },
    cleanSlate: {
      name: "Blanka tavlan",
      condition: "Nollställ dina bedrifter.",
      learnMore:
        "Ett påskägg: nollställ dina upplåsningar från bedriftsmodalen för att börja resan om från början. Datan stannar, bara troféerna nollställs.",
    },
    completionist: {
      name: "Komplettist",
      condition: "Lås upp alla andra bedrifter.",
      learnMore:
        "Den svåraste att vinna — ditt troférum är fullt när den här lyser.",
    },
  },
};

export default achievements;
