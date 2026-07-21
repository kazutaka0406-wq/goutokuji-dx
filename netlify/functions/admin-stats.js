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
    const stampCounts = Array(10).fill(0);
    const stampSessions = new Set();
    const completedSessions = new Set();
    const sessionStamps = new Map();
    const omikujiRankCounts = {};
    const omikujiSamples = [];
    const surveys = [];

    for (const r of rows) {
      if (r.event_type === 'purchase') {
        if (!purchaseFirstSeen.has(r.session_id)) {
          purchaseFirstSeen.set(r.session_id, r.created_at);
          const day = r.created_at.slice(0, 10);
          purchaseDays[day] = (purchaseDays[day] || 0) + 1;
        }
      } else if (r.event_type === 'stamp') {
        const spot = r.payload && typeof r.payload.spot === 'number' ? r.payload.spot : null;
        if (spot !== null && spot >= 0 && spot < 10) stampCounts[spot]++;
        stampSessions.add(r.session_id);
        if (!sessionStamps.has(r.session_id)) sessionStamps.set(r.session_id, new Set());
        if (spot !== null) sessionStamps.get(r.session_id).add(spot);
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
    const avgRating = surveys.length
      ? surveys.reduce((a, s) => a + (s.rating || 0), 0) / surveys.length
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalPurchases,
        purchaseDays,
        stampCounts,
        totalVisitorsWithProgress,
        completedCount: completedSessions.size,
        completionRate,
        omikujiRankCounts,
        omikujiDrawCount: Object.values(omikujiRankCounts).reduce((a, b) => a + b, 0),
        omikujiSamples,
        avgRating,
        surveyCount: surveys.length,
        surveys: surveys.slice(0, 200),
        rawEventCount: rows.length,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'stats_failed' }) };
  }
};
