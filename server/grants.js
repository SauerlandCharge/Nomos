// Kuratierte Förderlinien-Datenbank (Stand-Beispiel für das MVP).
// Echte, bekannte Programme aus Bund, Ländern und EU. Beträge/Quoten sind
// Richtwerte und sollten vor einer echten Antragstellung verifiziert werden.
// Quelle für Verifizierung: Förderdatenbank des Bundes (foerderdatenbank.de).

export const GRANTS = [
  {
    id: "exist-gruenderstipendium",
    name: "EXIST-Gründerstipendium",
    provider: "BMWK",
    region: "DE · Bund",
    level: "national",
    amount: "Stipendium + bis 30 Tsd € Sachmittel",
    fundingRate: "Vollfinanzierung (Stipendium)",
    stage: ["idee", "pre-seed"],
    focus: ["hochschulnah", "technologie", "wissensbasiert", "gruendung", "innovativ"],
    eligibility:
      "Gründungsvorhaben aus Hochschulen/Forschungseinrichtungen; vor der Gründung; innovativ und technologieorientiert oder wissensbasiert.",
    notFor: "Bereits länger am Markt etablierte Unternehmen.",
  },
  {
    id: "exist-forschungstransfer",
    name: "EXIST-Forschungstransfer",
    provider: "BMWK",
    region: "DE · Bund",
    level: "national",
    amount: "Phase I: Personal + bis 250 Tsd € Sachmittel; Phase II: bis 180 Tsd €",
    fundingRate: "bis 100 % (Phase I)",
    stage: ["pre-seed", "seed"],
    focus: ["forschung", "hochschulnah", "deeptech", "technologie", "transfer", "prototyp"],
    eligibility:
      "Forschungsbasierte Ausgründungen mit aufwändigen, risikoreichen Entwicklungsarbeiten.",
    notFor: "Nicht-forschungsbasierte Geschäftsmodelle.",
  },
  {
    id: "kmu-innovativ",
    name: "KMU-innovativ",
    provider: "BMBF",
    region: "DE · Bund",
    level: "national",
    amount: "projektabhängig, häufig bis ~2,5 Mio €",
    fundingRate: "bis 50 % (KMU teils höher)",
    stage: ["seed", "wachstum"],
    focus: ["forschung", "klima", "energie", "gesundheit", "biotech", "ki", "produktion", "ressourceneffizienz", "technologie"],
    eligibility:
      "KMU mit anspruchsvollen FuE-Vorhaben in den Technologiefeldern (u.a. Klima/Energie, Gesundheit, KI, Produktion).",
    notFor: "Reine Markteinführung ohne Forschungsanteil.",
  },
  {
    id: "zim",
    name: "ZIM — Zentrales Innovationsprogramm Mittelstand",
    provider: "BMWK",
    region: "DE · Bund",
    level: "national",
    amount: "Einzelprojekt bis ~550 Tsd €, Kooperationen höher",
    fundingRate: "ca. 25–55 %",
    stage: ["seed", "wachstum"],
    focus: ["technologie", "produktion", "industrie", "software", "hardware", "ki", "mittelstand", "prototyp", "marktnah"],
    eligibility:
      "Marktorientierte FuE-Projekte von KMU, technologie- und branchenoffen.",
    notFor: "Grundlagenforschung ohne Marktbezug.",
  },
  {
    id: "go-digital",
    name: "go-digital",
    provider: "BMWK",
    region: "DE · Bund",
    level: "national",
    amount: "bis ~16,5 Tsd € (Beratungsleistungen)",
    fundingRate: "50 %",
    stage: ["wachstum"],
    focus: ["digitalisierung", "software", "online", "it-sicherheit", "prozesse", "marktnah"],
    eligibility:
      "Kleine Unternehmen für Digitalisierungsberatung (Online-Marketing, digitalisierte Prozesse, IT-Sicherheit).",
    notFor: "Forschungsvorhaben oder reine Sachinvestitionen.",
  },
  {
    id: "invest-zuschuss",
    name: "INVEST — Zuschuss für Wagniskapital",
    provider: "BMWK",
    region: "DE · Bund",
    level: "national",
    amount: "20 % des Investments (max. 100 Tsd €/Jahr je Investor)",
    fundingRate: "20 % Erwerbszuschuss",
    stage: ["pre-seed", "seed"],
    focus: ["innovativ", "technologie", "kapital", "business-angel", "skalierung"],
    eligibility:
      "Junge innovative Unternehmen, die privates Beteiligungskapital von Business Angels einwerben.",
    notFor: "Unternehmen ohne externe Beteiligungsfinanzierung.",
  },
  {
    id: "bafa-energieberatung",
    name: "BAFA — Energieberatung / Bundesförderung effiziente Gebäude (BEG)",
    provider: "BAFA / KfW",
    region: "DE · Bund",
    level: "national",
    amount: "stark vorhabenabhängig",
    fundingRate: "Zuschüsse/Kredite je Maßnahme",
    stage: ["wachstum"],
    focus: ["energie", "klima", "gebaeude", "effizienz", "waerme", "solar", "sanierung"],
    eligibility:
      "Maßnahmen zur Energieeffizienz und erneuerbaren Wärme in Gebäuden/Unternehmen.",
    notFor: "Software-/Plattform-Vorhaben ohne physische Effizienzmaßnahme.",
  },
  {
    id: "horizon-eic-accelerator",
    name: "EIC Accelerator (Horizon Europe)",
    provider: "Europäische Kommission",
    region: "EU · Brüssel",
    level: "eu",
    amount: "Zuschuss bis 2,5 Mio € + Equity bis 10 Mio €",
    fundingRate: "bis 70 % (Zuschuss)",
    stage: ["seed", "wachstum"],
    focus: ["deeptech", "ki", "klima", "energie", "gesundheit", "biotech", "skalierung", "disruptiv"],
    eligibility:
      "Hochinnovative KMU/Startups mit disruptiver DeepTech und hohem Marktpotenzial (EU-weit).",
    notFor: "Inkrementelle Innovationen ohne Breakthrough-Charakter.",
  },
  {
    id: "horizon-cluster5",
    name: "Horizon Europe — Cluster 5 (Klima, Energie, Mobilität)",
    provider: "Europäische Kommission",
    region: "EU · Brüssel",
    level: "eu",
    amount: "projektabhängig, oft 1–5 Mio € (Konsortien)",
    fundingRate: "bis 70–100 %",
    stage: ["seed", "wachstum"],
    focus: ["klima", "energie", "mobilitaet", "wasserstoff", "netz", "speicher", "forschung", "konsortium"],
    eligibility:
      "Meist Verbundprojekte mit europäischen Partnern in Klima/Energie/Mobilität.",
    notFor: "Reine Einzel-Markteinführung ohne Konsortium.",
  },
  {
    id: "bayern-baytou",
    name: "BayTOU — Bayerisches Technologieförderprogramm",
    provider: "Freistaat Bayern",
    region: "DE · Bayern",
    level: "land",
    amount: "bis ~250 Tsd €",
    fundingRate: "ca. 40 %",
    stage: ["pre-seed", "seed"],
    focus: ["technologie", "hardware", "software", "ki", "prototyp", "gruendung", "bayern"],
    eligibility:
      "Technologieorientierte Unternehmensgründungen und junge KMU in Bayern.",
    notFor: "Unternehmen ohne Bezug zu Bayern.",
  },
  {
    id: "berlin-profit",
    name: "Pro FIT (Frühphase) — Berlin",
    provider: "IBB / Land Berlin",
    region: "DE · Berlin",
    level: "land",
    amount: "Zuschuss/Darlehen, oft bis ~1 Mio €",
    fundingRate: "bis ~70 %",
    stage: ["pre-seed", "seed", "wachstum"],
    focus: ["software", "ki", "gesundheit", "mobilitaet", "plattform", "daten", "digital", "berlin"],
    eligibility:
      "Innovative FuE- und Marktvorbereitungsprojekte von Unternehmen mit Betriebsstätte in Berlin.",
    notFor: "Unternehmen ohne Berliner Betriebsstätte.",
  },
  {
    id: "nrw-bank-seed",
    name: "NRW.BANK.Seed/Venture / Gründungsförderung NRW",
    provider: "NRW.BANK / Land NRW",
    region: "DE · Nordrhein-Westfalen",
    level: "land",
    amount: "Beteiligung/Darlehen vorhabenabhängig",
    fundingRate: "vorhabenabhängig",
    stage: ["pre-seed", "seed", "wachstum"],
    focus: ["technologie", "software", "ki", "industrie", "gruendung", "nrw", "skalierung"],
    eligibility:
      "Junge technologieorientierte Unternehmen mit Sitz in Nordrhein-Westfalen.",
    notFor: "Unternehmen ohne NRW-Bezug.",
  },
  {
    id: "digital-jetzt",
    name: "Digital Jetzt — Investitionsförderung",
    provider: "BMWK",
    region: "DE · Bund",
    level: "national",
    amount: "bis ~50 Tsd € (bzw. ~100 Tsd € in Wertschöpfungsketten)",
    fundingRate: "ca. 30–50 %",
    stage: ["wachstum"],
    focus: ["digitalisierung", "software", "ki", "datensicherheit", "qualifizierung", "produktion", "marktnah"],
    eligibility:
      "KMU für Investitionen in digitale Technologien und Qualifizierung der Beschäftigten.",
    notFor: "Reine Forschungsvorhaben.",
  },
  {
    id: "bmel-agrar-innovation",
    name: "BMEL — Innovationsförderung Bioökonomie/Agrar",
    provider: "BMEL / BLE",
    region: "DE · Bund",
    level: "national",
    amount: "projektabhängig",
    fundingRate: "bis 50 % (KMU teils höher)",
    stage: ["seed", "wachstum"],
    focus: ["agrar", "biooekonomie", "lebensmittel", "nachhaltig", "ressourceneffizienz", "klima", "forschung"],
    eligibility:
      "FuE-Vorhaben in Landwirtschaft, Ernährung und Bioökonomie.",
    notFor: "Vorhaben ohne Agrar-/Bioökonomie-Bezug.",
  },
];

// Zusatz-Metadaten je Förderlinie: Kurzbeschreibung, offizielle Programmseite
// (verifizierte Homepages; Deep-Links vor echter Antragstellung prüfen),
// harte Anforderungen (für Matching & Rückfragen) und Format-Hinweise (für die
// vorgabenkonforme Antragsgenerierung).
const META = {
  "exist-gruenderstipendium": {
    summary: "Stipendium für innovative, technologie- oder wissensbasierte Gründungen aus der Hochschule — vor der Gründung.",
    url: "https://www.exist.de",
    requirements: ["Bezug zu Hochschule/Forschungseinrichtung", "Vorhaben noch vor der Gründung", "innovatives, technologie- oder wissensbasiertes Konzept", "Gründungsteam mit fachlicher Qualifikation (häufig Hochschulabschluss)"],
    formatHints: "Ideenpapier/Skizze + Businessplan; Fokus auf Innovationsgrad, Team-Qualifikation und Umsetzungsfahrplan.",
  },
  "exist-forschungstransfer": {
    summary: "Förderung für forschungsbasierte Ausgründungen mit aufwändigen, risikoreichen Entwicklungsarbeiten (zwei Phasen).",
    url: "https://www.exist.de",
    requirements: ["forschungsbasiertes Vorhaben aus einer Hochschule/Forschungseinrichtung", "aufwändige, risikoreiche FuE nötig", "wissenschaftliche Anbindung/Team"],
    formatHints: "Detaillierter FuE- und Arbeitsplan mit Meilensteinen; wissenschaftliche und wirtschaftliche Verwertung getrennt darstellen.",
  },
  "kmu-innovativ": {
    summary: "FuE-Förderung des BMBF für anspruchsvolle Innovationsprojekte von KMU in definierten Technologiefeldern.",
    url: "https://www.foerderdatenbank.de",
    requirements: ["KMU-Status", "anspruchsvolles FuE-Vorhaben", "Einordnung in ein förderfähiges Technologiefeld (z. B. Klima/Energie, Gesundheit, KI)"],
    formatHints: "Vorhabenbeschreibung mit Stand der Technik, Arbeitspaketen und Verwertungsplan.",
  },
  "zim": {
    summary: "Technologie- und branchenoffene Förderung marktorientierter FuE-Projekte des Mittelstands.",
    url: "https://www.zim.de",
    requirements: ["KMU bzw. Mittelstand", "marktorientiertes FuE-Projekt", "erkennbares technisches Risiko/Innovationssprung"],
    formatHints: "Einzel- oder Kooperationsprojekt; Arbeitsplan, Kostenplan und Markt-/Verwertungsperspektive.",
  },
  "go-digital": {
    summary: "Geförderte Beratung für kleine Unternehmen rund um Digitalisierung, Online-Marketing und IT-Sicherheit.",
    url: "https://www.foerderdatenbank.de",
    requirements: ["kleines Unternehmen", "Beratungs-/Digitalisierungsbedarf", "Umsetzung mit autorisiertem Beratungsunternehmen"],
    formatHints: "Beratungsfokus statt FuE; konkrete Maßnahmen und erwartete Wirkung beschreiben.",
  },
  "invest-zuschuss": {
    summary: "Erwerbszuschuss, der private Investments von Business Angels in junge innovative Unternehmen attraktiver macht.",
    url: "https://www.bafa.de",
    requirements: ["junges innovatives Unternehmen", "Einwerbung privaten Beteiligungskapitals (Business Angel)", "Antrag von Investor und Unternehmen"],
    formatHints: "Nachweis von Innovativität und Beteiligungsvertrag; weniger FuE-Plan, mehr Finanzierungsnachweis.",
  },
  "bafa-energieberatung": {
    summary: "Zuschüsse/Kredite für Energieeffizienz und erneuerbare Wärme in Gebäuden und Unternehmen.",
    url: "https://www.bafa.de",
    requirements: ["konkrete physische Effizienz-/Wärmemaßnahme", "Gebäude-/Anlagenbezug"],
    formatHints: "Maßnahmen- und Investitionsbeschreibung; technische Kennwerte und Einsparung ausweisen.",
  },
  "horizon-eic-accelerator": {
    summary: "EU-Förderung (Zuschuss + Equity) für hochinnovative DeepTech-Startups mit großem Marktpotenzial.",
    url: "https://eic.ec.europa.eu",
    requirements: ["KMU/Startup mit disruptiver DeepTech", "hohes Markt-/Skalierungspotenzial", "EU-Bezug"],
    formatHints: "EU-Pitch-Struktur (Excellence, Impact, Implementation), oft englischsprachig.",
  },
  "horizon-cluster5": {
    summary: "EU-Verbundförderung in Klima, Energie und Mobilität — meist mit europäischen Partnern.",
    url: "https://ec.europa.eu",
    requirements: ["meist Konsortium mit EU-Partnern", "Thema in Klima/Energie/Mobilität", "EU-weite Relevanz"],
    formatHints: "Konsortialantrag nach Horizon-Vorlage (Excellence/Impact/Implementation), englischsprachig.",
  },
  "bayern-baytou": {
    summary: "Bayerische Förderung für technologieorientierte Gründungen und junge KMU.",
    url: "https://www.foerderdatenbank.de",
    requirements: ["Betriebsstätte/Bezug in Bayern", "technologieorientiertes Vorhaben", "junges Unternehmen/Gründung"],
    formatHints: "Technologie- und Kostenplan mit Bayern-Bezug.",
  },
  "berlin-profit": {
    summary: "Berliner Förderung (IBB) für innovative FuE- und Marktvorbereitungsprojekte.",
    url: "https://www.ibb.de",
    requirements: ["Betriebsstätte in Berlin", "innovatives FuE-/Marktvorbereitungsprojekt"],
    formatHints: "FuE-/Markteinführungsplan mit Berlin-Bezug; Zuschuss- und Darlehensanteile.",
  },
  "nrw-bank-seed": {
    summary: "Beteiligungs-/Darlehensfinanzierung für junge technologieorientierte Unternehmen in NRW.",
    url: "https://www.nrwbank.de",
    requirements: ["Sitz/Bezug in Nordrhein-Westfalen", "technologieorientiertes junges Unternehmen"],
    formatHints: "Finanzierungs- und Wachstumsplan mit NRW-Bezug.",
  },
  "digital-jetzt": {
    summary: "Investitionszuschuss für KMU in digitale Technologien und Mitarbeiter-Qualifizierung.",
    url: "https://www.foerderdatenbank.de",
    requirements: ["KMU-Status", "Investition in digitale Technologien und/oder Qualifizierung"],
    formatHints: "Investitionsplan + Digitalisierungsvorhaben; kein reines FuE.",
  },
  "bmel-agrar-innovation": {
    summary: "Förderung von FuE-Vorhaben in Landwirtschaft, Ernährung und Bioökonomie.",
    url: "https://www.bmel.de",
    requirements: ["Bezug zu Agrar/Ernährung/Bioökonomie", "FuE-Charakter"],
    formatHints: "FuE-Plan mit Bezug zur Bioökonomie; Nachhaltigkeitswirkung darstellen.",
  },
};
GRANTS.forEach((g) => Object.assign(g, META[g.id] || {}));

// Kompakte Repräsentation für den System-Prompt (spart Tokens, stabil cachebar).
export function grantsForPrompt() {
  return GRANTS.map((g) => ({
    id: g.id,
    name: g.name,
    provider: g.provider,
    region: g.region,
    level: g.level,
    amount: g.amount,
    fundingRate: g.fundingRate,
    stage: g.stage,
    focus: g.focus,
    eligibility: g.eligibility,
    notFor: g.notFor,
    requirements: g.requirements,
  }));
}

export function getGrantById(id) {
  return GRANTS.find((g) => g.id === id);
}
