export type ResearchPublicationDef = {
  id: string;
  /** Parâmetro pub na API jw.org e chave de cache (.jwpub). */
  pub: string;
  issue: string;
  title: string;
  subtitle: string;
  primary?: boolean;
  /** Filtra documentos ao abrir (Perspicaz vol. I / II no mesmo .jwpub). */
  volume?: 1 | 2;
};

/** Obras de referência para pesquisa — baixadas via GETPUBMEDIALINKS (jw.org). */
export const RESEARCH_PUBLICATIONS: ResearchPublicationDef[] = [
  {
    id: 'rsg19',
    pub: 'rsg19',
    issue: '',
    title: 'Guia de Pesquisa para Testemunhas de Jeová',
    subtitle: 'Edição de 2019',
    primary: true,
  },
  {
    id: 'it-1',
    pub: 'it',
    issue: '',
    title: 'Estudo Perspicaz das Escrituras',
    subtitle: 'Volume I',
    volume: 1,
  },
  {
    id: 'it-2',
    pub: 'it',
    issue: '',
    title: 'Estudo Perspicaz das Escrituras',
    subtitle: 'Volume II',
    volume: 2,
  },
];

export { filterPerspicazVolumeDocuments } from '../shared/research-publication-docs';

export function getResearchPublication(id: string) {
  return RESEARCH_PUBLICATIONS.find((item) => item.id === id) ?? null;
}
