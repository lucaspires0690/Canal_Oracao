# -*- coding: utf-8 -*-
"""
Gerador de Prompt — Canal de Oração Cristã
-------------------------------------------------------------
Roda 100% local. Usa os arquivos JSON baixados do Firebase.
Gera um prompt pronto para o Claude, com base nos templates e regras validadas.

Como usar:
    python3 gerar_prompt.py
    (ele vai pedir o título e a duração em minutos no terminal)

Arquivos usados:
    nvi.json                -> Bíblia NVI (para validação de versículos)
    raw_titles.json         -> Dados brutos dos canais (para evitar repetição)
    validated_rules.json    -> Regras de validação
    system_prompts.json     -> Templates de roteiro
    historico_roteiros.json -> Memória do que já foi gerado (criado automaticamente)
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
NVI_PATH = os.path.join(BASE_DIR, "nvi.json")
RAW_TITLES_PATH = os.path.join(BASE_DIR, "raw_titles.json")
RULES_PATH = os.path.join(BASE_DIR, "validated_rules.json")
PROMPTS_PATH = os.path.join(BASE_DIR, "system_prompts.json")
HISTORICO_PATH = os.path.join(BASE_DIR, "historico_roteiros.json")

# Arquivos de saída
SAIDA_PATH = os.path.join(BASE_DIR, "prompt_pronto.txt")
REVISAO_PATH = os.path.join(BASE_DIR, "revisao_pronta.txt")

# Constantes
JANELA_REPETICAO = 6
PALAVRAS_POR_MINUTO_PADRAO = 150

# ============================================================
# CARREGAR ARQUIVOS JSON
# ============================================================
def carregar_json(caminho, padrao=None):
    """Carrega um arquivo JSON, ou retorna um padrão se não existir."""
    if not os.path.exists(caminho):
        if padrao is not None:
            return padrao
        return {}
    with open(caminho, "r", encoding="utf-8") as f:
        return json.load(f)

def salvar_json(caminho, dados):
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

def garantir_historico():
    return carregar_json(HISTORICO_PATH, {"roteiros": []})

# ============================================================
# CARREGAR DADOS DO FIREBASE (ARQUIVOS LOCAIS)
# ============================================================
def carregar_biblia():
    """Carrega a Bíblia NVI do arquivo local."""
    return carregar_json(NVI_PATH, [])

def carregar_regras():
    """Carrega as regras validadas do arquivo local."""
    return carregar_json(RULES_PATH, {})

def carregar_templates():
    """Carrega os templates de roteiro do arquivo local."""
    return carregar_json(PROMPTS_PATH, {})

def carregar_titulos_brutos():
    """Carrega os títulos brutos dos canais para evitar repetição."""
    return carregar_json(RAW_TITLES_PATH, {})

# ============================================================
# LÓGICA DE VARIAÇÃO (evita repetir o que já foi usado recentemente)
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
    """Varia a porcentagem de palavras por bloco em até ±15% do valor base."""
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
# FUNÇÃO PARA BUSCAR VERSÍCULO NA BÍBLIA
# ============================================================
def buscar_versiculo(referencia: str, biblia) -> str:
    """
    Recebe uma referência como "Isaías 41:10" e retorna o texto do versículo.
    """
    if not biblia:
        return None
    
    padrao = r"^([a-zA-ZÀ-ú]+)\s+(\d+):(\d+)(?:-(\d+))?$"
    match = re.match(padrao, referencia.strip())
    if not match:
        return None
    
    livro_nome, capitulo, versiculo, versiculo_fim = match.groups()
    capitulo = int(capitulo)
    versiculo = int(versiculo)
    
    # Buscar o livro pelo nome (em português)
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
# MONTAGEM DO PROMPT FINAL
# ============================================================
def montar_prompt(params, template):
    """
    Monta o prompt final substituindo os placeholders no template.
    """
    texto = template
    substituicoes = {
        "<<TITULO>>": params["titulo"],
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
    for chave, valor in substituicoes.items():
        texto = texto.replace(chave, valor)
    return texto

def montar_mensagem_revisao(params):
    return f"""Revise o roteiro que você acabou de escrever para este vídeo, sem reescrevê-lo do zero — corrija apenas o que estiver fora do esperado:

1. Contagem de palavras: confira se o roteiro tem entre {params['palavras_min']} e {params['palavras_max']} palavras. Se estiver abaixo de {params['palavras_min']}, expanda as partes mais fracas.
2. Parágrafos: nenhum parágrafo pode ter mais de 3 frases. Quebre qualquer parágrafo mais longo em parágrafos menores.
3. Humor situacional: confirme se existem pelo menos {params['humor_min']} momentos de humor distribuídos ao longo do roteiro.
4. Versículos: confirme que os versículos sugeridos estão corretos e bem integrados.
5. Tom: o tom deve ser acolhedor, compassivo e nunca de acusação ou medo.

Entregue apenas o roteiro corrigido e completo. Sem comentários sobre o que foi revisado."""

# ============================================================
# PROGRAMA PRINCIPAL
# ============================================================
def main():
    print("=== Gerador de Prompt — Canal de Oração Cristã ===\n")
    
    # Carregar todos os dados
    biblia = carregar_biblia()
    regras = carregar_regras()
    templates = carregar_templates()
    titulos_brutos = carregar_titulos_brutos()
    historico = garantir_historico()
    
    # Verificar se os arquivos essenciais existem
    if not biblia:
        print("⚠️  nvi.json não encontrado ou vazio. A validação de versículos não funcionará.")
    if not regras:
        print("⚠️  validated_rules.json não encontrado ou vazio. Usando regras padrão.")
    if not templates:
        print("⚠️  system_prompts.json não encontrado ou vazio. Usando template padrão.")
        templates = {"templates": {"madrugada_ansiedade": {"structure": {}}}}
    
    # Entrada do usuário
    titulo = input("📝 Qual é o título exato do vídeo? ").strip()
    while not titulo:
        titulo = input("O título não pode ficar em branco. Digite o título do vídeo: ").strip()
    
    while True:
        bruto = input("⏱️  Quantos minutos de narração você quer (pode variar ±10%)? ").strip()
        try:
            minutos = float(bruto.replace(",", "."))
            if minutos > 0:
                break
        except ValueError:
            pass
        print("Digite um número válido de minutos (ex.: 9, 10, 12.5).")
    print()
    
    # Escolher o template com base no título (simples: por palavras-chave)
    template_escolhido = "madrugada_ansiedade"
    titulo_lower = titulo.lower()
    if "manhã" in titulo_lower or "despertar" in titulo_lower or "começar" in titulo_lower:
        template_escolhido = "manha_disposicao"
    elif "noite" in titulo_lower or "dormir" in titulo_lower or "descansar" in titulo_lower:
        template_escolhido = "noite_sono"
    
    template_texto = templates.get("templates", {}).get(template_escolhido, {}).get("structure", "")
    
    # Se não tiver estrutura no template, usar um padrão
    if not template_texto:
        template_texto = """
BLOCO 1 — GANCHO
BLOCO 2 — ACOLHIMENTO
BLOCO 3 — ORAÇÃO PRINCIPAL (use {{VERSICULO}} aqui)
BLOCO 4 — VIRADA
BLOCO 5 — TENSÃO HONESTA
BLOCO 6 — PROMESSA (use {{VERSICULO}} aqui)
BLOCO 7 — ENCERRAMENTO
"""
    
    # Parâmetros
    params = {
        "titulo": titulo,
        "limite_anafora": escolher_numero_sem_repetir([2, 3, 4], historico, "limite_anafora"),
        "distribuicao": gerar_distribuicao_blocos(),
    }
    params.update(calcular_parametros_de_duracao(minutos))
    params["palavras_por_bloco"] = calcular_palavras_por_bloco(params["distribuicao"], params["palavras_alvo"])
    
    # Evitar repetição de arquétipos e casos (usando dados brutos como referência)
    arquetipos_usados = itens_usados_recentemente(historico, "arquetipos_usados")
    casos_usados = itens_usados_recentemente(historico, "casos_usados")
    
    # Extrair pools dos dados brutos (se disponível)
    pools = {
        "arquetipos_personagens": ["ansiedade", "medo", "solidão", "preocupação", "insônia", "desânimo"],
        "casos_historicos": ["Salmo 91", "Salmo 23", "Mateus 11:28", "Filipenses 4:6-7", "Isaías 41:10", "João 14:27"]
    }
    if titulos_brutos:
        # Extrair palavras-chave dos títulos virais
        todas_palavras = []
        for canal in titulos_brutos.values():
            for fase in ["antigos", "recentes", "virais"]:
                for item in canal.get(fase, []):
                    palavras = item.get("title", "").lower().split()
                    todas_palavras.extend(palavras)
        # Usar as palavras mais comuns como "arquétipos" para evitar repetição
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
    
    # Montar prompt
    prompt_final = montar_prompt(params, template_texto)
    mensagem_revisao = montar_mensagem_revisao(params)
    
    # Salvar saídas
    with open(SAIDA_PATH, "w", encoding="utf-8") as f:
        f.write(prompt_final)
    with open(REVISAO_PATH, "w", encoding="utf-8") as f:
        f.write(mensagem_revisao)
    
    # Registrar no histórico
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
        "template_usado": template_escolhido,
    }
    historico["roteiros"].append(novo_registro)
    salvar_json(HISTORICO_PATH, historico)
    
    # Buscar um versículo de exemplo para mostrar
    exemplo_versiculo = None
    if biblia:
        referencia_teste = "João 3:16"
        exemplo_versiculo = buscar_versiculo(referencia_teste, biblia)
    
    print(f"\n✅ Prompt gerado com sucesso para o título:")
    print(f"   \"{titulo}\"")
    print(f"📄 Prompt principal: {SAIDA_PATH}")
    print(f"📄 Mensagem de revisão: {REVISAO_PATH}")
    print(f"🗂️  Histórico atualizado: {HISTORICO_PATH}")
    print(f"\nParâmetros calculados desta rodada:")
    print(f"   Duração: {params['minutos']} min → {params['palavras_alvo']} palavras alvo ({params['palavras_min']}–{params['palavras_max']})")
    print(f"   Perguntas retóricas mínimas: {params['perguntas_min']} | Momentos de humor mínimos: {params['humor_min']}")
    print(f"   Limite de anáfora: {params['limite_anafora']}")
    print(f"   Template usado: {template_escolhido}")
    if exemplo_versiculo:
        print(f"\n📖 Exemplo de versículo (João 3:16):")
        print(f"   \"{exemplo_versiculo}\"")
    print("\n1) Abra o prompt_pronto.txt, copie tudo e cole numa conversa nova do Claude.ai.")
    print("2) Depois que o Claude entregar o roteiro, cole o conteúdo de revisao_pronta.txt")
    print("   na mesma conversa, como uma segunda mensagem, pra ele revisar o que falhar.")

if __name__ == "__main__":
    main()
