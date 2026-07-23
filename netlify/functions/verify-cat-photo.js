const CAT_VERIFY_PROMPTS = {
  ja: `あなたは寺院の「三重塔かくれ招き猫探しゲーム」の画像判定員です。
アップロードされた写真に、木彫りの小さな招き猫（手招きのポーズをした木彫りの猫の彫刻）や、それに類する寺院建築の軒下・梁・木彫り装飾が写っているかを判定してください。
参拝者を励ますためのゲームなので、多少ピンボケや角度が悪くても、それらしい木彫りの猫や寺院の装飾が確認できれば found は true としてください。
明らかに無関係な写真（人物の顔だけ、食べ物、街の風景、文字だけなど、招き猫や寺院建築と全く関係のないもの）の場合のみ false としてください。
出力は次のJSON形式のみで答えてください。他の文章は一切含めないこと。
{"found": true または false}`,

  en: `You are the image judge for a temple's "Find the Hidden Cats in the Pagoda" game.
Look at the uploaded photo and judge whether it shows a small hand-carved wooden beckoning cat (in a waving/beckoning pose), or similar temple architecture such as eaves, beams, or wood carvings.
This is a game meant to encourage visitors, so even if the photo is a bit blurry or at an awkward angle, mark found as true if it plausibly shows a wooden cat carving or temple woodwork.
Only mark found as false if the photo is clearly unrelated (e.g. just a person's face, food, a street scene, or text with nothing to do with a cat carving or temple architecture).
Respond with ONLY the following JSON format, no other text.
{"found": true or false}`,

  zh: `你是寺院「寻找三重塔隐藏招财猫」游戏的图片判定员。
请判断上传的照片中是否出现了木雕的小型招财猫（招手姿势的木雕猫）或类似的寺院建筑细节（屋檐、横梁、木雕装饰等）。
这是为了鼓励参拜者的游戏，即使照片略微模糊或角度不佳，只要能看出类似木雕猫或寺院木质装饰，也请将found判定为true。
只有当照片明显无关（例如只有人脸、食物、街景、文字等与招财猫或寺院建筑完全无关的内容）时，才判定为false。
请仅以下面的JSON格式回答，不要包含任何其他文字。
{"found": true 或 false}`,

  ko: `당신은 사원의 "삼중탑 숨은 마네키네코 찾기" 게임의 이미지 판정관입니다.
업로드된 사진에 손짓하는 포즈의 목조 작은 마네키네코 조각, 또는 그와 유사한 사원 건축의 처마·들보·목조 장식이 찍혀 있는지 판정해 주세요.
참배객을 격려하기 위한 게임이므로, 사진이 다소 흐릿하거나 각도가 나빠도 그럴듯한 목조 고양이나 사원 목조 장식이 보이면 found를 true로 해주세요.
사람 얼굴만, 음식, 거리 풍경, 글자만 등 마네키네코나 사원 건축과 전혀 관계없는 사진일 경우에만 false로 해주세요.
다음 JSON 형식으로만 답변하세요. 다른 텍스트는 절대 포함하지 마세요.
{"found": true 또는 false}`,

  es: `Eres el juez de imágenes del juego "Encuentra los Gatos Ocultos en la Pagoda" de un templo.
Observa la foto subida y determina si muestra un pequeño gato de la suerte tallado en madera (en pose de saludo), o arquitectura similar del templo como aleros, vigas o tallas de madera.
Este es un juego para animar a los visitantes, así que aunque la foto esté algo borrosa o en un ángulo incómodo, marca found como true si muestra de forma plausible una talla de gato de madera o carpintería del templo.
Marca found como false solo si la foto es claramente irrelevante (por ejemplo, solo un rostro, comida, una escena callejera, o texto sin relación con un gato tallado o arquitectura del templo).
Responde ÚNICAMENTE con el siguiente formato JSON, sin ningún otro texto.
{"found": true o false}`,

  fr: `Vous êtes le juge d'images du jeu "Trouvez les Chats Cachés dans la Pagode" d'un temple.
Regardez la photo téléchargée et déterminez si elle montre un petit chat porte-bonheur sculpté en bois (en position de salut), ou une architecture de temple similaire comme des avant-toits, poutres ou sculptures en bois.
Il s'agit d'un jeu destiné à encourager les visiteurs, donc même si la photo est un peu floue ou sous un angle maladroit, marquez found comme true si elle montre de façon plausible une sculpture de chat en bois ou une menuiserie de temple.
Ne marquez found comme false que si la photo est clairement sans rapport (par exemple, juste un visage, de la nourriture, une scène de rue, ou du texte sans rapport avec un chat sculpté ou l'architecture du temple).
Répondez UNIQUEMENT avec le format JSON suivant, sans aucun autre texte.
{"found": true ou false}`,
};

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (process.env.PAYMENT_MODE !== 'live') {
    /* デモモードではAnthropic APIの使用量削減のため、実際のAI画像判定は行わずダミーで常に成功とする */
    return { statusCode: 200, headers, body: JSON.stringify({ found: true }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'api_key_not_configured' }) };
  }

  let lang = 'ja';
  let imageDataUri = '';
  try {
    const body = JSON.parse(event.body || '{}');
    if (CAT_VERIFY_PROMPTS[body.lang]) lang = body.lang;
    imageDataUri = body.image || '';
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) };
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUri);
  if (!match) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_image' }) };
  }
  const mediaType = match[1];
  const base64Data = match[2];

  // 画像サイズの上限ガード（base64で約4MB ≒ 元画像で約3MB相当）
  if (base64Data.length > 4_000_000) {
    return { statusCode: 413, headers, body: JSON.stringify({ error: 'image_too_large' }) };
  }

  const prompt = CAT_VERIFY_PROMPTS[lang];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'anthropic_request_failed' }) };
    }

    const data = await response.json();
    const text = data.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return { statusCode: 200, headers, body: JSON.stringify({ found: !!parsed.found }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'verify_failed' }) };
  }
};
