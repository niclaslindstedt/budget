import type { AchievementsCatalogEntries } from "../../en/achievements/catalog";

const catalog: AchievementsCatalogEntries = {
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
  bookworm: {
    name: "Bokmal",
    condition: 'Öppna en funktionsbeskrivning via en "Läs mer"-länk i Nyheter.',
    learnMore:
      'Större funktioner får en "Läs mer"-länk i ändringsloggen som öppnar hela beskrivningen direkt i Nyheter-fönstret. En bakåtpil tar dig tillbaka till listan.',
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
  borrower: {
    name: "Låntagare",
    condition: "Lägg till ditt första lån på Lån-sidan.",
    learnMore:
      "Lån-sidan håller koll på pengarna du är skyldig — studielån, billån, bolån, pengar lånade av en person — med startdatum, startbelopp, månadsbetalning samt valfri ränta och uppläggningsavgift. Med en ränta satt simuleras det återstående saldot månad för månad. Ett bolån kan istället länka ett bolån från fastighetsbladet, så att villkor och betalningar bara finns på ett ställe.",
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
  pinnedFavorite: {
    name: "Fäst",
    condition: "Markera ett blad som favorit från dess … meny.",
    learnMore:
      "Markera upp till fem blad som favoriter så fästs de i nedre fältet som snabbväxlingsikoner — ett tryck för att hoppa mellan bladen du använder mest.",
  },
  birdsEye: {
    name: "Fågelperspektiv",
    condition: "Besök Konto-översikten.",
  },
  tabShuffler: {
    name: "Flikflyttare",
    condition: "Dra ett blad till en ny plats under Inställningar → Allmänt.",
    learnMore:
      "Ändra ordning på dina blad så att det du använder mest hamnar först. Ordningen du väljer styr flikraden i nedre fältet.",
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
  showMeTheMoney: {
    name: "Visa mig pengarna",
    condition: "Lägg till din första lön på Lön-sidan.",
    learnMore:
      "Hitta löner söker igenom ett valt kontos hela bankhistorik — även flera år bakåt, innan du märkte något — hittar din återkommande lön, fastställer en baslinje och går igenom den år för år så att du kan lägga till, redigera eller hoppa över varje månad.",
  },
  manualPayslip: {
    name: "Utanför böckerna",
    condition:
      "Lägg till ett lönebesked manuellt, utan någon banktransaktion bakom.",
    learnMore:
      "Bankhistoriken sträcker sig bara så långt bakåt, men din löneöversikt behöver inte sluta där. Använd Lägg till lönebesked på Lön-sidan för att registrera en lön från grunden — välj utbetalningsmånad, ange nettot (och bruttot, om du har det), så hamnar den i årstabellerna bredvid dem som Hitta löner hittade.",
  },
  taxEstimator: {
    name: "Skatteberäknare",
    condition: "Skapa en skatteprofil på en lönesida.",
    learnMore:
      "En skatteprofil (kommun, kyrkomedlemskap, ålder, inkomsttyp) låter Lön-sidan uppskatta varje lönebeskeds bruttolön från nettoinsättningen med svenska skatteregler — så att en lön där du bara känner till nettot ändå visar brutto och skatt. Ange exakt bruttolön när som helst för att åsidosätta uppskattningen.",
  },
  homeOwner: {
    name: "Husägare",
    condition: "Lägg till din första fastighet på Fastigheter-sidan.",
    learnMore:
      "Fastigheter-sidan håller koll på bostäderna du äger: vad var och en kostade, vad den är värd nu (uppdatera värdet när som helst för att lägga till en punkt i historiken), och bolånen på den. Ge ett bolån en långivare och ett bankkonto, och låt Hitta bolånebetalningar plocka fram dess betalningar ur kontots historik.",
  },
  saver: {
    name: "Sparare",
    condition: "Lägg till ditt första sparkonto på Sparande-sidan.",
    learnMore:
      "Sparande-sidan håller koll på pengar du lägger undan — en buffert, en resekassa — på sparkonton. Till skillnad från ett vanligt konto registrerar du saldot med ett datum (uppdatera det när som helst för att lägga till en punkt i historiken), så listan alltid visar vad du har sparat. Sparkonton deltar också i överföringsdetektering, så en överföring från ditt vardagskonto till sparandet matchas automatiskt.",
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
  tagger: {
    name: "Taggad",
    condition: "Tilldela en tagg till en post.",
    learnMore:
      "Taggar är dina egna färgkodade etiketter som går tvärs över kategorier — en rad kan bära flera. De skräpar aldrig ner tabellen; de visas bara vid redigering och låter dig plocka fram allt som är taggat på samma sätt via sökningen. Hantera dem under Inställningar → Taggar.",
  },
  companies: {
    name: "Skyltfönster",
    condition: "Märk en post med ett företag.",
    learnMore:
      "Företag är handlarna dina pengar går till — Fortum, H&M, caféet runt hörnet. Välj ett från beskrivningspopupen eller någon redigeringsmodal så visar raden vem den betalade även när den saknar en egen beskrivning. Hantera dem under Inställningar → Företag.",
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
  estimateRange: {
    name: "Plus minus",
    condition:
      "Lägg till en post med ett uppskattat intervall i stället för ett exakt belopp.",
    learnMore:
      "Växla beloppet från Exakt till Uppskattat och ange ett lågt, ett troligt och ett högt värde — praktiskt för räkningar som vandrar månad till månad, som elen. Uppskattningen är den som visas i tabellen och räknas mot saldot, och ett importerat belopp inom intervallet matchar ändå posten.",
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
  searchSmith: {
    name: "Söksmed",
    condition: "Justera inställningarna för sökrangordning.",
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
  debtCollector: {
    name: "Inkasseraren",
    condition: "Importera banktransaktioner som betalningar på ett lån.",
    learnMore:
      "Märk banktransaktioner med lånets typ (Studielån, Billån, Privatlån, …) så dyker de upp i Importera betalningar i lånets radmeny. Importen kommer också ihåg bankbeskrivningen, så nästa kontoutdrag du importerar kopplar matchande dragningar till lånet automatiskt — ingen dialog, inga klick.",
  },
  loanRanger: {
    name: "Lånjägaren",
    condition: "Registrera ett bolåns betalningar med Hitta bolånebetalningar.",
    learnMore:
      "Märk en månad av dina bolånedragningar med deras långivare och bolånetypen, och öppna sedan Hitta bolånebetalningar på bolånet: den hittar de märkta dragningarna, lär sig deras bankbeskrivning och plockar fram varje matchande månad ur kontots historik — rankar de mest sannolika först och lämnar en tidigare bostads lån utanför tack vare dess annorlunda belopp.",
  },
  mortgageFree: {
    name: "Skuldfri",
    condition: "Betala av ett bolån helt — dess avbetalningsstapel når 100 %.",
    learnMore:
      "Varje bolånekort har en avbetalningsstapel som visar hur stor del av det ursprungliga lånet du amorterat bort. Håll lånebelopp och aktuell skuld uppdaterade allt eftersom du betalar av; när skulden når noll fylls stapeln grön och visar 100 % — bostaden är din, helt skuldfri.",
  },
  unifiedMortgage: {
    name: "Helhetsbild",
    condition: "Slå om en fastighets bolån till den sammanslagna vyn.",
    learnMore:
      "En fastighet med flera lån är svår att överblicka rad för rad. Använd vyväljaren bredvid bolånesektionens …-meny för att välja Sammanslagen vy: alla bolån slås ihop till ett kort som visar samlad skuld och lånebelopp, den skuldvägda effektiva räntan och total månadsränta och amortering. Tryck på den andra symbolen för att byta tillbaka till Delad vy och redigera ett enskilt lån.",
  },
  paymentLedger: {
    name: "Betalningsbok",
    condition: "Redigera eller ta bort en registrerad bolånebetalning.",
  },
  firstRepair: {
    name: "Hemmafixare",
    condition:
      "Lägg till din första reparation eller renovering på en fastighet.",
    learnMore:
      "Tagga en bankutgift med typen Reparation eller Renovering, öppna sedan en fastighets skiftnyckelvy och lägg till den. Varje post länkas till sin källtransaktion, och att bifoga kvittot håller kostnaden redo för ett framtida skatteavdrag — en post utan kvitto flaggas så att du inte tappar bort underlaget.",
  },
  groupedRepair: {
    name: "Specificerad",
    condition: "Gruppera fler än en transaktion under samma reparation.",
    learnMore:
      "En faktura betalas ofta med flera bankutgifter — en handpenning och en slutbetalning, delbetalningar till en hantverkare. I en fastighets skiftnyckelvy lägger du till eller redigerar en reparation och bockar för varje transaktion som betalade samma faktura: beloppen summeras till en reparation, och ett enda kvitto på primärtransaktionen täcker dem alla.",
  },
  manualRepair: {
    name: "Pappersspår",
    condition:
      "Registrera en reparation eller renovering utan någon banktransaktion bakom.",
    learnMore:
      "Vissa förbättringar är äldre än din importerade bankhistorik — men de räknas ändå mot en fastighets avdragsgilla kostnader. I en fastighets skiftnyckelvy väljer du Lägg till manuellt och anger arbetet direkt: typ (Reparation eller Renovering), datum, belopp, beskrivning, hantverkare och taggar. Bifoga kvittot så är kostnaden redo för en framtida reavinstberäkning, precis som en transaktionsbunden post.",
  },
  netSaleProfit: {
    name: "Till salu",
    condition: "Öppna kalkylen för nettovinst på en fastighet.",
    learnMore:
      "Välj Nettovinst vid försäljning i en fastighets …-meny. Dra i reglaget för försäljningspris och se uppdelningen: mäklararvode, annonsering, reparationer, inköpspriset och din plats vinstskatt dras alla av före slutsumman. Prova mäklarlägena — fast belopp, en procentsats, eller en bas plus en procentsats över en gräns — för att matcha hur din mäklare tar betalt.",
  },
  valueChart: {
    name: "Trendspanare",
    condition: "Visualisera en fastighets värde över tid.",
    learnMore:
      "Välj Visualisera värde i en fastighets …-meny för att rita upp dess registrerade värden över tid — appens första visualisering. Slå på Inkludera reparationer för att lägga pengarna du investerat på linjen, och Visa nettovärde för att lägga till vad du faktiskt får kvar efter mäklararvode, annonsering, reparationer, inköpspris och vinstskatt. Diagrammet följer ditt tema: färger, typsnitt, hörn och avstånd matchar allihop.",
  },
  savingsValueChart: {
    name: "Sparbössa",
    condition: "Visualisera ditt sparande över tid.",
    learnMore:
      "Välj Visualisera värde i Sparande-sheetets …-meny för att rita upp hur mycket du har lagt undan över tid. Markera kontona du vill inkludera — alla som standard — så visar linjen deras sammanlagda saldo vid varje registrerat datum, stigande allt eftersom konton tillkommer och fylls på. Diagrammet följer ditt tema: färger, typsnitt, hörn och avstånd matchar allihop.",
  },
  loansChart: {
    name: "Skuldkartläggare",
    condition: "Visualisera dina lån över tid.",
    learnMore:
      "Välj Visualisera lån i Lån-sheetets …-meny för att rita upp din skuld som staplade band — ett per lån, där stapelns topp är totalsumman. Växla till Betalningar för månadsvisa staplar över det du betalat, och bryt ut den uppskattade räntan i ett eget segment för att se hur mycket av varje månads betalning som gick till banken i stället för till skulden. Bocka i eller ur studielån och bolån ur stapeln. Diagrammet följer ditt tema: färger, typsnitt, hörn och avstånd matchar allihop.",
  },
  spendingDetective: {
    name: "Utgiftsdetektiv",
    condition: "Visualisera hur du spenderar dina pengar.",
    learnMore:
      "Välj Visualisera utgifter i ett budget-sheets …-meny för att se vart pengarna faktiskt tog vägen: månadsstaplar staplade per kategori, en ring du kan klicka på för att borra ner i typerna inom en kategori, inkomster mot utgifter månad för månad, och de mottagare du spenderar mest hos. Bara genomförda poster och importerad bankhistorik räknas, så bilden visar verkliga utgifter — inte planer. Använd raden 3M / 6M / 12M / Allt för att vidga fönstret. Diagrammen följer ditt tema: färger, typsnitt, hörn och avstånd matchar allihop.",
  },
  archaeologist: {
    name: "Arkeolog",
    condition: "Skriv över en importerad historikposts beskrivning eller typ.",
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
  receiptKeeper: {
    name: "Kvittosamlare",
    condition: "Bifoga ett kvitto till ett köp.",
    learnMore:
      "Öppna Prylar på ett köp och bifoga ett foto eller en PDF av kvittot — varje sak köpet betalade för delar det. Det sparas som en fil i en kvittomapp i din lagring, namngett enligt mönstret du väljer under Inställningar → Saker, så att du hittar det senare. Tillgängligt för lokal mapp och molnlagring.",
  },
  receiptArchivist: {
    name: "Kvittoarkivarie",
    condition: "Bifoga två kvitton till en reparation.",
    learnMore:
      "Ett stort jobb betalas ofta via flera fakturor — en handpenning i början, en slutbetalning på slutet, delbetalningar över ett år. Öppna Hantera kvitton på en reparation och bifoga varje kvitto med sitt eget datum (det utgår från reparationens datum). De arkiveras som en daterad logg i fastighetens kvittomapp. Tillgängligt för lokal mapp och molnlagring.",
  },
  payslipKeeper: {
    name: "Lönerapportsamlare",
    condition: "Bifoga en lönerapport till en lön.",
    learnMore:
      "Öppna en lön på Lön-bladet och bifoga ett foto eller en PDF av lönerapporten. Den sparas som en fil i en lönerapportmapp i din lagring, namngiven efter arbetsgivaren och lönemånaden, så att du hittar den senare. Tillgängligt för lokal mapp och molnlagring.",
  },
  propertyFiler: {
    name: "Fastighetsarkivarie",
    condition: "Ladda upp en fil till en fastighet.",
    learnMore:
      "Öppna Ladda upp fil på en fastighet och bifoga ett foto eller en PDF — en före/efter-bild, en besiktningsrapport, ett försäkringsdokument. Ge den en beskrivning, etiketter och en kategori (som blir en undermapp). Filer sparas under en fastighetsmapp i din lagring. Tillgängligt för lokal mapp och molnlagring.",
  },
  propertyHandover: {
    name: "Ren överlämning",
    condition: "Exportera eller importera en fastighet.",
    learnMore:
      "Säljer du en bostad? Öppna fastighetens …-meny och välj Exportera för att samla allt om den — uppgifter, reparationer, kvitton och uppladdade dokument — i en enda ZIP-fil att lämna över till den nya ägaren. Markera känsliga filer som privata för att utesluta dem, och välj om kvitton och dina lånedetaljer ska följa med. Den nya ägaren väljer Importera på sin egen Fastigheter-flik för att ta in allt som en ny fastighet.",
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
  fineSieve: {
    name: "Finmaskig sil",
    condition: "Skriv en matchningsregel med belopps- eller överföringsfilter.",
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
  tidyMind: {
    name: "Ordning och reda",
    condition:
      "Fäll ihop en hög inställningssektion genom att trycka på dess titel.",
    learnMore:
      "Varje inställningssektion som är högre än halva skärmen — listan Kategorier och typer är det självklara exemplet — gör sin titel till en ihopfällningsknapp. Tryck på den för att vika undan hela sektionen till en smal rad så att sektionerna nedanför kommer inom räckhåll utan oändligt rullande; tryck igen för att fälla ut den.",
  },
  itemized: {
    name: "Specificerat",
    condition: "Koppla en del av ett köp till en pryl du äger.",
    learnMore:
      "Öppna radens ”…”-meny och välj Prylar för att koppla en del av beloppet till något du äger — 15 000 av ett köp på 20 000 var telefonen, resten är bara rest. Bygg upp en katalog över prylar (och klassificera dem gärna med en underkategori), grunden för att hålla koll på vad du äger och vad det är värt över tid.",
  },
  completionist: {
    name: "Komplettist",
    condition: "Lås upp alla andra bedrifter.",
    learnMore:
      "Den svåraste att vinna — ditt troférum är fullt när den här lyser.",
  },
};

export default catalog;
