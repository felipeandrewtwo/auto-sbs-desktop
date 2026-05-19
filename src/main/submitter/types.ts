export interface Vaga {
  cargo: string;
  empresa: string;
  linkEmpresa?: string;
  localidade: string;
  modoTrabalho?: string;
  tipoContrato?: string;
  id: string;
  linkVaga: string;
  profileRecrutador?: string;
  descricao?: string;
  categoria?: string;
  subcategorias?: string[];
  candidaturaSimplificada?: boolean;
}

export interface VagaAnalisada extends Vaga {
  porcentagemAlinhamento: number;
  recomendacao: string;
  pontosFortes: string[];
  pontosFracos: string[];
  submetido?: boolean;
  ingles?: boolean;
}

export interface SubmitterConfig {
  geminiApiKey: string;
  hasLinkedInSession: boolean;
  hasPrefillProfile: boolean;
}

export interface SubmitterPrefillProfile {
  currentCity: string;
  currentCompany: string;
  englishConfidence: string;
  englishComfortText: string;
  spanishConfidence: string;
  jobDiscoverySource: string;
  hasFamilyAtCompany: string;
  salaryExpectationClt: string;
  currentSalaryAndBenefits: string;
  dataProcessingConsent: boolean;
  contactConsent: boolean;
}
