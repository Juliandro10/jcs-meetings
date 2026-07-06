/** Conteúdo curado — Verdades que amamos ensinar (lmd). Atualizar quando publicações mudarem. */
export const PREACHING_TRUTH_PRESENTATIONS_VERSION = 1;

export type PreachingPresentationFollowUp =
  | { kind: 'tract'; pub: string; label: string }
  | { kind: 'lff'; lesson: number; label: string };

export type PreachingTruthPresentation = {
  id: string;
  title: string;
  opening: string;
  scriptureRef: string;
  readWithResident: string;
  bridge: string;
  followUp: PreachingPresentationFollowUp;
};

/** Chave = número do assunto (1–9) na brochura Ame as Pessoas — Faça Discípulos. */
export const PREACHING_TRUTH_PRESENTATIONS: Record<number, PreachingTruthPresentation[]> = {
  1: [
    {
      id: '1-a',
      title: 'Sinais claros nos noticiários',
      opening:
        'Muitas pessoas comentam que o mundo parece cada vez mais instável. A Bíblia descreveu de antemão certos acontecimentos e atitudes que indicariam que uma mudança global está próxima — não para piorar tudo, mas para trazer alívio.',
      scriptureRef: 'Mateus 24:7, 8',
      readWithResident:
        'Leia os versículos 7 e 8 e pergunte: “Você acha que hoje vemos guerras, falta de alimento e problemas semelhantes com frequência?”',
      bridge:
        'O folheto sobre o Reino de Deus explica de forma simples o que a Bíblia diz sobre o futuro da humanidade e por que esses sinais são motivo de esperança, não de medo.',
      followUp: { kind: 'tract', pub: 'T-kng', label: 'Folheto Reino de Deus' },
    },
    {
      id: '1-b',
      title: 'Quando o amor esfria',
      opening:
        'Talvez você já tenha percebido que muita gente está estressada, egoísta ou sem paciência. Isso afeta famílias, vizinhos e até estranhos. A Bíblia alertou que, nos últimos dias, o amor ao próximo esfriaria — um sinal de que estamos num tempo especial.',
      scriptureRef: '2 Timóteo 3:1-5',
      readWithResident:
        'Leia os versículos 1 a 5 e comente um ou dois traços que a pessoa reconhece na sociedade hoje. Evite tom de julgamento; foque em “a Bíblia descreveu isso”.',
      bridge:
        'Este folheto mostra como acreditar em um futuro melhor ainda faz sentido hoje, com base na Bíblia — não em promessas políticas ou esportivas que mudam a cada semana.',
      followUp: { kind: 'tract', pub: 'T-ftr', label: 'Folheto Futuro' },
    },
    {
      id: '1-c',
      title: 'Esperança que não envelhece',
      opening:
        'Quando vemos notícias difíceis, é normal pensar: “Será que vai continuar assim para sempre?” A Bíblia mostra que Deus não ficou indiferente — ele já governa por meio do Reino, e em breve veremos mudanças concretas na Terra.',
      scriptureRef: 'Lucas 21:10, 11',
      readWithResident:
        'Leia os versículos 10 e 11. Pergunte: “Você acha que a Bíblia realmente previu o tipo de mundo em que vivemos?”',
      bridge:
        'No curso bíblico Seja Feliz para Sempre!, a lição 32 explica como sabemos que o Reino de Deus já está governando e o que isso significa para nós.',
      followUp: { kind: 'lff', lesson: 32, label: 'Lição 32 — O Reino de Deus já está governando!' },
    },
  ],
  2: [
    {
      id: '2-a',
      title: 'A Terra foi feita para durar',
      opening:
        'Alguns filmes e teorias dão a impressão de que a Terra será destruída num apocalipse. Mas a Bíblia ensina o contrário: nosso planeta foi criado para ser habitado para sempre por humanos obedientes.',
      scriptureRef: 'Salmo 104:5',
      readWithResident:
        'Leia o versículo 5. Pergunte: “Faz sentido para você que o Criador fez a Terra para permanecer, e não para acabar?”',
      bridge:
        'O folheto Futuro apresenta de forma clara o que a Bíblia diz sobre o futuro da Terra e da humanidade — sem linguagem complicada.',
      followUp: { kind: 'tract', pub: 'T-ftr', label: 'Folheto Futuro' },
    },
    {
      id: '2-b',
      title: 'Gerações passam, a Terra fica',
      opening:
        'Vemos gerações inteiras nascerem e morrerem, mas o planeta continua. Esse padrão confirma o que a Bíblia diz: a Terra permanece, enquanto a humanidade recebe a chance de conhecer o propósito do Criador.',
      scriptureRef: 'Eclesiastes 1:4',
      readWithResident:
        'Leia o versículo 4. Comente como isso combina com o que observamos: muitas pessoas vêm e vão, mas continuamos aqui.',
      bridge:
        'Este folheto sobre o Reino de Deus explica quem vai viver para sempre na Terra e como esse futuro está ligado ao governo de Deus.',
      followUp: { kind: 'tract', pub: 'T-kng', label: 'Folheto Reino de Deus' },
    },
    {
      id: '2-c',
      title: 'O que o Reino fará pela Terra',
      opening:
        'Deus prometeu não apenas preservar a Terra, mas transformá-la num lar seguro. Isso inclui acabar com o que causa destruição e sofrimento — algo que nenhum governo humano conseguiu fazer.',
      scriptureRef: 'Salmo 37:29',
      readWithResident:
        'Leia o versículo 29. Pergunte: “Você gostaria de viver numa Terra onde os justos permanecem para sempre?”',
      bridge:
        'A lição 33 do curso Seja Feliz para Sempre! detalha o que o Reino de Deus vai realizar — inclusive para a Terra e para nós.',
      followUp: { kind: 'lff', lesson: 33, label: 'Lição 33 — O que o Reino de Deus vai fazer?' },
    },
  ],
  3: [
    {
      id: '3-a',
      title: 'Um planeta que floresce de novo',
      opening:
        'Muita gente se preocupa com poluição, desmatamento e clima. A Bíblia descreve um tempo em que a Terra será restaurada — campos produtivos, segurança e paz, como um jardim bem cuidado.',
      scriptureRef: 'Isaías 35:1, 2',
      readWithResident:
        'Leia os versículos 1 e 2. Pergunte: “Você acha possível um futuro em que a Terra seja transformada para melhor, e não destruída?”',
      bridge:
        'O folheto Futuro resume o que a Bíblia promete para o meio ambiente e para quem vive na Terra.',
      followUp: { kind: 'tract', pub: 'T-ftr', label: 'Folheto Futuro' },
    },
    {
      id: '3-b',
      title: 'Deus valoriza a sua criação',
      opening:
        'Quando vemos estragos na natureza, podemos pensar que Deus não se importa. Mas a Bíblia diz que ele vai “arruinar os arruinadores da terra” — ou seja, quem causa destruição não vencerá no final.',
      scriptureRef: 'Apocalipse 11:18',
      readWithResident:
        'Leia o versículo 18, focando na parte sobre arruinar os que arruínam a terra. Pergunte o que a pessoa acha dessa perspectiva.',
      bridge:
        'A brochura Ame as Pessoas — Faça Discípulos reúne verdades bíblicas atuais sobre o futuro da Terra; este assunto está logo no início da seção que estamos considerando.',
      followUp: { kind: 'tract', pub: 'T-kng', label: 'Folheto Reino de Deus' },
    },
    {
      id: '3-c',
      title: 'Paraíso em toda a Terra',
      opening:
        'A ideia de paraíso não precisa ser apenas simbólica. A Bíblia fala de condições reais: segurança, saúde e um meio ambiente equilibrado em escala global.',
      scriptureRef: 'Isaías 65:21-23',
      readWithResident:
        'Leia os versículos 21 a 23. Comente como seria construir, plantar e viver sem medo constante.',
      bridge:
        'A lição 33 do Seja Feliz para Sempre! explica o que o Reino fará — incluindo transformar a Terra num lugar agradável para sempre.',
      followUp: { kind: 'lff', lesson: 33, label: 'Lição 33 — O que o Reino de Deus vai fazer?' },
    },
  ],
  4: [
    {
      id: '4-a',
      title: 'Quando a doença não vence',
      opening:
        'Quase todos conhecemos alguém que sofre com problemas de saúde. A Bíblia promete um tempo em que ninguém dirá “Estou doente” — um futuro real, não apenas espiritualizado.',
      scriptureRef: 'Isaías 33:24',
      readWithResident:
        'Leia o versículo 24. Pergunte: “Como seria viver num mundo onde a doença deixa de dominar a vida das pessoas?”',
      bridge:
        'O folheto sobre a Morte aborda por que morremos hoje e o que a Bíblia promete em relação à saúde e à vida no futuro.',
      followUp: { kind: 'tract', pub: 'T-dth', label: 'Folheto Morte' },
    },
    {
      id: '4-b',
      title: 'Jesus deu uma amostra',
      opening:
        'Na Terra, Jesus curou pessoas cegas, mancas e doentes. Isso não foi apenas para chamar atenção — mostrou o que o Reino de Deus fará em escala mundial.',
      scriptureRef: 'Isaías 35:5, 6',
      readWithResident:
        'Leia os versículos 5 e 6. Relacione com os milagres de Jesus e pergunte se faz sentido que Deus repita isso para todos.',
      bridge:
        'O folheto Jesus explica quem ele é e por que podemos confiar nas promessas que ele fez sobre o futuro.',
      followUp: { kind: 'tract', pub: 'T-jss', label: 'Folheto Jesus' },
    },
    {
      id: '4-c',
      title: 'Reencontros que aquecem o coração',
      opening:
        'A promessa de saúde perfeita fica ainda mais tocante quando pensamos em quem perdemos. A Bíblia fala da ressurreição — voltar a ver entes queridos, saudáveis.',
      scriptureRef: 'João 5:28, 29',
      readWithResident:
        'Leia os versículos 28 e 29. Se a pessoa mencionar alguém que morreu, ouça com empatia antes de explicar a esperança.',
      bridge:
        'A lição 30 do Seja Feliz para Sempre! responde à pergunta: “As pessoas que você ama podem voltar a viver?”',
      followUp: { kind: 'lff', lesson: 30, label: 'Lição 30 — As pessoas que você ama podem voltar a viver!' },
    },
  ],
  5: [
    {
      id: '5-a',
      title: 'Morar para sempre aqui',
      opening:
        'Muita gente associa vida eterna a um lugar distante. Mas a Bíblia promete vida eterna na Terra — o lar que conhecemos, transformado, para quem faz a vontade de Deus.',
      scriptureRef: 'Salmo 37:29',
      readWithResident:
        'Leia o versículo 29. Pergunte: “Você preferiria viver para sempre no céu invisível ou numa Terra em paz?” — deixe a Bíblia responder.',
      bridge:
        'O folheto Futuro apresenta de forma direta o que a Bíblia ensina sobre vida eterna na Terra.',
      followUp: { kind: 'tract', pub: 'T-ftr', label: 'Folheto Futuro' },
    },
    {
      id: '5-b',
      title: 'Uma herança que vale a pena',
      opening:
        'Jesus prometeu que os mansos herdarão a terra. Isso combina com o restante da Bíblia: humanos obedientes continuarão vivendo aqui, sob o Reino de Deus.',
      scriptureRef: 'Mateus 5:5',
      readWithResident:
        'Leia o versículo 5. Explique brevemente que “mansos” são pessoas que tratam os outros com respeito e aceitam a orientação de Deus.',
      bridge:
        'Este folheto sobre o Reino de Deus ajuda a ligar essa promessa ao governo que Deus usa para cumprir seu propósito.',
      followUp: { kind: 'tract', pub: 'T-kng', label: 'Folheto Reino de Deus' },
    },
    {
      id: '5-c',
      title: 'Para que fomos criados',
      opening:
        'Viver para sempre não seria desejável se a vida não tivesse propósito. A Bíblia mostra que Deus quer que desfrutemos a vida eternamente, trabalhando e aprendendo com sentido.',
      scriptureRef: 'Salmo 37:11',
      readWithResident:
        'Leia o versículo 11 junto com o 29, se houver tempo. Destaque paz, segurança e vida plena.',
      bridge:
        'A lição 25 do Seja Feliz para Sempre! explica qual é o objetivo de Deus para nós — a base para entender a vida eterna.',
      followUp: { kind: 'lff', lesson: 25, label: 'Lição 25 — Qual é o objetivo de Deus para nós?' },
    },
  ],
  6: [
    {
      id: '6-a',
      title: 'Amor prático no casamento',
      opening:
        'Casamentos fortes não dependem só de romance. A Bíblia pede ao marido que ame a esposa como a si mesmo — ou seja, cuide dos sentimentos e necessidades dela no dia a dia.',
      scriptureRef: 'Efésios 5:33',
      readWithResident:
        'Leia o versículo 33, primeira parte. Pergunte: “Como seria se todo marido aplicasse isso de forma consistente?”',
      bridge:
        'O folheto Família mostra princípios bíblicos simples que ajudam maridos e esposas a se tratar com respeito.',
      followUp: { kind: 'tract', pub: 'T-fam', label: 'Folheto Família' },
    },
    {
      id: '6-b',
      title: 'Gentileza que fortalece',
      opening:
        'Pequenas atitudes — ouvir, ajudar, ser paciente — refletem o tipo de amor que a Bíblia descreve. Não é fraqueza; é força orientada por princípios.',
      scriptureRef: 'Colossenses 3:19',
      readWithResident:
        'Leia o versículo 19. Comente que “tornar-se amargo” destrói famílias, e o oposto traz paz.',
      bridge:
        'Deixe o folheto Jesus: ele ajuda a ver como o exemplo de Cristo pode melhorar relacionamentos, inclusive no casamento.',
      followUp: { kind: 'tract', pub: 'T-jss', label: 'Folheto Jesus' },
    },
    {
      id: '6-c',
      title: 'Família feliz — começo no casal',
      opening:
        'Quando marido e esposa cooperam, os filhos percebem. A Bíblia liga a felicidade familiar ao amor e respeito mútuo entre o casal.',
      scriptureRef: '1 Pedro 3:7',
      readWithResident:
        'Leia o versículo 7. Destaque honrar a esposa e viver com entendimento.',
      bridge:
        'A lição 49 do Seja Feliz para Sempre! — “Como ter uma família feliz? (Parte 1)” — aprofunda esses princípios de forma prática.',
      followUp: { kind: 'lff', lesson: 49, label: 'Lição 49 — Como ter uma família feliz? — Parte 1' },
    },
  ],
  7: [
    {
      id: '7-a',
      title: 'Respeito que nutre o amor',
      opening:
        'A Bíblia fala de amor do marido e de profundo respeito da esposa — duas atitudes que se complementam. Respeito não é medo; é valorizar a liderança amorosa que Deus designou.',
      scriptureRef: 'Efésios 5:33',
      readWithResident:
        'Leia o versículo 33, segunda parte. Pergunte como o clima em casa mudaria se ambos aplicasse sua parte.',
      bridge:
        'O folheto Família resume orientações bíblicas atuais para casamento e criação de filhos.',
      followUp: { kind: 'tract', pub: 'T-fam', label: 'Folheto Família' },
    },
    {
      id: '7-b',
      title: 'Cooperação, não competição',
      opening:
        'Quando marido e esposa competem por controle, todos perdem. A Bíblia descreve um arranjo em que cada um contribui com qualidades diferentes para a união.',
      scriptureRef: 'Colossenses 3:18',
      readWithResident:
        'Leia o versículo 18 junto com o 19, se couber. Enfatize que ambos têm responsabilidades — não só um lado.',
      bridge:
        'Este folheto sobre Deus ajuda a ver por que seguir a orientação do Criador traz benefícios concretos à família.',
      followUp: { kind: 'tract', pub: 'T-god', label: 'Folheto Deus' },
    },
    {
      id: '7-c',
      title: 'Construindo o lar juntos',
      opening:
        'Famílias felizes não acontecem por acaso. Precisam de comunicação, perdão e papéis bem definidos — princípios que a Bíblia detalha para nosso tempo.',
      scriptureRef: 'Efésios 5:28',
      readWithResident:
        'Leia o versículo 28. Mostre que amar a esposa “como ao próprio corpo” é cuidado prático.',
      bridge:
        'A lição 50 do Seja Feliz para Sempre! continua o tema da família feliz, com foco em aplicar a Palavra de Deus.',
      followUp: { kind: 'lff', lesson: 50, label: 'Lição 50 — Como ter uma família feliz? — Parte 2' },
    },
  ],
  8: [
    {
      id: '8-a',
      title: 'Lealdade que protege o casamento',
      opening:
        'Infidelidade destrói confiança. A Bíblia condena o adultério e valoriza casamentos leais — um homem e uma mulher que honram o pacto matrimonial.',
      scriptureRef: 'Hebreus 13:4',
      readWithResident:
        'Leia o versículo 4. Comente que Deus aprova o leito marital fiel e desaprova a infidelidade.',
      bridge:
        'O folheto Família aborda princípios que ajudam casais a fortalecer a lealdade mútua.',
      followUp: { kind: 'tract', pub: 'T-fam', label: 'Folheto Família' },
    },
    {
      id: '8-b',
      title: 'Casamento segundo o Criador',
      opening:
        'Jesus confirmou o padrão original: homem e mulher se tornam “uma só carne”. Isso implica exclusividade e compromisso — valores que protegem a família.',
      scriptureRef: 'Mateus 19:4-6',
      readWithResident:
        'Leia os versículos 4 a 6. Pergunte o que a pessoa acha do padrão definido pelo Criador.',
      bridge:
        'O folheto Religião explica por que nem todo ensino religioso está alinhado com a Bíblia — útil quando tradições humanas minam a lealdade.',
      followUp: { kind: 'tract', pub: 'T-rlg', label: 'Folheto Religião' },
    },
    {
      id: '8-c',
      title: 'Decisões sábias sobre casamento',
      opening:
        'Antes e durante o casamento, escolhas afetam a lealdade. A Bíblia oferece orientação clara sobre relacionamento, casamento e solteirice.',
      scriptureRef: 'Malaquias 2:16',
      readWithResident:
        'Leia o versículo 16. Destaque que Deus odeia traição no casamento — proteção, não opressão.',
      bridge:
        'A lição 42 do Seja Feliz para Sempre! responde: “O que a Bíblia diz sobre se casar e ficar solteiro?” — ideal para aprofundar.',
      followUp: { kind: 'lff', lesson: 42, label: 'Lição 42 — O que a Bíblia diz sobre se casar e ficar solteiro?' },
    },
  ],
  9: [
    {
      id: '9-a',
      title: 'Filhos que ouvem conseguem mais',
      opening:
        'Pais se preocupam com o futuro dos filhos. A Bíblia mostra que crianças e jovens que aceitam orientação sábia dos pais evitam muitos caminhos perigosos.',
      scriptureRef: 'Provérbios 1:8, 9',
      readWithResident:
        'Leia os versículos 8 e 9. Pergunte se a pessoa teve conselhos de pais ou responsáveis que a ajudaram.',
      bridge:
        'O folheto Família reúne princípios práticos para pais e filhos — linguagem atual e direta.',
      followUp: { kind: 'tract', pub: 'T-fam', label: 'Folheto Família' },
    },
    {
      id: '9-b',
      title: 'Obediência com benefício',
      opening:
        'Obediência não significa cegueira — significa confiar em quem nos ama. A Bíblia promete que filhos que honram pai e mãe colhem benefícios duradouros.',
      scriptureRef: 'Efésios 6:1-3',
      readWithResident:
        'Leia os versículos 1 a 3. Destaque que a promessa de “vida longa” aponta para bem-estar geral.',
      bridge:
        'O folheto Futuro ajuda jovens e pais a ver por que vale a pena aprender princípios bíblicos cedo — o futuro deles está ligado às escolhas de hoje.',
      followUp: { kind: 'tract', pub: 'T-ftr', label: 'Folheto Futuro' },
    },
    {
      id: '9-c',
      title: 'Família unida aprende junto',
      opening:
        'Quando pais e filhos estudam a Bíblia juntos, todos crescem. Deus valoriza famílias que aprendem e aplicam sua Palavra.',
      scriptureRef: 'Deuteronômio 6:6, 7',
      readWithResident:
        'Leia os versículos 6 e 7. Comente como instruir os filhos “de modo persistente” pode ser feito hoje.',
      bridge:
        'A lição 49 do Seja Feliz para Sempre! mostra passos concretos para famílias aplicarem a Bíblia no dia a dia.',
      followUp: { kind: 'lff', lesson: 49, label: 'Lição 49 — Como ter uma família feliz? — Parte 1' },
    },
  ],
};

export function preachingPresentationsForPoint(pointNumber: number): PreachingTruthPresentation[] {
  return PREACHING_TRUTH_PRESENTATIONS[pointNumber] ?? [];
}
