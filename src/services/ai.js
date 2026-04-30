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
  try {
    // JSON'u temizle (bazen ```json ... ``` ile sarılı gelir)
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.error("Failed to parse AI response:", textBlock.text.slice(0, 500));
    throw new Error("AI returned invalid JSON. Please try again with a clearer menu image.");
  }

  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new Error("AI did not return a valid items array");
  }

  return {
    categories: parsed.categories || [],
    items: parsed.items.map(it => ({
      name: it.name || "",
      description: (it.description || "").slice(0, 200),
      price: typeof it.price === "number" ? it.price : parseFloat(it.price) || 0,
      category: it.category || "Other",
      isProperName: !!it.isProperName,
    })),
    usage: response.usage,
  };
}

/**
 * Bir item için açıklama oluşturur (manuel ekleme sırasında)
 */
async function generateDescription(itemName, category, language = "en") {
  const langName = getLanguageName(language);

  const response = await client.messages.create({
    model: MODEL_DESC,
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `Write a short, appetizing menu description for this dish. Language: ${langName}. Category: ${category}. Dish name: ${itemName}.

Rules:
- Maximum 200 characters
- 1-2 sentences
- Natural, restaurant-quality wording
- Include key ingredients or preparation method if recognizable
- Do not include the dish name itself in the description
- No quotes, no markdown, just the plain description text

Respond with ONLY the description text, nothing else.`,
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  return (textBlock?.text || "").trim().slice(0, 200);
}

/**
 * Item çevirisi - özel isimleri korur, açıklamayı çevirir
 */
async function translateItems(items, sourceLanguage, targetLanguage) {
  const sourceLang = getLanguageName(sourceLanguage);
  const targetLang = getLanguageName(targetLanguage);

  const itemsForAI = items.map(i => ({
    id: i.id,
    name: i.name,
    description: i.description || "",
    isProperName: i.isProperName || false,
  }));

  const response = await client.messages.create({
    model: MODEL_TRANSLATE,
    max_tokens: 8000,
    messages: [{
      role: "user",
      content: `Translate these menu items from ${sourceLang} to ${targetLang}.

Rules:
- If isProperName is true, KEEP the original name unchanged
- For non-proper names, translate to ${targetLang} naturally
- Always translate descriptions (keep under 200 characters)
- Do not add any explanations or notes in the name field
- Output JSON only, no markdown

Items: ${JSON.stringify(itemsForAI)}

Respond with ONLY this JSON format:
{
  "translations": [
    {"id": "...", "name": "translated or original", "description": "translated description"}
  ]
}`,
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  const parsed = JSON.parse(jsonText);
  return parsed.translations || [];
}

/**
 * Kategori çevirisi
 */
async function translateCategories(categories, sourceLanguage, targetLanguage) {
  const sourceLang = getLanguageName(sourceLanguage);
  const targetLang = getLanguageName(targetLanguage);

  const response = await client.messages.create({
    model: MODEL_TRANSLATE,
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Translate these menu category names from ${sourceLang} to ${targetLang}.

Categories: ${JSON.stringify(categories.map(c => ({ id: c.id, label: c.label })))}

Respond with ONLY this JSON:
{"translations":[{"id":"...","label":"translated label"}]}`,
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(jsonText).translations || [];
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

module.exports = {
  extractMenuFromFiles,
  generateDescription,
  translateItems,
  translateCategories,
  getLanguageName,
};
