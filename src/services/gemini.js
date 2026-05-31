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
  
  const name = org.name || "";
  const url = org.googleMapsUrl || "";
  
  // Google Maps URL'inden restoran adını çıkarmaya çalış
  let extractedName = "";
  if (url) {
    // URL format: /maps/place/Restaurant+Name/... veya /maps/place/Restaurant%20Name/...
    const placeMatch = url.match(/\/place\/([^/@]+)/);
    if (placeMatch) {
      extractedName = decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
    }
  }
  
  const searchName = extractedName || name;
  
  if (!searchName && !url) {
    console.warn("[gemini] no name and no URL, skipping");
    return null;
  }
  
  console.log("[gemini] fetching for:", searchName, "url:", url);

  const prompt = `Search for "${searchName}" restaurant on Google. Find customer reviews and identify the most popular dishes that customers mention and recommend.

${url ? `This is the restaurant Google Maps link: ${url}` : ""}

Based on real customer reviews, list the dishes that are mentioned most often. Include a short quote from reviews for each dish.

Return ONLY a JSON object. No other text, no markdown code blocks, just the JSON:
{"popularDishes":[{"name":"dish name","mentions":10,"quote":"short customer quote"}],"mustTry":["dish1","dish2"],"overallSentiment":"positive","totalReviewsAnalyzed":30,"notes":"brief summary of restaurant strengths"}

If you truly cannot find any reviews for this restaurant, return:
{"popularDishes":[],"mustTry":[],"overallSentiment":"unknown","totalReviewsAnalyzed":0,"notes":"No reviews found"}`;

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
      console.log("[gemini] no popular dishes found for", url || name);
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
