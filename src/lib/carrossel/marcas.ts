// Marcas que a Fábrica de Carrossel atende. Replicar pra outro perfil = adicionar uma entrada aqui
// (nada de marca fixa nos templates).

export interface MarcaCarrossel {
  id: string;
  nome: string;
  handle: string;
  palavraCta: string; // palavra do "comenta X"
  destaque: string; // cor de acento das etiquetas
}

export const MARCAS: MarcaCarrossel[] = [
  { id: "manual-rn", nome: "Manual do Recém-Nascido", handle: "@manualdorecemnascido", palavraCta: "QUERO", destaque: "#f6d77a" },
  { id: "ofertas-maternas", nome: "As Ofertas Maternas", handle: "@asofertasmaternas", palavraCta: "QUERO", destaque: "#ffb4c6" },
  { id: "brunotropolis", nome: "Brunotropolis", handle: "@brunotropolis", palavraCta: "QUERO", destaque: "#ffd400" },
];
