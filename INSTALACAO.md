# Guia de instalação — Telemetria General

Passo a passo completo pra instalar e calibrar um reservatório novo no sistema.
Cobre as duas partes: **sonda de nível** e **sensor de corrente da bomba (SCT-013)**.

---

## 1. Materiais necessários

### Por reservatório
- 1× ESP32
- 1× Placa de expansão do ESP32
- 1× Regulador de tensão (24V → 5V/3.3V conforme a placa)
- 1× Fonte de alimentação 24V
- 1× Sonda de nível 4–20mA (para reservatório)
- 1× Sensor de corrente SCT-013-030 (1V em 30A) — opcional, só se quiser monitorar a bomba

### Componentes extras pro circuito da bomba
- 2× Resistor 10kΩ
- 1× Capacitor eletrolítico 10µF
- Fios para soldar
- Placa perfurada ou protoboard

---

## 2. Cadastrar o reservatório no painel admin

**Faça isso ANTES de gravar o firmware** — você vai precisar do `device_id` e da `device_key` que o sistema gera.

1. Entre em `https://telemetria.ggeneral.com.br` como admin master.
2. Vá em **Cadastros** → **Novo reservatório**.
3. Preencha:
   - **Condomínio**: selecione o condomínio.
   - **Tipo**: superior, inferior ou outro.
   - **Nome**: ex. "Reservatório Superior Bloco A".
   - **Device ID**: identificador único do ESP32. Ex: `RES_COND10_SUP`. Use letras maiúsculas, números e underline.
   - Os campos de **Calibração da sonda** e **Limiar da bomba** podem ficar em branco por enquanto — preenche depois.
4. Clica em "Cadastrar reservatório".
5. **Anote a `device_key`** que aparece na confirmação. Essa chave é mostrada SÓ uma vez.
   - Se perder, dá pra regenerar pelo botão "Key" do reservatório, mas aí precisa atualizar o firmware.

---

## 3. Sonda de nível — instalação física

A sonda é submersível, com 2 fios (vermelho e preto), padrão 4–20mA.
Trabalha alimentada por 24V (recebida da fonte) e devolve uma corrente proporcional à pressão da coluna d'água.

### 3.1. Visão geral das ligações

```
            REDE 220V (cabo de força)
                    │
                    ├── Marrom  →  L (fase) da fonte 24V
                    ├── Azul    →  N (neutro) da fonte 24V
                    └── Verde   →  Terra (PE) da fonte 24V

         FONTE 24V AC → DC
              │
              ├── V+ ──┬── VIN+ do regulador de tensão
              │       │
              │       └── Cabo VERMELHO da sonda (alimentação +24V)
              │
              └── V- ──┬── VIN- do regulador de tensão
                      │
                      └── GND do ESP32

        REGULADOR 24V → 5V
              │
              ├── VOUT+ → VIN do ESP32 (alimenta o ESP)
              └── VOUT- → GND do ESP32

           SONDA (sinal 4-20mA)
              │
              └── Cabo PRETO → GPIO 34 (D34) do ESP32
                                  │
                                  └── Resistor 150Ω → GND
                                      (shunt: converte mA em tensão)
```

### 3.2. Fonte 24V — cabo de força

A fonte 24V tem entrada AC (220V) e saída DC (24V).
O cabo de força tem 3 fios padrão IEC:

| Cor do fio | Vai em | Função |
|---|---|---|
| **Marrom** | borne **L** da fonte | Fase (110/220V AC) |
| **Azul** | borne **N** da fonte | Neutro |
| **Verde** | borne **terra** da fonte | Terra de proteção |

### 3.3. Saídas da fonte 24V (V+ e V-)

A fonte tem dois bornes de saída DC: **V+** (24V positivo) e **V-** (referência, 0V).

**Do V+ saem 2 fios:**
1. Um fio para o **VIN+ do regulador de tensão** (alimenta o regulador).
2. Outro fio para o **cabo vermelho da sonda** (alimentação +24V da sonda).

**Do V- saem 2 fios:**
1. Um fio para o **VIN- do regulador de tensão**.
2. Outro fio para o **GND do ESP32** (referência comum entre fonte, regulador e ESP).

### 3.4. Regulador de tensão (24V → 5V)

O regulador recebe os 24V da fonte e baixa pra 5V pra alimentar o ESP32.

| Pino do regulador | Vai em |
|---|---|
| **VIN+** | V+ da fonte 24V |
| **VIN-** | V- da fonte 24V |
| **VOUT+** | **VIN** do ESP32 (entrada de 5V do ESP) |
| **VOUT-** | **GND** do ESP32 |

> ⚠️ Confirme que o regulador está configurado pra **saída de 5V**. Ligar o ESP32 com tensão maior pode queimar a placa.

### 3.5. Sonda — cabo vermelho e cabo preto

A sonda tem 2 fios:

| Cor do cabo | Vai em | Função |
|---|---|---|
| **Vermelho** | V+ da fonte 24V (mesmo barramento que alimenta o regulador) | Alimentação da sonda |
| **Preto** | **GPIO 34 (D34)** do ESP32 | Sinal de medição (4-20mA) |

Ou seja: a sonda "se alimenta" pelos 24V que vêm da fonte, mede a pressão e devolve o sinal pelo cabo preto. O ESP32 lê esse sinal no GPIO 34.

### 3.6. Resistor shunt no GPIO 34

O sinal da sonda é **corrente** (4-20mA), mas o ADC do ESP32 lê **tensão** (0-3,1V). Pra converter, tem um resistor entre o GPIO 34 e o GND — o famoso "shunt".

Pela Lei de Ohm: `tensão = corrente × resistência`. Os valores possíveis:

| Resistor | 4mA → tensão | 20mA → tensão | Cabe no ADC do ESP32? |
|---|---|---|---|
| **150Ω** | 0,60V | 3,00V | ✓ Cabe inteiro, com margem |
| 165Ω | 0,66V | 3,30V | ⚠️ No limite |
| **200Ω (atual)** | 0,80V | 4,00V | ❌ Satura acima de ~16mA |

> ⚠️ **Atenção: hoje o circuito está com 200Ω, que satura o ADC quando a corrente passa de ~16mA.** Pode estar funcionando porque o reservatório nunca enche o suficiente pra alcançar essa faixa, mas o ideal é trocar por **150Ω/¼W** pra cobrir a faixa inteira da sonda com margem de segurança.
>
> Se trocar o resistor, **vai precisar recalibrar** os campos `adc_zero` e `adc_por_metro` no painel admin (ver seção 5), porque a relação entre corrente e ADC vai mudar.

### 3.7. Instalação física no reservatório

1. Desligue tudo antes de mexer na fiação.
2. Instale a sonda **no fundo do reservatório**, na vertical, com o cabo subindo pra fora.
3. Conecte os fios da sonda como descrito acima.
4. Verifique todas as ligações antes de ligar a fonte.
5. Ao ligar, mede com multímetro entre GPIO 34 e GND — deve dar uma tensão entre 0,6V e 3V (com a sonda submersa). Se der 0V ou >3V, alguma coisa está errada.

---

## 4. Sensor de corrente da bomba — instalação física

### 4.1. Montagem do circuito

O SCT-013-030 é um clamp não-invasivo. Você vai montar um circuito simples na placa perfurada:

**Lista do que vai onde:**

1. **Não corte o fio do SCT.** Apenas descasque a ponta dos dois fios pra ter cobre exposto.
2. Pegue **um resistor de 10kΩ**, solde **uma perna no 3V3** do ESP32, deixe a outra solta.
3. Pegue **outro resistor de 10kΩ**, solde **uma perna no GND** do ESP32, deixe a outra solta.
4. **Solde as duas pernas soltas dos dois resistores juntas.** Esse ponto onde os resistores se encontram é o **ponto M**.
5. **Solde um fio do SCT** no ponto M (no mesmo lugar onde os dois resistores se juntam).
6. **Solde o outro fio do SCT** no GND (pode ser no mesmo GND onde está o segundo resistor).
7. Ligue o **GPIO 35** do ESP32 ao **ponto M** com um pedaço de fio.
8. **(Recomendado)** Solde o capacitor de **10µF** entre o ponto M (perna +) e o GND (perna −). Esse cap reduz ruído.

> ⚠️ **Capacitor eletrolítico tem polaridade.** A perna negativa vem marcada com uma faixa branca/cinza no corpo. Se inverter, ele estraga.

### 4.2. Instalação do clamp na fiação

1. Identifique o cabo da fase (220V) que alimenta a bomba. Bombas trifásicas têm 3 fases — clamp em **uma só** delas (qualquer uma).
2. Abra o clamp do SCT-013, passe o cabo da fase pelo meio, feche o clamp. **O clamp NÃO corta o fio nem precisa de eletricista** — é só "abraçar" o cabo.
3. **Não passe os dois fios (fase e neutro) juntos pelo clamp** — se passar, a corrente líquida é zero e o sensor não lê nada. Tem que ser SÓ a fase.

---

## 5. Calibração — Sonda de nível

Depois de montar tudo e gravar o firmware, abra o **Serial Monitor** do Arduino IDE (115200 baud) com o ESP32 ligado.

Você vai ver linhas:
```
ADC raw: 923
RMS bomba: 8
```

### 5.1. Coletar os valores

1. **Sonda fora d'água** (ou reservatório vazio): anota o valor de `ADC raw`. Esse é o **`adc_zero`**. Ex: 923.
2. **Encha o reservatório até o máximo** e anote o `ADC raw`. Ex: 2050.
3. Calcule: `(ADC_cheio - ADC_zero) / altura_em_metros = adc_por_metro`. Exemplo: se o reservatório tem 2,2m de água:
   - `(2050 - 923) / 2,20 = 512` → **`adc_por_metro = 512`**.
4. **`altura_total_m`**: altura total de água que o reservatório comporta. Ex: `2.20`.
5. **`faixa_sonda_m`**: a faixa de medição da sonda (consulte o datasheet — geralmente 4 ou 10m). Ex: `4.00`.

### 5.2. Salvar no painel

1. Painel admin → reservatório → **Editar**.
2. Preencha os 4 campos:
   - Altura total (m): `2.20`
   - ADC zero: `923`
   - ADC por metro: `512`
   - Faixa sonda (m): `4.00`
3. Salvar.

A partir daí, toda nova leitura que chegar do ESP32 vai ser convertida em % corretamente.

---

## 6. Calibração — Sensor da bomba

1. Com o ESP32 ligado e o sensor montado/instalado, abra o Serial Monitor.
2. **Bomba desligada**: anote o valor de `RMS bomba`. Vai ser baixinho — geralmente entre 0 e 20 (só ruído).
3. **Ligue a bomba**: o valor sobe muito. Anote.
4. Pegue um número no meio dos dois e coloque no campo **"Limiar do sensor (RMS)"** do reservatório no painel admin.

**Exemplos:**
- Bomba 1HP: desligada=8, ligada=80 → limiar = **40**.
- Bomba 2HP: desligada=10, ligada=180 → limiar = **80**.
- Bomba 3HP: desligada=12, ligada=320 → limiar = **150**.

### 6.1. E se eu não quiser monitorar a bomba?

**Deixa o campo "Limiar do sensor (RMS)" em branco.** Sem o limiar, o painel mostra "-" no status da bomba e o sistema ignora o valor de RMS que vier do ESP32. A telemetria de nível continua funcionando normalmente.

---

## 7. Gravação do firmware

1. Abra `firmware/esp32_telemetria.ino` no Arduino IDE.
2. Edite as 4 variáveis no topo:
   ```cpp
   const char* WIFI_SSID     = "NomeDoWiFi";
   const char* WIFI_PASSWORD = "senha-do-wifi";
   const char* DEVICE_ID     = "RES_COND10_SUP";          // mesmo do painel
   const char* DEVICE_KEY    = "0624e7fcf31d...";          // a chave que o painel gerou
   ```
3. Selecione a placa correta (Tools → Board → ESP32 Dev Module ou similar).
4. Selecione a porta USB.
5. Compile e grave (botão de upload).
6. Após gravar, abra o Serial Monitor (115200 baud) pra acompanhar.

---

## 8. Verificação final

Depois de tudo conectado e o firmware gravado:

1. **Serial Monitor deve mostrar a cada 10 segundos:**
   ```
   ADC raw: 1450
   RMS bomba: 12
   Enviando adc_raw: 1450
   {"device_id":"RES_COND10_SUP","adc_raw":1450,"bomba_rms":12}
   HTTP 200
   ```
2. **No painel admin:**
   - O reservatório deve aparecer com **última leitura recente** (segundos atrás).
   - O **status offline** deve estar "NÃO".
   - O **nível** deve mostrar a porcentagem correta.
   - A **bomba** deve mostrar "LIGADA" ou "DESLIGADA" (se o limiar foi configurado) ou "-" (se não foi).

Se algo dá errado, o Serial Monitor é a primeira coisa pra olhar — ele mostra qual é o erro.

---

## 9. Problemas comuns

### "WiFi não conecta"
- Confere `WIFI_SSID` e `WIFI_PASSWORD`.
- O ESP32 só pega WiFi 2.4GHz (não pega 5GHz).
- Sinal fraco no local? Coloque mais perto do roteador pra teste.

### "HTTP 403 — Dispositivo não autorizado"
- O `DEVICE_ID` no firmware não bate com nenhum reservatório cadastrado.
- Confere se digitou exatamente igual no painel.

### "HTTP 403 — Chave do dispositivo inválida"
- A `DEVICE_KEY` está errada.
- Se você perdeu a chave, regenera no painel admin (botão "Key" do reservatório) e atualiza no firmware.

### "HTTP 422 — Reservatório sem calibração"
- Você cadastrou o reservatório mas não preencheu `altura_total_m`, `adc_zero` e `adc_por_metro`.
- Vai em Editar → preenche os 3 campos → salva.

### "Painel mostra OFFLINE mesmo com ESP32 ligado"
- O ESP32 não está conseguindo enviar (sem internet, certificado, firewall).
- Olha o Serial Monitor pra ver o erro de HTTP.
- Verifica se o domínio `telemetria.ggeneral.com.br` está acessível.

### "Bomba mostra DESLIGADA mesmo com bomba ligada"
- O limiar está alto demais. Olhe o Serial Monitor pra ver o RMS quando a bomba está ligada e ajuste o limiar pra um valor menor (entre o desligado e o ligado).
- O clamp está com fase E neutro juntos — só pode ser fase.
- Conexão do circuito errada — confira que o ponto M tem 3V3 → 10k → M → 10k → GND, e que o capacitor (se usou) tem a polaridade certa.

### "RMS bomba sempre alto, mesmo com bomba desligada"
- Cabo do SCT muito perto de fontes de interferência (motores, contatores).
- Capacitor de 10µF não foi instalado — ele filtra esse ruído.
- Bias DC está errado — meça com multímetro: o ponto M deve estar em ~1.65V quando o ESP32 está ligado.

---

## 10. Resumo do fluxo de dados

Pra entender o que está acontecendo nos bastidores:

1. **ESP32** lê a sonda (ADC do GPIO34) e o SCT-013 (ADC do GPIO35 com cálculo RMS).
2. ESP32 monta um JSON: `{ device_id, adc_raw, bomba_rms }`.
3. Envia via HTTPS POST pro endpoint `/telemetria` com header `X-Device-Key`.
4. **Servidor** valida a chave, busca o reservatório, aplica:
   - **Calibração da sonda** (`adc_zero`, `adc_por_metro`, `altura_total_m`) → calcula `nivel_pct`.
   - **Limiar da bomba** → compara `bomba_rms` com `limiar_bomba` → `bomba_ligada` true/false.
5. Salva na tabela `leituras` (com threshold pra não gravar leitura redundante).
6. Atualiza alertas (nível baixo, dispositivo offline) automaticamente.
7. Painel admin e cliente buscam `/admin/status` ou `/cliente/status` e renderizam.

**Importante:** o ESP32 não tem nenhuma calibração interna. Ele é "burro" de propósito — manda o que mediu, e o servidor decide o que aquilo significa. Isso permite trocar a calibração pelo painel sem regravar firmware.
