# Sistema de Monitoramento Cardíaco com ESP32

## Sobre o Projeto

Este projeto tem como objetivo desenvolver um protótipo portátil de monitoramento cardíaco baseado no microcontrolador ESP32, capaz de adquirir sinais de eletrocardiograma (ECG), processar informações relacionadas à atividade cardíaca e disponibilizar os dados em uma interface web.

O desenvolvimento faz parte de um projeto acadêmico da PUC-Campinas, em colaboração com o Centro Nacional de Pesquisa em Energia e Materiais (CNPEM).

A proposta é construir um sistema capaz de realizar a aquisição de ECG de uma derivação, estimar a frequência cardíaca (FC), calcular intervalos RR e analisar métricas selecionadas de variabilidade da frequência cardíaca (HRV).

O projeto também busca investigar, de maneira exploratória, indicadores fisiológicos associados ao estresse, sem finalidade diagnóstica.

**O protótipo possui finalidade acadêmica e experimental, não sendo um dispositivo médico.**

## Objetivos

- Desenvolver um dispositivo portátil utilizando ESP32.
- Captar sinais de ECG por meio do sensor AD8232.
- Converter os sinais analógicos utilizando o ADS1115.
- Processar e transmitir as leituras pelo ESP32.
- Implementar comunicação sem fio utilizando Wi-Fi.
- Desenvolver uma interface web para visualização dos sinais.
- Estimar frequência cardíaca e intervalos RR.
- Implementar métricas de HRV.
- Permitir o armazenamento e a exportação dos dados coletados.
- Realizar testes e validações em ambiente controlado.

## Componentes de Hardware

| Componente | Função |
|---|---|
| ESP32-WROVER-B | Processamento e comunicação sem fio |
| AD8232 | Aquisição e condicionamento do sinal de ECG |
| ADS1115 | Conversão analógico-digital de 16 bits |
| Eletrodos | Captação dos sinais cardíacos |
| Bateria e circuito de alimentação | Alimentação portátil, conforme requisitos de segurança |

## Arquitetura do Sistema

O sistema será dividido em três partes principais:

### 1. Firmware — ESP32

Responsável pela comunicação com o ADS1115, aquisição das amostras, organização dos dados e transmissão pela rede.

**Tecnologias:**
- C++
- Framework Arduino
- PlatformIO
- Comunicação I²C
- Wi-Fi

### 2. Backend — Servidor

Responsável por receber os dados enviados pelo ESP32 e disponibilizá-los para a aplicação web.

Funcionalidades planejadas:
- Recebimento das amostras de ECG.
- Processamento e organização dos dados.
- Disponibilização de uma API.
- Integração futura com banco de dados.
- Gerenciamento de registros e sessões de monitoramento.

A linguagem, o framework e o banco de dados ainda serão definidos.

### 3. Frontend — Interface Web

Responsável por apresentar os dados coletados em uma interface acessível pelo navegador de computadores e celulares.

Funcionalidades planejadas:
- Visualização gráfica do ECG.
- Exibição da frequência cardíaca.
- Apresentação dos indicadores calculados.
- Estado de conexão com o dispositivo.
- Indicação da qualidade do sinal.
- Histórico de monitoramento.
- Exportação de dados em CSV.

## Estrutura do Repositório

```text
ESP32_2026/
├── backend/          # Servidor e API
├── docs/             # Documentação técnica
├── frontend/         # Interface web
├── include/          # Cabeçalhos do firmware
├── lib/              # Bibliotecas locais
├── src/              # Código-fonte do ESP32
│   └── main.cpp
├── test/             # Testes do firmware
├── .gitignore
├── platformio.ini    # Configuração do PlatformIO
└── README.md
```

## Comunicação entre os Componentes

O fluxo planejado será:

**Eletrodos → AD8232 → ADS1115 → ESP32 → Wi-Fi → Backend → Interface Web**

O ESP32 realizará a aquisição das amostras e enviará os dados ao backend.

O backend será responsável por disponibilizar os dados à aplicação web e, futuramente, integrá-los ao banco de dados.

## Estado Atual do Desenvolvimento

O projeto está em fase de desenvolvimento e validação dos componentes eletrônicos.

Atividades já realizadas:

- Criação e organização do repositório no GitHub.
- Configuração inicial do ambiente de desenvolvimento no VS Code e PlatformIO.
- Identificação do modelo ESP32-WROVER-B.
- Compilação e upload de programas básicos para o ESP32.
- Instalação das bibliotecas necessárias para testes com ADS1115 na Arduino IDE.
- Realização de testes iniciais com ADS1115 e AD8232.
- Estudo das alternativas de comunicação Wi-Fi e Bluetooth.

### Pendências atuais

- Confirmar o funcionamento da comunicação serial.
- Validar a comunicação I²C entre ESP32 e ADS1115.
- Obter amostras estáveis e coerentes do AD8232.
- Visualizar o sinal de ECG.
- Implementar a transmissão de dados por Wi-Fi.
- Desenvolver backend e frontend.
- Definir e integrar o banco de dados.
- Implementar algoritmos de detecção de QRS, frequência cardíaca e HRV.
- Realizar testes de validação e caracterização do sistema.

## Segurança e Limitações

O dispositivo é destinado exclusivamente a estudos e experimentos acadêmicos.

A aquisição de sinais em pessoas dependerá da revisão e aprovação dos procedimentos de segurança pelo orientador, incluindo alimentação adequada por bateria, isolamento e prevenção de conexões simultâneas com equipamentos alimentados pela rede elétrica.

A validação inicial deverá ocorrer em bancada, preferencialmente utilizando sinais simulados ou fontes de teste apropriadas.

Os resultados não deverão ser utilizados para diagnóstico médico, avaliação clínica ou decisões relacionadas à saúde e à aptidão ocupacional.

## Próximas Etapas

1. Validar a aquisição dos dados pelo ESP32.
2. Integrar o AD8232 e o ADS1115.
3. Definir o formato dos dados transmitidos.
4. Implementar a comunicação Wi-Fi.
5. Desenvolver uma API para recebimento dos dados.
6. Criar a primeira versão do dashboard web.
7. Definir a tecnologia de banco de dados.
8. Implementar o processamento dos sinais cardíacos.
9. Realizar testes de integração, segurança e validação.

## Instituições

**Pontifícia Universidade Católica de Campinas — PUC-Campinas**

**Centro Nacional de Pesquisa em Energia e Materiais — CNPEM**

Projeto acadêmico de engenharia — 2026.