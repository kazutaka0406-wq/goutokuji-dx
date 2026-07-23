const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];

/* Supabaseのcreated_atはUTC。来訪者はほぼ全員日本国内のため、
   日別・曜日別・月別・年別の集計はJST（UTC+9）に変換してから行う */
function toJst(dateStr) {
  return new Date(new Date(dateStr).getTime() + 9 * 3600 * 1000);
}
function jstDateKey(dateStr) {
  const d = toJst(dateStr);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function jstMonthKey(dateStr) {
  const d = toJst(dateStr);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function jstYearKey(dateStr) {
  return String(toJst(dateStr).getUTCFullYear());
}
function jstWeekday(dateStr) {
  return toJst(dateStr).getUTCDay();
}

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.ADMIN_PASSWORD) {
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

  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/events?select=*&order=created_at.desc&limit=5000`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (!res.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'supabase_read_failed' }) };
    }
    const rows = await res.json();

    const purchaseFirstSeen = new Map();
    const purchaseDays = {};
    const purchaseWeekdayCounts = Array(7).fill(0);
    const purchaseMonths = {};
    const purchaseYears = {};
    const stampCounts = Array(10).fill(0);
    const quizWrongCounts = Array(10).fill(0);
    const stampSessions = new Set();
    const completedSessions = new Set();
    const sessionStamps = new Map();
    const omikujiRankCounts = {};
    const omikujiSamples = [];
    const surveys = [];
    let catVerifyTotal = 0;
    let catVerifyFoundCount = 0;
    let shareClickCount = 0;
    let narrationPlayCount = 0;
    const hintCounts = { 1: 0, 2: 0, 3: 0 };
    const hintSessions = new Set();
    const catVerifySessions = new Set();

    /* 言語別集計用：セッションごとの言語を記録する（そのセッションで最初に見つかった言語を採用） */
    const sessionLangAny = new Map(); // 全イベントから：来訪者の言語利用割合に使う
    const sessionLangProgress = new Map(); // stampイベントから：完了率・満足度の言語別内訳に使う

    for (const r of rows) {
      if (r.lang && !sessionLangAny.has(r.session_id)) {
        sessionLangAny.set(r.session_id, r.lang);
      }

      if (r.event_type === 'purchase') {
        if (!purchaseFirstSeen.has(r.session_id)) {
          purchaseFirstSeen.set(r.session_id, r.created_at);
          purchaseDays[jstDateKey(r.created_at)] = (purchaseDays[jstDateKey(r.created_at)] || 0) + 1;
          purchaseWeekdayCounts[jstWeekday(r.created_at)]++;
          purchaseMonths[jstMonthKey(r.created_at)] = (purchaseMonths[jstMonthKey(r.created_at)] || 0) + 1;
          purchaseYears[jstYearKey(r.created_at)] = (purchaseYears[jstYearKey(r.created_at)] || 0) + 1;
        }
      } else if (r.event_type === 'stamp') {
        const spot = r.payload && typeof r.payload.spot === 'number' ? r.payload.spot : null;
        if (spot !== null && spot >= 0 && spot < 10) stampCounts[spot]++;
        stampSessions.add(r.session_id);
        if (!sessionStamps.has(r.session_id)) sessionStamps.set(r.session_id, new Set());
        if (spot !== null) sessionStamps.get(r.session_id).add(spot);
        if (r.lang && !sessionLangProgress.has(r.session_id)) {
          sessionLangProgress.set(r.session_id, r.lang);
        }
      } else if (r.event_type === 'quiz_wrong') {
        const spot = r.payload && typeof r.payload.spot === 'number' ? r.payload.spot : null;
        if (spot !== null && spot >= 0 && spot < 10) quizWrongCounts[spot]++;
      } else if (r.event_type === 'cat_verify') {
        catVerifyTotal++;
        catVerifySessions.add(r.session_id);
        if (r.payload && r.payload.found) catVerifyFoundCount++;
      } else if (r.event_type === 'share_click') {
        shareClickCount++;
      } else if (r.event_type === 'hint_used') {
        const n = r.payload && r.payload.hintNum;
        if (n === 1 || n === 2 || n === 3) hintCounts[n]++;
        hintSessions.add(r.session_id);
      } else if (r.event_type === 'narration_play') {
        narrationPlayCount++;
      } else if (r.event_type === 'omikuji') {
        const rank = r.payload && r.payload.rank;
        if (rank) omikujiRankCounts[rank] = (omikujiRankCounts[rank] || 0) + 1;
        if (omikujiSamples.length < 20) {
          omikujiSamples.push({
            rank: r.payload && r.payload.rank,
            rankReading: r.payload && r.payload.rankReading,
            poem: r.payload && r.payload.poem,
            overall: r.payload && r.payload.overall,
            lang: r.lang,
            created_at: r.created_at,
          });
        }
      } else if (r.event_type === 'survey') {
        surveys.push({
          rating: r.payload && r.payload.rating,
          guideRating: r.payload && r.payload.guideRating,
          quizRating: r.payload && r.payload.quizRating,
          priceRating: r.payload && r.payload.priceRating,
          comment: r.payload && r.payload.comment,
          lang: r.lang,
          created_at: r.created_at,
        });
      }
    }

    for (const [sid, spots] of sessionStamps.entries()) {
      if (spots.size >= 10) completedSessions.add(sid);
    }

    const totalPurchases = purchaseFirstSeen.size;
    const totalVisitorsWithProgress = stampSessions.size;
    const completionRate = totalVisitorsWithProgress
      ? completedSessions.size / totalVisitorsWithProgress
      : null;
    const _avgOf = (arr, field) => {
      const answered = arr.filter((s) => s[field] > 0);
      return answered.length
        ? answered.reduce((a, s) => a + s[field], 0) / answered.length
        : null;
    };
    const avgRating = _avgOf(surveys, 'rating');
    const avgGuideRating = _avgOf(surveys, 'guideRating');
    const avgQuizRating = _avgOf(surveys, 'quizRating');
    const avgPriceRating = _avgOf(surveys, 'priceRating');

    const omikujiDrawCount = Object.values(omikujiRankCounts).reduce((a, b) => a + b, 0);

    /* スポット別クイズ正答率＝スタンプ獲得数（初回正解） / (初回正解 + 不正解回答数) */
    const quizCorrectRates = stampCounts.map((correct, i) => {
      const total = correct + quizWrongCounts[i];
      return total > 0 ? correct / total : null;
    });

    /* 隠れ招き猫探し（AI画像判定）の正答率＝AIがfoundと判定した回数 / 判定を行った総回数 */
    const catVerifyRate = catVerifyTotal > 0 ? catVerifyFoundCount / catVerifyTotal : null;

    /* SNSシェアボタン押下率＝ボタン押下回数 / おみくじ実施数（最も一般的にボタンが出現する状態を分母とする） */
    const shareClickRate = omikujiDrawCount > 0 ? shareClickCount / omikujiDrawCount : null;

    /* 隠れ招き猫探しのヒント利用率＝ヒントを1回以上使ったセッション数 / 写真判定を試みたセッション数 */
    const hintUsageRate = catVerifySessions.size > 0 ? hintSessions.size / catVerifySessions.size : null;

    /* AIナレーション再生率＝再生回数 / スタンプ獲得数（1スタンプあたりの平均再生回数、100%を超えることもある） */
    const narrationPlayRate = stampSessions.size > 0 ? narrationPlayCount / stampCounts.reduce((a, b) => a + b, 0) : null;

    /* 言語別 利用者数（全イベントから、来訪者がどの言語を選んだかの内訳） */
    const languageUsageCounts = {};
    for (const lang of sessionLangAny.values()) {
      languageUsageCounts[lang] = (languageUsageCounts[lang] || 0) + 1;
    }

    /* 言語別 完了率・満足度の内訳 */
    const langsWithProgress = new Set(sessionLangProgress.values());
    const languageBreakdown = Array.from(langsWithProgress).map((lang) => {
      const sessionsForLang = Array.from(sessionLangProgress.entries())
        .filter(([, l]) => l === lang)
        .map(([sid]) => sid);
      const visitorCount = sessionsForLang.length;
      const completedCountForLang = sessionsForLang.filter((sid) => completedSessions.has(sid)).length;
      const surveysForLang = surveys.filter((s) => s.lang === lang);
      return {
        lang,
        visitorCount,
        completedCount: completedCountForLang,
        completionRate: visitorCount > 0 ? completedCountForLang / visitorCount : null,
        avgRating: _avgOf(surveysForLang, 'rating'),
        avgGuideRating: _avgOf(surveysForLang, 'guideRating'),
        avgQuizRating: _avgOf(surveysForLang, 'quizRating'),
        avgPriceRating: _avgOf(surveysForLang, 'priceRating'),
        surveyCount: surveysForLang.length,
      };
    }).sort((a, b) => b.visitorCount - a.visitorCount);

    /* 推定売上＝購入件数 × ¥1,100（固定価格想定。実際のStripe決済額の集計ではなく件数ベースの概算） */
    const PRICE_JPY = 1100;
    const revenueByWeekday = purchaseWeekdayCounts.map((c) => c * PRICE_JPY);
    const revenueByMonth = {};
    for (const k of Object.keys(purchaseMonths)) revenueByMonth[k] = purchaseMonths[k] * PRICE_JPY;
    const revenueByYear = {};
    for (const k of Object.keys(purchaseYears)) revenueByYear[k] = purchaseYears[k] * PRICE_JPY;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalPurchases,
        purchaseDays,
        purchaseWeekdayCounts,
        purchaseMonths,
        purchaseYears,
        estimatedRevenueTotal: totalPurchases * PRICE_JPY,
        revenueByWeekday,
        revenueByMonth,
        revenueByYear,
        weekdayLabels: WEEKDAY_LABELS_JA,
        stampCounts,
        quizWrongCounts,
        quizCorrectRates,
        totalVisitorsWithProgress,
        completedCount: completedSessions.size,
        completionRate,
        omikujiRankCounts,
        omikujiDrawCount,
        omikujiSamples,
        avgRating,
        avgGuideRating,
        avgQuizRating,
        avgPriceRating,
        catVerifyTotal,
        catVerifyFoundCount,
        catVerifyRate,
        shareClickCount,
        shareClickRate,
        hintCounts,
        hintUsageRate,
        narrationPlayCount,
        narrationPlayRate,
        languageUsageCounts,
        languageBreakdown,
        surveyCount: surveys.length,
        surveys: surveys.slice(0, 200),
        rawEventCount: rows.length,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'stats_failed' }) };
  }
};
