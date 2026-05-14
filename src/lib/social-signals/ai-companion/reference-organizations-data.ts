/**
 * Curated reference organization accounts (not watched investigators).
 * Used as weak prestige / convergence signals — see hybrid-companion-scoring.
 */
export type ReferenceOrgPrestigeTier = 1 | 2 | 3;

export type ReferenceOrganizationSeed = {
  /** Stable slug for DB seeding */
  slug: string;
  name: string;
  /** Primary X handle without @ */
  xHandle: string;
  domainFocus: string;
  prestigeTier: ReferenceOrgPrestigeTier;
};

/** Rows: name, X handle (no @), domain focus, prestige tier */
const TUPLES: [string, string, string, ReferenceOrgPrestigeTier][] = [
  ["UCSF Helen Diller Family Comprehensive Cancer Center", "UCSFCancer", "cancer_oncology", 1],
  ["UCSF QBI", "QBI_UCSF", "quantitative_biology", 1],
  ["UCSF BCHSI", "UCSFBCHSI", "health_systems", 2],
  ["UCSF Weill Institute for Neurosciences", "UCSFNeuro", "neuroscience", 1],
  ["UCSF Memory and Aging Center", "UCSFmac", "neurodegeneration", 1],
  ["UCSF CVRI", "UCSF_CVRI", "cardiovascular", 1],
  ["UCSF Diabetes Center", "UCSFDiabetes", "metabolism_diabetes", 2],
  ["UCSF Institute for Global Health Sciences", "UCSF_IGHS", "global_health", 2],
  ["UCSF CTSI", "UCSF_CTSI", "clinical_translational", 2],
  ["UCSF Institute for Human Genetics", "UCSF_IHG", "genetics", 2],
  ["UCSF Center for Intelligent Imaging", "UCSFCi2", "imaging_ai", 2],
  ["UCSF Center for Microbiome Medicine", "UCSF_Microbiome", "microbiome", 2],
  ["UCSF Center for Tobacco Control Research and Education", "UCSF_TCORS", "tobacco_public_health", 2],
  ["UCSF Center for AIDS Prevention Studies", "UCSF_CAPS", "hiv_prevention", 2],
  ["UCSF Institute for Health Policy Studies", "UCSF_IHPS", "health_policy", 2],
  ["UCSF Preterm Birth Initiative", "PTBi_UCSF", "maternal_child", 2],
  ["UCSF Osher Center", "UCSFOsher", "integrative_medicine", 2],
  ["UCSF Institute for Neurodegenerative Diseases", "UCSF_IND", "neurodegeneration", 1],
  ["UCSF Dyslexia Center", "UCSFDyslexia", "cognitive_neuro", 2],
  ["UCSF Center for Population Brain Health", "UCSFpopbrain", "population_neuro", 2],
  ["UCSF Department of Medicine", "UCSFMedicine", "general_medicine", 2],
  ["UCSF Surgery", "UCSFSurgery", "surgery", 2],
  ["UCSF Radiology & Biomedical Imaging", "UCSFimaging", "radiology_imaging", 2],
  ["UCSF Neurosurgery", "UCSFNeuroSurg", "neurosurgery", 2],
  ["UCSF Pediatrics Research", "UCSFPediatrics", "pediatrics", 2],
  ["Stanford Bio-X", "StanfordBioX", "interdisciplinary_bio", 1],
  ["Stanford Stem Cell Institute", "StanfordStemCell", "stem_cell", 1],
  ["Stanford Cancer Institute", "StanfordCancer", "cancer_oncology", 1],
  ["UC Berkeley IGI", "igisci", "genomics_immunology", 1],
  ["UCSD Sanford Stem Cell Institute", "ucsdstemcell", "stem_cell", 1],
  ["UCSD Moores Cancer Center", "UCSDCancer", "cancer_oncology", 1],
  ["UCLA Broad Stem Cell Research Center", "UCLAStemCell", "stem_cell", 1],
  ["UCLA Jonsson Cancer Center", "UCLAJCCC", "cancer_oncology", 1],
  ["UC Davis Comprehensive Cancer Center", "UCD_Cancer", "cancer_oncology", 2],
  ["UCI Chao Family Comprehensive Cancer Center", "UCICancer", "cancer_oncology", 2],
  ["USC Stem Cell", "USCStemCell", "stem_cell", 1],
  ["USC Norris Cancer Center", "uscnorris", "cancer_oncology", 1],
  ["Parker Institute for Cancer Immunotherapy", "parkerici", "cancer_immunotherapy", 1],
  ["La Jolla Institute for Immunology", "ljiresearch", "immunology", 1],
  ["Salk Institute", "salkinstitute", "basic_neuro_bio", 1],
  ["Sanford Burnham Prebys", "SBPdiscovery", "cancer_bio", 1],
  ["Gladstone Institutes", "GladstoneInst", "neuro_cardio", 1],
  ["Buck Institute", "BuckInstitute", "aging", 1],
  ["Allen Institute for Immunology", "AllenInstitute", "immunology", 1],
  ["Allen Institute for Brain Science", "AllenInstitute", "neuroscience", 1],
  ["Fred Hutchinson Cancer Center", "fredhutch", "cancer_translational", 1],
  ["Benaroya Research Institute", "BenaroyaResearch", "autoimmunity", 2],
  ["Institute for Systems Biology", "ISBscience", "systems_biology", 1],
  ["OHSU Knight Cancer Institute", "OHSUKnight", "cancer_oncology", 1],
  ["Huntsman Cancer Institute", "huntsmancancer", "cancer_oncology", 2],
  ["Broad Institute", "broadinstitute", "genomics", 1],
  ["Whitehead Institute", "WhiteheadInst", "basic_bio", 1],
  ["Koch Institute at MIT", "kochinstitute", "cancer_engineering", 1],
  ["Ragon Institute", "ragoninstitute", "immunology_vaccines", 1],
  ["Picower Institute", "PicowerInstitute", "neuroscience", 1],
  ["McGovern Institute for Brain Research", "mcgovernmit", "neuroscience", 1],
  ["Harvard Stem Cell Institute", "harvardstemcell", "stem_cell", 1],
  ["Wyss Institute", "wyssinstitute", "bioengineering", 1],
  ["Dana-Farber Cancer Institute", "DanaFarber", "cancer_oncology", 1],
  ["Dana-Farber Research", "DanaFarberNews", "cancer_oncology", 1],
  ["MGH Research Institute", "MGH_RI", "translational_medicine", 1],
  ["Brigham Research Institute", "BrighamResearch", "translational_medicine", 1],
  ["Boston Children’s Research", "BostonChildrens", "pediatrics_translational", 1],
  ["Broad Center for Regenerative Medicine at USC", "USCStemCell", "stem_cell", 1],
  ["Yale Cancer Center", "YaleCancer", "cancer_oncology", 1],
  ["Yale Stem Cell Center", "YaleStemCell", "stem_cell", 2],
  ["Yale Center for Genomic Health", "YaleGenomics", "genomics", 2],
  ["Rockefeller University Research", "RockefellerUniv", "basic_bio", 1],
  ["Columbia Zuckerman Institute", "ZuckermanBrain", "neuroscience", 1],
  ["Columbia Stem Cell Initiative", "ColumbiaStem", "stem_cell", 2],
  ["MSK Cancer Center", "MSKCancerCenter", "cancer_oncology", 1],
  ["Weill Cornell Englander Institute for Precision Medicine", "WCMPrecision", "precision_medicine", 2],
  ["NYU Perlmutter Cancer Center", "Perlmutter_CC", "cancer_oncology", 1],
  ["Mount Sinai Icahn Genomics Institute", "IcahnMountSinai", "genomics", 1],
  ["Penn Institute for Immunology", "Penn_IFI", "immunology", 1],
  ["Penn Abramson Cancer Center", "PennCancer", "cancer_oncology", 1],
  ["Penn Epigenetics Institute", "PennEpigenetics", "epigenetics", 2],
  ["Children’s Hospital of Philadelphia Research Institute", "CHOP_Research", "pediatrics", 1],
  ["Johns Hopkins Kimmel Cancer Center", "HopkinsKimmel", "cancer_oncology", 1],
  ["Johns Hopkins Institute for Basic Biomedical Sciences", "HopkinsMedicine", "basic_bio", 2],
  ["Duke Human Vaccine Institute", "DukeDHVI", "vaccines", 1],
  ["Duke Cancer Institute", "DukeCancer", "cancer_oncology", 1],
  ["UNC Lineberger Comprehensive Cancer Center", "UNC_Lineberger", "cancer_oncology", 1],
  ["Emory Vaccine Center", "EmoryVaccineCtr", "vaccines", 1],
  ["Winship Cancer Institute", "WinshipAtEmory", "cancer_oncology", 1],
  ["Vanderbilt-Ingram Cancer Center", "VUMC_Cancer", "cancer_oncology", 1],
  ["Vanderbilt Center for Immunobiology", "VUMC_Immuno", "immunology", 2],
  ["WashU Siteman Cancer Center", "SitemanCenter", "cancer_oncology", 1],
  ["WashU Center of Regenerative Medicine", "WUSTLRegMed", "regenerative_medicine", 2],
  ["Northwestern Lurie Cancer Center", "LurieCancer", "cancer_oncology", 1],
  ["UChicago Comprehensive Cancer Center", "UChicagoCancer", "cancer_oncology", 1],
  ["University of Michigan Rogel Cancer Center", "UMRogelCancer", "cancer_oncology", 1],
  ["Ohio State Comprehensive Cancer Center", "OSUCCC_James", "cancer_oncology", 1],
  ["Cleveland Clinic Lerner Research Institute", "LernerResearch", "translational", 1],
  ["MD Anderson Cancer Center Research", "MDAndersonNews", "cancer_oncology", 1],
  ["MD Anderson Immunotherapy Platform", "MDAndersonNews", "cancer_immunotherapy", 1],
  ["Baylor College of Medicine Human Genome Sequencing Center", "BCM_HGSC", "genomics", 2],
  ["UT Southwestern Simmons Cancer Center", "utswcancer", "cancer_oncology", 1],
  ["Moffitt Cancer Center", "MoffittNews", "cancer_oncology", 1],
  ["St. Jude Research", "StJudeResearch", "pediatrics_cancer", 1],
];

function slugify(name: string, handle: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "org"}-${handle.toLowerCase()}`;
}

export const REFERENCE_ORGANIZATION_SEEDS: ReferenceOrganizationSeed[] = TUPLES.map(([name, xHandle, domainFocus, prestigeTier]) => ({
  slug: slugify(name, xHandle),
  name,
  xHandle: xHandle.toLowerCase(),
  domainFocus,
  prestigeTier,
}));

/** Normalized X handle → org (first wins when the same program handle appears twice) */
export const REFERENCE_ORG_BY_X_HANDLE: Map<string, ReferenceOrganizationSeed> = (() => {
  const m = new Map<string, ReferenceOrganizationSeed>();
  for (const o of REFERENCE_ORGANIZATION_SEEDS) {
    const k = o.xHandle.toLowerCase();
    if (!m.has(k)) m.set(k, o);
  }
  return m;
})();
