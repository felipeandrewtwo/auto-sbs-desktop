import { GoogleGenAI, Type } from "@google/genai";
import type { SubmitterPrefillProfile, VagaAnalisada } from "./types";

export async function generateFormAnswers(
  geminiKey: string,
  cv: string,
  profile: SubmitterPrefillProfile,
  vaga: VagaAnalisada | null,
  emptyFieldsJson: string
): Promise<Record<string, string> | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const jobDescription = vaga ? `Vaga: ${vaga.cargo || "Desconhecido"}\nEmpresa: ${vaga.empresa || "Desconhecida"}\nDescrição: ${vaga.descricao || ""}` : "Não fornecida.";

    const systemInstruction = `
Você é um assistente especialista em preencher formulários de vagas de emprego no LinkedIn.
Sua missão é responder perguntas do formulário baseando-se no currículo, no perfil pré-preenchido do candidato e nas regras abaixo.

# REGRAS RÍGIDAS DE PREENCHIMENTO:
1. Consentimento de Dados/LGPD/Background check/Terms & Conditions: Se a pergunta for sobre autorização ou veracidade, responda "${profile.dataProcessingConsent ? 'true' : 'false'}" para checkboxes, ou o equivalente "Yes"/"Sim"/"I Agree" para selects/radios.
2. Contato (SMS/Email): Responda "${profile.contactConsent ? 'true' : 'false'}" ou "Yes"/"Sim".
3. Pretensão Salarial: Utilize o valor: "${profile.salaryExpectationClt}". Extraia apenas os números se o campo for numérico (isNumeric: true).
4. Cidade Atual / Localização: "${profile.currentCity}".
5. Empresa Atual: "${profile.currentCompany}".
6. Nível de Inglês: "${profile.englishConfidence}". Se pedirem um texto sobre conforto com inglês, use: "${profile.englishComfortText}".
7. Nível de Espanhol: "${profile.spanishConfidence}".

# OUTRAS REGRAS GERAIS:
- Como ficou sabendo da vaga (How did you hear about us)? Use "LinkedIn".
- Possui familiar na empresa? Use "Não" ou "No".
- Campos numéricos (isNumeric: true): retorne APENAS o número.
- Checkboxes: retorne a string "true" ou "false".
- Campos restritos (select ou radio): VOCÊ DEVE ESCOLHER APENAS E EXATAMENTE O TEXTO (text) OU VALOR (value) DAS OPÇÕES FORNECIDAS NA PERGUNTA (se houver a propriedade options). NUNCA INVENTE OPÇÕES. Se nenhuma opção bater exatamente, escolha a menos restritiva ou "Outro/Other".
- Nunca deixe um campo obrigatório (required: true) vazio. Se faltar informação, use "N/A" ou deduza logicamente.

# CURRÍCULO DO CANDIDATO:
${cv}

# DESCRIÇÃO DA VAGA ATUAL:
${jobDescription}
`;

    const prompt = `
Abaixo estão os campos vazios do formulário que precisam ser preenchidos.
Eles estão em formato JSON.

CAMPOS VAZIOS:
${emptyFieldsJson}
`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "Lista de respostas mapeadas por ID do campo",
          items: {
            type: Type.OBJECT,
            properties: {
              fieldId: { type: Type.STRING, description: "O identificador ou id do campo" },
              answer: { type: Type.STRING, description: "A resposta apropriada formatada de acordo com o tipo do campo" }
            },
            required: ["fieldId", "answer"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return null;

    const parsedArray = JSON.parse(text) as Array<{ fieldId: string; answer: string }>;
    const answersMap: Record<string, string> = {};
    for (const item of parsedArray) {
      answersMap[item.fieldId] = item.answer;
    }

    return answersMap;
  } catch (err) {
    console.error("Erro ao gerar respostas via AI (Agent):", err);
    return null;
  }
}

export async function correctFormErrors(
  geminiKey: string,
  cv: string,
  profile: SubmitterPrefillProfile,
  vaga: VagaAnalisada | null,
  errorsJson: string
): Promise<Record<string, string> | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const jobDescription = vaga ? `Vaga: ${vaga.cargo || "Desconhecido"}\nEmpresa: ${vaga.empresa || "Desconhecida"}\nDescrição: ${vaga.descricao || ""}` : "Não fornecida.";

    const systemInstruction = `
Você é um assistente especialista em corrigir erros de formulários do LinkedIn.
Ao tentar submeter o formulário anterior, o LinkedIn bloqueou e mostrou mensagens de erro em alguns campos.
Sua missão é gerar UMA NOVA RESPOSTA para esses campos que estão com erro, prestando MUITA ATENÇÃO à mensagem de erro reportada pelo site.

Use o currículo e os dados do candidato apenas como base, mas obedeça o formato que a mensagem de erro exige.
Por exemplo: se a mensagem de erro diz "Insira um número", forneça apenas números.

# DADOS DO CANDIDATO:
- Pretensão Salarial: ${profile.salaryExpectationClt}
- Cidade Atual: ${profile.currentCity}
- Nível Inglês: ${profile.englishConfidence}

# CURRÍCULO:
${cv}

# VAGA ATUAL:
${jobDescription}
`;

    const prompt = `
Abaixo estão os campos que falharam na validação do LinkedIn, junto com a mensagem de erro exata que o site exibiu.

CAMPOS COM ERRO:
${errorsJson}

Por favor, corrija e forneça a nova resposta para cada campo.
`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "Lista de correções mapeadas por ID do campo",
          items: {
            type: Type.OBJECT,
            properties: {
              fieldId: { type: Type.STRING },
              answer: { type: Type.STRING }
            },
            required: ["fieldId", "answer"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return null;

    const parsedArray = JSON.parse(text) as Array<{ fieldId: string; answer: string }>;
    const answersMap: Record<string, string> = {};
    for (const item of parsedArray) {
      answersMap[item.fieldId] = item.answer;
    }

    return answersMap;
  } catch (err) {
    console.error("Erro ao gerar correções via AI (Agent):", err);
    return null;
  }
}
