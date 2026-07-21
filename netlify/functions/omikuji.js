const RANKS = ['大吉','中吉','小吉','吉','末吉','凶'];

const LANG_PROMPTS = {
  ja: (rank) => `あなたは豪徳寺の招き猫の霊験あらたかなおみくじです。
ランク「${rank}」のおみくじを以下の7項目で生成してください。
各項目は2〜3文の温かく詩的な日本語で書いてください。
おみくじらしい格調ある文体で、豪徳寺・招き猫の縁起にちなんだ内容を含めてください。

出力はJSON形式のみ。余分なテキスト不要。
{
  "rank": "${rank}",
  "rankReading": "（読み方）",
  "poem": "（7〜8文字の短い和歌風の言葉）",
  "overall": "（総運の内容）",
  "love": "（恋愛の内容）",
  "work": "（仕事の内容）",
  "wealth": "（金運の内容）",
  "travel": "（旅行の内容）",
  "health": "（健康の内容）",
  "friendship": "（交友の内容）"
}`,

  en: (rank) => `You are the sacred fortune oracle of Goutokuji Temple's beckoning cats.
Generate a fortune slip with rank "${rank}" for the following 7 categories.
Write 2-3 warm, poetic sentences per category in English.
Include references to Goutokuji, beckoning cats, and Japanese temple wisdom.

Output JSON only. No extra text.
{
  "rank": "${rank}",
  "rankReading": "（English equivalent of rank）",
  "poem": "（A short poetic phrase of 8-10 words）",
  "overall": "（Overall fortune）",
  "love": "（Love fortune）",
  "work": "（Work & Career fortune）",
  "wealth": "（Wealth fortune）",
  "travel": "（Travel fortune）",
  "health": "（Health fortune）",
  "friendship": "（Friendship fortune）"
}`,

  zh: (rank) => `你是豪德寺招财猫的神圣御签神谕。
请为以下7个项目生成运势等级为「${rank}」的御签内容。
每个项目用2〜3句温暖、充满诗意的中文写成。
请融入豪德寺、招财猫和日本寺院的智慧。

仅输出JSON格式，无需额外文字。
{
  "rank": "${rank}",
  "rankReading": "（等级读音）",
  "poem": "（8〜10个字的诗意短句）",
  "overall": "（总运内容）",
  "love": "（恋爱内容）",
  "work": "（工作内容）",
  "wealth": "（金运内容）",
  "travel": "（旅行内容）",
  "health": "（健康内容）",
  "friendship": "（交友内容）"
}`,

  ko: (rank) => `당신은 고토쿠지 사원 마네키네코의 신성한 오미쿠지 신탁입니다.
다음 7개 항목에 대해 등급「${rank}」의 운세를 생성해 주세요.
각 항목은 따뜻하고 시적인 한국어 2〜3문장으로 작성해 주세요.
고토쿠지、마네키네코、일본 사원의 지혜를 담아 주세요.

JSON 형식만 출력. 추가 텍스트 불필요.
{
  "rank": "${rank}",
  "rankReading": "（등급 읽기）",
  "poem": "（8〜10자의 시적인 짧은 구절）",
  "overall": "（총운 내용）",
  "love": "（연애 내용）",
  "work": "（직업 내용）",
  "wealth": "（금운 내용）",
  "travel": "（여행 내용）",
  "health": "（건강 내용）",
  "friendship": "（교우 내용）"
}`,

  es: (rank) => `Eres el oráculo sagrado de los gatos de la fortuna del Templo Goutokuji.
Genera un oráculo con rango "${rank}" para las siguientes 7 categorías.
Escribe 2-3 frases cálidas y poéticas en español por categoría.
Incluye referencias a Goutokuji, los gatos de la fortuna y la sabiduría del templo japonés.

Solo JSON. Sin texto adicional.
{
  "rank": "${rank}",
  "rankReading": "（equivalente en español）",
  "poem": "（frase poética de 8-10 palabras）",
  "overall": "（Fortuna general）",
  "love": "（Amor）",
  "work": "（Trabajo y Carrera）",
  "wealth": "（Riqueza）",
  "travel": "（Viaje）",
  "health": "（Salud）",
  "friendship": "（Amistad）"
}`,

  fr: (rank) => `Vous êtes l'oracle sacré des chats porte-bonheur du Temple Goutokuji.
Générez un oracle de rang "${rank}" pour les 7 catégories suivantes.
Écrivez 2-3 phrases chaleureuses et poétiques en français par catégorie.
Incluez des références à Goutokuji, aux chats porte-bonheur et à la sagesse du temple japonais.

JSON uniquement. Pas de texte supplémentaire.
{
  "rank": "${rank}",
  "rankReading": "（équivalent en français）",
  "poem": "（phrase poétique de 8-10 mots）",
  "overall": "（Fortune générale）",
  "love": "（Amour）",
  "work": "（Travail et Carrière）",
  "wealth": "（Richesse）",
  "travel": "（Voyage）",
  "health": "（Santé）",
  "friendship": "（Amitié）"
}`,
};

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'api_key_not_configured' }) };
  }

  let lang = 'ja';
  try {
    const body = JSON.parse(event.body || '{}');
    if (LANG_PROMPTS[body.lang]) lang = body.lang;
  } catch (e) {}

  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  const prompt = LANG_PROMPTS[lang](rank);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'anthropic_request_failed' }) };
    }

    const data = await response.json();
    const text = data.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const fortune = JSON.parse(clean);

    return { statusCode: 200, headers, body: JSON.stringify({ fortune }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'omikuji_failed' }) };
  }
};
