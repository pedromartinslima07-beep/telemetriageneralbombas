#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// WiFi
const char* WIFI_SSID     = "Julia";
const char* WIFI_PASSWORD = "58190488jC";

// Servidor
const char* SERVER_URL = "https://telemetria.ggeneral.com.br/telemetria";

// Dispositivo
const char* DEVICE_ID  = "RES_TESTE_SUP";
const char* DEVICE_KEY = "0624e7fcf31d483cb115d12c1b0d82c3d8f97bb9daefb2fb";

// Pino da sonda 4-20mA
#define PINO_SONDA 34

// Sensor de corrente SCT-013 (detecção da bomba)
// O limiar de detecção fica no servidor (campo limiar_bomba do reservatório),
// configurável pelo painel admin sem precisar regravar o firmware.
#define PINO_BOMBA      35
#define AMOSTRAS_BOMBA  500

// Intervalo de envio
#define INTERVALO_MS 10000

unsigned long ultimoEnvio = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);

  Serial.println("Conectando ao WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi conectado!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFalha ao conectar no WiFi!");
  }
}

int lerSonda() {
  const int amostras = 10;
  long soma = 0;

  for (int i = 0; i < amostras; i++) {
    soma += analogRead(PINO_SONDA);
    delay(20);
  }

  int leitura = soma / amostras;
  Serial.printf("ADC raw: %d\n", leitura);
  return leitura;
}

// Lê o SCT-013 e devolve um valor proporcional à corrente que está passando.
// Quanto maior o valor, mais corrente. Bomba desligada -> valor baixo (ruído).
// Bomba ligada -> valor sobe bastante. O servidor decide se é "ligada" comparando
// com limiar_bomba do reservatório (configurável pelo painel admin).
int lerCorrenteRMS() {
  static int16_t amostras[AMOSTRAS_BOMBA];
  long soma = 0;

  for (int i = 0; i < AMOSTRAS_BOMBA; i++) {
    amostras[i] = analogRead(PINO_BOMBA);
    soma += amostras[i];
    delayMicroseconds(200);
  }

  // Calcula o bias DC (~ponto médio dos divisores 10k+10k)
  int bias = soma / AMOSTRAS_BOMBA;

  // Soma dos quadrados do sinal AC (amostra menos bias)
  long sumSq = 0;
  for (int i = 0; i < AMOSTRAS_BOMBA; i++) {
    int v = amostras[i] - bias;
    sumSq += (long)v * v;
  }

  return (int)sqrt(sumSq / (float)AMOSTRAS_BOMBA);
}

void enviarDados() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi desconectado, tentando reconectar...");
    WiFi.reconnect();
    delay(3000);
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.setTimeout(10000);

  int adcRaw   = lerSonda();
  int bombaRms = lerCorrenteRMS();
  Serial.printf("RMS bomba: %d\n", bombaRms);

  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["adc_raw"]   = adcRaw;
  doc["bomba_rms"] = bombaRms;

  String body;
  serializeJson(doc, body);

  Serial.printf("Enviando adc_raw: %d\n", adcRaw);
  Serial.println(body);

  int httpCode = http.POST(body);
  Serial.printf("HTTP %d\n", httpCode);

  if (httpCode > 0) {
    String resposta = http.getString();
    Serial.println(resposta);
  } else {
    Serial.print("Erro: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
}

void loop() {
  unsigned long agora = millis();

  if (agora - ultimoEnvio >= INTERVALO_MS) {
    ultimoEnvio = agora;
    enviarDados();
  }
}
