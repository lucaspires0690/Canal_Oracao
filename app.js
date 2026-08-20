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
  orderBy,
  limit,
  startAfter,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- constantes do motor ----------
const JANELA_REPETICAO = 6;
const QTD_ARQUETIPOS_SUGERIDOS = 6;
const QTD_CASOS_SUGERIDOS = 6;
const PPM_PADRAO = 150;

// ---------- URLs dos arquivos JSON no GitHub ----------
const GITHUB_BASE = "https://raw.githubusercontent.com/lucaspires0690/meu_sistema_firebase/main/";
const URL_TRANSLATIONS = GITHUB_BASE + "translations.json";
const URL_SYSTEM_PROMPTS = GITHUB_BASE + "system_prompts.json";
const URL_VALIDATED_RULES = GITHUB_BASE + "validated_rules.json";
const URL_RAW_TITLES = GITHUB_BASE + "raw_titles.json";

// ---------- estado global ----------
let traducoes = null;
let systemPrompts = null;
let validatedRules = null;
let rawTitles = null;
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
    await carregarDados();
    carregarHistorico(true);
  } else if (user) {
    loginErro.textContent = `O e-mail ${user.email} não tem acesso a este app.`;
    await signOut(auth);
  } else {
    telaApp.classList.add("oculto");
    telaLogin.classList.remove("oculto");
  }
});

// ============================================================
// CARREGAR DADOS DO GITHUB
// ============================================================
async function carregarDados() {
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
  } catch (err) {
    console.error("❌ Erro ao carregar dados:", err);
    document.getElementById("status-gerar").textContent = "Erro ao carregar dados. Recarregue a página.";
    document.getElementById("status-gerar").className = "status erro";
  }
}

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
// ABA: GERAR PROMPT
// ============================================================
const inputTitulo = document.getElementById("input-titulo");
const selectMomento = document.getElementById("select-momento");
const selectIdioma = document.getElementById("select-idioma");
const btnGerar = document.getElementById("btn-gerar");
const statusGerar = document.getElementById("status-gerar");
const cartaoResultado = document.getElementById("cartao-resultado");
const resultadoPrompt = document.getElementById("resultado-prompt");
const parametrosDetalhe = document.getElementById("parametros-detalhe");
const btnCopiar = document.getElementById("btn-copiar");
const cartaoRevisao = document.getElementById("cartao-revisao");
const resultadoRevisao = document.getElementById("resultado-revisao");
const btnCopiarRevisao = document.getElementById("btn-copiar-revisao");

btnGerar.addEventListener("click", async () => {
  const titulo = inputTitulo.value.trim();
  const momento = selectMomento.value;
  const idioma = selectIdioma.value;
  const minutos = parseFloat(document.getElementById("input-minutos").value);
  const ppm = parseFloat(document.getElementById("input-ppm").value) || PPM_PADRAO;

  if (!titulo) {
    statusGerar.textContent = "Digite o título do vídeo.";
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
    const langData = traducoes.languages?.[idioma] || {};
    const momentTemplates = traducoes.moment_templates || {};
    const templateBlocos = momentTemplates[momento]?.[idioma] || momentTemplates[momento]?.["pt-BR"] || "";

    const histSnap = await getDocs(
      query(collection(db, "historico"), orderBy("criadoEm", "desc"), limit(JANELA_REPETICAO))
    );
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
        minutos: params.minutos,
        ppm: params.ppm,
        palavras_alvo: params.palavrasAlvo,
        palavras_min: params.palavrasMin,
        palavras_max: params.palavrasMax,
        perguntas_min: params.perguntasMin,
        humor_min: params.humorMin,
        limite_anafora: params.limite_anafora,
        distribuicao_blocos: params.distribuicao,
        momento,
        idioma,
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

    await addDoc(collection(db, "historico"), {
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
    carregarHistorico(true);
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
// ABA: HISTÓRICO
// ============================================================
function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

async function carregarHistorico(reiniciar = false) {
  const lista = document.getElementById("lista-historico");
  const btnMais = document.getElementById("btn-mais-historico");
  if (reiniciar) {
    lista.innerHTML = "";
    ultimoDocHistorico = null;
  }
  let q;
  if (ultimoDocHistorico) {
    q = query(
      collection(db, "historico"),
      orderBy("criadoEm", "desc"),
      startAfter(ultimoDocHistorico),
      limit(PAGINA_HISTORICO)
    );
  } else {
    q = query(collection(db, "historico"), orderBy("criadoEm", "desc"), limit(PAGINA_HISTORICO));
  }
  const snap = await getDocs(q);
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
}

document.getElementById("btn-recarregar-historico").addEventListener("click", () => carregarHistorico(true));
document.getElementById("btn-mais-historico").addEventListener("click", () => carregarHistorico(false));

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
