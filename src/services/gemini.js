/**
 * Gemini API - Google Reviews insights + Restoran bilgisi çekme
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * FIX 1: Mobile share URL'leri (maps.app.goo.gl) uzat.
 * Bu URL'lerde restoran adı yok, redirect takip ederek tam URL'e dönüştür.
 */
async function expandGoogleMapsUrl(url) {
  if (!url) return url;
  
  // Zaten tam URL ise direkt döndür
  if (url.includes("/maps/place/")) return url;
  
  // Kısaltılmış URL: maps.app.goo.gl veya goo.gl/maps
  if (url.includes("goo.gl") || url.includes("maps.app.goo.gl")) {
    try {
      const resp = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
      });
      const expanded = resp.url;
      console.log("[gemini] expanded URL:", url, "→", expanded.slice(0, 80));
      return expanded;
    } catch (e) {
      console.warn("[gemini] URL expand failed:", e.message);
      return url;
    }
  }
  
  return url;
}

/**
 * URL'den ve/veya org'dan en iyi arama terimini çıkar.
 * FIX 2: Kullanıcı tarafından girilen restoran adını önceliklendir.
 */
function extractSearchTerms(org, expandedUrl) {
  const orgName = (org.name || "").trim();
  const city = (org.city || "").trim();
  const country = (org.country || "").trim();
  
  // URL'den restoran adı çıkar
  let urlName = "";
  if (expandedUrl && expandedUrl.includes("/place/")) {
    const match = expandedUrl.match(/\/place\/([^/@?]+)/);
    if (match) {
      urlName = decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
    }
  }
  
  // Kullanıcının girdiği org adı "My Restaurant" veya boşsa URL'den al
  const isDefaultName = !orgName || orgName === "My Restaurant" || orgName === "my restaurant";
  const bestName = isDefaultName ? (urlName || orgName) : orgName;
  
  const location = [city, country].filter(Boolean).join(", ");
  
  return { name: bestName, urlName, location };
}

/**
 * Gemini'ye istek at - ortak fonksiyon
 */
async function callGemini(prompt) {
  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    }),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`);
  }
  
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("\n") || "";
  return text;
}

/**
 * JSON parse - çok strateji
 */
function parseJSON(text) {
  // 1. Direkt
  try { return JSON.parse(text.trim()); } catch(e) {}
  // 2. Markdown code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch(e) {}
  }
  // 3. İlk { ... }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch(e) {}
  }
  return null;
}

/**
 * FIX 3: Boş popularDishes durumunda daha anlamlı sonuç döndür.
 * Restoran bulunduysa ama yorum yoksa farklı mesaj ver.
 */
function buildEmptyResult(notes) {
  return {
    popularDishes: [],
    mustTry: [],
    overallSentiment: "unknown",
    totalReviewsAnalyzed: 0,
    notes: notes || "No reviews found",
    fetchedAt: new Date().toISOString(),
    notFound: true,
  };
}

/**
 * Ana fonksiyon: Restoran yorumlarından popüler yemekleri çek
 */
async function fetchGoogleInsights(org) {
  if (!GEMINI_API_KEY) {
    console.warn("[gemini] GEMINI_API_KEY not set");
    return null;
  }
  
  const rawUrl = org.googleMapsUrl || "";
  
  // FIX 1: URL'i genişlet
  const expandedUrl = rawUrl ? await expandGoogleMapsUrl(rawUrl) : "";
  
  // FIX 2: En iyi arama terimini bul
  const { name, urlName, location } = extractSearchTerms(org, expandedUrl);
  
  if (!name && !expandedUrl) {
    console.warn("[gemini] no search terms available");
    return null;
  }
  
  console.log("[gemini] searching for:", name, "| url name:", urlName, "| location:", location);
  
  // Arama stratejisi: birden fazla ipucu ver
  const locationHint = location ? ` in ${location}` : "";
  const urlHint = expandedUrl ? `\nGoogle Maps link: ${expandedUrl}` : "";
  const altNameHint = urlName && urlName !== name ? `\nAlternative name from URL: ${urlName}` : "";

  const prompt = `Search Google Maps and Google Reviews to find the most popular dishes at this restaurant:

Restaurant: ${name}${locationHint}${urlHint}${altNameHint}

Instructions:
1. Search for this restaurant on Google Maps
2. Look through customer reviews to find which dishes are mentioned most
3. Return the top dishes customers love

Return ONLY this JSON structure, no other text:
{"popularDishes":[{"name":"dish name","mentions":10,"quote":"short customer quote under 80 chars"}],"mustTry":["dish1","dish2"],"overallSentiment":"positive","totalReviewsAnalyzed":50,"notes":"one sentence about restaurant"}

Rules:
- Include 3-8 dishes sorted by how often mentioned
- Quotes must be from actual customer reviews (paraphrase if needed)
- If restaurant not found or has no English/Turkish reviews: {"popularDishes":[],"mustTry":[],"overallSentiment":"unknown","totalReviewsAnalyzed":0,"notes":"Restaurant not found or no reviews available"}
- ONLY return JSON, nothing else`;

  try {
    const text = await callGemini(prompt);
    console.log("[gemini] response length:", text.length, "| preview:", text.slice(0, 150));
    
    const parsed = parseJSON(text);
    
    if (!parsed) {
      console.warn("[gemini] JSON parse failed:", text.slice(0, 400));
      return buildEmptyResult("Could not parse response");
    }
    
    // FIX 3: popularDishes boşsa anlamlı bilgi dön
    if (!Array.isArray(parsed.popularDishes) || parsed.popularDishes.length === 0) {
      const notes = parsed.notes || "No reviews found for this restaurant";
      console.log("[gemini] no dishes found. Notes:", notes);
      return buildEmptyResult(notes);
    }
    
    const result = {
      popularDishes: parsed.popularDishes.slice(0, 8).map(d => ({
        name: String(d.name || "").trim(),
        mentions: parseInt(d.mentions) || 1,
        quote: String(d.quote || "").trim().slice(0, 120),
      })).filter(d => d.name),
      mustTry: Array.isArray(parsed.mustTry) ? parsed.mustTry.slice(0, 5) : [],
      overallSentiment: parsed.overallSentiment || "positive",
      totalReviewsAnalyzed: parseInt(parsed.totalReviewsAnalyzed) || 0,
      notes: String(parsed.notes || "").slice(0, 300),
      fetchedAt: new Date().toISOString(),
      notFound: false,
    };
    
    console.log("[gemini] success:", result.popularDishes.length, "dishes for", name);
    return result;
    
  } catch (err) {
    console.error("[gemini] error:", err.message);
    return null;
  }
}

/**
 * Gemini'den gelen yemek isimlerini menü item'larıyla eşleştirir.
 */
function matchInsightsToMenu(insights, menuItems) {
  if (!insights || !Array.isArray(insights.popularDishes) || insights.popularDishes.length === 0) {
    return {};
  }
  
  const result = {};
  
  const normalize = (s) => String(s || "").toLowerCase()
    .replace(/[ıİ]/g, "i").replace(/[şŞ]/g, "s").replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9\s]/g, "").trim();
  
  for (const popDish of insights.popularDishes) {
    const popNorm = normalize(popDish.name);
    if (!popNorm) continue;
    
    let best = null;
    let bestScore = 0;
    
    for (const mi of menuItems) {
      const miNorm = normalize(mi.name);
      if (!miNorm) continue;
      
      let score = 0;
      if (miNorm === popNorm) score = 100;
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

/**
 * Google Maps URL'inden restoran bilgilerini çeker (onboarding için).
 */
async function fetchRestaurantInfo(googleMapsUrl, restaurantName) {
  if (!GEMINI_API_KEY) return null;
  
  // FIX 1: URL'i genişlet
  const expandedUrl = googleMapsUrl ? await expandGoogleMapsUrl(googleMapsUrl) : "";
  
  // Restoran adını çıkar
  let urlName = "";
  if (expandedUrl && expandedUrl.includes("/place/")) {
    const match = expandedUrl.match(/\/place\/([^/@?]+)/);
    if (match) urlName = decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
  }
  
  // Kullanıcının manuel girdiği ad varsa öncelik ona
  const searchName = restaurantName || urlName || "";
  
  if (!searchName && !expandedUrl) {
    console.warn("[gemini] fetchRestaurantInfo: no name and no URL");
    return urlName ? { name: urlName } : null;
  }
  
  console.log("[gemini] extracting info for:", searchName, "url:", expandedUrl?.slice(0, 60));
  
  const prompt = `Find information about this restaurant on Google Maps:

${searchName ? `Restaurant name: ${searchName}` : ""}
${expandedUrl ? `Google Maps URL: ${expandedUrl}` : ""}

Search Google Maps for this restaurant and return its official details.

Return ONLY this JSON, no other text:
{"name":"full restaurant name","country":"country name in English","city":"city name","address":"street address","postalCode":"postal code or empty string","phone":"+country code and number","latitude":0.0,"longitude":0.0,"suggestedCurrency":"TRY","suggestedLanguage":"tr","cuisineType":"Turkish"}

Rules:
- suggestedCurrency: local currency code (TRY, USD, EUR, GBP, etc.)
- suggestedLanguage: two-letter code of primary menu language (tr, en, de, etc.)
- Use empty string for unknown text fields, 0 for unknown numbers
- ONLY return JSON`;

  try {
    const text = await callGemini(prompt);
    console.log("[gemini] restaurant info response:", text.slice(0, 200));
    
    const parsed = parseJSON(text);
    if (!parsed) {
      console.warn("[gemini] restaurant info parse failed");
      return searchName ? { name: searchName } : null;
    }
    
    console.log("[gemini] restaurant info found:", parsed.name);
    return parsed;
  } catch (err) {
    console.error("[gemini] restaurant info error:", err.message);
    return searchName ? { name: searchName } : null;
  }
}

module.exports = {
  fetchGoogleInsights,
  matchInsightsToMenu,
  fetchRestaurantInfo,
};
