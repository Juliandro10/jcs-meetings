# Editor de dados — Visita do superintendente de circuito

Documento de trabalho (JCS Meetings · área Elder).

## Objetivo

Importar export JSON do **Hourglass**, corrigir inconsistências, revisar mês a mês e gerar pacote de arquivos para pendrive (S-21 por publicador/grupo, totais, S-88, relatório resumo).

## Fluxo

1. **Importar** `hourglass-export.json`
2. **Revisar** — lista de meses com alertas; aplicar correções automáticas quando possível
3. **Configurar** — caminhos dos PDFs modelo S-21-T e S-88-T (site JW)
4. **Exportar** — pasta raiz escolhida pelo usuário

## Estrutura de exportação

```
Pasta escolhida/
├── Grupo {nome}/
│   ├── {Nome Publicador}.pdf     ← S-21 individual
│   └── ...
├── Total-Publicadores.pdf
├── Total-Pioneiros-Regulares.pdf
├── Total-Pioneiros-Auxiliares.pdf
├── S-88-Assistencia-Reunioes.pdf
└── Resumo-Visita.pdf
```

Diferença do Hourglass: um arquivo por publicador, organizado por grupo; totais separados (Hourglass junta tudo).

## Correções automáticas

| Problema | Ação |
|----------|------|
| `monthlyTotals.reg/aux` zerado com relatórios de pioneiros | Reconstruir totais a partir de `reports` |
| Contagem `pub` incoerente | Recalcular agregados do mês |

## Validação mês a mês

- Totais agregados vs. soma dos `reports`
- Pioneiro regular/auxiliar sem horas
- Relatórios ausentes para publicador ativo no mês anterior
- Mês sem `monthlyTotals`

## Relatório resumo (últimos 6 meses)

| Métrica | Regra |
|---------|--------|
| Publicadores totais | ≥ 1 relatório no período |
| Média de publicadores | Média mensal de quem reportou |
| Irregulares | ≥ 1 mês sem relatar (**1 por pessoa**, mesmo com vários meses parados) |
| Inativos totais | 6 meses **seguidos** sem relatar |
| Novos inativos no ano de serviço | Virou inativo entre 1/set e 31/ago |
| Reativados | 6+ meses parados e voltou a relatar ≥ 1 mês no período |
| Novos não batizados | Entrou como pub. não batizado no período |
| Novos batizados | Batismo no período |
| Pioneiros regulares | Quantidade no último mês fechado |
| Pioneiros auxiliares | Quantidade no último mês fechado |
| Total de estudos | Soma nos 6 meses |

**Ano de serviço:** 1° setembro → 31 agosto.

## Dados de entrada (Hourglass JSON)

Blocos usados: `congregation`, `publishers`, `reports`, `monthlyTotals`, `fsGroups`, `attendance`.

Campos `e2e_*` ignorados (criptografia não exportada).

## Implementação (fases)

- [x] Fase 1 — Doc + parse/validação/correção/métricas (`shared/hourglass/`)
- [x] Fase 1 — Store + IPC + UI Elder (importar, revisar, resumo)
- [x] Fase 2 — Preenchimento PDF S-21/S-88 com modelos em `assets/forms/` (S-21-T.pdf, S-88-T.pdf)
- [x] Fase 2 — Export completo para pendrive (grupos, totais separados, S-88, resumo)
- [ ] S-21 com **duas páginas** por publicador (dois anos de serviço no mesmo PDF, como Hourglass)

## Arquivos principais

| Caminho | Função |
|---------|--------|
| `shared/hourglass/` | Lógica pura (parse, validate, fix, metrics) |
| `electron/circuit-visit-store.ts` | Persistência `elder/circuit-visits.json` |
| `electron/hourglass-service.ts` | Import e processamento no main |
| `electron/circuit-visit-export.ts` | Geração de arquivos |
| `src/pages/ElderCircuitVisitsPage.tsx` | Lista de visitas |
| `src/pages/ElderCircuitVisitEditorPage.tsx` | Editor |
