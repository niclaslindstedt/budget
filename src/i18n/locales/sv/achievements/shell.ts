import type { AchievementsShellCatalog } from "../../en/achievements/shell";

const shell: AchievementsShellCatalog = {
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
};

export default shell;
