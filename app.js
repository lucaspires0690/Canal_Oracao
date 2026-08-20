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
  Timestamp,
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

// ---------- constantes do motor ----------
const JANELA_REPETICAO = 6;
const QTD_ARQUETIPOS_SUGERIDOS = 6;
const QTD_CASOS_SUGERIDOS = 6;
const PPM_PADRAO = 150;

// ---------- URLs dos arquivos JSON no GitHub ----------
const GITHUB_BASE = "https://raw.githubusercontent.com/lucaspires0690/Canal_Oracao/main/";
const URL_TRANSLATIONS = GITHUB_BASE + "translations.json";
const URL_SYSTEM_PROMPTS = GITHUB_BASE + "system_prompts.json";
const URL_VALIDATED_RULES = GITHUB_BASE + "validated_rules.json";
const URL_RAW_TITLES = GITHUB_BASE + "raw_titles.json";

// ---------- Mapeamento de Bíblias por idioma ----------
const BIBLE_MAP = {
  "pt-BR": "nvi.json",
  "en-US": "niv.json",
  "es-LA": "nvi_es.json",
  "fr": "lsg.json",
  "ko": "krv.json"
};

// ---------- estado global ----------
let traducoes = null;
let systemPrompts = null;
let validatedRules = null;
let rawTitles = null;
let biblia = null;
let canais = [];
let canalSelecionadoId = null;
let ultimoDocHistorico = null;
const PAGINA_HISTORICO = 10;

// ---------- persistência local do PPM ----------
const inputPpm = document.getElementById("input-ppm");
const ppmSalvo = localStorage.getItem("storyengine_ppm");
if (ppmSalvo) inputPpm.value = ppmSalvo;
inputPpm.addEventListener("change", () => {
  const valor = parseFloat(inputPpm.value);
  if (valor > 0) localStorage.setItem("storyengine_ppm", String(valor));
});

// ============================================================
// AUTENTICAÇÃO
// ============================================================
const EMAIL_PERMITIDO = "lucasserip1990@gmail.com";

const telaLogin = document.getElementById("tela-login");
const telaApp = document.getElementById("tela-app");
const btnGoogleLogin = document.getElementById("btn-google-login");
const loginErro = document.getElementById("login-erro");
const btnLogout = document.getElementById("btn-logout");

btnGoogleLogin.addEventListener("click", async () => {
  loginErro.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    console.error(err);
    loginErro.textContent = "Não foi possível entrar com o Google. Tente novamente.";
  }
});

btnLogout.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user && user.email === EMAIL_PERMITIDO) {
    telaLogin.classList.add("oculto");
    telaApp.classList.remove("oculto");
    await carregarDados(user);
    await carregarCanais();
    carregarHistorico(null, true);
  } else if (user) {
    loginErro.textContent = `O e-mail ${user.email} não tem acesso a este app.`;
    await signOut(auth);
  } else {
    telaApp.classList.add("oculto");
    telaLogin.classList.remove("oculto");
  }
});

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

    if (user) {
      try {
        const token = await user.getIdToken();
        console.log("✅ Token de autenticação obtido");
        await carregarBibliaDoStorage("pt-BR");
      } catch (tokenErr) {
        console.warn("⚠️ Não foi possível obter token:", tokenErr);
        await carregarBibliaDoStorage("pt-BR");
      }
    } else {
      console.warn("⚠️ Usuário não autenticado. Tentando carregar Bíblia mesmo assim...");
      await carregarBibliaDoStorage("pt-BR");
    }
  } catch (err) {
    console.error("❌ Erro ao carregar dados:", err);
    const status = document.getElementById("status-gerar");
    if (status) {
      status.textContent = "Erro ao carregar dados. Recarregue a página.";
      status.className = "status erro";
    }
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
    console.log(`✅ Bíblia carregada do Storage (${fileName})`);
    return true;
  } catch (err) {
    console.error("❌ Erro ao carregar a Bíblia:", err);
    biblia = null;
    return false;
  }
}

// ============================================================
// GERENCIAMENTO DE CANAIS
// ============================================================
async function carregarCanais() {
  try {
    const q = query(collection(db, "canais"), orderBy("nome", "asc"));
    const snap = await getDocs(q);
    canais = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log("✅ Canais carregados:", canais.length);
    atualizarDropdownCanais();
    renderizarListaCanais();
  } catch (err) {
    console.error("❌ Erro ao carregar canais:", err);
  }
}

function atualizarDropdownCanais() {
  const select = document.getElementById("select-canal");
  select.innerHTML = "";
  
  if (canais.length === 0) {
    select.innerHTML = '<option value="">Nenhum canal cadastrado</option>';
    return;
  }

  for (const canal of canais) {
    const option = document.createElement("option");
    option.value = canal.id;
    const momentoLabel = {
      "manha_disposicao": "🌅 Manhã",
      "madrugada_ansiedade": "🌙 Madrugada",
      "noite_sono": "🌙 Noite"
    }[canal.momento] || canal.momento;
    const idiomaLabel = {
      "pt-BR": "🇧🇷 PT",
      "en-US": "🇺🇸 EN",
      "es-LA": "🇪🇸 ES",
      "fr": "🇫🇷 FR",
      "ko": "🇰🇷 KO"
    }[canal.idioma] || canal.idioma;
    option.textContent = `${canal.nome} (${momentoLabel} · ${idiomaLabel})`;
    select.appendChild(option);
  }
}

function renderizarListaCanais() {
  const container = document.getElementById("lista-canais");
  container.innerHTML = "";
  
  if (canais.length === 0) {
    container.innerHTML = '<p style="color: var(--texto-fraco);">Nenhum canal cadastrado ainda.</p>';
    return;
  }

  for (const canal of canais) {
    const item = document.createElement("div");
    item.className = "item-historico";
    const momentoLabel = {
      "manha_disposicao": "🌅 Manhã",
      "madrugada_ansiedade": "🌙 Madrugada",
      "noite_sono": "🌙 Noite"
    }[canal.momento] || canal.momento;
    const idiomaLabel = {
      "pt-BR": "🇧🇷 Português",
      "en-US": "🇺🇸 Inglês",
      "es-LA": "🇪🇸 Espanhol",
      "fr": "🇫🇷 Francês",
      "ko": "🇰🇷 Coreano"
    }[canal.idioma] || canal.idioma;
    
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div class="item-titulo">${canal.nome}</div>
          <div class="item-meta">${momentoLabel} · ${idiomaLabel}</div>
        </div>
        <button class="btn btn-ghost" style="font-size: 0.8rem; padding: 4px 10px;" data-id="${canal.id}">🗑️</button>
      </div>
    `;
    
    const btnDelete = item.querySelector("button");
    btnDelete.addEventListener("click", async () => {
      if (confirm(`Tem certeza que deseja excluir o canal "${canal.nome}" e todo o seu histórico?`)) {
        await excluirCanal(canal.id);
      }
    });
    
    container.appendChild(item);
  }
}

async function excluirCanal(canalId) {
  try {
    // Excluir todos os roteiros do histórico do canal
    const q = query(collection(db, "historico"), where("canalId", "==", canalId));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    // Excluir o canal
    await deleteDoc(doc(db, "canais", canalId));
    
    console.log("✅ Canal e histórico excluídos");
    await carregarCanais();
    await carregarHistorico(null, true);
    
    const status = document.getElementById("status-canal");
    status.textContent = "Canal excluído com sucesso!";
    status.className = "status sucesso";
  } catch (err) {
    console.error("❌ Erro ao excluir canal:", err);
    const status = document.getElementById("status-canal");
    status.textContent = "Erro ao excluir canal.";
    status.className = "status erro";
  }
}

document.getElementById("btn-criar-canal").addEventListener("click", async () => {
  const nome = document.getElementById("input-nome-canal").value.trim();
  const momento = document.getElementById("select-momento-canal").value;
  const idioma = document.getElementById("select-idioma-canal").value;
  const status = document.getElementById("status-canal");
  
  if (!nome) {
    status.textContent = "Digite um nome para o canal.";
    status.className = "status erro";
    return;
  }
  
  try {
    await addDoc(collection(db, "canais"), {
      nome: nome,
      momento: momento,
      idioma: idioma,
      criadoEm: serverTimestamp(),
      ativo: true
    });
    
    status.textContent = "✅ Canal criado com sucesso!";
    status.className = "status sucesso";
    document.getElementById("input-nome-canal").value = "";
    await carregarCanais();
  } catch (err) {
    console.error(err);
    status.textContent = "Erro ao criar canal.";
    status.className = "status erro";
  }
});

document.getElementById("btn-recarregar-canais").addEventListener("click", async () => {
  await carregarCanais();
});

// ============================================================
// NAVEGAÇÃO POR ABAS
// ============================================================
document.querySelectorAll(".aba").forEach((botao) => {
  botao.addEventListener("click", () => {
    document.querySelectorAll(".aba").forEach((b) => {
      b.classList.remove("ativa");
      b.setAttribute("aria-selected", "false");
    });
    botao.classList.add("ativa");
    botao.setAttribute("aria-selected", "true");
    const alvo = botao.dataset.aba;
    document.querySelectorAll(".painel").forEach((p) => {
      p.classList.toggle("oculto", p.dataset.painel !== alvo);
    });
  });
});

// ============================================================
// MOTOR DE GERAÇÃO
// ============================================================
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

function calcularParametrosDeDuracao(minutos, ppm) {
  const palavrasAlvo = Math.round(minutos * ppm);
  const palavrasMin = Math.round(palavrasAlvo * 0.9);
  const palavrasMax = Math.round(palavrasAlvo * 1.1);
  const perguntasMin = Math.max(4, Math.round(palavrasAlvo / 300));
  const humorMin = Math.max(2, Math.round(palavrasAlvo / 700));
  return { minutos, ppm, palavrasAlvo, palavrasMin, palavrasMax, perguntasMin, humorMin };
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
    const versos = livro.chapters[capitulo - 1].slice(versiculo - 1, versiculoFim);
    return versos.join(" ");
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

  // Substituir placeholders numéricos
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

// ============================================================
// CARREGAR HISTÓRICO POR CANAL
// ============================================================
async function carregarHistorico(canalId = null, reiniciar = false) {
  const lista = document.getElementById("lista-historico");
  const btnMais = document.getElementById("btn-mais-historico");
  
  if (reiniciar) {
    lista.innerHTML = "";
    ultimoDocHistorico = null;
  }
  
  // Se não tiver canalId, tenta pegar do dropdown
  if (!canalId) {
    const select = document.getElementById("select-canal");
    canalId = select.value;
  }
  
  if (!canalId || canalId === "") {
    lista.innerHTML = '<p style="color: var(--texto-fraco);">Selecione um canal para ver o histórico.</p>';
    btnMais.classList.add("oculto");
    return;
  }
  
  try {
    let q;
    if (ultimoDocHistorico) {
      q = query(
        collection(db, "historico"),
        where("canalId", "==", canalId),
        orderBy("criadoEm", "desc"),
        startAfter(ultimoDocHistorico),
        limit(PAGINA_HISTORICO)
      );
    } else {
      q = query(
        collection(db, "historico"),
        where("canalId", "==", canalId),
        orderBy("criadoEm", "desc"),
        limit(PAGINA_HISTORICO)
      );
    }
    
    const snap = await getDocs(q);
    if (reiniciar && snap.empty) {
      lista.innerHTML = '<p style="color: var(--texto-fraco);">Nenhum roteiro gerado para este canal ainda.</p>';
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
        <div class="item-titulo">${escaparHtml(r.titulo || "(sem título)")}</div>
        <div class="item-meta">${dataFormatada} · ${duracaoTexto}${momentoLabel} · ${idiomaLabel} · anáfora ${r.limite_anafora ?? "—"} · arquétipos: ${escaparHtml((r.arquetipos_usados || []).join(", "))}</div>
      `;
      lista.appendChild(item);
    });
    
    if (snap.docs.length > 0) {
      ultimoDocHistorico = snap.docs[snap.docs.length - 1];
    }
    btnMais.classList.toggle("oculto", snap.docs.length < PAGINA_HISTORICO);
  } catch (err) {
    console.error("Erro ao carregar histórico:", err);
  }
}

// ============================================================
// ABA: GERAR PROMPT
// ============================================================
const inputTitulo = document.getElementById("input-titulo");
const selectCanal = document.getElementById("select-canal");
const btnGerar = document.getElementById("btn-gerar");
const statusGerar = document.getElementById("status-gerar");
const cartaoResultado = document.getElementById("cartao-resultado");
const resultadoPrompt = document.getElementById("resultado-prompt");
const parametrosDetalhe = document.getElementById("parametros-detalhe");
const btnCopiar = document.getElementById("btn-copiar");
const cartaoRevisao = document.getElementById("cartao-revisao");
const resultadoRevisao = document.getElementById("resultado-revisao");
const btnCopiarRevisao = document.getElementById("btn-copiar-revisao");

// Quando o canal mudar, recarregar o histórico
selectCanal.addEventListener("change", () => {
  carregarHistorico(selectCanal.value, true);
});

btnGerar.addEventListener("click", async () => {
  const titulo = inputTitulo.value.trim();
  const canalId = selectCanal.value;
  const minutos = parseFloat(document.getElementById("input-minutos").value);
  const ppm = parseFloat(document.getElementById("input-ppm").value) || PPM_PADRAO;

  if (!titulo) {
    statusGerar.textContent = "Digite o título do vídeo.";
    statusGerar.className = "status erro";
    return;
  }
  if (!canalId || canalId === "") {
    statusGerar.textContent = "Selecione um canal.";
    statusGerar.className = "status erro";
    return;
  }
  if (!minutos || minutos <= 0) {
    statusGerar.textContent = "Digite uma duração válida em minutos.";
    statusGerar.className = "status erro";
    return;
  }
  if (!traducoes || !systemPrompts) {
    statusGerar.textContent = "Dados ainda não carregados. Aguarde...";
    statusGerar.className = "status erro";
    return;
  }

  btnGerar.disabled = true;
  statusGerar.textContent = "Gerando...";
  statusGerar.className = "status";

  try {
    // Buscar dados do canal
    const canalDoc = await getDoc(doc(db, "canais", canalId));
    if (!canalDoc.exists()) {
      throw new Error("Canal não encontrado.");
    }
    const canalData = canalDoc.data();
    const momento = canalData.momento;
    const idioma = canalData.idioma;

    // Carregar a Bíblia no idioma do canal
    const currentUser = auth.currentUser;
    if (currentUser) {
      await carregarBibliaDoStorage(idioma);
    }

    const langData = traducoes.languages?.[idioma] || {};
    const momentTemplates = traducoes.moment_templates || {};
    const templateBlocos = momentTemplates[momento]?.[idioma] || momentTemplates[momento]?.["pt-BR"] || "";

    // Carregar histórico APENAS deste canal
    const q = query(
      collection(db, "historico"),
      where("canalId", "==", canalId),
      orderBy("criadoEm", "desc"),
      limit(JANELA_REPETICAO)
    );
    const histSnap = await getDocs(q);
    const historicoRecente = histSnap.docs.map((d) => d.data());

    const arquetiposUsadosRecentes = itensUsadosRecentemente(historicoRecente, "arquetipos_usados");
    const casosUsadosRecentes = itensUsadosRecentemente(historicoRecente, "casos_usados");

    const duracao = calcularParametrosDeDuracao(minutos, ppm);
    const distribuicao = gerarDistribuicaoBlocos();

    // Pool de palavras dos títulos brutos
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
    resultadoPrompt.value = promptFinal;
    parametrosDetalhe.textContent = JSON.stringify(
      {
        canal: canalData.nome,
        momento,
        idioma,
        minutos: params.minutos,
        ppm: params.ppm,
        palavras_alvo: params.palavrasAlvo,
        palavras_min: params.palavrasMin,
        palavras_max: params.palavrasMax,
        perguntas_min: params.perguntasMin,
        humor_min: params.humorMin,
        limite_anafora: params.limite_anafora,
        distribuicao_blocos: params.distribuicao,
        arquetipos_evitar: params.arquetipos_evitar,
        casos_evitar: params.casos_evitar,
      },
      null,
      2
    );
    cartaoResultado.classList.remove("oculto");

    const revisao = montarMensagemRevisao(params, langData);
    resultadoRevisao.value = revisao;
    cartaoRevisao.classList.remove("oculto");

    // Salvar no histórico com canalId
    await addDoc(collection(db, "historico"), {
      canalId: canalId,
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
    });

    statusGerar.textContent = "Prompt gerado e histórico atualizado.";
    statusGerar.className = "status sucesso";
    
    // Recarregar histórico do canal
    carregarHistorico(canalId, true);
  } catch (err) {
    console.error(err);
    statusGerar.textContent = "Erro ao gerar: " + err.message;
    statusGerar.className = "status erro";
  } finally {
    btnGerar.disabled = false;
  }
});

btnCopiar.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultadoPrompt.value);
    btnCopiar.textContent = "Copiado!";
  } catch {
    resultadoPrompt.select();
    document.execCommand("copy");
    btnCopiar.textContent = "Copiado!";
  }
  setTimeout(() => {
    btnCopiar.textContent = "Copiar";
  }, 1500);
});

btnCopiarRevisao.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultadoRevisao.value);
    btnCopiarRevisao.textContent = "Copiado!";
  } catch {
    resultadoRevisao.select();
    document.execCommand("copy");
    btnCopiarRevisao.textContent = "Copiado!";
  }
  setTimeout(() => {
    btnCopiarRevisao.textContent = "Copiar";
  }, 1500);
});

// ============================================================
// ABA: HISTÓRICO (já integrado com o dropdown de canais)
// ============================================================
function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

document.getElementById("btn-recarregar-historico").addEventListener("click", () => {
  const canalId = document.getElementById("select-canal").value;
  carregarHistorico(canalId, true);
});

document.getElementById("btn-mais-historico").addEventListener("click", () => {
  const canalId = document.getElementById("select-canal").value;
  carregarHistorico(canalId, false);
});

// ============================================================
// ABA: FORMATAR PARÁGRAFOS
// ============================================================
function dividirEmFrases(paragrafo) {
  const partes = paragrafo.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9"“(\u2014\u2013])/);
  return partes.map((p) => p.trim()).filter(Boolean);
}

function formatarParagrafos(texto, maxFrasesPorParagrafo = 3) {
  const paragrafosOriginais = texto
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
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
  return {
    textoFormatado: paragrafosFinais.join("\n"),
    totalAjustados,
    totalParagrafosOriginais: paragrafosOriginais.length,
  };
}

const entradaFormatar = document.getElementById("entrada-formatar");
const btnFormatar = document.getElementById("btn-formatar");
const statusFormatar = document.getElementById("status-formatar");
const cartaoFormatado = document.getElementById("cartao-formatado");
const resultadoFormatado = document.getElementById("resultado-formatado");
const btnCopiarFormatado = document.getElementById("btn-copiar-formatado");

btnFormatar.addEventListener("click", () => {
  const texto = entradaFormatar.value.trim();
  if (!texto) {
    statusFormatar.textContent = "Cole o roteiro antes de formatar.";
    statusFormatar.className = "status erro";
    return;
  }
  const { textoFormatado, totalAjustados, totalParagrafosOriginais } = formatarParagrafos(texto);
  resultadoFormatado.value = textoFormatado;
  cartaoFormatado.classList.remove("oculto");
  statusFormatar.textContent =
    totalAjustados > 0
      ? `${totalAjustados} de ${totalParagrafosOriginais} parágrafos tinham mais de 3 frases — todos ajustados.`
      : "Nenhum parágrafo passava de 3 frases. Nada precisou ser alterado.";
  statusFormatar.className = "status sucesso";
});

btnCopiarFormatado.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultadoFormatado.value);
    btnCopiarFormatado.textContent = "Copiado!";
  } catch {
    resultadoFormatado.select();
    document.execCommand("copy");
    btnCopiarFormatado.textContent = "Copiado!";
  }
  setTimeout(() => {
    btnCopiarFormatado.textContent = "Copiar";
  }, 1500);
});
