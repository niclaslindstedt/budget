import type { RenamePredictorCatalog } from "../en/renamePredictor";

const renamePredictor: RenamePredictorCatalog = {
  title: "Granska föreslagna omdöpningar",
  intro:
    "Baserat på tidigare ändringar kan dessa nya poster döpas om automatiskt. Avmarkera de du vill behålla som de är, eller redigera förslaget direkt.",
  original: "Från banken",
  suggested: "Döp om till",
  suggestedPlaceholder: "Föreslaget namn",
  suggestionAria: "Omdöpningsförslag för {description}",
  acceptAria: "Acceptera omdöpning för {description}",
  hitCountOne: "1 tidigare omdöpning",
  hitCountOther: "{n} tidigare omdöpningar",
  cancel: "Avbryt import",
  skip: "Hoppa över omdöpningar",
  commit: "Tillämpa omdöpningar",
  commitCountOne: "Tillämpa 1 omdöpning",
  commitCountOther: "Tillämpa {n} omdöpningar",
};

export default renamePredictor;
