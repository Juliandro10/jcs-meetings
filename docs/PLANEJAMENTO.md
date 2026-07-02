# JW Prep — Planejamento do projeto

> Documento de referência para desenvolvimento.  
> **Stack escolhida:** Electron + React + TypeScript (Web).  
> **Pasta:** `C:\Stoll-Pr\jw-prep` (separada do PULSO).  
> **Status:** planejamento — código inicia na próxima sessão.

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

Hoje o fluxo manual já funciona com **Gemini + `.jwpub`**: o modelo busca respostas na matéria, na Bíblia e no jw.org, e monta comentários para a reunião completa. O app **automatiza e padroniza** esse fluxo e adiciona a **exportação para JW Library**.

---

## 3. Stack técnica

| Camada | Tecnologia |
|--------|------------|
| Shell desktop | **Electron** |
| UI | **React + TypeScript + Vite** |
| Estilo | **Tailwind CSS** |
| Parser de publicações | **`meeting-schedules-parser`** (JWPUB/EPUB, URL ou arquivo local) |
| Download oficial | API **`GETPUBMEDIALINKS`** (`b.jw-cdn.org`) |
| IA / síntese | **Google Gemini API** (mesma lógica do fluxo atual) |
| Busca complementar jw.org | Fase 2: WOL / busca jw.org (ex.: `jwlib`, wrappers WOL) |
| Export JW Library | **JSZip + sql.js** → arquivo `.jwlibrary` |

### Variáveis de ambiente

```env
GEMINI_API_KEY=...
# Fase 2+
# WOL / outras chaves se necessário
```

---

## 4. Publicações alvo (português BR)

| Código | Arquivo típico | Uso |
|--------|----------------|-----|
| `mwb` | `mwb_T_YYYYMM.jwpub` | Reunião Vida e Ministério (meio de semana) |
| `w` | `w_T_YYYYMM.jwpub` | Sentinela — Edição de Estudo (fim de semana) |

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
4. Síntese — Gemini monta resposta + comentários/aplicações citando fontes
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
jw-prep/
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

### Fase 1 — Fundação (primeira sessão de código)

- [ ] Scaffold Electron + Vite + React + TypeScript + Tailwind
- [ ] Tela: seleção de mês + botão “Baixar publicações”
- [ ] Integração `GETPUBMEDIALINKS` (mwb + w, lang `T`)
- [ ] Cache local em `%APPDATA%/jw-prep/cache/`
- [ ] Parser: listar semanas via `meeting-schedules-parser`
- [ ] UI: cards por semana (data, leitura bíblica, partes)

**Critério de pronto:** baixar abril/2026, ver semanas listadas na UI.

### Fase 2 — Geração de conteúdo

- [ ] Integração Gemini API (chave em `.env`)
- [ ] Extrair perguntas/campos do HTML da publicação
- [ ] Pipeline RAG: publicação → Bíblia → (stub WOL)
- [ ] UI de revisão editável por pergunta
- [ ] Indicador de fonte usada em cada resposta

**Critério de pronto:** gerar preparação completa de uma semana e revisar na tela.

### Fase 3 — Export JW Library

- [ ] Mapear perguntas → `LocationId` + `TextTag` (requer engenharia reversa / amostra de backup real)
- [ ] Gerar `userData.db` mínimo válido
- [ ] Empacotar `.jwlibrary` (JSZip + manifest + hash)
- [ ] Testar restore no JW Library Android
- [ ] Ajustes até campos aparecerem corretamente na apostila/Sentinela

**Critério de pronto:** importar backup no celular e ver respostas nos campos nativos.

### Fase 4 — Polimento

- [ ] Busca WOL/jw.org robusta para fallback
- [ ] Destaques automáticos (`UserMark`) nos trechos-chave
- [ ] Notas para comentários longos
- [ ] Build instalador Windows (electron-builder)
- [ ] Tratamento de erros, loading states, tema claro/escuro

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

1. Confirmar que a pasta `C:\Stoll-Pr\jw-prep` está ok.
2. `npm create` / scaffold Electron + Vite + React.
3. Implementar download `mwb_T_202604` + `w_T_202604` como teste.
4. Listar semanas na UI.
5. Opcional: usuário gera um `.jwlibrary` manual (1 campo preenchido) para calibrar Fase 3.

---

## 16. Decisões registradas

| Decisão | Escolha |
|---------|---------|
| Plataforma MVP | **Computador (Windows)** — Android depois, se necessário |
| Stack UI | **Electron / Web (React + TS + Vite)** |
| IA | **Gemini** (fluxo já validado pelo usuário) |
| Destino da preparação | **`.jwlibrary`**, não `.jwpub` modificado |
| Idioma inicial | **Português (T)** |
| Repositório | **`C:\Stoll-Pr\jw-prep`**, separado do PULSO |

---

*Última atualização: 1 de julho de 2026*
