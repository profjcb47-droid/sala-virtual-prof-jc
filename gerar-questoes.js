const MAX_QUESTIONS = 20;

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function demoQuestions({ disciplina, assunto, quantidade, tipo, dificuldade }) {
  const n = Math.min(Math.max(Number(quantidade) || 5, 1), 10);
  const subject = clean(disciplina, 80) || 'Matemática';
  const topic = clean(assunto, 160) || 'conteúdo informado';
  const qtype = clean(tipo, 40) || 'Múltipla Escolha';
  const out = [];
  for (let i = 1; i <= n; i++) {
    if (qtype === 'Discursiva') {
      out.push({ tipo: 'Discursiva', texto: `[TESTE] ${i}. Explique um conceito importante de ${topic} em ${subject} e apresente um exemplo.`, valor: 1, resposta: `Resposta esperada: explicação correta e exemplo coerente sobre ${topic}.`, alternativas: [] });
    } else if (qtype === 'Resposta Curta') {
      out.push({ tipo: 'Resposta Curta', texto: `[TESTE] ${i}. Escreva uma resposta curta relacionada a ${topic} (${dificuldade}).`, valor: 1, resposta: `Resposta a ser revisada pelo professor sobre ${topic}.`, alternativas: [] });
    } else if (qtype === 'Certo ou Errado') {
      out.push({ tipo: 'Certo ou Errado', texto: `[TESTE] ${i}. Analise a afirmação sobre ${topic}: este item demonstra o funcionamento da geração automática.`, valor: 1, resposta: '', alternativas: [{ texto: 'Certo', correta: i % 2 === 1 }, { texto: 'Errado', correta: i % 2 === 0 }] });
    } else {
      out.push({ tipo: 'Múltipla Escolha', texto: `[TESTE] ${i}. Questão demonstrativa sobre ${topic} (${subject}). Qual alternativa foi marcada como gabarito para testar o formulário?`, valor: 1, resposta: '', alternativas: [{ texto: 'Alternativa A', correta: true }, { texto: 'Alternativa B', correta: false }, { texto: 'Alternativa C', correta: false }, { texto: 'Alternativa D', correta: false }] });
    }
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const disciplina = clean(body.disciplina, 80);
  const assunto = clean(body.assunto, 180);
  const dificuldade = clean(body.dificuldade, 30) || 'Média';
  const tipo = clean(body.tipo, 40) || 'Múltipla Escolha';
  const instrucoes = clean(body.instrucoes, 600);
  const serie = clean(body.serie, 40) || '9º Ano';
  const quantidade = Math.min(Math.max(Number(body.quantidade) || 5, 1), MAX_QUESTIONS);

  if (!assunto) return res.status(400).json({ error: 'Informe o conteúdo ou assunto.' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      demo: true,
      warning: 'OPENAI_API_KEY não configurada. Retornando questões de demonstração para testar a interface.',
      questions: demoQuestions({ disciplina, assunto, quantidade, tipo, dificuldade })
    });
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_QUESTIONS,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tipo: { type: 'string', enum: ['Múltipla Escolha', 'Discursiva', 'Certo ou Errado', 'Resposta Curta'] },
            texto: { type: 'string' },
            valor: { type: 'number' },
            resposta: { type: 'string' },
            alternativas: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: { texto: { type: 'string' }, correta: { type: 'boolean' } },
                required: ['texto', 'correta']
              }
            }
          },
          required: ['tipo', 'texto', 'valor', 'resposta', 'alternativas']
        }
      }
    },
    required: ['questions']
  };

  const prompt = `Crie exatamente ${quantidade} questões escolares para ${serie}.\nDisciplina: ${disciplina}.\nConteúdo: ${assunto}.\nDificuldade: ${dificuldade}.\nTipo preferencial: ${tipo}.\nInstruções adicionais: ${instrucoes || 'nenhuma'}.\n\nRegras: português do Brasil; enunciados claros; conteúdo apropriado ao 9º ano; sem mencionar que foi criado por IA. Em múltipla escolha, gere exatamente 4 alternativas e apenas uma correta. Em certo/errado, use duas alternativas: Certo e Errado, apenas uma correta. Em questões discursivas e de resposta curta, deixe alternativas vazias e forneça resposta esperada. Use valor 1 para cada questão. Revise o gabarito antes de responder.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        input: prompt,
        text: { format: { type: 'json_schema', name: 'questoes_escolares', strict: true, schema } },
        max_output_tokens: 7000,
        store: false
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('OpenAI error', data);
      return res.status(response.status >= 500 ? 502 : response.status).json({ error: data?.error?.message || 'Erro ao chamar a IA.' });
    }
    let outputText = data.output_text || '';
    if (!outputText && Array.isArray(data.output)) {
      for (const item of data.output) {
        for (const part of (item.content || [])) if (part.type === 'output_text' && part.text) outputText += part.text;
      }
    }
    if (!outputText) return res.status(502).json({ error: 'A IA não retornou conteúdo de texto.' });
    const parsed = JSON.parse(outputText);
    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, quantidade) : [];
    if (!questions.length) return res.status(502).json({ error: 'A IA não retornou questões válidas.' });
    return res.status(200).json({ demo: false, model: process.env.OPENAI_MODEL || 'gpt-5-mini', questions });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Não foi possível gerar as questões agora.' });
  }
}
