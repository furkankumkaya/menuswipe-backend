const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL_PARSER = "claude-sonnet-4-6";
const MODEL_DESC = "claude-sonnet-4-6";
const MODEL_TRANSLATE = "claude-haiku-4-5-20251001";

/**
 * PDF veya fotoğraf dosyalarından menü item'larını çıkarır
 * @param {Array} files - [{buffer, mimetype, originalname}]
 * @param {string} sourceLanguage - Menünün dili (en, tr, ar, ...)
 * @param {string} currency - Para birimi (USD, EUR, TRY, ...)
 * @returns {Promise<{categories, items}>}
 */
async function extractMenuFromFiles(files, sourceLanguage = "en", currency = "USD") {
  // Dosyaları content blocks'a çevir
  const content = [];

  for (const file of files) {
    const base64 = file.buffer.toString("base64");
    if (file.mimetype === "application/pdf") {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      });
    } else if (file.mimetype.startsWith("image/")) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.mimetype,
          data: base64,
        },
      });
    }
  }

  const langName = getLanguageName(sourceLanguage);

  const prompt = `You are a menu parsing assistant. Analyze the attached restaurant menu (which may be one or multiple files containing a single restaurant's menu) and extract every menu item.

The menu is written in ${langName}. The currency is ${currency}.

For each menu item, extract:
- name: the dish name as it appears (in ${langName})
- description: a short description (1-2 sentences, max 200 characters) describing what the dish is. If the menu already includes a description, use it. If not, write a natural, appetizing description based on the dish name and your culinary knowledge.
- price: the price as a number (no currency symbol). If a dish has multiple sizes/prices, use the smallest. If no price is shown, use 0.
- category: the category/section name as it appears in the menu (e.g., "Pizzas", "Salads", "Drinks"). Group items that appear under the same heading.
- isProperName: true if this is a brand-specific or proprietary dish name that should NOT be translated (e.g., "Big Mac", "Chef's Special Burger", regional dishes like "Pad Thai", "Köfte", "Lahmacun" that are commonly used internationally). False for generic dishes ("Caesar Salad", "Chicken Wings").

Also extract a list of all categories found in the menu, in the order they appear.

Respond with ONLY valid JSON in this exact format, no other text:
{
  "categories": [
    {"name": "Category Name 1"},
    {"name": "Category Name 2"}
  ],
  "items": [
    {
      "name": "Dish name",
      "description": "Short description here",
      "price": 12.50,
      "category": "Category Name 1",
      "isProperName": false
    }
  ]
}

Important rules:
- Extract EVERY visible item, do not skip any
- If a menu has multiple sections/pages, combine them all into the "items" array
- If there are duplicate items across pages, include only once
- Keep the original language of names and descriptions
- Be generous with isProperName for dishes that are clearly named (proprietary or regional)
- Do not include allergen icons, prices in different currencies, or non-item content
- If the menu is unreadable or not a menu, return {"categories": [], "items": []}`;

  content.push({ type: "text", text: prompt });

  const response = await client.messages.create({
    model: MODEL_PARSER,
    max_tokens: 8000,
    messages: [{ role: "user", content }],
  });

  // İlk text block'u al
  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock) throw new Error("No text response from AI");

  let parsed;
  const rawText = textBlock.text.trim();
  
  // Birden fazla strateji ile JSON parse
  // 1. Direkt parse
  try {
    let jsonText = rawText;
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    parsed = JSON.parse(jsonText);
  } catch(e) {}
  
  // 2. Markdown code block içinden çıkar
  if (!parsed) {
    const codeBlock = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      try { parsed = JSON.parse(codeBlock[1].trim()); } catch(e) {}
    }
  }
  
  // 3. İlk { ... } bloğunu bul
  if (!parsed) {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch(e) {}
    }
  }
  
  // 4. Hala parse edemedik — satır satır item çıkarmayı dene
  if (!parsed) {
    console.warn("[import] JSON parse failed, trying line extraction. Raw:", rawText.slice(0, 800));
    const extractedItems = [];
    const lines = rawText.split('\n').filter(l => l.trim());
    for (const line of lines) {
      // "ItemName - $12.50" veya "ItemName    12.50" veya "ItemName ... 150₺" gibi desenleri yakala
      const match = line.match(/^[\s\-\*]*(.+?)[\s\.\-—:]+(\$|€|£|₺|TL|USD|EUR)?[\s]*(\d+[\.,]?\d*)\s*(\$|€|£|₺|TL|USD|EUR)?[\s]*$/);
      if (match) {
        extractedItems.push({
          name: match[1].trim(),
          description: "",
          price: parseFloat(match[3].replace(',','.')) || 0,
          category: "Other",
          isProperName: false,
        });
      } else if (line.trim().length > 2 && line.trim().length < 80 && !line.match(/^\d+$/) && !line.match(/^[\s\-\*]+$/)) {
        // İsim gibi görünen satır, fiyatsız
        const cleanName = line.replace(/^[\s\-\*•]+/, '').trim();
        if (cleanName.length > 1) {
          extractedItems.push({
            name: cleanName,
            description: "",
            price: 0,
            category: "Other",
            isProperName: false,
          });
        }
      }
    }
    if (extractedItems.length > 0) {
      parsed = { categories: [{ name: "Other" }], items: extractedItems };
      console.log("[import] extracted", extractedItems.length, "items from raw text");
    }
  }
  
  if (!parsed || !parsed.items || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    console.error("[import] all parse strategies failed. Raw text:", rawText.slice(0, 800));
    throw new Error("Could not extract menu items. Please try with a clearer image or PDF.");
  }

  // Items'ı temizle - eksik alanlar için default değer
  const cleanedItems = parsed.items.map(it => ({
    name: (it.name || "").trim(),
    description: (it.description || "").slice(0, 200),
    price: typeof it.price === "number" ? it.price : parseFloat(it.price) || 0,
    category: it.category || "Other",
    isProperName: !!it.isProperName,
    needsReview: !it.price || it.price === 0, // fiyatı olmayan item'lar review gerektirir
  })).filter(it => it.name.length > 0); // isimsiz item'ları at

  const itemsNeedingReview = cleanedItems.filter(it => it.needsReview).length;
  if (itemsNeedingReview > 0) {
    console.log("[import]", itemsNeedingReview, "items need price review (price=0)");
  }

  return {
    categories: parsed.categories || [],
    items: cleanedItems,
    usage: response.usage,
    itemsNeedingReview,
  };
}

/**
 * Bir item için açıklama oluşturur (manuel ekleme sırasında)
 */
async function generateDescription(itemName, category, language = "en") {
  const langName = getLanguageName(language);

  const response = await client.messages.create({
    model: MODEL_DESC,
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `Write a short, appetizing menu description for this dish. Language: ${langName}. Category: ${category}. Dish name: ${itemName}.

Rules:
- HARD LIMIT: max 200 characters total (including spaces) — count carefully
- Length is flexible: can be short (60-100 chars) or longer (up to 200) — write what's natural
- 1-2 complete sentences
- Natural, restaurant-quality wording
- Include key ingredients or preparation method if recognizable
- Do not include the dish name itself in the description
- No quotes, no markdown, just the plain description text
- Always finish with proper punctuation (period)
- If the dish is simple, keep it short. Don't pad with filler.

Respond with ONLY the description text, nothing else.`,
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  let text = (textBlock?.text || "").trim();
  
  // 200 karakter sınırı
  if (text.length > 200) {
    const trimmed = text.slice(0, 200);
    const lastPunct = Math.max(trimmed.lastIndexOf('.'), trimmed.lastIndexOf('!'), trimmed.lastIndexOf('?'));
    if (lastPunct > 80) {
      text = trimmed.slice(0, lastPunct + 1);
    } else {
      const lastSpace = trimmed.lastIndexOf(' ');
      text = lastSpace > 80 ? trimmed.slice(0, lastSpace) + '.' : trimmed + '.';
    }
  }
  return text;
}

/**
 * Tek bir item için çeviri yapar, retry logic ile
 * 1. ve 2. denemede direkt çeviri
 * 3. denemede AI kendi araştırıp yazar
 * Tümü başarısızsa null döner (caller orijinal dilini kullanır)
 */
async function translateItem(item, sourceLanguage, targetLanguage) {
  const sourceLang = getLanguageName(sourceLanguage);
  const targetLang = getLanguageName(targetLanguage);
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let prompt;
      if (attempt < 3) {
        // İlk iki deneme: direkt çeviri
        prompt = `Translate this menu item from ${sourceLang} to ${targetLang}.

Item:
- Name: ${item.name}
- Description: ${item.description || "(no description)"}
- isProperName: ${item.isProperName ? "true" : "false"}

Rules:
- If isProperName is true, KEEP the original name unchanged in the translation
- For non-proper names, translate naturally to ${targetLang}
- Translate the description naturally (max 200 characters)
- Don't add notes, explanations, or quotes
- Output JSON only, no markdown

Respond with this exact JSON format:
{"name": "translated or original", "description": "translated description"}`;
      } else {
        // 3. deneme: AI araştırıp kendi yazsın
        prompt = `You are translating a restaurant menu item from ${sourceLang} to ${targetLang}.

Item name: ${item.name}
Category: ${item.category || "Main"}
Original description: ${item.description || "(none provided)"}
isProperName: ${item.isProperName ? "true" : "false"}

Your task:
- If isProperName is true, keep the name as is
- Otherwise translate the name naturally
- Even if the original description is poor or empty, write a NEW appetizing description in ${targetLang} (max 200 chars) based on what you know about this dish

Respond with ONLY this JSON:
{"name": "...", "description": "..."}`;
      }

      const response = await client.messages.create({
        model: MODEL_TRANSLATE,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === "text");
      if (!textBlock) continue;
      
      let jsonText = textBlock.text.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      
      const parsed = JSON.parse(jsonText);
      if (parsed.name) {
        let desc = (parsed.description || "").trim();
        // 200 karakter sınırı, kelime ortasından kesme
        if (desc.length > 200) {
          const trimmed = desc.slice(0, 200);
          const lastPunct = Math.max(trimmed.lastIndexOf('.'), trimmed.lastIndexOf('!'), trimmed.lastIndexOf('?'));
          if (lastPunct > 80) {
            desc = trimmed.slice(0, lastPunct + 1);
          } else {
            const lastSpace = trimmed.lastIndexOf(' ');
            desc = lastSpace > 80 ? trimmed.slice(0, lastSpace) + '.' : trimmed;
          }
        }
        return {
          name: parsed.name,
          description: desc,
        };
      }
    } catch (e) {
      console.warn(`Translation attempt ${attempt} failed for item "${item.name}" → ${targetLanguage}:`, e.message);
      if (attempt === 3) return null;
    }
  }
  return null;
}

/**
 * Kategori çevirisi
 */
async function translateCategory(label, sourceLanguage, targetLanguage) {
  const sourceLang = getLanguageName(sourceLanguage);
  const targetLang = getLanguageName(targetLanguage);
  
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL_TRANSLATE,
        max_tokens: 100,
        messages: [{
          role: "user",
          content: `Translate this menu category name from ${sourceLang} to ${targetLang}: "${label}"

Respond with ONLY the translated label, nothing else. No quotes, no explanations.`,
        }],
      });
      
      const textBlock = response.content.find(b => b.type === "text");
      if (textBlock) {
        const result = textBlock.text.trim().replace(/^["']|["']$/g, "").slice(0, 100);
        if (result) return result;
      }
    } catch (e) {
      if (attempt === 2) return null;
    }
  }
  return null;
}

function getLanguageName(code) {
  const map = {
    en: "English", tr: "Turkish", ar: "Arabic", es: "Spanish", fr: "French",
    de: "German", it: "Italian", pt: "Portuguese", ru: "Russian", zh: "Chinese",
    ja: "Japanese", ko: "Korean", hi: "Hindi", th: "Thai", vi: "Vietnamese",
    id: "Indonesian", nl: "Dutch", pl: "Polish", uk: "Ukrainian", el: "Greek",
    he: "Hebrew", fa: "Persian", ur: "Urdu", bn: "Bengali", ms: "Malay",
    sv: "Swedish", no: "Norwegian", da: "Danish", fi: "Finnish", cs: "Czech",
    hu: "Hungarian", ro: "Romanian", bg: "Bulgarian", hr: "Croatian", sr: "Serbian",
    sk: "Slovak", sl: "Slovenian", lt: "Lithuanian", lv: "Latvian", et: "Estonian",
    az: "Azerbaijani", ka: "Georgian", hy: "Armenian", kk: "Kazakh", uz: "Uzbek",
  };
  return map[code] || code;
}

async function recommendItems(menuItems, answers, language = "en", googleContext = null) {
  const langName = getLanguageName(language);
  
  // Menü datasını compact JSON formatına çevir
  const menuCompact = menuItems.map(it => ({
    id: it.id,
    name: it.name,
    category: it.category,
    price: it.price,
    description: (it.description || "").slice(0, 150),
    tagDietary: it.tagDietary || null,
    allergens: it.allergens || [],
  }));

  const systemPrompt = `You are a friendly restaurant AI assistant helping a customer choose what to order from this restaurant's menu.

You MUST ONLY recommend items from the JSON menu below. NEVER invent items that aren't in the list. Always reference items by their exact "id".

Menu (JSON):
${JSON.stringify(menuCompact)}
${googleContext || ""}

Respond ONLY in valid JSON with this exact structure:
{
  "items": [
    {"id": "exact-item-id-from-menu", "reason": "one short sentence in ${langName} explaining why this matches"}
  ],
  "intro": "one short friendly sentence in ${langName} introducing your suggestions"
}

Rules:
- Recommend 2-3 items total based on what the customer wants
- If they want food AND drink, include both
- If they only want food, only suggest food. Same for drinks
- Respect dietary restrictions strictly (vegan, vegetarian, gluten-free, halal)
- Avoid items containing customer's allergens
- Match the hunger level (light items for light hunger, hearty for very hungry)
- Reason must be specific and in the customer's language: ${langName}
- Keep each reason under 80 characters
- If nothing matches well, still pick the closest 2 items and acknowledge in intro`;

  const userMessage = `Customer answers (in their language ${langName}):
- Looking for: ${answers.lookingFor || "anything"}
- Hunger level: ${answers.hungerLevel || "not specified"}
- Dietary restrictions: ${answers.dietary?.length ? answers.dietary.join(", ") : "none"}
- Allergens to avoid: ${answers.allergens?.length ? answers.allergens.join(", ") : "none"}
- Taste preferences: ${answers.taste?.length ? answers.taste.join(", ") : "no specific preference"}
${answers.note ? `- Extra note from customer: "${answers.note}"` : ""}

Recommend the best 2-3 items from the menu. Respond in ${langName}.`;

  const response = await client.messages.create({
    model: MODEL_DESC,
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  let text = (textBlock?.text || "").trim();
  
  // JSON parse
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI did not return valid JSON");
  }
  
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error("Failed to parse AI response");
  }
  
  // Validation: AI'nın döndürdüğü ID'ler gerçekten menüde var mı?
  const menuIds = new Set(menuItems.map(i => i.id));
  parsed.items = (parsed.items || [])
    .filter(rec => rec.id && menuIds.has(rec.id))
    .slice(0, 3);
  
  if (parsed.items.length === 0) {
    throw new Error("No valid recommendations from AI");
  }
  
  return {
    intro: parsed.intro || "",
    items: parsed.items,
  };
}

/**
 * Batch generate dietary tags + allergens for menu items
 */
async function generateDietaryAllergens(items, language = "en") {
  const langName = getLanguageName(language);
  const VALID_DIETARY = ["SPICY","VEGAN","GLUTEN_FREE","HALAL","DAIRY_FREE","PROTEIN_PLUS"];
  const VALID_ALLERGENS = ["GLUTEN","CRUSTACEANS","EGGS","FISH","PEANUTS","SOYBEANS","MILK","NUTS","CELERY","MUSTARD","SESAME","SULPHITES","LUPIN","MOLLUSCS"];

  const itemList = items.map(it => ({
    id: it.id,
    name: it.name,
    description: it.description || "",
    category: it.category || "",
  }));

  const response = await client.messages.create({
    model: MODEL_DESC,
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `You are a food safety and nutrition expert. Analyze these menu items (in ${langName}) and assign dietary tags and allergens.

Menu items:
${JSON.stringify(itemList)}

Valid dietary tags (pick at most 1 per item, or null): ${VALID_DIETARY.join(", ")}
Valid allergens (pick all that likely apply): ${VALID_ALLERGENS.join(", ")}

Rules:
- Base your analysis on the item name, description, and category
- Be conservative: only tag allergens you're reasonably confident about
- SPICY for clearly spicy dishes. VEGAN for plant-only. GLUTEN_FREE for naturally GF items. HALAL for clearly halal. DAIRY_FREE for dairy-free. PROTEIN_PLUS for high-protein.
- Most bread/pasta/pizza items contain GLUTEN. Most items with cheese contain MILK. Seafood items may contain CRUSTACEANS, FISH, or MOLLUSCS.
- If unsure about dietary, use null

Respond with ONLY JSON array:
[{"id":"...","tagDietary":"SPICY"|null,"allergens":["GLUTEN","MILK"]}]`,
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  const raw = (textBlock?.text || "").trim();
  let jsonText = raw;
  if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const match = jsonText.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const parsed = JSON.parse(match[0]);
  return parsed.map(r => ({
    id: r.id,
    tagDietary: VALID_DIETARY.includes(r.tagDietary) ? r.tagDietary : null,
    allergens: (r.allergens || []).filter(a => VALID_ALLERGENS.includes(a)),
  }));
}

/**
 * Batch generate marketing tags for menu items
 */
async function generateMarketingTags(items, language = "en") {
  const langName = getLanguageName(language);
  const VALID_MARKETING = ["NEW","BESTSELLER","OFFER","LIMITED","SEASONAL","LOCAL_FOOD"];

  const itemList = items.map(it => ({
    id: it.id,
    name: it.name,
    description: it.description || "",
    price: it.price,
    category: it.category || "",
  }));

  const response = await client.messages.create({
    model: MODEL_DESC,
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `You are a restaurant marketing expert. Analyze these menu items (in ${langName}) and suggest marketing tags.

Menu items:
${JSON.stringify(itemList)}

Valid marketing tags (pick at most 1 per item, or null): ${VALID_MARKETING.join(", ")}

Rules:
- BESTSELLER: dishes that are commonly popular in restaurants of this type
- LOCAL_FOOD: regional/local specialty dishes
- SEASONAL: items that are clearly seasonal
- NEW, OFFER, LIMITED: use sparingly, only if the name/description suggests it
- Most items should get null (no tag). Only ~20-30% should get a tag.
- Be selective. A tag on every item defeats the purpose.

Respond with ONLY JSON array:
[{"id":"...","tagMarketing":"BESTSELLER"|null}]`,
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  const raw = (textBlock?.text || "").trim();
  let jsonText = raw;
  if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const match = jsonText.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const parsed = JSON.parse(match[0]);
  return parsed.map(r => ({
    id: r.id,
    tagMarketing: VALID_MARKETING.includes(r.tagMarketing) ? r.tagMarketing : null,
  }));
}

/**
 * Batch generate descriptions for items that lack them
 */
async function generateDescriptions(items, language = "en") {
  const langName = getLanguageName(language);
  const needDesc = items.filter(it => !it.description || it.description.trim() === "");
  if (needDesc.length === 0) return [];

  const itemList = needDesc.map(it => ({
    id: it.id,
    name: it.name,
    category: it.category || "",
  }));

  const response = await client.messages.create({
    model: MODEL_DESC,
    max_tokens: 6000,
    messages: [{
      role: "user",
      content: `Write short, appetizing menu descriptions for these dishes. Language: ${langName}.

Items needing descriptions:
${JSON.stringify(itemList)}

Rules:
- Each description: 1-2 sentences, max 200 characters
- Natural, restaurant-quality wording
- Include key ingredients or preparation method if recognizable from the name
- Do not repeat the dish name in the description

Respond with ONLY JSON array:
[{"id":"...","description":"Short appetizing description here."}]`,
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  const raw = (textBlock?.text || "").trim();
  let jsonText = raw;
  if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const match = jsonText.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]).map(r => ({
    id: r.id,
    description: (r.description || "").slice(0, 200),
  }));
}

/**
 * Generate upsell combos: food-drink, food-side, food-dessert, dessert-drink
 */
async function generateUpsellCombos(items, categories, language = "en") {
  const langName = getLanguageName(language);

  // Build category group map
  const catGroupMap = {};
  for (const c of categories) catGroupMap[c.code] = c.group || "food";

  const itemList = items.map(it => ({
    id: it.id,
    name: it.name,
    price: it.price,
    category: it.category,
    group: catGroupMap[it.category] || "food",
  }));

  const response = await client.messages.create({
    model: MODEL_DESC,
    max_tokens: 6000,
    messages: [{
      role: "user",
      content: `You are a restaurant upselling expert. Create smart upsell combinations for these menu items (in ${langName}).

Menu items with their groups:
${JSON.stringify(itemList)}

Create upsell suggestions. For each item, suggest 1-3 complementary items from DIFFERENT groups:
- Food items -> suggest drinks, sides, or desserts
- Drink items -> suggest food or desserts
- Dessert items -> suggest drinks or coffee

Rules:
- Only suggest items that naturally pair well together
- A burger pairs well with a drink and fries. A steak pairs with wine. Dessert pairs with coffee/tea.
- Each suggestion must use an actual item ID from the list
- An item cannot suggest itself
- Focus on the most natural pairings, not random combinations
- Not every item needs upsells. Skip items with no good matches.

Respond with ONLY JSON array:
[{"id":"item_id","crossSellItemIds":["suggested_id_1","suggested_id_2"]}]`,
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  const raw = (textBlock?.text || "").trim();
  let jsonText = raw;
  if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const match = jsonText.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const validIds = new Set(items.map(i => i.id));
  return JSON.parse(match[0]).map(r => ({
    id: r.id,
    crossSellItemIds: (r.crossSellItemIds || []).filter(sid => validIds.has(sid) && sid !== r.id).slice(0, 3),
  })).filter(r => r.crossSellItemIds.length > 0);
}

module.exports = {
  extractMenuFromFiles,
  generateDescription,
  translateItem,
  translateCategory,
  getLanguageName,
  recommendItems,
  generateDietaryAllergens,
  generateMarketingTags,
  generateDescriptions,
  generateUpsellCombos,
};
