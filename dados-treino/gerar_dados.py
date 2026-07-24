# -*- coding: utf-8 -*-
"""
Gerador de dados sintéticos de treino para análise no Excel
(Tabela Dinâmica + Power Query).

Reproduz FIELMENTE o schema/formato que o admin exporta hoje em
`public/admin.js` (`_relToCsv` / `_relExportarCsv`) a partir dos endpoints
`/relatorios/{chamados,alertas,telemetria}` (`src/routes/relatorios.routes.js`):

  - Separador de coluna : ";"
  - Fim de linha        : CRLF ("\\r\\n")
  - Encoding            : UTF-8 COM BOM
  - Escape de campo     : aspas duplas se contiver ; " CR LF  ->  "" internamente
  - Datas/hora          : ISO-8601 UTC com milissegundos e "Z"  (timestamptz -> JSON)
  - "Dia" (telemetria)  : DATE -> "YYYY-MM-DDT00:00:00.000Z"
  - Decimais (SLA/Tempo): numeric ROUND(x,1) -> string com PONTO ("4.5")

Enums extraídos do código (não inventados):
  - chamado.status     : aberto | em_atendimento | fechado
  - chamado.prioridade : p1 | p2 | p3 | p4
  - chamado.categoria  : vazamento | bomba_falha | nivel_baixo | sem_agua | ruido | manutencao | outro
  - alerta.tipo        : dispositivo_offline | nivel_baixo | nivel_muito_baixo
  - alerta.status      : aberto | resolvido
  - reservatorio.tipo  : superior | inferior | outro

OBS sobre nomes: o repositório NÃO tem seed de condomínios/reservatórios
(vivem só no banco de produção). Os nomes abaixo são plausíveis e seguem a
convenção de device_id do firmware (`RES_<APELIDO>_<SUP|INF>`,
ver firmware/esp32_telemetria.ino -> "RES_TESTE_SUP"). Troque à vontade.
"""

import math
import random
import datetime as dt
from pathlib import Path

# ==========================================================================
# CONFIG (mexa aqui) ── seed fixa e parametrizável
# ==========================================================================
SEED               = 42                       # troque p/ variar mantendo os padrões
END_DATE           = dt.date(2026, 7, 24)     # último dia (hoje). use dt.date.today() se quiser
N_DIAS             = 90                        # tamanho do período
CHAMADOS_POR_MES   = 40                        # ~alvo mensal
LEITURAS_DIA       = 96                        # 1 leitura / 15 min em condição normal
BR_UTC_OFFSET_H    = 3                         # America/Sao_Paulo = UTC-3 (banco guarda UTC)
OUT_DIR            = Path(__file__).resolve().parent   # escreve os CSVs aqui (./dados-treino/)

rng = random.Random(SEED)

# ── "agora" de referência (para SLA/Tempo de itens ainda abertos) ──
NOW_LOCAL = dt.datetime(END_DATE.year, END_DATE.month, END_DATE.day, 20, 0, 0)
DIAS = [END_DATE - dt.timedelta(days=i) for i in range(N_DIAS - 1, -1, -1)]  # asc

# ==========================================================================
# ENTIDADES
# ==========================================================================
TECNICOS = [
    "Anderson Souza", "Bruno Carvalho", "Carlos Nogueira",
    "Diego Ramos", "Eduardo Pinto", "Fábio Tavares",
]
# padrões plantados nos técnicos:
TEC_RESOLVE_LENTO   = "Carlos Nogueira"   # tempo TOTAL de resolução ~3x pior
TEC_1A_RESPOSTA_LENTA = "Diego Ramos"     # demora MUITO p/ 1ª resposta, mas resolve rápido depois

# Perfis de tempo (medianas em minutos p/ lognormal)
#   base_ttfr  = tempo até a 1ª resposta   (primeira_resposta_em - criado_em)
#   base_post  = tempo após a 1ª resposta  (fechado_em - primeira_resposta_em)
TEC_PERFIL = {
    "Anderson Souza": dict(base_ttfr=30,  base_post=200),
    "Bruno Carvalho": dict(base_ttfr=45,  base_post=260),
    "Carlos Nogueira": dict(base_ttfr=40,  base_post=760),   # ~3x a média de resolução
    "Diego Ramos":     dict(base_ttfr=360, base_post=45),    # 1ª resposta ~6h, resolve em ~45min
    "Eduardo Pinto":   dict(base_ttfr=35,  base_post=230),
    "Fábio Tavares":   dict(base_ttfr=50,  base_post=210),
}

CONDOMINIOS = {
    1: "Residencial Jardim das Acácias",
    2: "Edifício Monte Belo",       # categoria recorrente (vazamento) + reservatório vazando
    3: "Condomínio Parque Ipê",     # concentra alertas de offline (rede local ruim)
    4: "Residencial Vista Verde",
    5: "Condomínio Bela Vista",
}

# device_id, nome do reservatório, tipo, condominio_id
RESERVATORIOS = [
    dict(device="RES_ACAC_SUP",   nome="Caixa Superior", tipo="superior", condo=1),
    dict(device="RES_ACAC_INF",   nome="Cisterna",       tipo="inferior", condo=1),
    dict(device="RES_MONTE_SUP",  nome="Caixa Superior", tipo="superior", condo=2),
    dict(device="RES_MONTE_INF",  nome="Cisterna",       tipo="inferior", condo=2),  # VAZAMENTO
    dict(device="RES_IPE_SUP",    nome="Caixa Superior", tipo="superior", condo=3),  # offline-prone
    dict(device="RES_IPE_INF",    nome="Cisterna",       tipo="inferior", condo=3),  # gap de 2 dias
    dict(device="RES_VVERDE_SUP", nome="Caixa Superior", tipo="superior", condo=4),  # bomba ~95%
    dict(device="RES_BVISTA_SUP", nome="Caixa Superior", tipo="superior", condo=5),  # leituras instáveis
]
DEV = {r["device"]: r for r in RESERVATORIOS}

# ── entidades dos padrões plantados ──
RES_VAZANDO     = "RES_MONTE_INF"    # queda lenta e constante
RES_BOMBA_95    = "RES_VVERDE_SUP"   # bomba ligada em ~95% das leituras
RES_INSTAVEL    = "RES_BVISTA_SUP"   # volume de leituras bem abaixo em alguns dias, SEM alerta
RES_GAP_2DIAS   = "RES_IPE_INF"      # 2 dias seguidos sem nenhuma leitura
CONDO_OFFLINE   = 3                  # Parque Ipê concentra dispositivo_offline
CONDO_VAZAMENTO = 2                  # Monte Belo -> categoria vazamento recorrente

# baseline de nível médio (%) por device em condição normal
BASE_NIVEL = {
    "RES_ACAC_SUP": 66, "RES_ACAC_INF": 54,
    "RES_MONTE_SUP": 62, "RES_MONTE_INF": None,   # vazando -> curva própria
    "RES_IPE_SUP": 63, "RES_IPE_INF": 52,
    "RES_VVERDE_SUP": 58, "RES_BVISTA_SUP": 64,
}
# fração normal de leituras com bomba ligada
BASE_BOMBA = {
    "RES_ACAC_SUP": 0.22, "RES_ACAC_INF": 0.30,
    "RES_MONTE_SUP": 0.25, "RES_MONTE_INF": 0.40,
    "RES_IPE_SUP": 0.24, "RES_IPE_INF": 0.28,
    "RES_VVERDE_SUP": 0.95,  # anomalia
    "RES_BVISTA_SUP": 0.26,
}

# ==========================================================================
# HELPERS de formatação (fiéis ao export)
# ==========================================================================
def to_iso_utc(local_dt):
    """timestamptz -> ISO-8601 UTC c/ ms e Z, como o driver pg + JSON.stringify."""
    u = local_dt + dt.timedelta(hours=BR_UTC_OFFSET_H)
    return u.strftime("%Y-%m-%dT%H:%M:%S") + ".%03dZ" % rng.randint(0, 999)

def dia_iso(d):
    """DATE -> 'YYYY-MM-DDT00:00:00.000Z' (midnight UTC no servidor UTC)."""
    return d.strftime("%Y-%m-%d") + "T00:00:00.000Z"

def dec1(x):
    """numeric ROUND(x,1) -> string com ponto decimal ('4.5', '12.0')."""
    return "%.1f" % x

def draw(med_min, sigma=0.55):
    """amostra lognormal em minutos com mediana med_min."""
    return max(2.0, rng.lognormvariate(math.log(med_min), sigma))

def _cap_hora(d, h_max):
    """No último dia, não deixa o evento nascer depois do 'agora' de referência."""
    return h_max if d != END_DATE else min(h_max, NOW_LOCAL.hour - 1)

def business_dt(d):
    h = int(rng.triangular(7, min(21, _cap_hora(d, 21)), 14))
    return dt.datetime(d.year, d.month, d.day, h, rng.randint(0, 59), rng.randint(0, 59))

def any_dt(d):
    return dt.datetime(d.year, d.month, d.day, rng.randint(0, _cap_hora(d, 23)),
                       rng.randint(0, 59), rng.randint(0, 59))

def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))

# ── escrita CSV idêntica a _relToCsv/_relBaixarCsv ──
def _esc(v):
    if v is None:
        return ""
    s = str(v)
    if any(c in s for c in (";", '"', "\r", "\n")):
        return '"' + s.replace('"', '""') + '"'
    return s

def escrever_csv(path, headers, linhas):
    header = ";".join(_esc(h) for h in headers)
    corpo = "\r\n".join(";".join(_esc(c) for c in linha) for linha in linhas)
    texto = header + "\r\n" + corpo
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write("﻿" + texto)   # BOM

# ==========================================================================
# 1) TELEMETRIA (uma linha por reservatório por dia) + coleta de sinais
#    p/ alertas correlacionados
# ==========================================================================
# dias de eventos especiais
offline_days = {          # device -> set de dias com queda de comunicação (Ipê domina)
    "RES_IPE_SUP": set(rng.sample(DIAS, 20)),
    "RES_IPE_INF": set(rng.sample(DIAS, 15)),
}
# um pouco de offline esporádico em outros devices (ruído realista)
for dv in ("RES_ACAC_SUP", "RES_MONTE_SUP", "RES_VVERDE_SUP"):
    offline_days[dv] = set(rng.sample(DIAS, rng.randint(1, 3)))

# gap total de 2 dias seguidos (sem nenhuma linha) p/ RES_IPE_INF
gap_start_idx = 46
GAP_DIAS = {DIAS[gap_start_idx], DIAS[gap_start_idx + 1]}

# dias de conectividade instável (poucas leituras, SEM alerta) p/ RES_BVISTA_SUP
flaky_days = set(rng.sample(DIAS, 16))

telemetria = []   # dicts
low_signals = []  # (device, dia_date, nivel_medio) p/ gerar alertas de nível
off_signals = []  # (device, dia_date) p/ gerar alertas de offline

for r in RESERVATORIOS:
    dv = r["device"]
    base = BASE_NIVEL[dv]
    fase = rng.uniform(0, math.tau)  # fase do "consumo" diário/semanal
    for i, d in enumerate(DIAS):
        if dv == RES_GAP_2DIAS and d in GAP_DIAS:
            continue  # 2 dias sem NENHUMA leitura

        leituras = LEITURAS_DIA
        bomba_frac = BASE_BOMBA[dv]

        # nível médio do dia
        if dv == RES_VAZANDO:
            # queda lenta e constante: ~70% -> ~14% ao longo do período
            medio = 70 - (i / (N_DIAS - 1)) * (70 - 14) + rng.gauss(0, 2.5)
            bomba_frac = 0.38 + 0.22 * (i / (N_DIAS - 1))  # bomba trabalha cada vez mais
        else:
            sazonal = 6 * math.sin(i / 6.0 + fase)
            medio = base + sazonal + rng.gauss(0, 5)

        # eventos que reduzem o volume de leituras
        is_off = d in offline_days.get(dv, ())
        is_flaky = (dv == RES_INSTAVEL and d in flaky_days)
        if is_off:
            leituras = rng.randint(6, 40)          # comunicação caiu -> perdeu leituras
            off_signals.append((dv, d))
        elif is_flaky:
            leituras = rng.randint(20, 45)         # instabilidade, SEM alerta formal

        if dv == RES_BOMBA_95:
            bomba_frac = clamp(0.95 + rng.gauss(0, 0.02), 0.80, 1.0) / 1.0

        medio = int(round(clamp(medio)))
        nmin = int(clamp(medio - rng.randint(4, 18)))
        nmax = int(clamp(medio + rng.randint(4, 18)))
        nmin = min(nmin, medio)
        nmax = max(nmax, medio)
        bomba_on = int(round(clamp(bomba_frac, 0, 1) * leituras))
        bomba_on = min(bomba_on, leituras)

        telemetria.append(dict(
            dia=d, device=dv, resv=r["nome"], condo=CONDOMINIOS[r["condo"]],
            leituras=leituras, nmin=nmin, nmedio=medio, nmax=nmax, bomba_on=bomba_on,
        ))

        # sinal p/ alerta de nível (não p/ o instável e não em dia de offline)
        if not is_off and not is_flaky and medio < 30:
            low_signals.append((dv, d, medio))

# ── ruído: duplicar algumas linhas de telemetria ──
for _ in range(3):
    telemetria.append(dict(rng.choice(telemetria)))  # cópia idêntica

# ==========================================================================
# 2) ALERTAS  (dispositivo_offline | nivel_baixo | nivel_muito_baixo)
# ==========================================================================
alertas = []
last_alert = {}  # (device, tipo) -> ultimo dia, p/ throttle

def add_alerta(device, tipo, d, medio=None):
    r = DEV[device]
    resv_nome = r["nome"]
    condo = CONDOMINIOS[r["condo"]]
    criado = any_dt(d)

    if tipo == "dispositivo_offline":
        mins = rng.randint(15, 240)
        msg = f"Dispositivo {device} sem comunicação há mais de {mins} minutos"
        res_h = rng.uniform(0.5, 12)
    elif tipo == "nivel_muito_baixo":
        msg = f"Nível crítico no reservatório {resv_nome}: {medio}% (abaixo de 15%)"
        res_h = rng.uniform(3, 48)
    else:  # nivel_baixo
        msg = f"Nível do reservatório {resv_nome} em {medio}% (abaixo de 30%)"
        res_h = rng.uniform(2, 36)

    # aberto se muito recente; senão resolvido
    idade_h = (NOW_LOCAL - criado).total_seconds() / 3600
    if idade_h < 96 and rng.random() < 0.6:
        status = "aberto"
        atualizado = criado + dt.timedelta(minutes=rng.randint(0, 30))
        tempo_h = max(0.0, (NOW_LOCAL - criado).total_seconds() / 3600)
    else:
        status = "resolvido"
        atualizado = criado + dt.timedelta(hours=res_h)
        if atualizado > NOW_LOCAL:
            atualizado = max(NOW_LOCAL, criado + dt.timedelta(minutes=1))
        tempo_h = max(0.0, (atualizado - criado).total_seconds() / 3600)

    alertas.append(dict(
        tipo=tipo, mensagem=msg, status=status, resv=resv_nome, condo=condo,
        criado=criado, atualizado=atualizado, tempo_h=tempo_h,
    ))

# offline: concentrado no Parque Ipê (throttle p/ não estourar)
for device, d in sorted(off_signals, key=lambda x: x[1]):
    key = (device, "dispositivo_offline")
    if key in last_alert and (d - last_alert[key]).days < 2:
        continue
    last_alert[key] = d
    add_alerta(device, "dispositivo_offline", d)

# gap de 2 dias também gera offline (device sumiu)
add_alerta(RES_GAP_2DIAS, "dispositivo_offline", min(GAP_DIAS))

# nível baixo / muito baixo (Monte Belo INF domina no 2º semestre do período)
for device, d, medio in sorted(low_signals, key=lambda x: x[1]):
    tipo = "nivel_muito_baixo" if medio < 15 else "nivel_baixo"
    key = (device, tipo)
    if key in last_alert and (d - last_alert[key]).days < 4:
        continue
    last_alert[key] = d
    add_alerta(device, tipo, d, medio=medio)

# ==========================================================================
# 3) CHAMADOS
# ==========================================================================
N_CHAMADOS = round(CHAMADOS_POR_MES * (N_DIAS / 30.0))

CATEGORIAS = ["vazamento", "bomba_falha", "nivel_baixo", "sem_agua", "ruido", "manutencao", "outro"]
CAT_PESO   = [3, 3, 2, 2, 1, 2, 1]
PRIOS      = ["p1", "p2", "p3", "p4"]
PRIO_PESO  = [1, 3, 5, 2]

# Prazos de SLA por prioridade — tabela `sla_definicoes` (migration 028), em minutos.
# NÃO inventado: são os defaults reais do sistema (ttfr_min = 1ª resposta, ttr_min = resolução).
SLA_DEF = {            # prioridade: (ttfr_min, ttr_min)
    "p1": (15,   240),
    "p2": (60,   1440),
    "p3": (240,  4320),
    "p4": (1440, 14400),
}

def sla_estourado(status, prioridade, criado, primeira_em):
    """Replica _chamadoSlaEstourado(ch) do admin.js + as flags sla_ttfr_estourado /
    sla_ttr_risco do GET /chamados: só vale p/ chamado NÃO fechado; estoura se passou
    do TTFR sem 1ª resposta OU passou do TTR (prazo de resolução)."""
    if status == "fechado":
        return False
    ttfr, ttr = SLA_DEF[prioridade]
    idade_min = (NOW_LOCAL - criado).total_seconds() / 60.0
    ttfr_estourado = (primeira_em is None) and (idade_min > ttfr)
    ttr_estourado = idade_min > ttr
    return ttfr_estourado or ttr_estourado
CONDO_IDS  = list(CONDOMINIOS.keys())
CONDO_PESO = [1.0, 1.7, 1.2, 1.0, 1.0]   # Monte Belo aparece mais

# dias de spike (picos ocasionais)
SPIKE_DIAS = set(rng.sample(DIAS, 3))

def escolher_dia():
    while True:
        d = rng.choice(DIAS)
        w = 1.0
        if d.weekday() >= 5:      # fim de semana: menos chamados
            w = 0.35
        if d in SPIKE_DIAS:       # pico
            w = 2.5
        if rng.random() < w / 2.5:
            return d

chamados = []
for _ in range(N_CHAMADOS):
    d = escolher_dia()
    criado = business_dt(d)
    condo_id = rng.choices(CONDO_IDS, weights=CONDO_PESO)[0]

    # categoria: Monte Belo -> vazamento recorrente
    if condo_id == CONDO_VAZAMENTO and rng.random() < 0.78:
        categoria = "vazamento"
    else:
        categoria = rng.choices(CATEGORIAS, weights=CAT_PESO)[0]

    prioridade = rng.choices(PRIOS, weights=PRIO_PESO)[0]
    tecnico = rng.choice(TECNICOS)
    perfil = TEC_PERFIL[tecnico]

    ttfr = draw(perfil["base_ttfr"])
    post = draw(perfil["base_post"])
    primeira = criado + dt.timedelta(minutes=ttfr)
    fechado_calc = primeira + dt.timedelta(minutes=post)

    idade_dias = (NOW_LOCAL - criado).total_seconds() / 86400
    p_fechado = 0.90 if idade_dias > 3 else 0.30
    fechado_ok = rng.random() < p_fechado and fechado_calc <= NOW_LOCAL

    if fechado_ok:
        status = "fechado"
        primeira_em = primeira
        fechado_em = fechado_calc
        tempo_res = int((fechado_em - criado).total_seconds())
        sla_h = tempo_res / 3600.0
    else:
        # ainda aberto
        fechado_em = None
        tempo_res = None
        sla_h = (NOW_LOCAL - criado).total_seconds() / 3600.0
        if rng.random() < 0.6:
            status = "em_atendimento"
            primeira_em = primeira if primeira <= NOW_LOCAL else None
        else:
            status = "aberto"
            primeira_em = None

    # técnico às vezes ausente em chamados recém-abertos (LEFT JOIN -> null)
    if status == "aberto" and rng.random() < 0.35:
        tecnico = None

    # ruído: ~5% sem "Primeira resposta em"
    if rng.random() < 0.05:
        primeira_em = None

    chamados.append(dict(
        criado=criado, condo=CONDOMINIOS[condo_id], categoria=categoria,
        prioridade=prioridade, status=status, tecnico=tecnico,
        primeira_em=primeira_em, fechado_em=fechado_em,
        tempo_res=tempo_res, sla_h=sla_h,
        sla_estourado=sla_estourado(status, prioridade, criado, primeira_em),
    ))

# IDs sequenciais por ordem cronológica de criação (como o serial do banco)
chamados.sort(key=lambda c: c["criado"])
for i, c in enumerate(chamados, start=1):
    c["id"] = i

alertas.sort(key=lambda a: a["criado"])
for i, a in enumerate(alertas, start=1):
    a["id"] = i

# ==========================================================================
# ESCRITA DOS CSVs (ordenação idêntica às queries do relatorios.routes.js)
# ==========================================================================
OUT_DIR.mkdir(parents=True, exist_ok=True)

# -- chamados: colunas exatamente como o pedido; ORDER BY criado_em DESC
chamados.sort(key=lambda c: c["criado"], reverse=True)
ch_headers = ["ID", "Técnico", "Condomínio", "Categoria", "Prioridade", "Status",
              "Criado em", "Primeira resposta em", "Fechado em",
              "Tempo resolução (s)", "SLA (h)", "SLA estourado"]
ch_linhas = [[
    c["id"], c["tecnico"], c["condo"], c["categoria"], c["prioridade"], c["status"],
    to_iso_utc(c["criado"]),
    to_iso_utc(c["primeira_em"]) if c["primeira_em"] else "",
    to_iso_utc(c["fechado_em"]) if c["fechado_em"] else "",
    c["tempo_res"] if c["tempo_res"] is not None else "",
    dec1(c["sla_h"]),
    "Sim" if c["sla_estourado"] else "Não",
] for c in chamados]
escrever_csv(OUT_DIR / "chamados.csv", ch_headers, ch_linhas)

# -- alertas: ORDER BY criado_em DESC
alertas.sort(key=lambda a: a["criado"], reverse=True)
al_headers = ["ID", "Tipo", "Mensagem", "Status", "Reservatório", "Condomínio",
              "Criado em", "Atualizado em", "Tempo (h)"]
al_linhas = [[
    a["id"], a["tipo"], a["mensagem"], a["status"], a["resv"], a["condo"],
    to_iso_utc(a["criado"]), to_iso_utc(a["atualizado"]), dec1(a["tempo_h"]),
] for a in alertas]
escrever_csv(OUT_DIR / "alertas.csv", al_headers, al_linhas)

# -- telemetria: ORDER BY dia DESC, condominio ASC, reservatorio ASC
telemetria.sort(key=lambda t: (-t["dia"].toordinal(), t["condo"], t["resv"]))
tel_headers = ["Dia", "Device ID", "Reservatório", "Condomínio", "Leituras",
               "Nível mín (%)", "Nível médio (%)", "Nível máx (%)",
               "Leituras c/ bomba ligada"]
tel_linhas = [[
    dia_iso(t["dia"]), t["device"], t["resv"], t["condo"], t["leituras"],
    t["nmin"], t["nmedio"], t["nmax"], t["bomba_on"],
] for t in telemetria]
escrever_csv(OUT_DIR / "telemetria.csv", tel_headers, tel_linhas)

# ==========================================================================
# GABARITO.md
# ==========================================================================
def media(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else 0

# métricas por técnico (só fechados)
por_tec = {}
for c in chamados:
    if c["status"] == "fechado" and c["tecnico"]:
        por_tec.setdefault(c["tecnico"], []).append(c)

def horas(seg): return seg / 3600.0

linhas_tec = []
for t in TECNICOS:
    fs = por_tec.get(t, [])
    if not fs:
        linhas_tec.append(f"| {t} | 0 | — | — | — |")
        continue
    tres_h = media([c["tempo_res"] for c in fs]) / 3600.0
    ttfr_h = media([(c["primeira_em"] - c["criado"]).total_seconds() for c in fs if c["primeira_em"]]) / 3600.0
    post_h = media([(c["fechado_em"] - c["primeira_em"]).total_seconds()
                    for c in fs if c["primeira_em"] and c["fechado_em"]]) / 3600.0
    linhas_tec.append(f"| {t} | {len(fs)} | {tres_h:.1f} | {ttfr_h:.1f} | {post_h:.1f} |")

media_geral_tres = media([c["tempo_res"] for c in chamados if c["status"] == "fechado"]) / 3600.0

# contagens auxiliares
n_offline_ipe = sum(1 for a in alertas if a["tipo"] == "dispositivo_offline" and a["condo"] == CONDOMINIOS[CONDO_OFFLINE])
n_offline_tot = sum(1 for a in alertas if a["tipo"] == "dispositivo_offline")
n_vaz_monte = sum(1 for c in chamados if c["condo"] == CONDOMINIOS[CONDO_VAZAMENTO] and c["categoria"] == "vazamento")
n_ch_monte = sum(1 for c in chamados if c["condo"] == CONDOMINIOS[CONDO_VAZAMENTO])
tel_vaz = sorted([t for t in telemetria if t["device"] == RES_VAZANDO], key=lambda t: t["dia"])
nivel_ini = media([t["nmedio"] for t in tel_vaz[:7]])
nivel_fim = media([t["nmedio"] for t in tel_vaz[-7:]])
bomba95 = [t for t in telemetria if t["device"] == RES_BOMBA_95]
pct_bomba95 = 100 * media([t["bomba_on"] / t["leituras"] for t in bomba95])

# SLA estourado (coluna extra em chamados.csv)
sla_est = [c for c in chamados if c["sla_estourado"]]
n_sla_est = len(sla_est)
sla_por_prio = __import__("collections").Counter(c["prioridade"] for c in sla_est)
n_p34_est = sla_por_prio.get("p3", 0) + sla_por_prio.get("p4", 0)

gab = f"""# GABARITO — dados sintéticos de treino

> Gerado por `gerar_dados.py` com `SEED = {SEED}`, período de **{N_DIAS} dias**
> terminando em **{END_DATE.isoformat()}**. Rode de novo com a mesma seed para
> reproduzir idêntico; troque a seed no topo do script para variar mantendo os
> mesmos padrões.

## Volumes gerados
- **Chamados:** {len(chamados)}  (~{CHAMADOS_POR_MES}/mês) — {sum(1 for c in chamados if c['status']=='fechado')} fechados, {sum(1 for c in chamados if c['status']=='em_atendimento')} em atendimento, {sum(1 for c in chamados if c['status']=='aberto')} abertos
- **Alertas:** {len(alertas)}  ({n_offline_tot} offline, {sum(1 for a in alertas if a['tipo']=='nivel_baixo')} nível baixo, {sum(1 for a in alertas if a['tipo']=='nivel_muito_baixo')} nível muito baixo)
- **Telemetria:** {len(telemetria)} linhas (8 reservatórios × {N_DIAS} dias, menos gaps, mais duplicatas de ruído)

## Convenção dos nomes
O repositório não tem seed de condomínios/reservatórios (vivem só no banco de
produção), então os nomes abaixo são **plausíveis, não os reais**. Os `device_id`
seguem a convenção do firmware (`RES_<APELIDO>_<SUP|INF>`).

Condomínios: {", ".join(CONDOMINIOS.values())}.

---

## Padrões plantados (o que procurar)

### 1. Técnico com tempo médio de resolução ~3x pior
- **Entidade:** **{TEC_RESOLVE_LENTO}**
- **Análise:** tabela dinâmica de `chamados` — média de `Tempo resolução (s)` por
  `Técnico` (só `Status = fechado`). {TEC_RESOLVE_LENTO} destoa (~3x a média geral).
- Média geral de resolução ≈ **{media_geral_tres:.1f} h**; ver tabela abaixo.

### 2. Técnico com 1ª resposta lenta, mas que resolve rápido depois
- **Entidade:** **{TEC_1A_RESPOSTA_LENTA}**
- **Análise:** criar 2 colunas no Power Query:
  `TTFR = [Primeira resposta em] - [Criado em]` e
  `PósResposta = [Fechado em] - [Primeira resposta em]`.
  {TEC_1A_RESPOSTA_LENTA} tem **TTFR** muito alto (~horas) mas **PósResposta** o
  menor de todos. Ou seja: o alto tempo total dele vem da demora em *começar*,
  não em *resolver* — o oposto de {TEC_RESOLVE_LENTO}.

| Técnico | Fechados | Resolução total (h) | TTFR médio (h) | Pós-resposta (h) |
|---|---|---|---|---|
{chr(10).join(linhas_tec)}

### 3. Condomínio que concentra alertas de offline (rede local)
- **Entidade:** **{CONDOMINIOS[CONDO_OFFLINE]}** (devices RES_IPE_SUP / RES_IPE_INF)
- **Análise:** tabela dinâmica de `alertas` — contagem de `Tipo = dispositivo_offline`
  por `Condomínio`. {CONDOMINIOS[CONDO_OFFLINE]} tem **{n_offline_ipe} de {n_offline_tot}**
  alertas offline. Cruze com `telemetria`: nesses dias o device tem `Leituras`
  bem abaixo de {LEITURAS_DIA}.

### 4. Reservatório com queda lenta e constante (vazamento)
- **Entidade:** **{RES_VAZANDO}** — {CONDOMINIOS[CONDO_VAZAMENTO]}, Cisterna (inferior)
- **Análise:** em `telemetria`, gráfico de linha de `Nível médio (%)` por `Dia`
  filtrando esse device. Cai de ~**{nivel_ini:.0f}%** (início) para ~**{nivel_fim:.0f}%**
  (fim) de forma monotônica — nenhum outro reservatório tem tendência.

### 5. Reservatório com bomba ligada em ~95% das leituras
- **Entidade:** **{RES_BOMBA_95}** — {CONDOMINIOS[DEV[RES_BOMBA_95]['condo']]}
- **Análise:** em `telemetria`, coluna calculada
  `% bomba = [Leituras c/ bomba ligada] / [Leituras]`, média por `Device ID`.
  {RES_BOMBA_95} fica em ~**{pct_bomba95:.0f}%** (os demais ~22–40%).

### 6. Device com volume de leituras bem abaixo do esperado (sem alerta formal)
- **Entidade:** **{RES_INSTAVEL}** — {CONDOMINIOS[DEV[RES_INSTAVEL]['condo']]}
- **Análise:** em `telemetria`, ordenar/filtrar `Leituras` << {LEITURAS_DIA} em vários
  dias (~20–45). O truque: **não há alerta correspondente** em `alertas` para esse
  device — some só olhando o volume de leituras, não o painel de alertas.

### 7. Condomínio com categoria recorrente (sempre vazamento)
- **Entidade:** **{CONDOMINIOS[CONDO_VAZAMENTO]}**
- **Análise:** tabela dinâmica de `chamados` — `Categoria` × `Condomínio`.
  {CONDOMINIOS[CONDO_VAZAMENTO]} tem **{n_vaz_monte} de {n_ch_monte}** chamados como
  `vazamento` (concentração muito acima do normal).

### 8. Correlação entre arquivos (o vazamento amarra tudo)
- **Entidade:** **{RES_VAZANDO}** / **{CONDOMINIOS[CONDO_VAZAMENTO]}**
- **Análise:** o mesmo reservatório que cai de nível (padrão 4, `telemetria`)
  dispara alertas `nivel_baixo`/`nivel_muito_baixo` (`alertas`) **e** gera chamados
  `vazamento` no {CONDOMINIOS[CONDO_VAZAMENTO]} (`chamados`, padrão 7) — todos no
  mesmo período, com concentração crescente no fim. Junte os 3 arquivos por
  condomínio/reservatório e período para enxergar a história completa.

---

## Coluna extra: `SLA estourado` (em chamados.csv)

Coluna **derivada**, adicionada a pedido — **não existe no export real** hoje.
Ela materializa no CSV a regra `_chamadoSlaEstourado(ch)` que o `admin.js` calcula
em tela (o sistema trata isso como *alerta crítico* na página de Alertas, mas **não**
grava na tabela `alertas` — por isso a marca vive no chamado, não em alertas.csv).

- **Prazos usados** (tabela real `sla_definicoes`, em minutos): p1 = 15/240,
  p2 = 60/1440, p3 = 240/4320, p4 = 1440/14400  (TTFR = 1ª resposta / TTR = resolução).
- **Regra:** só chamado **não fechado** pode estourar. `Sim` quando, ainda aberto,
  passou do **TTFR** sem `Primeira resposta em`, **ou** passou do **TTR** de resolução.
- **Neste dataset:** {n_sla_est} chamados com `SLA estourado = Sim`
  (por prioridade: {dict(sla_por_prio)}).
- **Duas origens do estouro:** (a) chamado `aberto` **sem** `Primeira resposta em` que
  passou do **TTFR**; (b) chamado não fechado (aberto/em_atendimento) que passou do
  **TTR** de resolução. Só chamados vivos entram — um fechado que demorou não conta.
- **Análise sugerida:** tabela dinâmica `SLA estourado` × `Prioridade` / `Condomínio` /
  `Técnico`. Repare que há **{n_p34_est}** chamados **P3/P4** estourados — na regra
  antiga eles seriam "normais" (severidade só pela prioridade); a regra nova os eleva
  a crítico. É aí que o `SLA (h)` mostra sua limitação (discutida na análise): ele é
  tempo decorrido, não diz se estourou — quem responde isso é esta coluna.

---

## Ruído embutido (para não ficar "limpo demais")
- ~5% dos chamados sem `Primeira resposta em`.
- Chamados ainda abertos (`aberto`/`em_atendimento`) sem `Fechado em` nem `Tempo resolução (s)`.
- 3 linhas de `telemetria` duplicadas (idênticas).
- **{RES_GAP_2DIAS}** ({CONDOMINIOS[DEV[RES_GAP_2DIAS]['condo']]}) fica **2 dias seguidos sem nenhuma leitura** ({min(GAP_DIAS).isoformat()} e {max(GAP_DIAS).isoformat()}).
- Volume de chamados menor em fins de semana + 3 dias de pico.
- Alguns chamados abertos sem técnico atribuído (`Técnico` vazio).

## Formato do arquivo (igual ao export real)
- Separador `;`, quebra de linha CRLF, UTF-8 **com BOM**.
- Datas em **ISO-8601 UTC** (`...Z`); `Dia` da telemetria à meia-noite UTC.
- Decimais (`SLA (h)`, `Tempo (h)`) usam **ponto** (`4.5`) — no Power Query, importe
  essas colunas com *locale* en-US (ou troque `.` por `,`) para não virar texto.
"""

with open(OUT_DIR / "GABARITO.md", "w", encoding="utf-8") as f:
    f.write(gab)

print("OK ->", OUT_DIR)
print(f"chamados.csv    : {len(chamados)} linhas")
print(f"alertas.csv     : {len(alertas)} linhas")
print(f"telemetria.csv  : {len(telemetria)} linhas")
print(f"GABARITO.md     : gerado")
