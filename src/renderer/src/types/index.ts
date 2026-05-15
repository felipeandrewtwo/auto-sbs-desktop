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
