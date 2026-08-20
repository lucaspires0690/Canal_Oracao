# -*- coding: utf-8 -*-
"""
Gerador de Prompt — Canal de Oração Cristã (Multilíngue)
-------------------------------------------------------------
Roda 100% local. Carrega traduções e templates do translations.json.
Permite escolher o momento (Manhã/Noite/Madrugada) e o idioma (PT/EN/ES/FR/KO).

Como usar:
    python3 gerar_prompt.py
    (seleciona momento e idioma no terminal)

Arquivos usados:
    translations.json      -> Traduções e templates por idioma
    nvi.json               -> Bíblia NVI (para validação de versículos)
    raw_titles.json        -> Dados brutos dos canais
    historico_roteiros.json -> Memória do que já foi gerado
    prompt_pronto.txt       -> Saída pronta para copiar e colar
"""

import json
import os
import random
import datetime
import re

# ============================================================
# CONFIGURAÇÃO
# ============================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Arquivos de entrada
TRANSLATIONS_PATH = os.path.join(BASE_DIR, "translations.json")
NVI_PATH = os.path.join(BASE_DIR, "nvi.json")
RAW_TITLES_PATH = os.path.join(BASE_DIR, "raw_titles.json")
HISTORICO_PATH = os.path.join(BASE_DIR, "historico_roteiros.json")

# Arquivos de saída
SAIDA_PATH = os.path.join(BASE_DIR, "prompt_pronto.txt")
REVISAO_PATH = os.path.join(BASE_DIR, "revisao_pronta.txt")

# Constantes
JANELA_REPETICAO = 6
PALAVRAS_POR_MINUTO_PADRAO = 150

# Mapeamento de idiomas para suas Bíblias
BIBLE_MAP = {
    "pt-BR": "nvi",
    "en-US": "niv",
    "es-LA": "nvi_es",
    "fr": "lsg",
    "ko": "krv"
}

# ============================================================
# UTILITÁRIOS DE ARQUIVO
# ============================================================
def carregar_json(caminho, padrao=None):
    if not os.path.exists(caminho):
        return padrao if padrao is not None else {}
    with open(caminho, "r", encoding="utf-8") as f:
        return json.load(f)

def salvar_json(caminho, dados):
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

def garantir_historico():
    return carregar_json(HISTORICO_PATH, {"roteiros": []})

# ============================================================
# CARREGAR DADOS
# ============================================================
def carregar_biblia():
    return carregar_json(NVI_PATH, [])

def carregar_traducoes():
    return carregar_json(TRANSLATIONS_PATH, {})

def carregar_titulos_brutos():
    return carregar_json(RAW_TITLES_PATH, {})

# ============================================================
# LÓGICA DE VARIAÇÃO
# ============================================================
def itens_usados_recentemente(historico, campo, janela=JANELA_REPETICAO):
    recentes = historico["roteiros"][-janela:]
    usados = set()
    for r in recentes:
        usados.update(r.get(campo, []))
    return usados

def escolher_numero_sem_repetir(opcoes, historico, campo, janela=JANELA_REPETICAO):
    recentes = [r.get(campo) for r in historico["roteiros"][-janela:]]
    candidatos = [o for o in opcoes if o not in recentes]
    if not candidatos:
        candidatos = list(opcoes)
    return random.choice(candidatos)

def escolher_lista_sem_repetir(pool, usados_recentes, quantidade):
    disponiveis = [item for item in pool if item not in usados_recentes]
    if len(disponiveis) < quantidade:
        disponiveis = list(pool)
    random.shuffle(disponiveis)
    return disponiveis[:quantidade]

def gerar_distribuicao_blocos():
    base = {"B1": 10, "B2": 12, "B3": 33, "B4": 10, "B5": 11, "B6": 12, "B7": 12}
    variado = {}
    for bloco, pct in base.items():
        margem = pct * 0.15
        variado[bloco] = pct + random.uniform(-margem, margem)
    soma = sum(variado.values())
    fator = 100 / soma
    for bloco in variado:
        variado[bloco] = round(variado[bloco] * fator, 1)
    return variado

def calcular_palavras_por_bloco(distribuicao_pct, palavras_alvo):
    return {bloco: round(palavras_alvo * pct / 100) for bloco, pct in distribuicao_pct.items()}

def calcular_parametros_de_duracao(minutos, ppm=PALAVRAS_POR_MINUTO_PADRAO):
    palavras_alvo = round(minutos * ppm)
    palavras_min = round(palavras_alvo * 0.9)
    palavras_max = round(palavras_alvo * 1.1)
    perguntas_min = max(4, round(palavras_alvo / 300))
    humor_min = max(2, round(palavras_alvo / 700))
    return {
        "minutos": minutos,
        "ppm": ppm,
        "palavras_alvo": palavras_alvo,
        "palavras_min": palavras_min,
        "palavras_max": palavras_max,
        "perguntas_min": perguntas_min,
        "humor_min": humor_min,
    }

# ============================================================
# FUNÇÃO PARA BUSCAR VERSÍCULO NA BÍBLIA (NVI)
# ============================================================
def buscar_versiculo(referencia: str, biblia) -> str:
    padrao = r"^([a-zA-ZÀ-ú]+)\s+(\d+):(\d+)(?:-(\d+))?$"
    match = re.match(padrao, referencia.strip())
    if not match:
        return None
    livro_nome, capitulo, versiculo, versiculo_fim = match.groups()
    capitulo = int(capitulo)
    versiculo = int(versiculo)
    livro = next((l for l in biblia if l["name"].lower() == livro_nome.lower()), None)
    if not livro:
        return None
    if capitulo > len(livro["chapters"]):
        return None
    if versiculo_fim:
        versiculo_fim = int(versiculo_fim)
        versos = livro["chapters"][capitulo - 1][versiculo - 1:versiculo_fim]
        return " ".join(versos)
    else:
        return livro["chapters"][capitulo - 1][versiculo - 1]

# ============================================================
# MONTAGEM DO PROMPT
# ============================================================
def montar_prompt(params, instructions, template_blocos):
    """
    Monta o prompt final usando as instruções traduzidas e o template de blocos.
    """
    # Substitui os placeholders nas instruções
    texto = instructions.get("system_prompt", "") + "\n\n"
    texto += instructions.get("channel_identity", "") + "\n\n"
    texto += instructions.get("focus", "") + "\n\n"
    texto += instructions.get("narrative_objective", "") + "\n\n"
    texto += instructions.get("title_placeholder", "").replace("<<TITULO>>", params["titulo"]) + "\n\n"
    texto += instructions.get("analysis_step", "") + "\n\n"
    texto += instructions.get("word_count", "") + "\n\n"
    texto += instructions.get("structural_variation", "") + "\n\n"
    
    # Estrutura dos blocos (traduzida)
    texto += "🧱 ESTRUTURA NARRATIVA — 7 BLOCOS (obrigatória)\n\n"
    
    # Usar o template de blocos específico do momento e idioma
    blocos = template_blocos.split("\n")
    for bloco in blocos:
        if bloco.strip():
            texto += bloco + "\n"
    
    texto += "\n"
    texto += instructions.get("forbidden_absolutes", "") + "\n\n"
    texto += instructions.get("tts_format", "") + "\n\n"
    
    # Instrução final com verificação
    texto += """✅ VERIFICAÇÃO PROGRESSIVA DE PALAVRAS (durante a escrita, bloco por bloco)

Cada bloco tem um alvo de palavras definido na seção 🔁 Variação Estrutural acima. Ao terminar de escrever cada bloco, faça uma pausa interna e estime quantas palavras esse bloco tem.

Se o bloco ficou visivelmente abaixo do alvo dele, complete antes de seguir adiante.

Antes de entregar a resposta final, confirme que o texto final realmente contém:
- Pelo menos <<PERGUNTAS_MIN>> perguntas retóricas
- Pelo menos <<HUMOR_MIN>> momentos de consolo/declarações de paz
- Pelo menos 2 versículos bíblicos citados explicitamente (via {{VERSICULO}})
- Nenhum parágrafo com mais de 3 frases
- O tom acolhedor e compassivo (nunca de acusação ou medo)

Se o total geral passar de <<PALAVRAS_MAX>> palavras, corte o excesso sem perder nenhuma das regras obrigatórias acima.
"""
    
    texto += "\n" + instructions.get("final_output", "").replace("<<TITULO>>", params["titulo"])
    
    # Substituir placeholders de números
    substitutos = {
        "<<MINUTOS>>": str(params["minutos"]),
        "<<PPM>>": str(params["ppm"]),
        "<<PALAVRAS_ALVO>>": str(params["palavras_alvo"]),
        "<<PALAVRAS_MIN>>": str(params["palavras_min"]),
        "<<PALAVRAS_MAX>>": str(params["palavras_max"]),
        "<<PERGUNTAS_MIN>>": str(params["perguntas_min"]),
        "<<HUMOR_MIN>>": str(params["humor_min"]),
        "<<LIMITE_ANAFORA>>": str(params["limite_anafora"]),
        "<<B1>>": str(params["distribuicao"]["B1"]),
        "<<B2>>": str(params["distribuicao"]["B2"]),
        "<<B3>>": str(params["distribuicao"]["B3"]),
        "<<B4>>": str(params["distribuicao"]["B4"]),
        "<<B5>>": str(params["distribuicao"]["B5"]),
        "<<B6>>": str(params["distribuicao"]["B6"]),
        "<<B7>>": str(params["distribuicao"]["B7"]),
        "<<PALAVRAS_B1>>": str(params["palavras_por_bloco"]["B1"]),
        "<<PALAVRAS_B2>>": str(params["palavras_por_bloco"]["B2"]),
        "<<PALAVRAS_B3>>": str(params["palavras_por_bloco"]["B3"]),
        "<<PALAVRAS_B4>>": str(params["palavras_por_bloco"]["B4"]),
        "<<PALAVRAS_B5>>": str(params["palavras_por_bloco"]["B5"]),
        "<<PALAVRAS_B6>>": str(params["palavras_por_bloco"]["B6"]),
        "<<PALAVRAS_B7>>": str(params["palavras_por_bloco"]["B7"]),
        "<<ARQUETIPOS_EVITAR>>": "\n".join(f"- {a}" for a in params["arquetipos_evitar"]),
        "<<CASOS_EVITAR>>": "\n".join(f"- {c}" for c in params["casos_evitar"]),
    }
    for chave, valor in substitutos.items():
        texto = texto.replace(chave, valor)
    
    return texto

def montar_mensagem_revisao(params, lang_data):
    return f"""{lang_data.get('revision_message', 'Revise o roteiro que você acabou de escrever para este vídeo')}:

1. Contagem de palavras: confira se o roteiro tem entre {params['palavras_min']} e {params['palavras_max']} palavras.
2. Parágrafos: nenhum parágrafo pode ter mais de 3 frases.
3. Humor/consolo: confirme se existem pelo menos {params['humor_min']} momentos de consolo distribuídos.
4. Versículos: confirme que os versículos sugeridos estão corretos (use {{VERSICULO}} como marcador).
5. Tom: o tom deve ser acolhedor, compassivo e nunca de acusação ou medo.

Entregue apenas o roteiro corrigido e completo. Sem comentários sobre o que foi revisado."""

# ============================================================
# MENU INTERATIVO
# ============================================================
def exibir_menu_opcoes(titulo, opcoes):
    print(f"\n{titulo}")
    for i, (chave, valor) in enumerate(opcoes.items(), 1):
        print(f"   {i}. {valor}")
    while True:
        try:
            escolha = input("Digite o número da sua escolha: ").strip()
            num = int(escolha)
            if 1 <= num <= len(opcoes):
                return list(opcoes.keys())[num - 1]
        except ValueError:
            pass
        print("Opção inválida. Tente novamente.")

# ============================================================
# PROGRAMA PRINCIPAL
# ============================================================
def main():
    print("=" * 60)
    print("   GERADOR DE PROMPT — CANAL DE ORAÇÃO CRISTÃ")
    print("   Multilíngue | Momentos: Manhã / Noite / Madrugada")
    print("=" * 60)
    
    # Carregar dados
    traducoes = carregar_traducoes()
    biblia = carregar_biblia()
    titulos_brutos = carregar_titulos_brutos()
    historico = garantir_historico()
    
    if not traducoes:
        print("❌ translations.json não encontrado. Execute o script na pasta correta.")
        return
    
    # 1. ESCOLHER O MOMENTO
    momentos = {
        "manha_disposicao": "Manhã (Começar o Dia com Deus)",
        "madrugada_ansiedade": "Madrugada (Ansiedade / Medo / Insônia)",
        "noite_sono": "Noite (Descanso / Sono Tranquilo)"
    }
    momento_escolhido = exibir_menu_opcoes("📋 ESCOLHA O MOMENTO DO CANAL:", momentos)
    print(f"✅ Momento selecionado: {momentos[momento_escolhido]}")
    
    # 2. ESCOLHER O IDIOMA
    idiomas = traducoes.get("languages", {})
    nomes_idiomas = {k: v.get("name", k) for k, v in idiomas.items()}
    idioma_escolhido = exibir_menu_opcoes("🌍 ESCOLHA O IDIOMA:", nomes_idiomas)
    lang_data = idiomas.get(idioma_escolhido, {})
    print(f"✅ Idioma selecionado: {lang_data.get('name', idioma_escolhido)}")
    
    # 3. ENTRADA DO USUÁRIO
    print("\n" + "=" * 60)
    titulo = input("📝 Qual é o título exato do vídeo? ").strip()
    while not titulo:
        titulo = input("O título não pode ficar em branco: ").strip()
    
    while True:
        bruto = input("⏱️  Quantos minutos de narração (ex: 10, 12.5)? ").strip()
        try:
            minutos = float(bruto.replace(",", "."))
            if minutos > 0:
                break
        except ValueError:
            pass
        print("Digite um número válido de minutos.")
    
    # 4. PARÂMETROS
    params = {
        "titulo": titulo,
        "limite_anafora": escolher_numero_sem_repetir([2, 3, 4], historico, "limite_anafora"),
        "distribuicao": gerar_distribuicao_blocos(),
    }
    params.update(calcular_parametros_de_duracao(minutos))
    params["palavras_por_bloco"] = calcular_palavras_por_bloco(params["distribuicao"], params["palavras_alvo"])
    
    # 5. EVITAR REPETIÇÃO
    arquetipos_usados = itens_usados_recentemente(historico, "arquetipos_usados")
    casos_usados = itens_usados_recentemente(historico, "casos_usados")
    
    # Pools básicos
    pools = {
        "arquetipos_personagens": ["ansiedade", "medo", "solidão", "preocupação", "insônia", "desânimo", "cansaço", "dúvida"],
        "casos_historicos": ["Salmo 91", "Salmo 23", "Mateus 11:28", "Filipenses 4:6-7", "Isaías 41:10", "João 14:27"]
    }
    if titulos_brutos:
        todas_palavras = []
        for canal in titulos_brutos.values():
            for fase in ["antigos", "recentes", "virais"]:
                for item in canal.get(fase, []):
                    palavras = item.get("title", "").lower().split()
                    todas_palavras.extend(palavras)
        if todas_palavras:
            from collections import Counter
            contagem = Counter(todas_palavras)
            palavras_comuns = [p for p, c in contagem.most_common(20) if len(p) > 3]
            pools["arquetipos_personagens"] = palavras_comuns[:10] if palavras_comuns else pools["arquetipos_personagens"]
    
    params["arquetipos_evitar"] = escolher_lista_sem_repetir(
        pools.get("arquetipos_personagens", []), arquetipos_usados, 6
    )
    params["casos_evitar"] = escolher_lista_sem_repetir(
        pools.get("casos_historicos", []), casos_usados, 6
    )
    
    # 6. MONTAR O PROMPT
    instructions = lang_data.get("instructions", {})
    moment_templates = traducoes.get("moment_templates", {})
    template_blocos = moment_templates.get(momento_escolhido, {}).get(idioma_escolhido, "")
    
    if not template_blocos:
        # Fallback: usar o template em português
        template_blocos = moment_templates.get(momento_escolhido, {}).get("pt-BR", "")
        print("⚠️  Template não encontrado para este idioma. Usando português como fallback.")
    
    prompt_final = montar_prompt(params, instructions, template_blocos)
    mensagem_revisao = montar_mensagem_revisao(params, lang_data)
    
    # 7. SALVAR
    with open(SAIDA_PATH, "w", encoding="utf-8") as f:
        f.write(prompt_final)
    with open(REVISAO_PATH, "w", encoding="utf-8") as f:
        f.write(mensagem_revisao)
    
    # 8. HISTÓRICO
    novo_registro = {
        "id": len(historico["roteiros"]) + 1,
        "data": datetime.datetime.now().isoformat(timespec="seconds"),
        "titulo": titulo,
        "minutos": params["minutos"],
        "palavras_alvo": params["palavras_alvo"],
        "limite_anafora": params["limite_anafora"],
        "distribuicao_blocos": params["distribuicao"],
        "arquetipos_usados": params["arquetipos_evitar"][:3],
        "casos_usados": params["casos_evitar"][:3],
        "momento": momento_escolhido,
        "idioma": idioma_escolhido,
    }
    historico["roteiros"].append(novo_registro)
    salvar_json(HISTORICO_PATH, historico)
    
    # 9. EXIBIR RESUMO
    print("\n" + "=" * 60)
    print(f"✅ Prompt gerado com sucesso!")
    print(f"   Título: \"{titulo}\"")
    print(f"   Momento: {momentos[momento_escolhido]}")
    print(f"   Idioma: {lang_data.get('name', idioma_escolhido)}")
    print(f"   Duração: {params['minutos']} min → {params['palavras_alvo']} palavras")
    print(f"\n📄 Prompt: {SAIDA_PATH}")
    print(f"📄 Revisão: {REVISAO_PATH}")
    print(f"🗂️  Histórico: {HISTORICO_PATH}")
    print("\n1) Abra o prompt_pronto.txt, copie tudo e cole no Claude.ai.")
    print("2) Depois do roteiro, cole a revisão para ele corrigir.")
    print("=" * 60)

if __name__ == "__main__":
    main()
