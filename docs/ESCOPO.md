# JCS Meetings — Escopo do produto

> Documento mestre de escopo. Complementa o [PLANEJAMENTO.md](./PLANEJAMENTO.md) (detalhes técnicos).  
> **Versão:** 1.1 · **Status:** **MVP funcional em teste** — leitor, IA, lfb e prep local prontos; falta export `.jwlibrary`.

---

## Estado atual (julho 2026)

### Entregue e testável

| Área | Situação |
|------|----------|
| Shell + Reuniões | Electron, sidebar, semanas, download `mwb`/`w` |
| Leitor de publicação | HTML, imagens, links `jwpub://` |
| Preparação manual | Campos editáveis (auto-resize), destaques, notas ancoradas |
| Painel Referências | NWT, matérias `w`/`p`, **livro lfb** (histórias CBS) |
| Assistente IA | Chat no painel com contexto da matéria |
| Preparar automático | OpenAI **gpt-4o**: grifos, campos, joias (3× cap:vers + aplicação), notas por parte, EBC (3 perguntas por história lfb) |
| Limpar preparação | Remove grifos, notas e campos da matéria aberta |
| Persistência | `prep-data.json` local (intermediário até `userData.db` v14) |

### Próximos passos (ordem acordada)

1. **Próximo teste manual** — semana 29 jun–5 jul 2026: limpar → preparar automático → lfb → notas → campos.
2. **Primeiro salvamento na nuvem (JW Library)** — logo após teste OK: implementar export **`.jwlibrary`** e restaurar no **JW Library mobile (Android)** (campos, grifos, notas).
3. **Após MVP funcional fechado** — separar **Modo Assistência** (filha → esposa) vs **Modo Tribuna** (só você; bloqueio local; não distribuir publicamente).
4. Depois: modos presidente / dirigente / discurso, resumo da semana, instalador, tema escuro.

---

## 1. Visão

**JCS Meetings** é um aplicativo desktop (Windows) que **reproduz a experiência de preparação de reuniões do JW Library** — como se o usuário estivesse dentro do próprio app — e **vai além** com ferramentas de IA e modos especiais para anciãos e partes designadas.

O usuário deve sentir que está no JW Library: mesma organização por semanas, mesma matéria, mesmas ações de estudo (marcar respostas, comentários, destaques, notas). A diferença é que o JCS Meetings **atualiza publicações do jw.org**, **prepara automaticamente** com IA e oferece **modos para presidir e dirigir**.

---

## 2. Princípios de produto

| Princípio | Descrição |
|-----------|-----------|
| **Paridade JW Library** | Preparação manual idêntica em funções: campos editáveis, destaques, notas, painel de estudo, links bíblicos. |
| **Fidelidade visual** | **Sidebar + header** como JW Library Windows (capturas em [UI-REFERENCIA-JW-LIBRARY.md](./UI-REFERENCIA-JW-LIBRARY.md)). |
| **Sem substituir o estudo** | IA acelera e sugere; usuário revisa e edita antes de usar na reunião. |
| **Fontes oficiais** | Publicações e complementos vêm do **jw.org / WOL**; nada inventado sem base. |
| **Dados portáveis** | Preparação exportável/importável via **`.jwlibrary`** para continuar no JW Library mobile. |

---

## 3. Público e casos de uso

| Persona | Necessidade |
|---------|-------------|
| **Publicador** | Preparar partes de estudante, comentários, respostas às perguntas. |
| **Ancião / servo** | Preparar discursos (Tesouros, Joias, Viver como Cristãos, CBS). |
| **Presidente (meio de semana)** | Comentários introdutórios/finais, transições, visão geral da reunião. |
| **Dirigente da Sentinela** | Introdução, orientação por pergunta, comentários finais, tempo. |

---

## 4. Estrutura de navegação (espelho JW Library Windows)

> Referência visual detalhada: [UI-REFERENCIA-JW-LIBRARY.md](./UI-REFERENCIA-JW-LIBRARY.md)

### 4.1 Shell global

| Área | Comportamento |
|------|---------------|
| **Sidebar esquerda** | Ícones: Início, Bíblia, Biblioteca, Mídia, **Reuniões**, Estudo pessoal |
| **Header** | Título da seção + idioma + ícones (busca, download, histórico, sync, menu) |
| **Conteúdo** | Área principal branca/cinza claro |
| **Splash** | Logo roxo + loading (estilo JW Library) |

### 4.2 Seções — escopo JCS Meetings

| Seção | Escopo |
|-------|--------|
| **Início** | Fase 2 — favoritos, novidades |
| **Bíblia** | Fase 2 — NWT, grid de livros, painel de estudo |
| **Biblioteca** | Download/atualização `mwb`, `w`, `nwt`; aba Baixados |
| **Reuniões** | **Núcleo** — ver 4.3 |
| **Estudo pessoal** | Notas, etiquetas, backup `.jwlibrary` |
| **Ferramentas IA** | Integradas na tela Reuniões e no leitor (não app separado) |

### 4.3 Tela Reuniões (layout real do JW Library)

**Não** usa sub-abas “Apostila / Sentinela” no topo. Usa **uma página** com navegação de semana e três blocos:

```
        ‹    29 de junho–5 de julho · Esta semana    ›

  VIDA E MINISTÉRIO
  [thumb] 29 de junho–5 de julho                    ⋯

  ESTUDO DE A SENTINELA
  [thumb] 29 DE JUNHO–5 DE JULHO DE 2026
          Marido e esposa, continuem fortalecendo...  ⋯

  OUTRAS PUBLICAÇÕES USADAS NAS REUNIÕES
  [capa] Apostila da Reunião Vida e Ministério       ☁ ⋯
  [capa] A Sentinela — Edição de Estudo              ☁ ⋯
  [capa] Cante de Coração para Jeová                 ⋯
  ...
```

- Setas **‹ ›** trocam a semana (passado/futuro).
- Toque em Vida e Ministério ou Sentinela → **leitor de publicação**.
- Ícone **nuvem** → publicação não baixada (link para download jw.org).
- **Ações JCS** (Preparar IA, Resumo, modos presidente/dirigente): menu ou barra secundária, sem quebrar o layout.

### 4.4 Leitor de publicação (ao abrir matéria)

- Conteúdo HTML do `.jwpub`; painel de estudo lateral (versículos).
- Campos editáveis, destaques, notas, marcadores — paridade total com JW Library.
- Aviso se publicação não estiver baixada.

---

## 5. Leitor de publicação (paridade JW Library)

Renderização do conteúdo descriptografado do `.jwpub` (HTML + imagens).

### 5.1 Funções manuais (obrigatórias — “preparar igual no Library”)

| Função | Comportamento |
|--------|---------------|
| **Campos editáveis** | Respostas às perguntas da apostila e da Sentinela (`InputField`). |
| **Destacar texto** | Múltiplas cores; persistência local. |
| **Sublinhar** | Idem destaque, tipo underline. |
| **Notas** | Anotação ligada a trecho ou campo; título + corpo. |
| **Marcadores de página** | Bookmark na publicação/seção. |
| **Painel de estudo** | Versículos e referências ao tocar links; Bíblia ao lado (desktop). |
| **Navegação** | Anterior/próximo na publicação; ir para parte da reunião. |
| **Busca na publicação** | Localizar palavra/frase na edição aberta (fase 2). |

### 5.2 Armazenamento local

- Banco **`userData.db`** (schema compatível JW Library v14) em `%APPDATA%/JCS meetings/`.
- Mesma lógica de `Location`, `InputField`, `UserMark`, `BlockRange`, `Note`.
- Permite **exportar/importar `.jwlibrary`** para o celular.

---

## 6. Publicações — download e atualização (jw.org)

### 6.1 Publicações obrigatórias (MVP)

| Pub | Código | Uso |
|-----|--------|-----|
| Apostila Vida e Ministério | `mwb` | Meio de semana |
| Sentinela (Estudo) | `w` | Fim de semana |
| Tradução do Novo Mundo | `nwt` | Versículos no painel de estudo |

### 6.2 Publicações opcionais (fases posteriores)

- Cantemos a Jeová (`sjj`), brochuras citadas, vídeos linked.

### 6.3 Fluxo de atualização

1. App consulta catálogo oficial (`catalog.db` / `GETPUBMEDIALINKS`).
2. Compara hash/edição com cache local.
3. Botão **“Atualizar publicações”** + verificação automática ao abrir (configurável).
4. Download em background; indicador de progresso.
5. Cache: `%APPDATA%/JCS meetings/cache/jwpub/`.

---

## 7. Organização por semanas

Cada semana agrega:

| Bloco | Conteúdo |
|-------|----------|
| **Metadados** | Data início–fim, leitura bíblica semanal |
| **Meio de semana** | Todas as partes (Tesouros, Joias, Aplicação, Viver, EBC) + campos de preparação |
| **Fim de semana** | Artigo Sentinela da semana + perguntas de estudo |
| **Estado** | Não iniciada / em preparação / preparada (manual ou IA) |

Parser: `meeting-schedules-parser` sobre `mwb` + `w` do mês.

---

## 8. Ferramentas IA (além do JW Library)

### 8.1 Preparar automaticamente

**Botão:** `Preparar reunião (IA)` na tela da semana.

| Aspecto | Detalhe |
|---------|---------|
| **Escopo** | Semana completa: meio de semana + Sentinela (configurável: só uma reunião). |
| **Fontes (ordem)** | 1) Publicação da semana · 2) Bíblia (NWT) · 3) jw.org / WOL · 4) **lfb** (histórias CBS) |
| **Saída** | Preenche campos, destaca trechos-chave, cria notas por parte (roteiro de tribuna) |
| **Modelo** | OpenAI **`gpt-4o`** no preparar automático (`gpt-4o-mini` no assistente) |
| **UX** | Progresso → revisão → **Aplicar** ou **Descartar**; botão **Limpar preparação** |
| **Regra** | Joias: 3× capítulo:versículo + aplicação; EBC: 3 perguntas oficiais por história lfb |

### 8.1.1 Pós-MVP — dois modos de IA (registrado)

Após MVP funcional (leitor + prep automático + export `.jwlibrary` validado):

| Modo | Público | Conteúdo |
|------|---------|----------|
| **Assistência** | Filha (depois esposa) | Joias, campos, notas **curtas**, EBC — preparação do dia a dia |
| **Tribuna** | **Somente você** | Roteiros longos de condução, notas detalhadas por parte |

**Acesso:** Modo Tribuna desligado por padrão; desbloqueio local (PIN ou usuário Windows). Não expor em build público. Rollout: você → filha → esposa.

### 8.2 Resumo da reunião

**Botão:** `Resumo da semana (IA)`.

| Aspecto | Detalhe |
|---------|---------|
| **Entrada** | Semana selecionada + matéria baixada |
| **Saída** | Resumo estruturado: tema, pontos principais, versículos-chave, aplicações |
| **Modelo** | **OpenAI** (API já disponível ao usuário) |
| **Ações** | Copiar, exportar Markdown/PDF, salvar como nota na semana |

### 8.3 Modos especiais de preparação

Acessíveis no menu **Ferramentas IA** ou contexto da semana/part:

#### A) Preparar discurso

- Usuário escolhe **parte designada** (ex.: Tesouros 10 min, Joias, parte Viver, EBC).
- IA gera: esboço, pontos principais, transições, citações, tempo sugerido.
- Resultado editável; pode virar notas + destaques na publicação.

#### B) Presidir reunião de meio de semana

- Foco no **presidente**: comentários de abertura e encerramento, apresentação de cada seção, transições entre partes, lembretes (músicas, oração, tempo).
- Referência: instruções oficiais + matéria da apostila da semana.
- Saída: **“Folha do presidente”** editável (nota dedicada + opcional export PDF).

#### C) Dirigir estudo da Sentinela

- Foco no **dirigente**: parágrafos introdutório e conclusivo, orientação por pergunta (§), comentários que unem respostas, gestão de tempo.
- Saída: **“Folha do dirigente”** editável por pergunta/seção.

> Estes modos **não existem no JW Library**; são diferencial do JCS Meetings.

---

## 9. Fluxos do usuário

### 9.1 Preparação manual (como hoje no Library)

```
Abrir Reuniões → escolher semana → apostila ou Sentinela
→ ler matéria → preencher campos → destacar respostas → notas
→ (opcional) Exportar .jwlibrary → restaurar no celular
```

### 9.2 Preparação automática

```
Abrir Reuniões → escolher semana → [Preparar reunião (IA)]
→ aguardar (publicação + Bíblia + jw.org) → revisar → Aplicar
→ editar manualmente se quiser → Exportar .jwlibrary
```

### 9.3 Presidente / Dirigente / Discurso

```
Reuniões → semana → Ferramentas IA → escolher modo
→ informar parte (se discurso) → gerar → editar folha → usar na reunião
```

---

## 10. Requisitos não funcionais

| Requisito | Meta |
|-----------|------|
| **Performance** | Abrir semana &lt; 2 s (cache quente); IA com streaming na UI |
| **Offline** | Leitura e preparação manual offline após download das pubs |
| **Tema** | Claro e escuro (JW Library usa claro; escuro como opção) |
| **Idioma MVP** | Português (Brasil) — código `T` |
| **Plataforma MVP** | Windows 10+ (Electron) |
| **Privacidade** | Chaves API só local (`.env`); dados de preparação só no dispositivo |

---

## 11. Fora de escopo (MVP)

- Escalas congregacionais / designações de publicadores (Organized, NW Scheduler).
- Streaming de vídeos integrado (link abre navegador ou fase posterior).
- App Android nativo (fase futura).
- Sincronização em nuvem própria (só `.jwlibrary` manual).
- Língua de sinais / outras línguas além de PT-BR no MVP.

---

## 12. Critérios de aceite do MVP

| # | Critério | Status |
|---|----------|--------|
| 1 | Baixar/atualizar `mwb` e `w` do jw.org | ✅ |
| 2 | Listar semanas e exibir matéria como JW Library | ✅ |
| 3 | Preparar manualmente: campos, destaques e notas locais | ✅ |
| 4 | **Preparar automaticamente** semana com revisão/aplicar | ✅ (em teste) |
| 5 | **Resumo da semana** via OpenAI | ⏳ pendente |
| 6 | Pelo menos **um modo especial** (presidente/dirigente/discurso) | ⏳ pendente |
| 7 | Exportar `.jwlibrary` importável no JW Library mobile | ⏳ **próximo após teste manual** |

---

## 13. Roadmap de entrega

| Fase | Entrega | Prioridade | Status |
|------|---------|------------|--------|
| **1** | Electron + UI JW-like + download pubs + semanas | P0 | ✅ |
| **2** | Leitor + campos + destaques + notas + painel estudo + lfb | P0 | ✅ |
| **3** | OpenAI: preparar automático + revisão/aplicar | P0 | ✅ (teste) |
| **4** | Export/import `.jwlibrary` + restore JW Library mobile | P0 | ⏳ **próximo** |
| **5** | Modos Assistência vs Tribuna (bloqueio local) | P1 | pós-MVP |
| **6** | Modos presidente, dirigente, discurso + resumo | P1 | pendente |
| **7** | Início, busca, Bíblia completa, instalador, tema escuro | P2 | pendente |

---

## 14. Decisões de escopo (registro)

| Item | Decisão |
|------|---------|
| Nome | **JCS Meetings** |
| Experiência base | **Paridade JW Library** na preparação manual |
| Diferencial | **IA + modos presidente/dirigente/discurso** |
| IA (MVP) | **OpenAI** (resumo + preparação automática + modos) |
| Publicações | **Download/atualização automática** via jw.org |
| Organização | **Por semanas**, igual JW Library |
| Dados | **`prep-data.json`** hoje → **`userData.db` v14** + export **`.jwlibrary`** |
| Plataforma | **Windows / Electron** primeiro |
| Pós-MVP | **Modo Assistência** (família) vs **Modo Tribuna** (só você, bloqueio local) |

---

*Escopo atualizado em julho de 2026.*
