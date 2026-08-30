# Órbita Entregas

Nova camada visual para o sistema operacional de entregas do Nilo Supermercado.

## O que foi preservado

- Central de Operação, Dashboard e pesquisa geral;
- cadastro e edição completa de entregas;
- entregas normais, grandes e múltiplas viagens;
- ciclos, bloqueio de veículo/entregador e roteiro por prioridade;
- status, retornos, reagendamentos e retirada na loja;
- odômetro por veículo e expediente;
- custos, taxas, reembolsos e resultado financeiro;
- relatórios para impressão/PDF e exportação para Excel;
- auditoria, lixeira, backup/restauração e modo treinamento;
- sincronização, PWA e funcionamento offline.

## Nova identidade visual

O projeto usa o layout **Órbita**: navegação azul profunda, cartões claros, hierarquia visual compacta, nova marcação de status e componentes preparados para desktop e celular. A camada foi adicionada em `layout-orbita.css`, mantendo os IDs e contratos do JavaScript para reduzir risco de regressão funcional.

## Publicação

O projeto é estático e compatível com GitHub Pages. Basta publicar a raiz deste diretório como branch `main` ou `gh-pages`.

O histórico operacional novo deve começar em **01/09/2026**. O repositório não importa dados antigos automaticamente.
