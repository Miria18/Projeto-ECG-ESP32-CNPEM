/*
  ECG didático: AD8232 + ADS1115 + TTGO T8 (ESP32) via Wi-Fi
  CNPEM - roteiro de prática

  Como usar:
   1) IDE do Arduino: instalar "esp32 by Espressif Systems", placa "ESP32 Dev Module".
   2) Ajustar NOME_REDE abaixo (ex.: ECG_GRUPO_1).
   3) Gravar. Monitor Serial (115200) deve mostrar "ADS1115 em 0x48" e o nome da rede.
   4) No computador/celular: conectar na rede do grupo (senha ecg12345)
      e abrir http://192.168.4.1

  Ligações (ver Figura 1 do roteiro):
   ESP32 3V3 -> ADS1115 VDD e AD8232 3.3V e SDN
   ESP32 GND -> ADS1115 GND e ADDR, AD8232 GND
   GPIO21 -> ADS1115 SDA      GPIO22 -> ADS1115 SCL
   AD8232 OUTPUT -> ADS1115 A0
   AD8232 LO+ -> GPIO32       AD8232 LO- -> GPIO33
*/

#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <LittleFS.h>

// PRECISA AJUSTAR AQUI 
const char* NOME_REDE  = "ECG_GRUPO_1";
const char* SENHA_REDE = "ecg12345";


const uint8_t ADS_ADDR = 0x48;
const int PIN_SDA = 21, PIN_SCL = 22;
const int PIN_LO_P = 32, PIN_LO_N = 33;

// Config do ADS1115: A0 vs GND, ganho +-4,096 V (125 uV/bit), modo contínuo.
// A conversão interna roda a 475 SPS e o ESP32 lê exatamente a cada 4 ms (250 amostras/s),
// assim nunca há amostra repetida ou perdida por diferença de relógio.
// (Para converter a 250 SPS no ADS, troque 0xC3 por 0xA3.)
const uint8_t ADS_CFG_H = 0x42;
const uint8_t ADS_CFG_L = 0xC3;

const int RING = 1500;               // 6 s de histórico para os clientes
static int32_t ring[RING];           // valor = adc_bruto*4 + LO(bit0 = LO+, bit1 = LO-)
volatile uint32_t head = 0;
volatile bool adsOk = false;
volatile float fsMedida = 0;

WebServer server(80);


// ADS1115 
bool adsPresente() {
  Wire.beginTransmission(ADS_ADDR);
  return Wire.endTransmission() == 0;
}

bool adsConfigura() {
  Wire.beginTransmission(ADS_ADDR);
  Wire.write(0x01);
  Wire.write(ADS_CFG_H);
  Wire.write(ADS_CFG_L);
  return Wire.endTransmission() == 0;
}

bool adsLe(int16_t &v) {
  Wire.beginTransmission(ADS_ADDR);
  Wire.write(0x00);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)ADS_ADDR, 2) != 2) return false;
  int hi = Wire.read();
  int lo = Wire.read();
  v = (int16_t)((hi << 8) | lo);
  return true;
}

//Amostragem a 250 Hz
void tarefaAmostragem(void*) {
  TickType_t t = xTaskGetTickCount();
  uint32_t cont = 0, falhas = 0;
  uint32_t t0 = micros();
  int16_t ultimo = 0;
  for (;;) {
    vTaskDelayUntil(&t, pdMS_TO_TICKS(4));
    int16_t v;
    if (adsLe(v)) {
      ultimo = v; falhas = 0; cont++; adsOk = true;
    } else {
      falhas++;
      if (falhas >= 10) adsOk = false;
      if (falhas % 100 == 0) adsConfigura();
    }
    int lo = (digitalRead(PIN_LO_P) ? 1 : 0) | (digitalRead(PIN_LO_N) ? 2 : 0);
    ring[head % RING] = ((int32_t)ultimo * 4) + lo;
    head = head + 1;

    uint32_t agora = micros();
    if (agora - t0 >= 1000000UL) {
      fsMedida = cont * 1e6f / (float)(agora - t0);
      cont = 0; t0 = agora;
    }
  }
}

// Servidor web e arquivos da interface
// O navegador busca as amostras por /d e recebe a tela do LittleFS.
void enviaArquivo(const char* caminho, const char* mime) {
  File f = LittleFS.open(caminho, "r");
  if (!f) {server.send(404, "text/plain", "Arquivo nao encontrado; grave o filesystem");return;}
  server.streamFile(f, mime); f.close();
}
void trataRaiz(){ enviaArquivo("/index.html", "text/html"); }
void trataCSS(){ enviaArquivo("/css/style.css", "text/css"); }
void trataJS(){ enviaArquivo("/js/script.js", "application/javascript"); }

//proximo indice (n=-1: ultimas 250 amostras)
void trataDados() {
  long n = server.hasArg("n") ? server.arg("n").toInt() : -1;
  uint32_t h = head;
  uint32_t ini;
  if (n < 0) ini = (h > 250) ? h - 250 : 0;
  else if ((uint32_t)n > h) ini = h;
  else ini = (uint32_t)n;
  if (h - ini > (uint32_t)(RING - 10)) ini = h - (RING - 10);
  String s;
  s.reserve(80 + (h - ini) * 8);
  s = "{\"s\":"; s += String((unsigned long)ini);
  s += ",\"e\":"; s += String((unsigned long)h);
  s += ",\"fs\":"; s += String(fsMedida, 1);
  s += ",\"ads\":"; s += (adsOk ? "1" : "0");
  s += ",\"v\":[";
  for (uint32_t i = ini; i < h; i++) {
    if (i > ini) s += ',';
    s += String((long)ring[i % RING]);
  }
  s += "]}";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", s);
}
void trataOutros(){server.send(404, "text/plain", "Recurso inexistente");}

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(PIN_LO_P, INPUT);
  pinMode(PIN_LO_N, INPUT);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);
  if (adsPresente() && adsConfigura()) {
    adsOk = true;
    Serial.println("ADS1115 em 0x48");
  } else {
    Serial.println("ADS1115 NAO encontrado em 0x48. Confira SDA (GPIO21), SCL (GPIO22), VDD e ADDR no GND.");
  }

  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false);
  WiFi.softAP(NOME_REDE, SENHA_REDE, 1, 0, 4);   
  Serial.print("Rede: ");
  Serial.println(NOME_REDE);
  Serial.print("Abra http://");
  Serial.println(WiFi.softAPIP());

  if(!LittleFS.begin(true)) Serial.println("Falha ao montar LittleFS");

  server.on("/", trataRaiz);
  server.on("/css/style.css", trataCSS);
  server.on("/js/script.js", trataJS);
  server.on("/d", trataDados);
  server.onNotFound(trataOutros);
  server.begin();

  xTaskCreatePinnedToCore(tarefaAmostragem, "amostragem", 4096, NULL, 3, NULL, 1);
}

void loop() {
  server.handleClient();
  delay(1);
}
