exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.ADMIN_PASSWORD) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'not_configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) };
  }

  if (body.password !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  if (process.env.PAYMENT_MODE !== 'live') {
    /* デモモードではAnthropic APIの使用量削減のため、実際のAI分析は行わずダミー文言を返す */
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        analysis: '## デモモード\n\nデモモード中はAnthropic APIの利用量削減のため、AIによる分析はダミー表示となっています。\n\n本番サービス開始後（`PAYMENT_MODE=live`）に実際の分析が有効になります。',
      }),
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'not_configured' }) };
  }

  const stats = body.stats || {};
  const surveys = Array.isArray(stats.surveys) ? stats.surveys : [];

  if (!surveys.length) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ analysis: 'まだアンケート回答がないため、分析できません。回答が集まってから再度お試しください。' }),
    };
  }

  const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : '-');
  const pct = (v) => (typeof v === 'number' ? Math.round(v * 100) + '%' : '-');

  const surveyLines = surveys.map((s, i) =>
    `${i + 1}. [言語:${s.lang || '-'}] 総合${s.rating ?? '-'} / ガイド${s.guideRating ?? '-'} / クイズ${s.quizRating ?? '-'} / 料金${s.priceRating ?? '-'} - コメント:「${(s.comment || '(なし)').replace(/\n/g, ' ')}」`
  ).join('\n');

  const stampLine = Array.isArray(stats.stampCounts)
    ? stats.stampCounts.map((c, i) => `スポット${i + 1}:${c}件`).join(' / ')
    : '(データなし)';

  const prompt = `あなたは「豪徳寺DX」という寺院参拝デジタル体験アプリ（10大スポットのスタンプラリー・AIナレーション・各スポットのクイズ・満願後のおみくじ）の運営者向けに、アンケート結果を分析するアナリストです。

## 集計データ
- 総購入数（当日パス発行数）: ${stats.totalPurchases ?? '-'}
- 10スポット完全踏破率: ${pct(stats.completionRate)}（${stats.completedCount ?? '-'} / ${stats.totalVisitorsWithProgress ?? '-'}）
- スポット別スタンプ獲得数: ${stampLine}
- おみくじ結果分布: ${stats.omikujiRankCounts ? JSON.stringify(stats.omikujiRankCounts) : '(データなし)'}
- アンケート平均（回答数${surveys.length}件）: 総合満足度${fmt1(stats.avgRating)} / ガイドの分かりやすさ${fmt1(stats.avgGuideRating)} / クイズの楽しさ${fmt1(stats.avgQuizRating)} / 料金への納得感${fmt1(stats.avgPriceRating)}

## 個別アンケート回答（自由記述含む。複数言語が混在する場合があります）
${surveyLines}

## 依頼内容
上記データをもとに、日本語で以下をMarkdown形式（見出しと箇条書きを使用）で、簡潔に出力してください。冗長な前置きは不要です。

## 傾向分析
数値評価と自由記述コメントを突き合わせ、良い評価の理由・低い評価の理由・スポット別の離脱傾向などを具体的に指摘してください（箇条書き3〜5点）。

## 改善提案
優先度の高い順に3〜5件、具体的で実行可能な改善案を提示してください。各提案には「想定される効果」と「実装の手軽さ（簡単/中程度/大掛かり）」を一言添えてください。

自由記述コメントが少数・偏っている場合は、その旨も正直に触れてください。断定的すぎる根拠のない主張は避け、与えられたデータに基づいた指摘のみを行ってください。`;

  try {
    /* 分析は運営者が任意タイミングで手動実行する管理用途のため、応答速度優先でHaikuを使用。
       Netlify標準Functionsのタイムアウト（30秒）に収まるよう、max_tokensも抑えている */
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'anthropic_request_failed' }) };
    }

    const data = await response.json();
    const text = data.content[0].text;

    return { statusCode: 200, headers, body: JSON.stringify({ analysis: text }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'analyze_failed' }) };
  }
};
