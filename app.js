// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAo9tWzi30ts5y5cNxpwljzHk3pF44zth4",
  authDomain: "roteiros-pre-historia.firebaseapp.com",
  projectId: "roteiros-pre-historia",
  storageBucket: "roteiros-pre-historia.firebasestorage.app",
  messagingSenderId: "787703137955",
  appId: "1:787703137955:web:aeb429b2b786da1ab86116",
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  serverTimestamp,
  writeBatch,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ============================================================
// CONSTANTES E URLs
// ============================================================
const JANELA_REPETICAO = 6;
const QTD_ARQUETIPOS_SUGERIDOS = 6;
const QTD_CASOS_SUGERIDOS = 6;
const PPM_PADRAO = 150;
const PAGINA_HISTORICO = 10;

const GITHUB_BASE = "https://raw.githubusercontent.com/lucaspires0690/Canal_Oracao/main/";
const URL_TRANSLATIONS = GITHUB_BASE + "translations.json";
const URL_SYSTEM_PROMPTS = GITHUB_BASE + "system_prompts.json";
const URL_VALIDATED_RULES = GITHUB_BASE + "validated_rules.json";
const URL_RAW_TITLES = GITHUB_BASE + "raw_titles.json";

const BIBLE_MAP = {
  "pt-BR": "nvi.json",
  "en-US": "niv.json",
  "es-LA": "nvi_es.json",
  "fr": "lsg.json",
  "ko": "krv.json"
};

// ---------- BANCOS PARA GERADOR DE TÍTULOS ----------
const ARQUETIPOS = [
  { id: "comando", peso: 30, label: "Comando" },
  { id: "pergunta", peso: 25, label: "Pergunta" },
  { id: "declaracao", peso: 25, label: "Declaração" },
  { id: "curiosidade", peso: 20, label: "Curiosidade" }
];
const COMANDOS = ["Ore", "Diga", "Ouça", "Comece", "Faça", "Entregue", "Clame"];
const DORES = {
  "manha_disposicao": ["novo dia", "disposição", "propósito", "fé", "renovação", "gratidão"],
  "madrugada_ansiedade": ["ansiedade", "medo", "preocupação", "insônia", "coração acelerado", "angústia", "desespero"],
  "noite_sono": ["insônia", "preocupação", "cansaço", "dormir", "descanso", "paz"]
};
const PROMESSAS = ["paz", "proteção", "descanso", "força", "esperança", "alívio", "cura"];
const TEMAS_CURIOSIDADE = ["Sinais", "Sintomas", "Hábitos", "Motivos", "Atitudes", "Erros"];

// ============================================================
// ESTADO GLOBAL
// ============================================================
let traducoes = null;
let systemPrompts = null;
let validatedRules = null;
let rawTitles = null;
let biblia = null;
let canais = [];
let canalSelecionadoId = null;
let ultimoDocHistorico = null;
let ultimoTituloGerado = "";
let ultimoArquetipo = "";
let criandoCanal = false; // trava contra duplo clique / duplo submit

// ============================================================
// REFERÊNCIAS DOS ELEMENTOS (Nova estrutura)
// ============================================================
const inputPpm = document.getElementById("input-ppm");
const inputTitulo = document.getElementById("input-titulo");
const inputMinutos = document.getElementById("input-minutos");
const btnGerar = document.getElementById("btn-gerar");
const btnGerarTitulo = document.getElementById("btn-gerar-titulo");
const btnRefazerTitulo = document.getElementById("btn-refazer-titulo");
const btnCopiar = document.getElementById("btn-copiar");
const btnCopiarRevisao = document.getElementById("btn-copiar-revisao");
const btnFormatar = document.getElementById("btn-formatar");
const btnCopiarFormatado = document.getElementById("btn-copiar-formatado");
const statusGerar = document.getElementById("status-gerar");
const statusCanal = document.getElementById("status-canal");
const statusFormatar = document.getElementById("status-formatar");
const resultadoPrompt = document.getElementById("resultado-prompt");
const resultadoRevisao = document.getElementById("resultado-revisao");
const resultadoFormatado = document.getElementById("resultado-formatado");
const parametrosDetalhe = document.getElementById("parametros-detalhe");
const cartaoResultado = document.getElementById("cartao-resultado");
const cartaoRevisao = document.getElementById("cartao-revisao");
const cartaoFormatado = document.getElementById("cartao-formatado");
const entradaFormatar = document.getElementById("entrada-formatar");
const listaHistorico = document.getElementById("lista-historico");
const listaCanaisDash = document.getElementById("lista-canais-dash");
const btnRecarregarHistorico = document.getElementById("btn-recarregar-historico");
const btnMaisHistorico = document.getElementById("btn-mais-historico");
const badgeArquetipo = document.getElementById("badge-arquetipo");
const videoCounter = document.getElementById("video-counter");
const detalheNome = document.getElementById("detalhe-nome");
const detalheMeta = document.getElementById("detalhe-meta");
const detalheBadge = document.getElementById("detalhe-badge");
const detalheTotal = document.getElementById("detalhe-total");
const btnVoltarDashboard = document.getElementById("btn-voltar-dashboard");
const btnCriarCanalDash = document.getElementById("btn-criar-canal-dash");
const modalCanal = document.getElementById("modal-canal");
const btnFecharModal = document.getElementById("btn-fechar-modal");
const btnCriarCanal = document.getElementById("btn-criar-canal");
const inputNomeCanal = document.getElementById("input-nome-canal");
const selectMomentoCanal = document.getElementById("select-momento-canal");
const selectIdiomaCanal = document.getElementById("select-idioma-canal");

// ============================================================
// PERSISTÊNCIA LOCAL (PPM)
// ============================================================
const ppmSalvo = localStorage.getItem("storyengine_ppm");
if (ppmSalvo && inputPpm) inputPpm.value = ppmSalvo;
if (inputPpm) {
  inputPpm.addEventListener("change", () => {
    const valor = parseFloat(inputPpm.value);
    if (valor > 0) localStorage.setItem("storyengine_ppm", String(valor));
  });
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================
const EMAIL_PERMITIDO = "lucasserip1990@gmail.com";

const telaLogin = document.getElementById("tela-login");
const telaApp = document.getElementById("tela-app");
const btnGoogleLogin = document.getElementById("btn-google-login");
const loginErro = document.getElementById("login-erro");
const btnLogout = document.getElementById("btn-logout");

if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", async () => {
    loginErro.textContent = "";
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) { loginErro.textContent = "Erro ao entrar. Tente novamente."; }
  });
}

if (btnLogout) {
  btnLogout.addEventListener("click", () => signOut(auth));
}

onAuthStateChanged(auth, async (user) => {
  if (user && user.email === EMAIL_PERMITIDO) {
    if (telaLogin) telaLogin.classList.add("oculto");
    if (telaApp) telaApp.classList.remove("oculto");
    await carregarDados(user);
    await carregarCanais();
    mostrarDashboard();
  } else if (user) {
    if (loginErro) loginErro.textContent = `E-mail ${user.email} não autorizado.`;
    await signOut(auth);
  } else {
    if (telaApp) telaApp.classList.add("oculto");
    if (telaLogin) telaLogin.classList.remove("oculto");
  }
});

// ============================================================
// NAVEGAÇÃO ENTRE TELAS
// ============================================================
function mostrarDashboard() {
  const dashboard = document.getElementById("tela-dashboard");
  const detalhe = document.getElementById("tela-detalhe");
  if (dashboard) dashboard.classList.remove("oculto");
  if (detalhe) detalhe.classList.add("oculto");
  if (btnVoltarDashboard) btnVoltarDashboard.classList.add("oculto");
  renderizarCanaisDashboard();
}

function mostrarDetalhe(canalId) {
  canalSelecionadoId = canalId;
  const dashboard = document.getElementById("tela-dashboard");
  const detalhe = document.getElementById("tela-detalhe");
  if (dashboard) dashboard.classList.add("oculto");
  if (detalhe) detalhe.classList.remove("oculto");
  if (btnVoltarDashboard) btnVoltarDashboard.classList.remove("oculto");

  const canal = canais.find(c => c.id === canalId);
  if (canal && detalheNome) {
    detalheNome.textContent = canal.nome;
    const momentoLabel = { manha_disposicao: "🌅 Manhã", madrugada_ansiedade: "🌙 Madrugada", noite_sono: "🌙 Noite" }[canal.momento] || canal.momento;
    const idiomaLabel = { "pt-BR": "🇧🇷 Português", "en-US": "🇺🇸 Inglês", "es-LA": "🇪🇸 Espanhol", "fr": "🇫🇷 Francês", "ko": "🇰🇷 Coreano" }[canal.idioma] || canal.idioma;
    if (detalheMeta) detalheMeta.textContent = `${momentoLabel} · ${idiomaLabel}`;
    if (detalheBadge) detalheBadge.textContent = canal.momento.replace("_", " ").toUpperCase();
    carregarHistorico(canalId, true);
    atualizarContadorVideos(canalId);
  }
}

if (btnVoltarDashboard) {
  btnVoltarDashboard.addEventListener("click", () => {
    mostrarDashboard();
  });
}

// ============================================================
// CARREGAR DADOS DO GITHUB E STORAGE
// ============================================================
async function carregarDados(user) {
  try {
    const [trad, prompts, rules, titles] = await Promise.all([
      fetch(URL_TRANSLATIONS).then(r => r.json()),
      fetch(URL_SYSTEM_PROMPTS).then(r => r.json()),
      fetch(URL_VALIDATED_RULES).then(r => r.json()),
      fetch(URL_RAW_TITLES).then(r => r.json())
    ]);
    traducoes = trad;
    systemPrompts = prompts;
    validatedRules = rules;
    rawTitles = titles;
    console.log("✅ Dados carregados do GitHub");
    if (user) await carregarBibliaDoStorage("pt-BR");
  } catch (err) {
    console.error("❌ Erro ao carregar dados:", err);
    if (statusGerar) { statusGerar.textContent = "Erro ao carregar dados. Recarregue."; statusGerar.className = "status erro"; }
  }
}

async function carregarBibliaDoStorage(idioma) {
  try {
    const fileName = BIBLE_MAP[idioma] || "nvi.json";
    const bibleRef = ref(storage, `bible_data/${fileName}`);
    const url = await getDownloadURL(bibleRef);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    biblia = await response.json();
    console.log(`✅ Bíblia carregada (${fileName})`);
    return true;
  } catch (err) {
    console.error("❌ Erro na Bíblia:", err);
    biblia = null;
    return false;
  }
}

// ============================================================
// CANAIS — DASHBOARD
// ============================================================
async function carregarCanais() {
  try {
    const q = query(collection(db, "canais"), orderBy("nome", "asc"));
    const snap = await getDocs(q);
    canais = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarCanaisDashboard();
  } catch (err) { console.error("Erro ao carregar canais:", err); }
}

async function renderizarCanaisDashboard() {
  if (!listaCanaisDash) return;
  listaCanaisDash.innerHTML = "";

  if (!canais.length) {
    listaCanaisDash.innerHTML = `<div class="empty-state">Nenhum canal criado ainda. Clique em "Criar canal" para começar.</div>`;
    return;
  }

  for (const canal of canais) {
    const card = document.createElement("div");
    card.className = "card-canal";
    const momentoIcon = { manha_disposicao: "🌅", madrugada_ansiedade: "🌙", noite_sono: "🌙" }[canal.momento] || "📌";
    const momentoLabel = { manha_disposicao: "Manhã", madrugada_ansiedade: "Madrugada", noite_sono: "Noite" }[canal.momento] || canal.momento;
    const idiomaLabel = { "pt-BR": "🇧🇷 PT", "en-US": "🇺🇸 EN", "es-LA": "🇪🇸 ES", "fr": "🇫🇷 FR", "ko": "🇰🇷 KO" }[canal.idioma] || canal.idioma;

    const q = query(collection(db, "historico"), where("canalId", "==", canal.id));
    const snap = await getDocs(q);
    const total = snap.size;

    card.innerHTML = `
      <div class="nome">${momentoIcon} ${canal.nome}</div>
      <div class="meta">${momentoLabel} · ${idiomaLabel}</div>
      <div class="stats">${total} vídeo${total !== 1 ? 's' : ''}</div>
      <button class="btn btn-primary btn-sm btn-entrar" data-id="${canal.id}">Entrar</button>
    `;
    listaCanaisDash.appendChild(card);

    card.querySelector(".btn-entrar").addEventListener("click", (e) => {
      e.stopPropagation();
      mostrarDetalhe(canal.id);
    });
    card.addEventListener("click", () => {
      mostrarDetalhe(canal.id);
    });
  }
}

async function atualizarContadorVideos(canalId) {
  if (!detalheTotal) return;
  const q = query(collection(db, "historico"), where("canalId", "==", canalId));
  const snap = await getDocs(q);
  detalheTotal.textContent = `${snap.size} vídeo${snap.size !== 1 ? 's' : ''}`;
}

// ============================================================
// MODAL — CRIAR CANAL
// ============================================================
if (btnCriarCanalDash) {
  btnCriarCanalDash.addEventListener("click", () => {
    if (modalCanal) modalCanal.classList.remove("oculto");
  });
}

if (btnFecharModal) {
  btnFecharModal.addEventListener("click", () => {
    if (modalCanal) modalCanal.classList.add("oculto");
  });
}

if (modalCanal) {
  modalCanal.addEventListener("click", (e) => {
    if (e.target === modalCanal) modalCanal.classList.add("oculto");
  });
}

// >>> CORREÇÃO DO BUG DE CANAL DUPLICADO <<<
// Antes: o clique disparava addDoc sem travar o botão, então um duplo-clique
// (ou um clique repetido enquanto a rede ainda respondia) criava dois
// documentos no Firestore. Agora: trava por flag + botão desabilitado
// durante o envio, e checagem de nome repetido antes de gravar.
if (btnCriarCanal) {
  btnCriarCanal.addEventListener("click", async () => {
    if (criandoCanal) return; // ignora cliques repetidos enquanto já está criando
    if (!inputNomeCanal || !statusCanal) return;

    const nome = inputNomeCanal.value.trim();
    const momento = selectMomentoCanal ? selectMomentoCanal.value : "madrugada_ansiedade";
    const idioma = selectIdiomaCanal ? selectIdiomaCanal.value : "pt-BR";

    if (!nome) {
      statusCanal.textContent = "Digite um nome.";
      statusCanal.className = "status erro";
      return;
    }

    const jaExiste = canais.some(c => (c.nome || "").trim().toLowerCase() === nome.toLowerCase());
    if (jaExiste) {
      statusCanal.textContent = "Já existe um canal com esse nome.";
      statusCanal.className = "status erro";
      return;
    }

    criandoCanal = true;
    btnCriarCanal.disabled = true;
    statusCanal.textContent = "Criando canal...";
    statusCanal.className = "status";

    try {
      await addDoc(collection(db, "canais"), { nome, momento, idioma, criadoEm: serverTimestamp(), ativo: true });
      statusCanal.textContent = "✅ Canal criado!";
      statusCanal.className = "status sucesso";
      inputNomeCanal.value = "";
      if (modalCanal) modalCanal.classList.add("oculto");
      await carregarCanais();
      renderizarCanaisDashboard();
    } catch (err) {
      statusCanal.textContent = "Erro ao criar.";
      statusCanal.className = "status erro";
    } finally {
      criandoCanal = false;
      btnCriarCanal.disabled = false;
    }
  });
}

// ============================================================
// GERADOR DE TÍTULOS
// ============================================================
function escolherArquetipo(historicoRecente) {
  const contagem = { comando: 0, pergunta: 0, declaracao: 0, curiosidade: 0 };
  const ultimos5 = historicoRecente.slice(0, 5);
  for (const item of ultimos5) {
    if (item.arquetipo_usado) contagem[item.arquetipo_usado] = (contagem[item.arquetipo_usado] || 0) + 1;
  }
  const disponiveis = ARQUETIPOS.filter(a => contagem[a.id] < 2);
  if (disponiveis.length === 0) {
    const totalPeso = ARQUETIPOS.reduce((s, a) => s + a.peso, 0);
    let rand = Math.random() * totalPeso;
    for (const a of ARQUETIPOS) {
      rand -= a.peso;
      if (rand <= 0) return a.id;
    }
  }
  return disponiveis[Math.floor(Math.random() * disponiveis.length)].id;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function gerarTitulo(canalId, forcarNovo = false) {
  try {
    const canalDoc = await getDoc(doc(db, "canais", canalId));
    if (!canalDoc.exists()) throw new Error("Canal não encontrado.");
    const canal = canalDoc.data();

    const q = query(collection(db, "historico"), where("canalId", "==", canalId), orderBy("criadoEm", "desc"), limit(10));
    const snap = await getDocs(q);
    const historicoRecente = snap.docs.map(d => d.data());

    let arquétipo = escolherArquetipo(historicoRecente);
    if (forcarNovo) {
      const outros = ARQUETIPOS.filter(a => a.id !== arquétipo);
      arquétipo = outros[Math.floor(Math.random() * outros.length)].id;
    }

    const doresDoMomento = DORES[canal.momento] || DORES["madrugada_ansiedade"];
    const dor = doresDoMomento[Math.floor(Math.random() * doresDoMomento.length)];
    const promessa = PROMESSAS[Math.floor(Math.random() * PROMESSAS.length)];
    const comando = COMANDOS[Math.floor(Math.random() * COMANDOS.length)];
    const temaCuriosidade = TEMAS_CURIOSIDADE[Math.floor(Math.random() * TEMAS_CURIOSIDADE.length)];

    let titulo = "";
    switch (arquétipo) {
      case "comando":
        titulo = `${comando} Isso Quando ${capitalize(dor)} e Encontre ${capitalize(promessa)}`;
        break;
      case "pergunta":
        const perguntas = [
          `${capitalize(dor)}? ${capitalize(comando)} Esta Oração e ${capitalize(promessa)}`,
          `Está com ${capitalize(dor)}? ${capitalize(comando)} Isso Agora`
        ];
        titulo = perguntas[Math.floor(Math.random() * perguntas.length)];
        break;
      case "declaracao":
        titulo = `Que a ${capitalize(promessa)} de Deus Esteja Sobre Você Hoje`;
        break;
      case "curiosidade":
        const numeros = ["3", "5", "7", "10"];
        titulo = `${numeros[Math.floor(Math.random() * numeros.length)]} ${temaCuriosidade} de que Deus Está ${capitalize(promessa)} Você`;
        break;
      default:
        titulo = `${comando} Isso Quando ${capitalize(dor)} e Encontre ${capitalize(promessa)}`;
    }

    return { titulo, arquétipo };
  } catch (err) {
    console.error("Erro ao gerar título:", err);
    throw err;
  }
}

// ============================================================
// MOTOR DE GERAÇÃO DE PROMPT
// ============================================================
function calcularParametrosDeDuracao(minutos, ppm) {
  const palavrasAlvo = Math.round(minutos * ppm);
  const palavrasMin = Math.round(palavrasAlvo * 0.9);
  const palavrasMax = Math.round(palavrasAlvo * 1.1);
  const perguntasMin = Math.max(4, Math.round(palavrasAlvo / 300));
  const humorMin = Math.max(2, Math.round(palavrasAlvo / 700));
  return { minutos, ppm, palavrasAlvo, palavrasMin, palavrasMax, perguntasMin, humorMin };
}

function gerarDistribuicaoBlocos() {
  const base = { B1: 10, B2: 12, B3: 33, B4: 10, B5: 11, B6: 12, B7: 12 };
  const variado = {};
  for (const bloco in base) {
    const pct = base[bloco];
    const margem = pct * 0.15;
    variado[bloco] = pct + (Math.random() * 2 - 1) * margem;
  }
  const soma = Object.values(variado).reduce((a, b) => a + b, 0);
  const fator = 100 / soma;
  for (const bloco in variado) {
    variado[bloco] = Math.round(variado[bloco] * fator * 10) / 10;
  }
  return variado;
}

function calcularPalavrasPorBloco(distribuicaoPct, palavrasAlvo) {
  const resultado = {};
  for (const bloco in distribuicaoPct) {
    resultado[bloco] = Math.round((palavrasAlvo * distribuicaoPct[bloco]) / 100);
  }
  return resultado;
}

function buscarVersiculo(referencia, biblia) {
  if (!biblia) return null;
  const padrao = /^([a-zA-ZÀ-ú]+)\s+(\d+):(\d+)(?:-(\d+))?$/;
  const match = padrao.exec(referencia.trim());
  if (!match) return null;
  const [_, livroNome, capituloStr, versiculoStr, versiculoFimStr] = match;
  const capitulo = parseInt(capituloStr);
  const versiculo = parseInt(versiculoStr);
  const livro = biblia.find(l => l.name.toLowerCase() === livroNome.toLowerCase());
  if (!livro) return null;
  if (capitulo > livro.chapters.length) return null;
  if (versiculoFimStr) {
    const versiculoFim = parseInt(versiculoFimStr);
    return livro.chapters[capitulo - 1].slice(versiculo - 1, versiculoFim).join(" ");
  } else {
    return livro.chapters[capitulo - 1][versiculo - 1] || null;
  }
}

function montarMensagemRevisao(params, langData) {
  const base = langData?.instructions?.revision_message || "Revise o roteiro que você acabou de escrever para este vídeo";
  return `${base}:

1. Contagem de palavras: confira se o roteiro tem entre ${params.palavrasMin} e ${params.palavrasMax} palavras.
2. Parágrafos: nenhum parágrafo pode ter mais de 3 frases.
3. Humor/consolo: confirme se existem pelo menos ${params.humorMin} momentos de consolo distribuídos.
4. Versículos: confirme que os versículos sugeridos estão corretos (use {{VERSICULO}} como marcador).
5. Tom: o tom deve ser acolhedor, compassivo e nunca de acusação ou medo.

Entregue apenas o roteiro corrigido e completo. Sem comentários sobre o que foi revisado.`;
}

function montarPrompt(params, langData, templateBlocos) {
  const inst = langData?.instructions || {};
  let texto = "";

  texto += (inst.system_prompt || "") + "\n\n";
  texto += (inst.channel_identity || "") + "\n\n";
  texto += (inst.focus || "") + "\n\n";
  texto += (inst.narrative_objective || "") + "\n\n";
  texto += (inst.title_placeholder || "🎬 TÍTULO DESTE VÍDEO\n\n\"<<TITULO>>\"").replace("<<TITULO>>", params.titulo) + "\n\n";
  texto += (inst.analysis_step || "") + "\n\n";
  texto += (inst.word_count || "") + "\n\n";
  texto += (inst.structural_variation || "") + "\n\n";

  texto += "🧱 ESTRUTURA NARRATIVA — 7 BLOCOS (obrigatória)\n\n";
  if (templateBlocos) {
    const blocos = templateBlocos.split("\n");
    for (const bloco of blocos) {
      if (bloco.trim()) texto += bloco + "\n";
    }
  }
  texto += "\n" + (inst.forbidden_absolutes || "") + "\n\n";
  texto += (inst.tts_format || "") + "\n\n";

  texto += `✅ VERIFICAÇÃO PROGRESSIVA DE PALAVRAS

Cada bloco tem um alvo de palavras. Ao terminar de escrever cada bloco, estime quantas palavras esse bloco tem.

Antes de entregar a resposta final, confirme que o texto final realmente contém:
- Pelo menos ${params.perguntasMin} perguntas retóricas
- Pelo menos ${params.humorMin} momentos de consolo/declarações de paz
- Pelo menos 2 versículos bíblicos (via {{VERSICULO}})
- Nenhum parágrafo com mais de 3 frases
- Tom acolhedor e compassivo

Se o total geral passar de ${params.palavrasMax} palavras, corte o excesso sem perder as regras obrigatórias.
`;

  texto += "\n" + (inst.final_output || "📤 SAÍDA FINAL\n\nExecute todas as regras acima e entregue apenas o roteiro final.\n\nAgora, escreva o roteiro para o título: <<TITULO>>").replace("<<TITULO>>", params.titulo);

  const substitutos = {
    "<<MINUTOS>>": String(params.minutos),
    "<<PPM>>": String(params.ppm),
    "<<PALAVRAS_ALVO>>": String(params.palavrasAlvo),
    "<<PALAVRAS_MIN>>": String(params.palavrasMin),
    "<<PALAVRAS_MAX>>": String(params.palavrasMax),
    "<<PERGUNTAS_MIN>>": String(params.perguntasMin),
    "<<HUMOR_MIN>>": String(params.humorMin),
    "<<LIMITE_ANAFORA>>": String(params.limite_anafora),
    "<<B1>>": String(params.distribuicao.B1),
    "<<B2>>": String(params.distribuicao.B2),
    "<<B3>>": String(params.distribuicao.B3),
    "<<B4>>": String(params.distribuicao.B4),
    "<<B5>>": String(params.distribuicao.B5),
    "<<B6>>": String(params.distribuicao.B6),
    "<<B7>>": String(params.distribuicao.B7),
    "<<PALAVRAS_B1>>": String(params.palavrasPorBloco.B1),
    "<<PALAVRAS_B2>>": String(params.palavrasPorBloco.B2),
    "<<PALAVRAS_B3>>": String(params.palavrasPorBloco.B3),
    "<<PALAVRAS_B4>>": String(params.palavrasPorBloco.B4),
    "<<PALAVRAS_B5>>": String(params.palavrasPorBloco.B5),
    "<<PALAVRAS_B6>>": String(params.palavrasPorBloco.B6),
    "<<PALAVRAS_B7>>": String(params.palavrasPorBloco.B7),
    "<<ARQUETIPOS_EVITAR>>": (params.arquetipos_evitar || []).map(a => `- ${a}`).join("\n"),
    "<<CASOS_EVITAR>>": (params.casos_evitar || []).map(c => `- ${c}`).join("\n"),
  };
  for (const [chave, valor] of Object.entries(substitutos)) {
    texto = texto.replaceAll(chave, valor);
  }

  return texto;
}

function itensUsadosRecentemente(historicoRecente, campo) {
  const usados = new Set();
  historicoRecente.forEach((r) => (r[campo] || []).forEach((item) => usados.add(item)));
  return usados;
}

function escolherNumeroSemRepetir(opcoes, historicoRecente, campo) {
  const recentes = historicoRecente.map((r) => r[campo]);
  let candidatos = opcoes.filter((o) => !recentes.includes(o));
  if (candidatos.length === 0) candidatos = [...opcoes];
  return candidatos[Math.floor(Math.random() * candidatos.length)];
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escolherListaSemRepetir(pool, usadosRecentes, quantidade) {
  let disponiveis = pool.filter((item) => !usadosRecentes.has(item));
  if (disponiveis.length < quantidade) {
    disponiveis = [...pool];
  }
  return shuffle(disponiveis).slice(0, quantidade);
}

// ============================================================
// HISTÓRICO POR CANAL
// ============================================================
async function carregarHistorico(canalId = null, reiniciar = false) {
  if (!listaHistorico) return;
  const btnMais = document.getElementById("btn-mais-historico");
  if (reiniciar) { listaHistorico.innerHTML = ""; ultimoDocHistorico = null; }
  if (!canalId) { canalId = canalSelecionadoId; }
  if (!canalId) {
    listaHistorico.innerHTML = '<p style="color: var(--ink-faint);">Selecione um canal.</p>';
    if (btnMais) btnMais.classList.add("oculto");
    return;
  }
  try {
    let q;
    if (ultimoDocHistorico) {
      q = query(collection(db, "historico"), where("canalId", "==", canalId), orderBy("criadoEm", "desc"), startAfter(ultimoDocHistorico), limit(PAGINA_HISTORICO));
    } else {
      q = query(collection(db, "historico"), where("canalId", "==", canalId), orderBy("criadoEm", "desc"), limit(PAGINA_HISTORICO));
    }
    const snap = await getDocs(q);
    if (reiniciar && snap.empty) {
      listaHistorico.innerHTML = '<p style="color: var(--ink-faint);">Nenhum roteiro ainda.</p>';
    }
    snap.docs.forEach((docSnap) => {
      const r = docSnap.data();
      const item = document.createElement("div");
      item.className = "item-historico";
      const dataFormatada = r.criadoEm?.toDate?.()?.toLocaleString?.("pt-BR") || "—";
      const momentoLabel = r.momento || "—";
      const idiomaLabel = r.idioma || "—";
      const duracaoTexto = r.minutos ? `${r.minutos} min (${r.palavras_alvo || "?"} palavras) · ` : "";
      item.innerHTML = `
        <div>
          <div class="item-titulo">${escaparHtml(r.titulo || "(sem título)")}</div>
          <div class="item-meta">${dataFormatada} · ${duracaoTexto}${momentoLabel} · ${idiomaLabel} · anáfora ${r.limite_anafora ?? "—"} · arquétipos: ${escaparHtml((r.arquetipos_usados || []).join(", "))}</div>
        </div>
      `;
      listaHistorico.appendChild(item);
    });
    if (snap.docs.length > 0) {
      ultimoDocHistorico = snap.docs[snap.docs.length - 1];
    }
    if (btnMais) btnMais.classList.toggle("oculto", snap.docs.length < PAGINA_HISTORICO);
  } catch (err) {
    console.error("Erro ao carregar histórico:", err);
  }
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

if (btnRecarregarHistorico) {
  btnRecarregarHistorico.addEventListener("click", () => {
    carregarHistorico(canalSelecionadoId, true);
  });
}

if (btnMaisHistorico) {
  btnMaisHistorico.addEventListener("click", () => {
    carregarHistorico(canalSelecionadoId, false);
  });
}

// ============================================================
// ABA INTERNA: GERAR PROMPT
// ============================================================
document.querySelectorAll(".aba-interna").forEach((botao) => {
  botao.addEventListener("click", () => {
    document.querySelectorAll(".aba-interna").forEach((b) => b.classList.remove("ativa"));
    botao.classList.add("ativa");
    const alvo = botao.dataset.aba;
    document.querySelectorAll(".painel-interno").forEach((p) => {
      p.classList.toggle("ativo", p.dataset.painel === alvo);
    });
  });
});

if (btnGerarTitulo) {
  btnGerarTitulo.addEventListener("click", async () => {
    if (!canalSelecionadoId) { alert("Selecione um canal."); return; }
    try {
      const result = await gerarTitulo(canalSelecionadoId, false);
      ultimoTituloGerado = result.titulo;
      ultimoArquetipo = result.arquétipo;
      if (inputTitulo) inputTitulo.value = result.titulo;
      if (badgeArquetipo) badgeArquetipo.textContent = result.arquétipo;
      const q = query(collection(db, "historico"), where("canalId", "==", canalSelecionadoId));
      const snap = await getDocs(q);
      if (videoCounter) videoCounter.textContent = `Vídeo #${snap.size + 1}`;
      if (statusGerar) { statusGerar.textContent = `✅ Título gerado (${result.arquétipo})`; statusGerar.className = "status sucesso"; }
    } catch (err) {
      alert("Erro: " + err.message);
    }
  });
}

if (btnRefazerTitulo) {
  btnRefazerTitulo.addEventListener("click", async () => {
    if (!canalSelecionadoId) { alert("Selecione um canal."); return; }
    try {
      const result = await gerarTitulo(canalSelecionadoId, true);
      ultimoTituloGerado = result.titulo;
      ultimoArquetipo = result.arquétipo;
      if (inputTitulo) inputTitulo.value = result.titulo;
      if (badgeArquetipo) badgeArquetipo.textContent = result.arquétipo;
      if (statusGerar) { statusGerar.textContent = `🔄 Novo título (${result.arquétipo})`; statusGerar.className = "status sucesso"; }
    } catch (err) {
      alert("Erro: " + err.message);
    }
  });
}

if (btnGerar) {
  btnGerar.addEventListener("click", async () => {
    const titulo = inputTitulo ? inputTitulo.value.trim() : "";
    const minutos = inputMinutos ? parseFloat(inputMinutos.value) : 10;
    const ppm = inputPpm ? parseFloat(inputPpm.value) || PPM_PADRAO : PPM_PADRAO;

    if (!titulo) { if (statusGerar) { statusGerar.textContent = "Digite ou gere um título."; statusGerar.className = "status erro"; } return; }
    if (!canalSelecionadoId) { if (statusGerar) { statusGerar.textContent = "Selecione um canal."; statusGerar.className = "status erro"; } return; }
    if (!minutos || minutos <= 0) { if (statusGerar) { statusGerar.textContent = "Duração inválida."; statusGerar.className = "status erro"; } return; }
    if (!traducoes || !systemPrompts) { if (statusGerar) { statusGerar.textContent = "Dados não carregados."; statusGerar.className = "status erro"; } return; }

    if (btnGerar) btnGerar.disabled = true;
    if (statusGerar) { statusGerar.textContent = "Gerando..."; statusGerar.className = "status"; }

    try {
      const canalDoc = await getDoc(doc(db, "canais", canalSelecionadoId));
      if (!canalDoc.exists()) throw new Error("Canal não encontrado.");
      const canalData = canalDoc.data();
      const momento = canalData.momento;
      const idioma = canalData.idioma;

      await carregarBibliaDoStorage(idioma);

      const langData = traducoes.languages?.[idioma] || {};
      const momentTemplates = traducoes.moment_templates || {};
      const templateBlocos = momentTemplates[momento]?.[idioma] || momentTemplates[momento]?.["pt-BR"] || "";

      const q = query(collection(db, "historico"), where("canalId", "==", canalSelecionadoId), orderBy("criadoEm", "desc"), limit(JANELA_REPETICAO));
      const histSnap = await getDocs(q);
      const historicoRecente = histSnap.docs.map((d) => d.data());

      const arquetiposUsadosRecentes = itensUsadosRecentemente(historicoRecente, "arquetipos_usados");
      const casosUsadosRecentes = itensUsadosRecentemente(historicoRecente, "casos_usados");

      const duracao = calcularParametrosDeDuracao(minutos, ppm);
      const distribuicao = gerarDistribuicaoBlocos();

      let poolsArquetipos = ["ansiedade", "medo", "solidão", "preocupação", "insônia", "desânimo", "cansaço", "dúvida"];
      let poolsCasos = ["Salmo 91", "Salmo 23", "Mateus 11:28", "Filipenses 4:6-7", "Isaías 41:10", "João 14:27"];

      if (rawTitles) {
        const todasPalavras = [];
        for (const canal of Object.values(rawTitles)) {
          for (const fase of ["antigos", "recentes", "virais"]) {
            for (const item of (canal[fase] || [])) {
              const palavras = (item.title || "").toLowerCase().split(/\s+/);
              todasPalavras.push(...palavras);
            }
          }
        }
        if (todasPalavras.length > 0) {
          const contagem = {};
          for (const p of todasPalavras) {
            if (p.length > 3) contagem[p] = (contagem[p] || 0) + 1;
          }
          const ordenadas = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
          const top10 = ordenadas.slice(0, 10).map(([p]) => p);
          if (top10.length > 0) poolsArquetipos = top10;
        }
      }

      const params = {
        titulo,
        ...duracao,
        limite_anafora: escolherNumeroSemRepetir([2, 3, 4], historicoRecente, "limite_anafora"),
        distribuicao,
        palavrasPorBloco: calcularPalavrasPorBloco(distribuicao, duracao.palavrasAlvo),
        arquetipos_evitar: escolherListaSemRepetir(poolsArquetipos, arquetiposUsadosRecentes, QTD_ARQUETIPOS_SUGERIDOS),
        casos_evitar: escolherListaSemRepetir(poolsCasos, casosUsadosRecentes, QTD_CASOS_SUGERIDOS),
      };

      const promptFinal = montarPrompt(params, langData, templateBlocos);
      if (resultadoPrompt) resultadoPrompt.value = promptFinal;
      if (parametrosDetalhe) {
        parametrosDetalhe.textContent = JSON.stringify(
          { canal: canalData.nome, momento, idioma, minutos: params.minutos, ppm: params.ppm, palavras_alvo: params.palavrasAlvo, palavras_min: params.palavrasMin, palavras_max: params.palavrasMax, perguntas_min: params.perguntasMin, humor_min: params.humorMin, limite_anafora: params.limite_anafora, distribuicao_blocos: params.distribuicao, arquetipos_evitar: params.arquetipos_evitar, casos_evitar: params.casos_evitar },
          null, 2
        );
      }
      if (cartaoResultado) cartaoResultado.classList.remove("oculto");

      const revisao = montarMensagemRevisao(params, langData);
      if (resultadoRevisao) resultadoRevisao.value = revisao;
      if (cartaoRevisao) cartaoRevisao.classList.remove("oculto");

      await addDoc(collection(db, "historico"), {
        canalId: canalSelecionadoId,
        titulo,
        criadoEm: serverTimestamp(),
        minutos: params.minutos,
        palavras_alvo: params.palavrasAlvo,
        limite_anafora: params.limite_anafora,
        distribuicao_blocos: params.distribuicao,
        momento,
        idioma,
        arquetipos_usados: params.arquetipos_evitar.slice(0, 3),
        casos_usados: params.casos_evitar.slice(0, 3),
        arquetipo_usado: ultimoArquetipo || null,
      });

      if (statusGerar) { statusGerar.textContent = "✅ Prompt gerado!"; statusGerar.className = "status sucesso"; }
      carregarHistorico(canalSelecionadoId, true);
      atualizarContadorVideos(canalSelecionadoId);
    } catch (err) {
      console.error(err);
      if (statusGerar) { statusGerar.textContent = "Erro: " + err.message; statusGerar.className = "status erro"; }
    } finally {
      if (btnGerar) btnGerar.disabled = false;
    }
  });
}

if (btnCopiar) {
  btnCopiar.addEventListener("click", async () => {
    if (!resultadoPrompt) return;
    try { await navigator.clipboard.writeText(resultadoPrompt.value); btnCopiar.textContent = "Copiado!"; }
    catch { resultadoPrompt.select(); document.execCommand("copy"); btnCopiar.textContent = "Copiado!"; }
    setTimeout(() => { btnCopiar.textContent = "Copiar"; }, 1500);
  });
}

if (btnCopiarRevisao) {
  btnCopiarRevisao.addEventListener("click", async () => {
    if (!resultadoRevisao) return;
    try { await navigator.clipboard.writeText(resultadoRevisao.value); btnCopiarRevisao.textContent = "Copiado!"; }
    catch { resultadoRevisao.select(); document.execCommand("copy"); btnCopiarRevisao.textContent = "Copiado!"; }
    setTimeout(() => { btnCopiarRevisao.textContent = "Copiar"; }, 1500);
  });
}

// ============================================================
// ABA: FORMATAR PARÁGRAFOS
// ============================================================
function dividirEmFrases(paragrafo) {
  const partes = paragrafo.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9"“(\u2014\u2013])/);
  return partes.map((p) => p.trim()).filter(Boolean);
}

function formatarParagrafos(texto, maxFrasesPorParagrafo = 3) {
  const paragrafosOriginais = texto.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const paragrafosFinais = [];
  let totalAjustados = 0;
  for (const paragrafo of paragrafosOriginais) {
    const frases = dividirEmFrases(paragrafo);
    if (frases.length <= maxFrasesPorParagrafo) {
      paragrafosFinais.push(paragrafo);
      continue;
    }
    totalAjustados++;
    for (let i = 0; i < frases.length; i += maxFrasesPorParagrafo) {
      paragrafosFinais.push(frases.slice(i, i + maxFrasesPorParagrafo).join(" "));
    }
  }
  return { textoFormatado: paragrafosFinais.join("\n"), totalAjustados, totalParagrafosOriginais: paragrafosOriginais.length };
}

if (btnFormatar) {
  btnFormatar.addEventListener("click", () => {
    if (!entradaFormatar) return;
    const texto = entradaFormatar.value.trim();
    if (!texto) { if (statusFormatar) { statusFormatar.textContent = "Cole o roteiro."; statusFormatar.className = "status erro"; } return; }
    const { textoFormatado, totalAjustados, totalParagrafosOriginais } = formatarParagrafos(texto);
    if (resultadoFormatado) resultadoFormatado.value = textoFormatado;
    if (cartaoFormatado) cartaoFormatado.classList.remove("oculto");
    if (statusFormatar) {
      statusFormatar.textContent = totalAjustados > 0 ? `${totalAjustados} de ${totalParagrafosOriginais} ajustados.` : "Nenhum parágrafo com mais de 3 frases.";
      statusFormatar.className = "status sucesso";
    }
  });
}

if (btnCopiarFormatado) {
  btnCopiarFormatado.addEventListener("click", async () => {
    if (!resultadoFormatado) return;
    try { await navigator.clipboard.writeText(resultadoFormatado.value); btnCopiarFormatado.textContent = "Copiado!"; }
    catch { resultadoFormatado.select(); document.execCommand("copy"); btnCopiarFormatado.textContent = "Copiado!"; }
    setTimeout(() => { btnCopiarFormatado.textContent = "Copiar"; }, 1500);
  });
}

console.log("✅ Faith Prompt Engine carregado!");
