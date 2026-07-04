# JCS-ELDER — Área restrita (ancianos)



> Documento de referência da área **Elder** no JCS Meetings.  

> **Regra:** o doc descreve o app como ele é — não o contrário. Atualizar aqui quando o comportamento mudar.  

> Complementa [ESCOPO.md](./ESCOPO.md) (parte comum / preparação aberta).



---



## Acesso e segurança



| Item | Comportamento atual |

|------|---------------------|

| Desbloqueio | PIN local (`prep/elder-auth.json`); sessão em memória até **Bloquear** ou reinício do app |

| Instalador | PIN opcional via `JCS_ELDER_PIN` no build → hash em `build/bundled-elder-auth.json` (sem texto plano no instalador) |

| IPC Elder | Handlers protegidos por `assertElderUnlocked()` |

| Dados | Namespace `elder/` em `%AppData%\JCS Meetings\` — separado de `prep/` |



---



## Hub Elder (atalhos)



Na aba **Elder** (desbloqueada), três atalhos:



| Atalho | Função |

|--------|--------|

| **Esboços** | Discursos públicos (S-34), celebração, assembleia — import `.jwpub`, rascunho editável, esboços preparados, proferimento, export `.doc`/`.pdf`, IA |

| **Orientações** | Publicações `s-*` / `ca-*` — leitor com referências |

| **Reuniões de anciãos** | Pauta, deliberações, geração e exportação de ATA |



---



## Reuniões de anciãos — implementado



Fluxo completo em **Elder → Reuniões de anciãos**.



### Lista



- Histórico por data (mais recente primeiro)

- **Nova reunião** cria registro com data de hoje e título automático

- Excluir reunião (confirmação)



### Editor da reunião



**Metadados:** data, congregação, presentes, **oração inicial**, **oração final**, título editável.

**Aba Pauta e deliberações**

| Ação | Detalhe |
|------|---------|
| **Importar pauta** | `.txt`, `.doc`, `.docx`, `.pdf` — extração de texto + **prévia editável** (assuntos, orações, reordenar) antes de confirmar (substituir ou adicionar) |
| **Colar pauta** | Textarea para texto copiado (WhatsApp, e-mail, PDF) — mesmo fluxo de prévia |
| **Parse em cascata** | Heurística (`mixed`, bullets, numeração, parágrafos, linhas) com pontuação; fallback **IA** (`OPENAI_API_KEY`) quando o parse automático é fraco |
| **Organizar com IA** | Na prévia, botão opcional para reprocessar com IA (`forceAi`) |
| **Parse inteligente** | Ignora cabeçalho “Pauta” e rodapé `-- N of M --`; reconhece `-` bullets, numeração, **Oração inicial/final**; junta linhas quebradas de PDF |
| **Adicionar item** | Item manual com título + editor rich text para deliberações |
| **Autosave** | Debounce ~600 ms → disco |

**Aba ATA**

| Ação | Detalhe |
|------|---------|
| **Criar ATA** | Template formal: título + data, bloco **Congregação / Data / Presentes**, orações, **PAUTA E DELIBERAÇÕES**, itens com título (`:`) e deliberação sempre abaixo |
| **Editar ATA** | Editor rich text — revisão final antes de arquivar |
| **Exportar .doc / .pdf** | `exportMeetingAtaDocument` — estilos tipográficos da ATA (Segoe UI / Calibri) |



**Template da ATA gerada:** título “ATA de reunião de anciãos” + data, bloco rotulado (congregação, data, presentes), orações, seção **PAUTA E DELIBERAÇÕES**, itens numerados (título com `:` + deliberação em bloco separado), rodapé de revisão.



### Persistência



- Arquivo: `%AppData%\JCS Meetings\elder\meetings.json`

- Estrutura: mapa `meetings[id]` com `items[]` (`id`, `title`, `notes`), `ataHtml`, timestamps



### IPC (renderer → main)



- `jcs:list-elder-meetings`

- `jcs:get-elder-meeting` / `jcs:create-elder-meeting` / `jcs:save-elder-meeting` / `jcs:delete-elder-meeting`

- `jcs:import-elder-meeting-pauta`

- `jcs:parse-elder-meeting-pauta-text` — `{ text, forceAi? }` — colar pauta ou reorganizar com IA na prévia

- `jcs:export-elder-meeting-ata`



---



## Esboços Elder — implementado



- Catálogo estático + import `.jwpub` (S-34, etc.)

- Rascunho de trabalho por documento + **esboços preparados** nomeados

- **Cartão de discurso** (por esboço preparado): orador, congregação, cântico → prévia → export `.html` com link direto ao cântico digital no JW Library

- Editor rich text, proferimento, export `.doc`/`.pdf`

- **Assistente IA** (`contentKind: elder-outline`): vê original + preparado; atalhos Comparar, Pontos faltando, Ilustrações, Revisar tribuna



---



## Orientações Elder — implementado



- Catálogo `s-*` / `ca-*` + import `.jwpub`

- Leitor com painel de referências (Bíblia / publicações)



---



## Backlog (não implementado)



### Publicações e biblioteca



- [ ] Aba Biblioteca **Ancião** dedicada na área comum (hoje: conteúdo elder só dentro do hub Elder)

- [ ] Grifos/notas em pubs elder com namespace próprio (orientações usam leitor; prep elder limitada a esboços)



### Presidir e discursos



- [ ] Modo **Presidir** reunião (meio de semana)

- [ ] Modo **Discurso** / partes especiais



### Atas — melhorias futuras



- [ ] Campos fixos opcionais (oração inicial, aprovação ata anterior, assinaturas)

- [x] Import `.pdf` de pauta (extração de texto; OCR não incluído)

- [ ] Template Word personalizável por congregação



### Pregação (extensão Elder)



- [ ] Ideias para reuniões de saída de campo na aba Pregação (comum hoje: Kit de Ensino + `lmd`)



---



## Histórico de anotações



| Data | Nota |

|------|------|

| 2026-07-03 | Criado doc. Estratégia fase comum + ELDER incremental. Registrado editor de atas (planejamento). |

| 2026-07-03 | Pregação comum + extensão Elder planejada. |

| 2026-07-04 | **Implementado:** hub Elder, PIN, esboços, orientações, IA esboços, **reuniões de anciãos (pauta + ATA + export)**. Doc reescrito para refletir o app. |

| 2026-07-04 | **Pauta:** parse em cascata + fallback IA, prévia editável, colar pauta, IPC `jcs:parse-elder-meeting-pauta-text`. |



---



## Referências



- [ESCOPO.md](./ESCOPO.md) — produto comum

- [PLANEJAMENTO.md](./PLANEJAMENTO.md) — detalhes técnicos

- Código: `electron/elder-meeting-store.ts`, `src/pages/ElderMeetingEditorPage.tsx`, `shared/elder-meeting-ata.ts`

