# FIXTURES — v1-Referenzwerte für finance.test.ts
Methode: Rechenfunktionen VERBATIM aus v1 (bbz-Dialog @ d3e1cfd,
07a calculate()/updateAnalysis(), 07b updateSimulation()/
calculateRecommendation()/getStressScore()) extrahiert und in Node
ausgeführt. Displaywerte: Math.round + toLocaleString('de-CH').
Toleranz: Rohwerte exakt (Float), Anzeige gerundet wie notiert.

## 07a Tragbarkeit (Defaults: calcRate 5.00%, sideRate 0.75%)
T1: income 145000, oblig 0, price 950000, cashEq 190000,
    pensBez 0, pensVp 0, age 40
    → afford 36.94% (Anzeige 37%), LTV 80%, Hypo 760'000,
      Monat 4'464, AmortP.a. 8'442, Banner ORANGE (Grenzbereich)
T2: income 180000, oblig 12000, price 1200000, cashEq 150000,
    pensBez 90000, pensVp 0, age 48
    → afford 40.28% (40%), LTV 80%, Hypo 960'000, Monat 5'639,
      AmortP.a. 10'664, Banner ROT (kritisch, afford>40)
T3: income 110000, oblig 0, price 800000, cashEq 160000,
    pensBez 0, pensVp 80000, age 35
    → afford 38.58% (39%), LTV 70%, Hypo 640'000, Monat 3'537,
      AmortP.a. 4'443 (Verpfändung /30J), Banner ORANGE

## 07b Simulation (STRATS: Einkommen 0.25/1.5, Konservativ 1.25/4.5,
## Ausgewogen 2.75/8.5, Wachstum 4.5/12.5, Dynamisch 5.5/18.0)
A1: 100'000, Ausgewogen, 10J → Ende 131'165, Gewinn 31'165,
    Band 84'292 — 204'103   (Band = end*exp(±1.645*vol*√t))
A2: 250'000, Wachstum, 15J → Ende 483'821, Gewinn 233'821,
    Band 218'183 — 1'072'874
A3: 100'000, Konservativ, 4J → Ende 105'095, Gewinn 5'095,
    Band 90'632 — 121'865

## 07b Empfehlung (Score = crash*0.5 + wait*0.3 + exp*0.2)
E1: Wunsch Wachstum, 10J, react=hold, wait=5y, exp=little
    → Score 1.80, Stress=Ausgewogen, HorizontMax=Dynamisch,
      EMPFEHLUNG Wachstum   (Abstand Wunsch-Stress = 1 → Wunsch)
E2: Wunsch Dynamisch, 7J, react=wait, wait=3y, exp=none
    → Score 0.80, Stress=Konservativ, HorizontMax=Wachstum,
      EMPFEHLUNG Ausgewogen (min(Wunsch, Stress+1), Horizont-Deckel)
E3: Wunsch Ausgewogen, 4J, react=buy, wait=open, exp=lot
    → Score 2.80, Stress=Dynamisch, HorizontMax=Ausgewogen,
      EMPFEHLUNG Ausgewogen (Horizont deckelt)
