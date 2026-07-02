# Referência visual — JW Library (Windows)

> Capturas de tela fornecidas pelo usuário em jul/2026.  
> **Objetivo:** o JCS Meetings deve parecer o JW Library nativo; ferramentas IA entram **dentro** das telas existentes, não como app separado.

---

## 1. Layout global (todas as telas)

```
┌──────────────────────────────────────────────────────────────┐
│ JW Library                                    ─  □  ✕      │  ← title bar (Electron)
├────┬─────────────────────────────────────────────────────────┤
│ ☰  │  [Título da seção]          🔍 🌐 🕐 ⋮               │  ← header branco
│ 🏠 │  Português (Brasil)                                     │
│ 📖 │─────────────────────────────────────────────────────────│
│ 📚 │                                                         │
│ 🎬 │              CONTEÚDO DA SEÇÃO                          │
│ 👥 │                                                         │
│ 💎 │                                                         │
└────┴─────────────────────────────────────────────────────────┘
     sidebar (~56px)              área principal
```

### Sidebar (ícones, de cima para baixo)

| Ícone | Seção JW Library | JCS Meetings |
|-------|------------------|--------------|
| ☰ | Menu hamburger | Igual |
| 🏠 | Início | Fase 2 |
| 📖 | Bíblia (NWT) | Fase 2 |
| 📚 | Biblioteca / Publicações | **P0** |
| 🎬 | Mídia | Fora do escopo MVP |
| 👥 | **Reuniões** | **P0 — núcleo** |
| 💎 | Estudo pessoal | **P1** (notas, tags, backup) |

- Item ativo: fundo roxo claro + barra/indicador roxo à esquerda.
- Ícones cinza quando inativos.

### Header da seção

- Título grande (ex.: `Reuniões`, `Biblioteca`, `Estudo Pessoal`).
- Subtítulo: `Português (Brasil)`.
- Ícones à direita (conforme tela): busca, idioma, download, histórico, sincronizar, menu `⋮`.

### Paleta (aproximada — calibrar com eyedropper)

| Token | Uso | Hex ref. |
|-------|-----|----------|
| `jw-purple` | Logo, tiles bíblia, destaques, barra ativa | `#5C3D6E` |
| `jw-purple-light` | Fundo item sidebar ativo | `#EDE7F0` |
| `jw-bg` | Fundo geral | `#F2F2F2` |
| `jw-surface` | Cards, listas | `#FFFFFF` |
| `jw-text` | Texto principal | `#333333` |
| `jw-muted` | Subtítulos, metadados | `#666666` |
| `jw-border` | Divisórias | `#E0E0E0` |

### Splash (abertura)

- Fundo cinza claro.
- Quadrado roxo central com **JW** + **LIBRARY** em branco.
- Indicador de carregamento (pontos roxos animados).

> JCS Meetings: splash com **JCS** + **MEETINGS** (mesmo estilo), depois entra direto em Reuniões ou última tela aberta.

---

## 2. Tela — Início

**Referência:** favoritos, kit de ensino (grid de vídeos), novidades (cards horizontais + vídeos).

| Elemento | Comportamento |
|----------|---------------|
| Favoritos | Placeholder ou publicações fixadas |
| Kit de ensino | Grid com thumbnail, duração, título |
| Novidades | Cards com capa, categoria, tamanho, ícone download |

**JCS:** fase posterior. Início pode mostrar atalho “Semana atual” → Reuniões.

---

## 3. Modal — Idiomas / Download

**Referência:** lista pesquisável de idiomas; cada linha = idioma + título da publicação.

| Estado | UI |
|--------|-----|
| Baixando | Barra de progresso roxa + botão cancelar (X) |
| Pronto | Ícone nuvem + tamanho (MB/KB) |
| Carregando lista | Spinner pontilhado roxo |

**JCS:** reutilizar na aba Publicações ao baixar `mwb`, `w`, `nwt` do jw.org.

---

## 4. Tela — Bíblia

**Referência:** Tradução do Novo Mundo · Português (Brasil).

- Sub-abas: **INTRODUÇÃO | LIVROS | ÍNDICE | APÊNDICE A | APÊNDICE B**
- Grid de livros em **tiles roxos** (4 colunas AT, 3 colunas NT).
- Ícone fone = áudio disponível.

**JCS:** fase 2 — necessário para painel de estudo (versículos ao clicar links na matéria).

---

## 5. Tela — Biblioteca (Publicações)

**Referência:** Biblioteca · Português (Brasil).

- Sub-abas: **PUBLICAÇÕES | VÍDEO | ÁUDIO | BAIXADOS**
- Grid de categorias com ícone + rótulo:
  - Livros, Brochuras, Sentinela, Despertai!, **Apostilas**, Orientações, etc.

**JCS:** MVP foca em **Apostilas**, **A Sentinela**, **Bíblia** e **Baixados**; demais categorias podem aparecer desabilitadas ou ocultas.

---

## 6. Tela — Reuniões ⭐ (núcleo)

**Referência:** layout real difere do rascunho inicial (não usa sub-abas Vida/Sentinela no topo).

### Navegação de semana

```
        ‹    29 de junho–5 de julho · Esta semana    ›
```

- Setas anterior/próximo.
- Label com intervalo de datas + “Esta semana” quando aplicável.

### Seções (vertical, mesma página)

#### 6.1 Vida e Ministério

- Item em lista: **thumbnail** + `29 de junho–5 de julho` + menu `⋯`
- Toque abre a **matéria da apostila** da semana (leitor completo).

#### 6.2 Estudo de A Sentinela

- Item em lista: thumbnail + data em caps + **título do artigo**
- Ex.: *“Marido e esposa, continuem fortalecendo a amizade entre vocês”*
- Menu `⋯`

#### 6.3 Outras publicações usadas nas reuniões

Lista com capa + título + subtítulo:

| Publicação | Observação |
|------------|------------|
| Apostila da Reunião Vida e Ministério | Ícone nuvem se não baixada |
| A Sentinela Anunciando… | Idem |
| Cante de Coração para Jeová | Songbook |
| Brochuras citadas | Amor ao Próximo, etc. |
| Instruções para a Reunião… | PDF/jwpub |

- Ícone **nuvem ↓** = precisa baixar.
- Menu `⋯` = opções (abrir, baixar, remover).

### O que acontece ao abrir um item

- Matéria abre no **leitor de publicação** (tela cheia ou split com painel de estudo).
- Campos editáveis, destaques, notas — **igual JW Library**.

### Onde entram as ferramentas JCS (além do Library)

Dentro da tela da semana ou do leitor, **barra de ações JCS** (discreta, não quebra o layout):

| Botão | Função |
|-------|--------|
| **Preparar automático (IA)** | Preenche semana inteira |
| **Resumo da semana** | OpenAI — resumo estruturado |
| **Modos especiais** | Discurso · Presidente · Dirigente |

> Posição sugerida: canto superior direito da área Reuniões ou FAB/menu `⋮` — **não** substituir a lista de seções.

---

## 7. Tela — Estudo pessoal

**Referência:** Notas e etiquetas · Playlists.

- Seções colapsáveis com `>`
- Empty state com ícones + texto explicativo
- Ícones: + etiqueta, + nota, + playlist

**JCS:** armazena `userData.db` local; export/import `.jwlibrary`; mesma estrutura de notas e tags.

---

## 8. Correções ao rascunho de código inicial

O scaffold v0.1 usava **abas horizontais no topo** — **incorreto** face ao JW Library Windows.

| Errado (v0.1) | Correto (JW Library) |
|---------------|----------------------|
| TabBar horizontal (Início, Bíblia…) | **Sidebar vertical** com ícones |
| Sub-abas Vida / Sentinela no topo | **Uma página Reuniões** com 3 seções |
| Botões IA prominentes no header | IA integrada via menu/ações secundárias |
| Cores azul `#2a6ebb` | **Roxo** `#5C3D6E` aprox. |

---

## 9. Prioridade de implementação UI

| Ordem | Tela |
|-------|------|
| 1 | Shell (sidebar + header + splash) |
| 2 | **Reuniões** (semana + 3 seções + navegação ‹ ›) |
| 3 | Leitor de publicação + painel estudo |
| 4 | Biblioteca / download (modal idiomas + Baixados) |
| 5 | Estudo pessoal + export `.jwlibrary` |
| 6 | Bíblia + Início |

---

*Referência visual registrada em 2 de julho de 2026.*
