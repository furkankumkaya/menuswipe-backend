/**
 * Gemini API ile Google Reviews insights çekme.
 * Restoran adı + Google Maps URL alır, popüler yemekleri döner.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Bir restoranın Google yorumlarından popüler yemekleri çıkarır.
 * @param {object} org - Organization (name, googleMapsUrl, city, etc.)
 * @returns {Promise<object|null>} { popularDishes, mustTry, sentiment, fetchedAt }
 */
async function fetchGoogleInsights(org) {
  if (!GEMINI_API_KEY) {
    console.warn("[gemini] GEMINI_API_KEY not set, skipping");
    return null;
  }
  
  const name = org.name;
  const url = org.googleMapsUrl;
  const city = org.city || "";
  const country = org.country || "";
  const address = org.address || "";
  
  if (!name) return null;
  
  // Konum bilgisini topla
  const locationParts = [address, city, country].filter(Boolean);
  const locationStr = locationParts.join(", ");
  
  const prompt = `Search Google Maps and Google reviews for this restaurant and find the most mentioned dishes in customer reviews.

Restaurant name: ${name}
${locationStr ? `Location: ${locationStr}` : ""}
${url ? `Google Maps URL: ${url}` : ""}

Your response must be ONLY a JSON object, nothing else. No explanation, no markdown, no code blocks. Just raw JSON.

Example of exactly what to return:
{"popularDishes":[{"name":"Köfte","mentions":15,"quote":"Very tasty and fresh"},{"name":"Baklava","mentions":8,"quote":"Best in the city"}],"mustTry":["Köfte"],"overallSentiment":"positive","totalReviewsAnalyzed":45,"notes":"Known for grilled meats"}

If you cannot find the restaurant or reviews, return exactly:
{"popularDishes":[],"mustTry":[],"overallSentiment":"unknown","totalReviewsAnalyzed":0,"notes":"Not found"}

Now return the JSON for: ${name}${locationStr ? ', ' + locationStr : ''}`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  };
  
  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error("[gemini] API error:", response.status, text.slice(0, 500));
      return null;
    }
    
    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) {
      console.warn("[gemini] no candidates in response");
      return null;
    }
    
    const text = candidate.content?.parts?.map(p => p.text).filter(Boolean).join("\n") || "";
    
    console.log("[gemini] raw response length:", text.length, "first 300:", text.slice(0, 300));
    
    // JSON parse - birden fazla strateji dene
    let parsed = null;
    
    // 1. Direkt parse
    try { parsed = JSON.parse(text.trim()); } catch(e) {}
    
    // 2. Markdown code block içinden çıkar
    if (!parsed) {
      const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) {
        try { parsed = JSON.parse(codeBlock[1].trim()); } catch(e) {}
      }
    }
    
    // 3. İlk { ... } bloğunu bul
    if (!parsed) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch(e) {}
      }
    }
    
    if (!parsed) {
      console.warn("[gemini] could not parse JSON. Full response:", text.slice(0, 1000));
      return null;
    }
    
    if (!Array.isArray(parsed.popularDishes) || parsed.popularDishes.length === 0) {
      console.log("[gemini] no popular dishes found for", name);
      return {
        popularDishes: [],
        mustTry: [],
        overallSentiment: parsed.overallSentiment || "unknown",
        totalReviewsAnalyzed: 0,
        notes: parsed.notes || "No reviews available",
        fetchedAt: new Date().toISOString(),
      };
    }
    
    // Temizle ve normalize et
    const result = {
      popularDishes: parsed.popularDishes.slice(0, 8).map(d => ({
        name: String(d.name || "").trim(),
        mentions: parseInt(d.mentions) || 1,
        quote: String(d.quote || "").trim().slice(0, 120),
      })).filter(d => d.name),
      mustTry: Array.isArray(parsed.mustTry) ? parsed.mustTry.slice(0, 5) : [],
      overallSentiment: parsed.overallSentiment || "unknown",
      totalReviewsAnalyzed: parseInt(parsed.totalReviewsAnalyzed) || 0,
      notes: String(parsed.notes || "").slice(0, 300),
      fetchedAt: new Date().toISOString(),
    };
    
    console.log("[gemini] fetched", result.popularDishes.length, "dishes for", name);
    return result;
  } catch (err) {
    console.error("[gemini] fetch error:", err.message);
    return null;
  }
}

/**
 * Gemini'den gelen yemek isimlerini menü item'larıyla eşleştirir.
 * Basit string matching - fuzzy.
 */
function matchInsightsToMenu(insights, menuItems) {
  if (!insights || !Array.isArray(insights.popularDishes) || insights.popularDishes.length === 0) {
    return {};
  }
  
  const result = {}; // itemId -> { mentions, quote }
  
  const normalize = (s) => String(s || "").toLowerCase()
    .replace(/[ıİ]/g, "i").replace(/[şŞ]/g, "s").replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9]/g, "");
  
  for (const popDish of insights.popularDishes) {
    const popNorm = normalize(popDish.name);
    if (!popNorm) continue;
    
    let best = null;
    let bestScore = 0;
    
    for (const mi of menuItems) {
      const miNorm = normalize(mi.name);
      if (!miNorm) continue;
      
      let score = 0;
      // Tam eşleşme
      if (miNorm === popNorm) score = 100;
      // Birbirini içerme
      else if (miNorm.includes(popNorm) || popNorm.includes(miNorm)) {
        const shorter = Math.min(miNorm.length, popNorm.length);
        const longer = Math.max(miNorm.length, popNorm.length);
        score = (shorter / longer) * 80;
      }
      
      if (score > bestScore && score >= 40) {
        bestScore = score;
        best = mi;
      }
    }
    
    if (best) {
      result[best.id] = {
        mentions: popDish.mentions,
        quote: popDish.quote,
      };
    }
  }
  
  return result;
}

module.exports = {
  fetchGoogleInsights,
  matchInsightsToMenu,
};
