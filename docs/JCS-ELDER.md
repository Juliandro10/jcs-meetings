# JCS-ELDER — Área restrita (ancianos)

> **Status:** planejamento — **não implementar** até a parte comum do JCS Meetings estar fechada.  
> Documento de backlog de funções **somente da área bloqueada** (senha local).  
> Complementa [ESCOPO.md](./ESCOPO.md) (parte comum / preparação aberta).

---

## Estratégia em duas fases

| Fase | Nome | Escopo | Quando |
|------|------|--------|--------|
| **1** | **JCS Meetings (comum)** | Preparação de reuniões, publicações normais, Bíblia, lfb, notas, grifos, export `.jwlibrary`, assistente IA, pesquisa em conteúdo **público** jw.org | **Agora** — terminar e polir |
| **2** | **JCS-ELDER** | Área com **senha/PIN**, publicações **só ancião congregacional**, presidir, discursos, ferramentas abaixo | **Depois** — incrementar sobre o app estável |

A parte comum permanece **sempre acessível** (assistência, prep da semana, família). A parte ELDER desbloqueia com credencial local — não substitui o JW Library oficial; é uso pessoal no PC.

---

## Princípios (ELDER)

- **Separação de dados:** prep da reunião (`prep/`) vs dados elder (`elder/` ou namespace equivalente) — não misturar na UI aberta.
- **Catálogo duplo:** aba Biblioteca **Normal** (fase 1) vs **Ancião** (fase 2, bloqueada) — símbolos/issues restritos configuráveis.
- **Segurança local:** PIN/senha impede uso casual; arquivos no disco não são criptografia forte (suficiente para privacidade doméstica/congregacional leve).
- **Definição detalhada depois:** fluxo de desbloqueio, timeout, dois PINs etc. — a definir antes da implementação.

---

## Backlog de funções (JCS-ELDER)

Itens anotados conforme conversas de produto. Expandir esta lista antes de codar.

### Publicações e biblioteca

- [ ] Aba Biblioteca **Ancião** (bloqueada): download de publicações só para ancião congregacional (lista de símbolos a definir: ex. `s-38`, orientações, etc.).
- [ ] Manter aba **Normal** na área comum (sem senha).
- [ ] Leitor + prep (grifos/notas) também nas pubs elder, namespace separado.

### Presidir e discursos

- [ ] Modo **Presidir** reunião (meio de semana): notas, transições, comentários intro/final — *escopo a detalhar*.
- [ ] Modo **Discurso** / partes especiais — *escopo a detalhar*.
- [ ] *(Outras funções a acrescentar aqui.)*

### Editor de atas — reunião de anciãos

**Pedido registrado (jul/2026):** editor de texto integrado ao JCS, dedicado a atas de reunião de anciãos.

| Etapa | Comportamento |
|-------|----------------|
| **Importar pauta** | Importar documento com assuntos em pauta (formatos a definir: `.docx`, `.pdf`, `.txt`, ou modelo interno). |
| **Reunião ao vivo** | Durante a reunião de anciãos, anotar **decisões tomadas** por item da pauta (texto livre + estrutura por tópico). |
| **Exportar ATA** | Botão **Exportar como ATA** → gera documento formatado como ata daquela reunião (data, presentes se preenchido, pauta, decisões). |
| **Persistência** | Salvar rascunho local em `elder/atas/` (ou similar); histórico de atas por data. |

**A definir antes de implementar:**

- Formato de export (`.docx`, `.pdf`, `.odt`).
- Template visual da ATA (cabeçalho congregação, data, assinaturas opcionais).
- Se importação é one-shot por reunião ou vínculo editável pauta ↔ decisões.
- Se há campos fixos (Oração inicial, Aprovação da ata anterior, etc.).

### Longo prazo (fora do ELDER imediato)

- Tablet / SO minimalista — ver conversas de produto; **não** bloquear fase 1.

### Pregação (extensão JCS-ELDER)

A aba **Pregação** existe na parte comum (Kit de Ensino + brochura `lmd`). No **JCS-ELDER**, a **mesma seção** ganhará conteúdo adicional: **ideias para reuniões de saída de campo** (ancianos), sem substituir o material de pregação pública já disponível.

---

## Histórico de anotações

| Data | Nota |
|------|------|
| 2026-07-03 | Criado doc. Estratégia: fechar parte comum primeiro; ELDER incremental. Registrado editor de atas (import pauta → anotar decisões → export ATA). |
| 2026-07-03 | Aba **Pregação** no comum (Kit de Ensino + `lmd`). ELDER: mesma seção + ideias para reunião de saída de campo. |

---

## Referências

- [ESCOPO.md](./ESCOPO.md) — produto comum (fase 1)
- [PLANEJAMENTO.md](./PLANEJAMENTO.md) — detalhes técnicos
