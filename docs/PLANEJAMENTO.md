# JCS Meetings — Planejamento técnico

> Detalhes de implementação. **Escopo de produto:** [ESCOPO.md](./ESCOPO.md)  
> **Stack:** Electron + React + TypeScript + Vite + Tailwind  
> **Pasta:** `C:\Stoll-Pr\JCS meetings` (separada do PULSO).  
> **Status:** **MVP funcional em teste** — leitor, IA, lfb e prep local prontos; falta export `.jwlibrary`.

---

## Estado atual (julho 2026)

### Implementado e testável

| Área | Detalhe |
|------|---------|
| **Shell + Reuniões** | Electron, sidebar, lista de semanas, download `mwb`/`w` via jw.org |
| **Leitor de publicação** | HTML descriptografado, imagens (`jcs-media://`), links `jwpub://` |
| **Campos editáveis** | Persistência local (`prep-data.json`), auto-resize estilo JW Library |
| **Destaques** | Marca-texto manual + grifos no preparar automático (1 cor por parágrafo) |
| **Notas** | Painel lateral estilo JW, âncoras no texto, persistência local |
| **Painel Referências** | Bíblia NWT (lazy download), matérias `w`/`p`, **livro lfb** (histórias CBS) |
| **Assistente IA** | Chat no painel, regras JW, contexto da matéria e referências |
| **Preparar automático** | OpenAI **`gpt-4o`**: grifos, campos, joias (3× cap:vers + aplicação), notas por parte, EBC com 3 perguntas por história lfb |
| **Limpar preparação** | Remove grifos, notas e campos da matéria aberta |
| **Busca online** | Fallback WOL/jw.org quando Extract local falha |

### Arquivos principais

- `electron/auto-prep.ts`, `lfb-reader.ts`, `jw-link-resolver.ts`, `user-prep-store.ts`
- `src/pages/ReaderPage.tsx`, `PublicationReader.tsx`, `NotePanel.tsx`, `SidePanel.tsx`

### Ainda não feito — foco atual (export `.jwlibrary` em pausa)

**Meio de semana (prep automática)**
- [ ] Ajustar prompts: aprendizado pessoal por parte (tesouros, estudante, vida cristã, EBC) — tirar tom de tribuna (`JW_TRIBUNE_NOTE_RULES`)
- [ ] Nota/bloco final **“Pontos altos para colocar em prática”** por semana

**Sentinela (prep automática)**
- [ ] Grifar resposta de cada pergunta no parágrafo correspondente
- [ ] Campo editável: resposta **com suas palavras** + **resposta adicional** (destaque, aplicação ou texto citado)
- [ ] Perguntas de revisão: respostas com **nº do(s) parágrafo(s)**
- [ ] **Sem** resumo no início nem no final do artigo

**Discurso público (UI)**
- [ ] Seção **Discurso público** na `MeetingsPage` (entre VM e Sentinela)
- [ ] Atalho **Anotações** → editor de texto por semana (persistência local)
- [ ] Export **.doc** e **.pdf** (só JCS; não entra no `.jwlibrary`)

### Depois (fora do foco imediato)

- [ ] Export/import `.jwlibrary` + restore JW Library mobile
- [ ] Modos presidente / dirigente / discurso → **JCS-ELDER**
- [ ] `userData.db` schema v14 (hoje: `prep-data.json`)
- [ ] Instalador Windows, tema escuro, polish geral

---

## Próximos passos (ordem acordada)

### 1. Foco atual — prep + discurso público (jul 2026)

*Export `.jwlibrary` **pausado**.*

1. **Prompts meio de semana** — aprendizado pessoal + nota “Pontos altos para prática”.
2. **Prompts Sentinela** — grifos, respostas parafraseadas (principal + adicional), revisão c/ parágrafo; sem resumo início/fim.
3. **UI Discurso público** — seção na tela Reuniões, editor Anotações, export doc/pdf.

Testar na semana **29 jun–5 jul 2026** após cada bloco.

### 2. Depois — export JW Library (quando retomar)

- Export/import `.jwlibrary`; restore no mobile.

### 3. JCS-ELDER (pós-comum)

- Modos tribuna, pubs ancião, atas — ver [JCS-ELDER.md](./JCS-ELDER.md).

### 4. Polish P2

- Bíblia completa, Início, busca, instalador, tema escuro.

---

## 1. Objetivo

Aplicativo de **preparação automática de reuniões** para uso com o **JW Library**:

1. Baixar publicações (`.jwpub`) **diretamente do jw.org**, sem copiar arquivos manualmente.
2. Extrair perguntas e estrutura da reunião (apostila + Sentinela).
3. Gerar **respostas**, **comentários adicionais** e **aplicações** com base em:
   - a própria publicação da semana;
   - a Bíblia (Tradução do Novo Mundo);
   - conteúdo complementar do **site oficial jw.org / WOL**, quando a matéria não cobrir.
4. Permitir **revisão e edição** antes de exportar.
5. Exportar um arquivo **`.jwlibrary`** importável no JW Library, com campos preenchidos, destaques e notas — reunião já preparada dentro do app.

### O que NÃO fazemos

- **Não** editamos o `.jwpub` para embutir respostas (JW Library não trata isso como preparação nativa).
- **Não** substituímos o estudo pessoal consciente — o app acelera a pesquisa; revisão humana é esperada.

---

## 2. Contexto validado pelo usuário

Hoje o fluxo manual já funciona com **Gemini + `.jwpub`**. No app, a **preparação automática e resumos** usam **OpenAI** (API já disponível). O JCS Meetings **replica o JW Library** para preparação manual e adiciona IA + modos presidente/dirigente/discurso.

---

## 3. Stack técnica

| Camada | Tecnologia |
|--------|------------|
| Shell desktop | **Electron** |
| UI | **React + TypeScript + Vite** |
| Estilo | **Tailwind CSS** |
| Parser de publicações | **`meeting-schedules-parser`** (JWPUB/EPUB, URL ou arquivo local) |
| Download oficial | API **`GETPUBMEDIALINKS`** (`b.jw-cdn.org`) |
| IA (preparar, resumo, modos) | **OpenAI API** (`gpt-4o` no preparar automático; assistente `gpt-4o-mini`) |
| Busca complementar jw.org | WOL / busca jw.org (Fase 2+) |
| Dados locais | **`userData.db`** (schema JW Library v14) em `%APPDATA%/JCS meetings/` |
| Export mobile | **JSZip + sql.js** → `.jwlibrary` |

### Variáveis de ambiente

```env
OPENAI_API_KEY=...
# Opcional: modelo do preparar automático (padrão gpt-4o)
OPENAI_AUTO_PREP_MODEL=gpt-4o
```

---

## 4. Publicações alvo (português BR)

| Código | Arquivo típico | Uso |
|--------|----------------|-----|
| `mwb` | `mwb_T_YYYYMM.jwpub` | Reunião Vida e Ministério (meio de semana) |
| `w` | `w_T_YYYYMM.jwpub` | Sentinela — Edição de Estudo (fim de semana) |
| `lfb` | `lfb_T_.jwpub` | Lições que Você Pode Aprender da Bíblia (estudo de congregação) |
| `nwt` | `nwt_T_.jwpub` | Tradução do Novo Mundo (referências bíblicas) |

- **`T`** = idioma português (Brasil), conforme convenção JW.
- **`YYYYMM`** = ano + mês da edição (ex.: `202604` = abril/2026).

---

## 5. Download automático do jw.org

Mesma API usada pelo JW Library e por apps como Organized:

```
GET https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS
  ?pub=mwb|w
  &issue=YYYYMM
  &fileformat=JWPUB
  &langwritten=T
  &txtCMSLang=T
  &output=json
  &alllangs=0
```

Resposta JSON → URL de download do `.jwpub`.

### Catálogo (listagem de publicações disponíveis)

```
https://app.jw-cdn.org/catalogs/publications/v4/manifest.json
https://app.jw-cdn.org/catalogs/publications/v4/{id}/catalog.db.gz
```

**Boas práticas:** cache local dos `.jwpub` baixados; retry com backoff; não sobrecarregar servidores.

---

## 6. Formato `.jwpub` (leitura)

- Arquivo ZIP externo → `manifest.json` + `contents` (ZIP interno).
- Dentro: SQLite (`.db`), imagens, textos.
- Campo `Content` nas tabelas `Document` etc.: **AES-128-CBC + Zlib Deflate** (algoritmo mapeado pela comunidade; o `meeting-schedules-parser` já implementa).
- **Leitura:** usar biblioteca existente; não reinventar descriptografia no MVP.

---

## 7. Formato `.jwlibrary` (escrita — destino da preparação)

Backup de dados do usuário do JW Library:

- ZIP (DEFLATE) contendo:
  - `manifest.json` — metadados + **SHA-256** do `userData.db`
  - `userData.db` — SQLite schema v14

### Tabelas relevantes para preparação

| Tabela | Função |
|--------|--------|
| `InputField` | Respostas nos campos editáveis da apostila/Sentinela |
| `UserMark` + `BlockRange` | Destaques no texto |
| `Note` | Notas / comentários adicionais |
| `Location` | Referência à publicação + posição no documento |
| `Tag` / `TagMap` | Tags opcionais |

Chave composta típica de campo editável: **`LocationId` + `TextTag`**.

**Referências de implementação:** JWLManager, jw-notes-sync, jwl-backup-merger, scripts `jwlibrary_unzip` / `jwlibrary_zip` (bibelo.info).

**Requisitos Android (JW Library):** `PRAGMA user_version = 14`, ZIP DEFLATE, hash correto no manifest, indexes/triggers do schema.

---

## 8. Motor de respostas (RAG)

Ordem de prioridade das fontes:

```
1. Publicação da semana (mwb / w) — parágrafos, quadros, perguntas adjacentes
2. Versículos citados — Bíblia NWT (jwpub nwt ou WOL)
3. Fallback — busca WOL / jw.org (artigos, estudos, brochuras relacionadas)
4. Síntese — OpenAI monta resposta + comentários/aplicações citando fontes
```

### Prompt (diretrizes)

- Responder com base **apenas** nas fontes recuperadas.
- Indicar origem (parágrafo, publicação, versículo).
- Comentários adicionais e aplicações: derivados do jw.org quando não estiverem na matéria.
- Tom adequado à reunião; respostas concisas para partes de 30 s / 4 min etc., quando aplicável.

### Validação humana

Tela de revisão semana a semana, pergunta a pergunta, antes de exportar.

---

## 9. Fluxo do usuário (UX)

```
┌─────────────────────────────────────────────────────────────┐
│  1. Abrir app → escolher mês/edição (ex.: abril/2026)       │
│  2. App baixa mwb_T + w_T do jw.org (com cache)             │
│  3. Lista semanas e partes da reunião                       │
│  4. [Gerar preparação] → Gemini + fontes locais/jw.org      │
│  5. Revisar / editar respostas e comentários                │
│  6. [Exportar .jwlibrary]                                   │
│  7. No celular: JW Library → restaurar backup               │
│  8. Abrir Reuniões → matéria já preparada                   │
└─────────────────────────────────────────────────────────────┘
```

**Nota:** o `.jwpub` também precisa estar instalado no JW Library (download normal ou importação). O `.jwlibrary` só leva os **dados pessoais** (campos, destaques, notas).

---

## 10. Arquitetura do app

```
jcs-meetings/
├── electron/
│   ├── main.ts              # janela, IPC, fs, download
│   └── preload.ts           # bridge seguro renderer ↔ main
├── src/
│   ├── App.tsx
│   ├── pages/
│   │   ├── Home.tsx         # seleção mês / download
│   │   ├── WeekDetail.tsx   # semana + perguntas
│   │   └── Review.tsx       # revisão antes export
│   ├── lib/
│   │   ├── jw-download.ts   # GETPUBMEDIALINKS
│   │   ├── jw-parse.ts      # meeting-schedules-parser
│   │   ├── gemini.ts        # geração de respostas
│   │   ├── jw-search.ts     # WOL / jw.org (fase 2)
│   │   └── jwlibrary-export.ts
│   └── components/
├── docs/
│   └── PLANEJAMENTO.md      # este arquivo
├── package.json
├── vite.config.ts
├── electron-builder config    # build Windows (.exe)
└── .env.example
```

### IPC Electron (main ↔ renderer)

| Canal | Responsabilidade |
|-------|------------------|
| `download-jwpub` | Baixar e cachear `.jwpub` |
| `parse-jwpub` | Extrair cronograma / HTML |
| `generate-prep` | Chamar Gemini (API key só no main) |
| `export-jwlibrary` | Gerar arquivo final |
| `open-export-folder` | Abrir pasta do export |

---

## 11. Fases de desenvolvimento

### Fase 1 — Fundação ✅

- [x] Scaffold Electron + Vite + React + TypeScript + Tailwind
- [x] Download `GETPUBMEDIALINKS` (mwb + w, lang `T`)
- [x] Cache local em `%APPDATA%/JCS meetings/cache/`
- [x] Parser: semanas via `meeting-schedules-parser`
- [x] UI: cards por semana

### Fase 2 — Leitor + preparação manual ✅

- [x] Leitor HTML `.jwpub` + imagens + links
- [x] Campos editáveis persistentes + auto-resize
- [x] Destaques e notas ancoradas
- [x] Painel referências (NWT, matérias, **lfb**)
- [x] Assistente IA (OpenAI)

### Fase 3 — Preparar automático ✅ (em teste)

- [x] OpenAI **`gpt-4o`** no preparar automático
- [x] Joias, grifos, notas por parte, EBC (lfb + 3 perguntas)
- [x] Limpar preparação

### Fase 4 — Export JW Library ⏳ **próximo**

- [ ] Mapear `InputField` / `UserMark` / notas → schema v14
- [ ] Gerar `userData.db` + empacotar `.jwlibrary`
- [ ] **Primeiro teste:** restaurar no JW Library mobile (Android)

### Fase 5 — Dois modos IA + acesso família (pós-MVP)

- [ ] Modo **Assistência** (filha → esposa)
- [ ] Modo **Tribuna** com bloqueio local — **só você**; não distribuir publicamente

### Fase 6 — Polimento

- [ ] Modos presidente / dirigente / discurso
- [ ] Instalador Windows, tema escuro, polish

---

## 12. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| API jw.org não documentada / muda | Cache agressivo; testes periódicos; fallback importar `.jwpub` manual |
| Mapeamento `InputField` frágil | Capturar backup `.jwlibrary` real após preenchimento manual de 1 semana; usar como template |
| Respostas incorretas da IA | Revisão obrigatória na UI; citar fontes; prompt restritivo |
| Schema `userData.db` v14 complexo | Copiar triggers/indexes de backup legítimo vazio ou gerado pelo app |
| Publicação não instalada no JW Library | Aviso na UI: importar `.jwpub` antes de restaurar `.jwlibrary` |

---

## 13. Dependências npm (previstas)

```json
{
  "dependencies": {
    "meeting-schedules-parser": "latest",
    "jszip": "^3",
    "sql.js": "^1",
    "@google/generative-ai": "^0",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "electron": "latest",
    "vite": "latest",
    "@vitejs/plugin-react": "latest",
    "typescript": "latest",
    "tailwindcss": "latest",
    "electron-builder": "latest"
  }
}
```

Versões exatas a fixar no `package.json` na Fase 1.

---

## 14. Material de referência

- [meeting-schedules-parser](https://github.com/sws2apps/meeting-schedules-parser) — parser MWB/W JWPUB/EPUB
- [organized-app](https://github.com/sws2apps/organized-app) — fetch automático jw.org
- [jw-notes-sync](https://github.com/DipandaAser/jw-notes-sync) — formato `.jwlibrary` / schema v14
- [JWLManager](https://github.com/erykjj/jwlmanager) — edição de backups
- [jwlib](https://pypi.org/project/jwlib/) — busca jw.org (referência; portar ou chamar via sidecar se necessário)
- [wol-mcp-server](https://github.com/LeomaiaJr/wol-mcp-server) — busca WOL (referência fase 2)
- Ajuda JW Library: backup `.jwlibrary` — Estudo Pessoal → Backup e Restauração

---

## 15. Próxima sessão (checklist)

1. **Teste manual** da semana 29 jun–5 jul (preparar automático + lfb + notas).
2. **Implementar export `.jwlibrary`** e testar restore no JW Library mobile.
3. Calibrar mapeamento com backup manual de referência (se necessário).
4. **Depois do MVP fechado:** separar Modo Assistência vs Modo Tribuna com bloqueio local (só família).

---

## 16. Decisões registradas

| Decisão | Escolha |
|---------|---------|
| Plataforma MVP | **Computador (Windows)** — Android via JW Library restore |
| Stack UI | **Electron / Web (React + TS + Vite)** |
| IA preparar automático | **OpenAI `gpt-4o`** (assistência chat: `gpt-4o-mini`) |
| Destino da preparação | **`.jwlibrary`**, não `.jwpub` modificado |
| Idioma inicial | **Português (T)** |
| Nome do projeto | **JCS Meetings** |
| Repositório | **`C:\Stoll-Pr\JCS meetings`**, separado do PULSO |
| Pós-MVP: dois modos IA | **Assistência** (família) vs **Tribuna** (só você; bloqueio local) |
| Tribuna | **Não** disponibilizar publicamente — só você e família autorizada |
| Rollout família | Filha → esposa (fases); tribuna permanece restrita |

---

*Última atualização: 2 de julho de 2026*
