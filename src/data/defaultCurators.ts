import { Curator } from '../types/question';

export const DEFAULT_CURATORS: Curator[] = [
  {
    id: 'patrick',
    nome: 'Patrick',
    email: 'patrick@apexmed.med.br',
    cargo: 'Curador Médico',
    avatarCor: '#A43939', // Medical Crimson
    iniciais: 'P',
  },
  {
    id: 'lucas',
    nome: 'Lucas',
    email: 'lucas@apexmed.med.br',
    cargo: 'Curador Médico',
    avatarCor: '#d97706', // Warm Amber
    iniciais: 'L',
  },
  {
    id: 'thierry',
    nome: 'Thierry',
    email: 'thierry@apexmed.med.br',
    cargo: 'Curador Médico',
    avatarCor: '#2563eb', // Academic Blue
    iniciais: 'T',
  },
];
