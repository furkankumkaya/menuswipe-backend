const API='';
let token=localStorage.getItem('ms_token')||'';
let org=JSON.parse(localStorage.getItem('ms_org')||'null');
let items=[],cats=[],branches=[];
let editingId=null,openDescId=null,currentFilter='all';
let photoItemId=null,activeSlot=null,pendingDeleteId=null,pendingDeleteType=null;
let pCur=0,pCat='all';
let editingBranchId=null;
const DESC_MAX=120;

const CURRENCIES=[
  {code:'USD',symbol:'$',name:'US Dollar'},{code:'EUR',symbol:'€',name:'Euro'},
  {code:'GBP',symbol:'£',name:'British Pound'},{code:'TRY',symbol:'₺',name:'Turkish Lira'},
  {code:'JPY',symbol:'¥',name:'Japanese Yen'},{code:'CNY',symbol:'¥',name:'Chinese Yuan'},
  {code:'AED',symbol:'د.إ',name:'UAE Dirham'},{code:'SAR',symbol:'﷼',name:'Saudi Riyal'},
  {code:'CAD',symbol:'$',name:'Canadian Dollar'},{code:'AUD',symbol:'$',name:'Australian Dollar'},
  {code:'CHF',symbol:'Fr',name:'Swiss Franc'},{code:'INR',symbol:'₹',name:'Indian Rupee'},
  {code:'BRL',symbol:'R$',name:'Brazilian Real'},{code:'MXN',symbol:'$',name:'Mexican Peso'},
  {code:'KRW',symbol:'₩',name:'Korean Won'},{code:'SGD',symbol:'$',name:'Singapore Dollar'},
  {code:'HKD',symbol:'$',name:'Hong Kong Dollar'},{code:'NOK',symbol:'kr',name:'Norwegian Krone'},
  {code:'SEK',symbol:'kr',name:'Swedish Krona'},{code:'DKK',symbol:'kr',name:'Danish Krone'},
  {code:'PLN',symbol:'zł',name:'Polish Zloty'},{code:'RUB',symbol:'₽',name:'Russian Ruble'},
  {code:'ZAR',symbol:'R',name:'South African Rand'},{code:'THB',symbol:'฿',name:'Thai Baht'},
  {code:'IDR',symbol:'Rp',name:'Indonesian Rupiah'},{code:'MYR',symbol:'RM',name:'Malaysian Ringgit'},
  {code:'PHP',symbol:'₱',name:'Philippine Peso'},{code:'VND',symbol:'₫',name:'Vietnamese Dong'},
  {code:'EGP',symbol:'£',name:'Egyptian Pound'},{code:'ILS',symbol:'₪',name:'Israeli Shekel'},
  {code:'NZD',symbol:'$',name:'New Zealand Dollar'},{code:'ARS',symbol:'$',name:'Argentine Peso'},
  {code:'CLP',symbol:'$',name:'Chilean Peso'},{code:'COP',symbol:'$',name:'Colombian Peso'},
  {code:'CZK',symbol:'Kč',name:'Czech Koruna'},{code:'HUF',symbol:'Ft',name:'Hungarian Forint'},
  {code:'RON',symbol:'lei',name:'Romanian Leu'},{code:'PKR',symbol:'₨',name:'Pakistani Rupee'},
  {code:'BDT',symbol:'৳',name:'Bangladeshi Taka'},{code:'NGN',symbol:'₦',name:'Nigerian Naira'},
  {code:'KES',symbol:'KSh',name:'Kenyan Shilling'},{code:'GHS',symbol:'GH₵',name:'Ghanaian Cedi'},
  {code:'MAD',symbol:'د.م.',name:'Moroccan Dirham'},{code:'QAR',symbol:'ر.ق',name:'Qatari Riyal'},
];
function getCurrencySymbol(){const c=CURRENCIES.find(x=>x.code===(org?.currency||'USD'));return c?c.symbol:'$';}

const PENCIL='<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5a1.5 1.5 0 012.12 2.12L4.5 11.75l-3 .75.75-3L9.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 4l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
const TRASH='<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M5.5 6.5v5M8.5 6.5v5M2.5 4l.9 8a1 1 0 001 .9h6.2a1 1 0 001-.9l.9-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const XMARK='<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
const PHOTO_ICO='<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="2" width="9" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1"/><circle cx="4" cy="5" r="1.2" stroke="currentColor" stroke-width=".9"/><path d="M1 8l3-3 2.5 2.5 1.5-2 3 3" stroke="currentColor" stroke-width=".8" fill="none"/></svg>';
const STAR_FILL='<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l1.94 4.07 4.49.65-3.25 3.16.77 4.46L8 11.74l-4.01 2.1.77-4.46L1.51 6.22l4.49-.65L8 1.5z"/></svg>';
const STAR_OUTLINE='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.94 4.07 4.49.65-3.25 3.16.77 4.46L8 11.74l-4.01 2.1.77-4.46L1.51 6.22l4.49-.65L8 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const SPARK='<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.5 4 4 1.5-4 1.5L7 12l-1.5-4-4-1.5 4-1.5L7 1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/></svg>';
const TRANSLATE_ICO='<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 4h6M5 2v8M2 10l3-6 3 6M9 11l3-3 3 3M11 8v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ALLERGENS = [
  {code:'GLUTEN',    label:'Gluten',          emoji:'🌾'},
  {code:'CRUSTACEANS',label:'Crustaceans',    emoji:'🦐'},
  {code:'EGGS',      label:'Eggs',            emoji:'🥚'},
  {code:'FISH',      label:'Fish',            emoji:'🐟'},
  {code:'PEANUTS',   label:'Peanuts',         emoji:'🥜'},
  {code:'SOYBEANS',  label:'Soybeans',        emoji:'🫘'},
  {code:'MILK',      label:'Milk',            emoji:'🥛'},
  {code:'NUTS',      label:'Tree Nuts',       emoji:'🌰'},
  {code:'CELERY',    label:'Celery',          emoji:'🥬'},
  {code:'MUSTARD',   label:'Mustard',         emoji:'🌿'},
  {code:'SESAME',    label:'Sesame',          emoji:'🌱'},
  {code:'SULPHITES', label:'Sulphites',       emoji:'🧪'},
  {code:'LUPIN',     label:'Lupin',           emoji:'🌼'},
  {code:'MOLLUSCS',  label:'Molluscs',        emoji:'🐚'},
];

async function api(method,path,body){
  const opts={method,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'}};
  if(body)opts.body=JSON.stringify(body);
  const r=await fetch(API+path,opts);
  if(r.status===401){
    const errData=await r.json().catch(()=>({}));
    // Oturum açıkken gelen 401 = session expired → yenile
    // Login/register sırasında gelen 401 = hatalı şifre → hata mesajı göster
    if(token){
      localStorage.removeItem('ms_token');
      localStorage.removeItem('ms_org');
      location.reload();
      throw new Error('Session expired');
    }
    throw new Error(errData.error||'Invalid email or password');
  }
  const data=await r.json();
  if(!r.ok)throw new Error(data.error||'Request failed');
  return data;
}
async function apiForm(method,path,fd){
  const r=await fetch(API+path,{method,headers:{'Authorization':`Bearer ${token}`},body:fd});
  if(r.status===401){
    localStorage.removeItem('ms_token');
    localStorage.removeItem('ms_org');
    location.reload();
    throw new Error('Session expired');
  }
  const data=await r.json();
  if(!r.ok)throw new Error(data.error||'Upload failed');
  return data;
}

function toast(msg,dur=2200){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),dur);}

/* AUTH */
function switchTab(tab){
  document.getElementById('loginForm').style.display=tab==='login'?'':'none';
  document.getElementById('registerForm').style.display=tab==='register'?'':'none';
  document.getElementById('tabLogin').classList.toggle('on',tab==='login');
  document.getElementById('tabRegister').classList.toggle('on',tab==='register');
  clearAuthErr();
}
function showAuthError(msg,shakeIds){
  const box=document.getElementById('authErr');
  document.getElementById('authErrText').textContent=msg;
  box.classList.add('visible');
  (shakeIds||[]).forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.classList.remove('err');
    void el.offsetWidth;
    el.classList.add('err');
    el.addEventListener('animationend',()=>el.classList.remove('err'),{once:true});
  });
}
function clearAuthErr(){
  document.getElementById('authErr').classList.remove('visible');
  document.getElementById('authErrText').textContent='';
}
async function doLogin(){
  clearAuthErr();
  const email=document.getElementById('loginEmail').value.trim();
  const password=document.getElementById('loginPassword').value;
  if(!email||!password){showAuthError('Please enter your email and password.',['loginEmail','loginPassword']);return;}
  const btn=document.querySelector('#loginForm .auth-btn');
  btn.disabled=true;btn.textContent='Signing in…';
  try{
    const data=await api('POST','/api/auth/login',{email,password});
    token=data.token;org=data.organization;
    localStorage.setItem('ms_token',token);localStorage.setItem('ms_org',JSON.stringify(org));
    startApp();
  }catch(e){
    showAuthError(e.message,['loginEmail','loginPassword']);
    btn.disabled=false;btn.textContent='Sign in';
  }
}
async function doRegister(){
  clearAuthErr();
  const restaurantName=document.getElementById('regRestaurantName').value.trim();
  const email=document.getElementById('regEmail').value.trim();
  const password=document.getElementById('regPassword').value;
  const passwordConfirm=document.getElementById('regPasswordConfirm').value;
  if(!restaurantName){showAuthError('Please enter your restaurant name.',['regRestaurantName']);return;}
  if(!email){showAuthError('Please enter your email.',['regEmail']);return;}
  if(password.length<6){showAuthError('Password must be at least 6 characters.',['regPassword']);return;}
  if(password!==passwordConfirm){showAuthError('Passwords do not match.',['regPassword','regPasswordConfirm']);return;}
  const btn=document.querySelector('#registerForm .auth-btn');
  btn.disabled=true;btn.textContent='Creating account…';
  try{
    const data=await api('POST','/api/auth/register',{restaurantName,email,password});
    token=data.token;org=data.organization;
    localStorage.setItem('ms_token',token);localStorage.setItem('ms_org',JSON.stringify(org));
    startApp();
  }catch(e){
    showAuthError(e.message,['regEmail']);
    btn.disabled=false;btn.textContent='Create account';
  }
}
function doLogout(){localStorage.removeItem('ms_token');localStorage.removeItem('ms_org');location.reload();}

/* ============== ONBOARDING ============== */
const LANGUAGES = [
  {code:'en',name:'English'},{code:'tr',name:'Türkçe'},{code:'es',name:'Español'},
  {code:'fr',name:'Français'},{code:'de',name:'Deutsch'},{code:'it',name:'Italiano'},
  {code:'pt',name:'Português'},{code:'ru',name:'Русский'},{code:'ar',name:'العربية'},
  {code:'zh',name:'中文'},{code:'ja',name:'日本語'},{code:'ko',name:'한국어'},
  {code:'hi',name:'हिन्दी'},{code:'th',name:'ไทย'},{code:'vi',name:'Tiếng Việt'},
  {code:'id',name:'Bahasa Indonesia'},{code:'nl',name:'Nederlands'},{code:'pl',name:'Polski'},
  {code:'uk',name:'Українська'},{code:'el',name:'Ελληνικά'},{code:'he',name:'עברית'},
  {code:'fa',name:'فارسی'},{code:'ms',name:'Bahasa Melayu'},{code:'sv',name:'Svenska'},
  {code:'no',name:'Norsk'},{code:'da',name:'Dansk'},{code:'fi',name:'Suomi'},
  {code:'cs',name:'Čeština'},{code:'hu',name:'Magyar'},{code:'ro',name:'Română'},
];

let obCurrentStep = 1;
let obFetchedInfo = null; // Gemini'den gelen bilgi

function showOnboarding(){
  document.getElementById('onboardingScreen').style.display='block';
  obCurrentStep = 1;
  obSetStep(1);
}

function obSetStep(n){
  obCurrentStep = n;
  for(let i=1;i<=4;i++){
    document.getElementById('obStep'+i).classList.toggle('on', i===n);
    const dot = document.getElementById('obDot'+i);
    dot.classList.remove('on','done');
    if(i<n) dot.classList.add('done');
    else if(i===n) dot.classList.add('on');
  }
  // Step 3'te dropdownları doldur
  if(n===3) obPopulateSettings();
}

function obNextStep(){ obSetStep(obCurrentStep+1); }
function obPrevStep(){ obSetStep(obCurrentStep-1); }

/* STEP 1: adı değişince step 2'ye kopyala */
function obNameChanged(){
  const name = document.getElementById('obRestaurantName').value.trim();
  const nameEl = document.getElementById('obName');
  if(nameEl && name) nameEl.value = name;
}

/* STEP 1: Google Fetch */
async function obFetchFromGoogle(){
  const url = document.getElementById('obGoogleUrl').value.trim();
  const name = document.getElementById('obRestaurantName').value.trim();
  
  if(!url && !name){
    document.getElementById('obFetchStatus').innerHTML = '<span style="color:#f87171">Please enter a restaurant name or Google Maps link</span>';
    return;
  }
  
  const btn = document.getElementById('obFetchBtn');
  const lbl = document.getElementById('obFetchLabel');
  btn.disabled = true;
  lbl.textContent = 'Fetching...';
  document.getElementById('obFetchStatus').innerHTML = '<span style="color:#f59e0b">Searching Google for your restaurant...</span>';
  
  try {
    const data = await api('POST', '/api/google-insights/extract-info', {
      googleMapsUrl: url || null,
      restaurantName: name || null,
    });
    obFetchedInfo = data.info;
    
    // Step 2'yi doldur
    if(obFetchedInfo.name) document.getElementById('obName').value = obFetchedInfo.name;
    else if(name) document.getElementById('obName').value = name;
    if(obFetchedInfo.country) document.getElementById('obCountry').value = obFetchedInfo.country;
    if(obFetchedInfo.city) document.getElementById('obCity').value = obFetchedInfo.city;
    if(obFetchedInfo.address) document.getElementById('obAddress').value = obFetchedInfo.address;
    if(obFetchedInfo.phone) document.getElementById('obPhone').value = obFetchedInfo.phone;
    
    document.getElementById('obFetchStatus').innerHTML = '<span style="color:#4ade80">✓ Found! Check your details on the next step.</span>';
    document.getElementById('obStep2Sub').textContent = 'We found your restaurant. Check the details and edit if needed.';
    
    setTimeout(() => obNextStep(), 900);
  } catch(e) {
    // Hata olsa bile devam et, kullanıcı manuel doldurabilir
    document.getElementById('obFetchStatus').innerHTML = '<span style="color:#f87171">Couldn\'t auto-fill. You can fill details manually.</span>';
    if(name) document.getElementById('obName').value = name;
    document.getElementById('obStep2Sub').textContent = 'Fill in your restaurant details.';
    setTimeout(() => obNextStep(), 1500);
  } finally {
    btn.disabled = false;
    lbl.textContent = 'Fetch details from Google';
  }
}

function obSkipGoogle(){
  const name = document.getElementById('obRestaurantName').value.trim();
  if(name) document.getElementById('obName').value = name;
  obFetchedInfo = null;
  document.getElementById('obStep2Sub').textContent = 'Fill in your restaurant details.';
  obNextStep();
}

/* STEP 2: Save info */
async function obSaveInfoAndNext(){
  const name = document.getElementById('obName').value.trim();
  const country = document.getElementById('obCountry').value.trim();
  const city = document.getElementById('obCity').value.trim();
  const address = document.getElementById('obAddress').value.trim();
  const phone = document.getElementById('obPhone').value.trim();
  const googleMapsUrl = document.getElementById('obGoogleUrl')?.value?.trim() || null;
  
  if(!name){ toast('Restaurant name is required'); return; }
  
  try{
    const updateData = {
      name,
      country: country || null,
      city: city || null,
      address: address || null,
      phone: phone || null,
      googleMapsUrl,
    };
    
    // Gemini'den koordinatlar geldiyse ekle
    if(obFetchedInfo){
      if(obFetchedInfo.latitude) updateData.latitude = obFetchedInfo.latitude;
      if(obFetchedInfo.longitude) updateData.longitude = obFetchedInfo.longitude;
    }
    
    const updated = await api('PATCH','/api/auth/organization', updateData);
    org = {...org, ...updated};
    localStorage.setItem('ms_org', JSON.stringify(org));
    obNextStep();
  }catch(e){ toast('Failed to save: '+e.message); }
}

/* STEP 3: Settings */
function obPopulateSettings(){
  const langEl = document.getElementById('obLanguage');
  const currEl = document.getElementById('obCurrency');
  
  if(langEl.options.length <= 1){
    langEl.innerHTML = LANGUAGES.map(l=>`<option value="${l.code}">${l.name}</option>`).join('');
  }
  if(currEl.options.length <= 1){
    currEl.innerHTML = CURRENCIES.map(c=>`<option value="${c.code}">${c.code} (${c.symbol}) — ${c.name}</option>`).join('');
  }
  
  // Gemini'den gelen önerilerle default değer set et
  if(obFetchedInfo?.suggestedLanguage){
    langEl.value = obFetchedInfo.suggestedLanguage;
  } else {
    langEl.value = navigator.language?.split('-')[0] || 'en';
  }
  if(obFetchedInfo?.suggestedCurrency){
    currEl.value = obFetchedInfo.suggestedCurrency;
  } else {
    currEl.value = org.currency || 'USD';
  }
  
  // Translation grid
  obBuildTranslationGrid();
}

let obSelectedTranslations = [];
function obBuildTranslationGrid(){
  const mainLang = document.getElementById('obLanguage').value;
  const grid = document.getElementById('obTranslationGrid');
  grid.innerHTML = LANGUAGES
    .filter(l => l.code !== mainLang)
    .map(l => `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#2a1d1d;border:1px solid #3d2828;border-radius:8px;cursor:pointer;font-size:12px;color:#fff">
      <input type="checkbox" value="${l.code}" onchange="obToggleTranslation('${l.code}',this.checked)" style="accent-color:#8E1616"/>
      ${l.name}
    </label>`).join('');
}

function obToggleTranslation(code, checked){
  if(checked && !obSelectedTranslations.includes(code)) obSelectedTranslations.push(code);
  if(!checked) obSelectedTranslations = obSelectedTranslations.filter(c=>c!==code);
}

async function obSaveSettingsAndNext(){
  const defaultLanguage = document.getElementById('obLanguage').value;
  const currency = document.getElementById('obCurrency').value;
  
  try{
    const updated = await api('PATCH','/api/auth/organization', {
      defaultLanguage,
      currency,
      enabledLanguages: obSelectedTranslations,
    });
    org = {...org, ...updated};
    localStorage.setItem('ms_org', JSON.stringify(org));
    
    // Google insights da arka planda fetch et (varsa)
    if(org.googleMapsUrl){
      api('POST','/api/google-insights/refresh').catch(()=>{});
    }
    
    obNextStep();
  }catch(e){ toast('Failed to save: '+e.message); }
}

/* STEP 4: Finish */
async function obFinish(){
  try{
    const updated = await api('PATCH','/api/auth/organization', { onboardingCompleted: true });
    org = {...org, ...updated};
    localStorage.setItem('ms_org', JSON.stringify(org));
    document.getElementById('onboardingScreen').style.display = 'none';
    startApp();
  }catch(e){ toast('Failed: '+e.message); }
}

function obOpenImport(){
  openImport(true);
}

/* ============== IMPORT MODAL ============== */
let importFiles = [];
let importJobId = null;
let importPolling = null;
let importParsedData = null;
let importFromOnboarding = false;

function openImport(fromOnboarding = false){
  importFromOnboarding = fromOnboarding;
  importFiles = [];
  importJobId = null;
  importParsedData = null;
  
  // Populate language and currency selects
  document.getElementById('importLang').innerHTML = LANGUAGES.map(l=>`<option value="${l.code}">${l.name}</option>`).join('');
  document.getElementById('importCurr').innerHTML = CURRENCIES.map(c=>`<option value="${c.code}">${c.code} (${c.symbol}) — ${c.name}</option>`).join('');
  document.getElementById('importLang').value = org.defaultLanguage || 'en';
  document.getElementById('importCurr').value = org.currency || 'USD';
  
  resetImport();
  document.getElementById('importOverlay').style.display = 'flex';
}

function closeImport(){
  if(importPolling){ clearInterval(importPolling); importPolling = null; }
  if(importJobId){
    api('DELETE','/api/import/job/'+importJobId).catch(()=>{});
    importJobId = null;
  }
  document.getElementById('importOverlay').style.display = 'none';
}

function resetImport(){
  importFiles = [];
  importParsedData = null;
  if(importPolling){ clearInterval(importPolling); importPolling = null; }
  document.getElementById('importStageUpload').style.display = 'block';
  document.getElementById('importStageProcessing').style.display = 'none';
  document.getElementById('importStagePreview').style.display = 'none';
  document.getElementById('importStageError').style.display = 'none';
  document.getElementById('importFooter').style.display = 'none';
  document.getElementById('importFiles').value = '';
  document.getElementById('importFilesList').innerHTML = '';
  document.getElementById('importStartBtn').disabled = true;
}

function handleImportFiles(e){
  const files = Array.from(e.target.files || []);
  for(const f of files){
    importFiles.push(f);
  }
  renderImportFiles();
}

function removeImportFile(idx){
  importFiles.splice(idx, 1);
  renderImportFiles();
}

function renderImportFiles(){
  const container = document.getElementById('importFilesList');
  if(importFiles.length === 0){
    container.innerHTML = '';
    document.getElementById('importStartBtn').disabled = true;
    return;
  }
  
  let totalSize = 0;
  container.innerHTML = importFiles.map((f, idx) => {
    totalSize += f.size;
    const ico = f.type === 'application/pdf' 
      ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 1h6l3 3v9H3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none"/><path d="M9 1v3h3" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="6" r="1.3" fill="currentColor"/><path d="M1 10l3-3 3 3 2-2 4 3" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>';
    return `<div class="import-file-row">
      <div class="import-file-icon">${ico}</div>
      <div class="import-file-name">${f.name}</div>
      <div class="import-file-size">${(f.size/1024/1024).toFixed(1)} MB</div>
      <button class="import-file-remove" onclick="removeImportFile(${idx})"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
    </div>`;
  }).join('');
  
  // Toplam boyut uyarısı
  if(totalSize > 25 * 1024 * 1024){
    container.innerHTML += `<div style="font-size:11px;color:#ef4444;margin-top:6px;font-weight:600">Total size exceeds 25MB. Please remove some files or compress them.</div>`;
    document.getElementById('importStartBtn').disabled = true;
  } else {
    document.getElementById('importStartBtn').disabled = false;
  }
}

async function startImport(){
  if(importFiles.length === 0) return;
  
  const fd = new FormData();
  for(const f of importFiles) fd.append('files', f);
  fd.append('sourceLanguage', document.getElementById('importLang').value);
  fd.append('currency', document.getElementById('importCurr').value);
  
  document.getElementById('importStageUpload').style.display = 'none';
  document.getElementById('importStageProcessing').style.display = 'block';
  document.getElementById('importStatus').textContent = 'Uploading files...';
  
  try{
    const res = await fetch('/api/import/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: fd,
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Upload failed');
    
    importJobId = data.jobId;
    document.getElementById('importStatus').textContent = 'AI is reading your menu...';
    document.getElementById('importSubStatus').textContent = 'Identifying dishes, prices, and categories';
    
    // Poll for status
    importPolling = setInterval(checkImportStatus, 3000);
    setTimeout(checkImportStatus, 1000); // ilk check daha hızlı
  }catch(e){
    showImportError(e.message);
  }
}

async function checkImportStatus(){
  if(!importJobId) return;
  try{
    const data = await api('GET','/api/import/job/'+importJobId);
    if(data.status === 'ready'){
      clearInterval(importPolling);
      importPolling = null;
      importParsedData = data.result;
      showImportPreview();
    } else if(data.status === 'failed'){
      clearInterval(importPolling);
      importPolling = null;
      showImportError(data.error || 'Failed to parse menu');
    }
    // 'processing' durumu - bekle
  }catch(e){
    // sessizce devam et, bir sonraki polling tekrar dener
  }
}

function showImportError(msg){
  document.getElementById('importStageUpload').style.display = 'none';
  document.getElementById('importStageProcessing').style.display = 'none';
  document.getElementById('importStagePreview').style.display = 'none';
  document.getElementById('importStageError').style.display = 'block';
  document.getElementById('importErrorMsg').textContent = msg || 'Something went wrong.';
}

function showImportPreview(){
  if(!importParsedData) return;
  
  document.getElementById('importStageUpload').style.display = 'none';
  document.getElementById('importStageProcessing').style.display = 'none';
  document.getElementById('importStagePreview').style.display = 'block';
  document.getElementById('importFooter').style.display = 'block';
  
  const items = importParsedData.items || [];
  if(items.length === 0){
    showImportError("We couldn't read your menu clearly. Please try a higher quality photo or PDF.");
    return;
  }
  
  // Mevcut kategori etiketleri
  const existingCatLabels = cats.map(c => c.label);
  
  // AI'nin bulduğu yeni kategoriler
  const aiCats = (importParsedData.categories || []).map(c => c.name);
  const allCatOptions = [...new Set([...existingCatLabels, ...aiCats])];
  
  // Item state'i
  window._importItems = items.map((it, idx) => ({
    ...it,
    _idx: idx,
    _selected: true,
    _isProperOverride: it.isProperName,
  }));
  
  const pricesMissing = items.filter(it => !it.price || it.price === 0).length;
  
  const html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:14px;font-weight:700;color:#1e293b">Found ${items.length} items in ${(importParsedData.categories||[]).length} categories</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Review, edit, or uncheck items you don't want to import</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-gh" style="font-size:11px" onclick="importToggleAll(true)">Select all</button>
        <button class="btn-gh" style="font-size:11px" onclick="importToggleAll(false)">Deselect all</button>
      </div>
    </div>
    ${pricesMissing > 0 ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px 12px;margin-bottom:14px;display:flex;align-items:center;gap:8px">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L1.5 13h13L8 2z" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 7v3M8 11.5v.5" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/></svg>
      <div style="font-size:12px;color:#92400e"><strong>${pricesMissing} item${pricesMissing>1?'s':''}</strong> couldn't be priced. Highlighted in yellow, please add prices.</div>
    </div>` : ''}
    <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:10px">
      <table class="preview-table">
        <thead>
          <tr>
            <th style="width:32px"></th>
            <th style="width:180px">Name</th>
            <th style="width:130px">Category</th>
            <th style="width:80px">Price</th>
            <th>Description</th>
            <th style="width:90px">Proper name</th>
          </tr>
        </thead>
        <tbody id="importPreviewTbody"></tbody>
      </table>
    </div>`;
  
  document.getElementById('importStagePreview').innerHTML = html;
  renderImportPreviewRows(allCatOptions);
  updateImportSelectedCount();
}

function renderImportPreviewRows(catOptions){
  const tbody = document.getElementById('importPreviewTbody');
  if(!tbody) return;
  tbody.innerHTML = window._importItems.map((it, idx) => {
    const needsPrice = !it.price || it.price === 0;
    return `
    <tr class="${it._selected ? '' : 'disabled'}" style="${needsPrice && it._selected ? 'background:#fef3c7' : ''}">
      <td><input type="checkbox" class="preview-row-checkbox" ${it._selected?'checked':''} onchange="importToggleRow(${idx}, this.checked)"/></td>
      <td><input type="text" value="${escapeHtml(it.name)}" oninput="importUpdateField(${idx},'name',this.value)"/></td>
      <td>
        <select onchange="importUpdateField(${idx},'category',this.value)">
          ${catOptions.map(c => `<option value="${escapeAttr(c)}"${c===it.category?' selected':''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" step="0.01" value="${it.price || 0}" oninput="importUpdateField(${idx},'price',parseFloat(this.value)||0)" style="${needsPrice ? 'border-color:#f59e0b;background:#fffbeb' : ''}"/></td>
      <td><textarea rows="2" oninput="importUpdateField(${idx},'description',this.value)" maxlength="200">${escapeHtml(it.description || '')}</textarea></td>
      <td style="text-align:center"><input type="checkbox" class="preview-row-checkbox" ${it._isProperOverride?'checked':''} onchange="importUpdateField(${idx},'_isProperOverride',this.checked)" title="Don't translate this name"/></td>
    </tr>`;
  }).join('');
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }

function importToggleRow(idx, checked){
  if(window._importItems[idx]){
    window._importItems[idx]._selected = checked;
    const tr = document.getElementById('importPreviewTbody').children[idx];
    if(tr) tr.className = checked ? '' : 'disabled';
    updateImportSelectedCount();
  }
}

function importToggleAll(checked){
  if(!window._importItems) return;
  for(const it of window._importItems) it._selected = checked;
  // Tam re-render - güvenli
  const allCatLabels = [...new Set([...cats.map(c=>c.label), ...(importParsedData.categories||[]).map(c=>c.name)])];
  renderImportPreviewRows(allCatLabels);
  updateImportSelectedCount();
}

function importUpdateField(idx, field, value){
  if(window._importItems[idx]){
    window._importItems[idx][field] = value;
  }
}

function updateImportSelectedCount(){
  const count = (window._importItems || []).filter(i => i._selected).length;
  document.getElementById('importSelectedCount').textContent = `${count} item${count===1?'':'s'} selected`;
  document.getElementById('importApplyBtn').disabled = count === 0;
  document.getElementById('importApplyBtn').textContent = `Import ${count} item${count===1?'':'s'}`;
}

async function applyImport(){
  const selected = (window._importItems || []).filter(i => i._selected);
  if(selected.length === 0) return;
  
  // Yeni kategorileri tespit et
  const existingLabels = new Set(cats.map(c => c.label.toLowerCase()));
  const newCatLabels = new Set();
  for(const it of selected){
    if(it.category && !existingLabels.has(it.category.toLowerCase())){
      newCatLabels.add(it.category);
    }
  }
  const createCategories = [...newCatLabels].map(label => ({ label, color: '#8E1616' }));
  
  const itemsPayload = selected.map(it => ({
    name: it.name,
    description: it.description,
    price: it.price,
    category: it.category,
    isProperName: !!it._isProperOverride,
  }));
  
  document.getElementById('importApplyBtn').disabled = true;
  document.getElementById('importApplyBtn').textContent = 'Importing...';
  
  try{
    const res = await api('POST','/api/import/job/'+importJobId+'/apply', {
      items: itemsPayload,
      createCategories,
    });
    
    importJobId = null;
    closeImport();
    toast(`✓ Imported ${res.createdCount} items`);
    
    // Onboarding'den geliyorsa onboarding'i bitir
    if(importFromOnboarding){
      await obFinish();
    } else {
      // Mevcut menüyü yeniden yükle
      await loadCats();
      await loadMenu();
    }
  }catch(e){
    toast('Import failed: '+e.message);
    document.getElementById('importApplyBtn').disabled = false;
    updateImportSelectedCount();
  }
}

async function startApp(){
  document.getElementById('authScreen').style.display='none';
  
  // Subscription kontrolü
  if(org.subscriptionStatus === 'EXPIRED'){
    showSubscriptionExpiredScreen();
    return;
  }
  
  // Onboarding kontrolü - tamamlanmamışsa wizard göster
  if(!org.onboardingCompleted){
    showOnboarding();
    return;
  }
  
  document.getElementById('appScreen').classList.add('visible');
  populateCurrencies();
  loadProfile();
  buildHoursGrid();
  await loadCats();
  await loadBranches();
  populateAddSel();
  buildCatPills();
  loadMenu();
  qrGenerate();
  // Hash routing: #tables, #qr, #profile, #analytics
  setTimeout(applyHash, 100);
}

function showSubscriptionExpiredScreen(){
  document.body.innerHTML = `
    <div style="min-height:100vh;background:#1D1616;display:flex;align-items:center;justify-content:center;padding:24px;color:#fff;font-family:system-ui,sans-serif">
      <div style="max-width:400px;text-align:center">
        <div style="width:64px;height:64px;border-radius:16px;background:#8E1616;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M6 25.5 L6 6.5 L16 19 L26 6.5 L26 25.5" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </div>
        <div style="font-size:22px;font-weight:800;margin-bottom:8px">Trial ended</div>
        <div style="font-size:14px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:24px">Choose a plan to continue managing your menu and reactivate customer access.</div>
        <button onclick="alert('Stripe integration coming soon. Contact support to upgrade.')" style="width:100%;padding:14px;border-radius:12px;border:none;background:#8E1616;color:#fff;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px">Choose a plan</button>
        <button onclick="doLogout()" style="width:100%;padding:12px;border-radius:12px;border:1.5px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.6);font-size:13px;cursor:pointer">Sign out</button>
      </div>
    </div>`;
}

/* NAV */
function go(id,el){
  document.querySelectorAll('.nav-btn').forEach(n=>n.classList.remove('on'));
  if(el)el.classList.add('on');
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
  const targetPanel=document.getElementById('p-'+id);
  if(targetPanel)targetPanel.classList.add('on');
  const titles={menu:'Menu items',tables:'Tables',qr:'QR & link',analytics:'Analytics',profile:'Profile'};
  document.getElementById('ptitle').textContent=titles[id]||id;
  document.getElementById('topActs').style.display=id==='menu'?'flex':'none';
  document.getElementById('backBtn').style.display='none';
  if(id==='qr'){buildQrBranchSelector();qrGenerate();}
  if(id==='analytics')loadAnalytics();
  if(id==='profile'){loadBranches();loadGoogleInsights();}
  if(id==='tables')loadTables();
  // hash güncelle
  if(history.replaceState)history.replaceState(null,'','#'+id);
  document.getElementById('appContent').scrollTop=0;
}
function goBack(){go('profile',document.getElementById('nav-profile'));}

// Hash routing: /editor.html#tables, #qr, #profile, #analytics, #menu
function applyHash(){
  const h=(location.hash||'').replace('#','').toLowerCase();
  const allowed=['menu','tables','qr','analytics','profile'];
  if(!h)return;
  if(allowed.includes(h)){
    const btn=document.getElementById('nav-'+h);
    if(btn)go(h, btn);
  }
}
window.addEventListener('hashchange',applyHash);

function toggleSection(id,row){
  const el=document.getElementById(id);
  el.classList.toggle('open');
  const chev=row.querySelector('.chevron');
  if(chev)chev.style.transform=el.classList.contains('open')?'rotate(90deg)':'';
}

/* PROFILE */
function populateCurrencies(){
  document.getElementById('orgCurrency').innerHTML=CURRENCIES.map(c=>`<option value="${c.code}">${c.code} (${c.symbol}) — ${c.name}</option>`).join('');
  document.getElementById('orgLanguage').innerHTML=LANGUAGES.map(l=>`<option value="${l.code}">${l.name}</option>`).join('');
}

function loadProfile(){
  if(!org)return;
  document.getElementById('profileName').value=org.name||'';
  document.getElementById('orgCountry').value=org.country||'';
  document.getElementById('orgCity').value=org.city||'';
  document.getElementById('orgAddress').value=org.address||'';
  document.getElementById('orgPostal').value=org.postalCode||'';
  document.getElementById('orgCurrency').value=org.currency||'USD';
  document.getElementById('orgLanguage').value=org.defaultLanguage||'en';
  document.getElementById('orgOrderListEnabled').checked = org.orderListEnabled !== false;
  document.getElementById('orgMapsUrl').value=org.googleMapsUrl||'';
  document.getElementById('orgPhone').value=org.phone||'';
  document.getElementById('orgWebsite').value=org.website||'';
  document.getElementById('orgInstagram').value=org.instagram||'';
  document.getElementById('orgFacebook').value=org.facebook||'';
  if(org.logoUrl){document.getElementById('logoImgP').src=org.logoUrl;document.getElementById('logoImgP').style.display='block';document.getElementById('logoSvgP').style.display='none';}
  updateAddrSummary();
  loadHours();
}
function updateAddrSummary(){
  const parts=[];
  if(document.getElementById('orgCity').value)parts.push(document.getElementById('orgCity').value);
  if(document.getElementById('orgCountry').value)parts.push(document.getElementById('orgCountry').value);
  document.getElementById('addrSummary').textContent=parts.length?parts.join(', '):'Set country, city, address';
}

let saveTimer;
function debounceSaveOrg(){
  clearTimeout(saveTimer);
  updateAddrSummary();
  saveTimer=setTimeout(saveOrg,800);
}
async function saveOrg(){
  const nameVal = document.getElementById('profileName').value.trim();
  const data={
    name: nameVal || org.name,
    country:document.getElementById('orgCountry').value.trim()||null,
    city:document.getElementById('orgCity').value.trim()||null,
    address:document.getElementById('orgAddress').value.trim()||null,
    postalCode:document.getElementById('orgPostal').value.trim()||null,
    currency:document.getElementById('orgCurrency').value,
    defaultLanguage:document.getElementById('orgLanguage').value,
    googleMapsUrl:document.getElementById('orgMapsUrl').value.trim()||null,
    phone:document.getElementById('orgPhone').value.trim()||null,
    website:document.getElementById('orgWebsite').value.trim()||null,
    instagram:document.getElementById('orgInstagram').value.trim()||null,
    facebook:document.getElementById('orgFacebook').value.trim()||null,
    workingHours:collectHours(),
  };
  console.log('[saveOrg] saving name:', data.name);
  try{
    const updated=await api('PATCH','/api/auth/organization',data);
    console.log('[saveOrg] response name:', updated.name);
    org={...org,...updated};
    localStorage.setItem('ms_org',JSON.stringify(org));
    renderItems();
    toast('Saved');
  }catch(e){
    console.error('[saveOrg] error:', e);
    toast('Save failed: '+e.message);
  }
}

const DAYS=['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABELS={mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri',sat:'Sat',sun:'Sun'};
function buildHoursGrid(){
  document.getElementById('hoursGrid').innerHTML=DAYS.map(d=>`
    <div class="wh-row">
      <div class="wh-day">${DAY_LABELS[d]}</div>
      <input type="time" id="hop-${d}" oninput="debounceSaveOrg()"/>
      <input type="time" id="hcl-${d}" oninput="debounceSaveOrg()"/>
      <label class="tog"><input type="checkbox" id="hen-${d}" onchange="toggleHourDay('${d}',this);debounceSaveOrg()" checked/><div class="tog-t"></div><div class="tog-th"></div></label>
    </div>`).join('');
}
function loadHours(){
  const wh=org.workingHours||{};
  for(const d of DAYS){
    const dat=wh[d];
    const en=document.getElementById('hen-'+d);
    const op=document.getElementById('hop-'+d);
    const cl=document.getElementById('hcl-'+d);
    if(!en||!op||!cl)continue;
    if(dat&&dat.open&&dat.close){en.checked=true;op.value=dat.open;cl.value=dat.close;op.disabled=false;cl.disabled=false;}
    else if(dat&&dat.closed){en.checked=false;op.value='';cl.value='';op.disabled=true;cl.disabled=true;}
    else{en.checked=true;op.value='09:00';cl.value='22:00';op.disabled=false;cl.disabled=false;}
  }
}
function toggleHourDay(d,cb){
  document.getElementById('hop-'+d).disabled=!cb.checked;
  document.getElementById('hcl-'+d).disabled=!cb.checked;
}
function collectHours(){
  const wh={};
  for(const d of DAYS){
    const en=document.getElementById('hen-'+d).checked;
    if(!en){wh[d]={closed:true};continue;}
    const op=document.getElementById('hop-'+d).value;
    const cl=document.getElementById('hcl-'+d).value;
    if(op&&cl)wh[d]={open:op,close:cl};
  }
  return wh;
}

function handleLogo(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{document.getElementById('logoImgP').src=ev.target.result;document.getElementById('logoImgP').style.display='block';document.getElementById('logoSvgP').style.display='none';};
  r.readAsDataURL(f);
  // Upload to backend
  const fd=new FormData();fd.append('logo',f);
  toast('Uploading logo...',4000);
  apiForm('POST','/api/menu/_logo',fd).then(res=>{
    org.logoUrl=res.logoUrl;localStorage.setItem('ms_org',JSON.stringify(org));
    toast('Logo updated');
  }).catch(err=>toast('Upload failed: '+err.message));
}

/* CATEGORIES — backend'den yüklenir */
async function loadCats(){
  try{
    const data = await api('GET','/api/categories');
    cats = data.map(c => ({ id: c.id, code: c.code, label: c.label, color: c.color, visible: c.visible }));
  }catch(e){
    console.error('loadCats failed', e);
    cats = [];
  }
}
function catById(code){
  // Hem code hem id ile arama (geriye dönük uyumluluk)
  return cats.find(c=>c.code===code) || cats.find(c=>c.id===code) || {code:code, label:code, color:'#888', visible:true};
}
function visCats(){return cats.filter(c=>c.visible);}

function openCatsOverlay(){renderCatMgmt();document.getElementById('catsOverlay').classList.add('open');}
function closeCatsOverlay(){document.getElementById('catsOverlay').classList.remove('open');loadMenu();}
function renderCatMgmt(){
  document.getElementById('catMgmtList').innerHTML=cats.map(c=>`
    <div class="cat-mgmt-item">
      <input type="color" value="${c.color}" oninput="onCatColorInput('${c.id}',this.value)" onchange="onCatColorChange('${c.id}',this.value)" style="width:24px;height:24px;border:none;background:none;cursor:pointer;padding:0"/>
      <input class="cat-name-inp" value="${c.label}" oninput="onCatLabelInput('${c.id}',this.value)" onblur="onCatLabelBlur('${c.id}',this.value)"/>
      <label class="tog"><input type="checkbox" ${c.visible?'checked':''} onchange="onCatVisibleToggle('${c.id}',this)"/><div class="tog-t"></div><div class="tog-th"></div></label>
      <button onclick="deleteCat('${c.id}')" style="width:30px;height:30px;border-radius:7px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ef4444">${TRASH}</button>
    </div>`).join('');
}

const catUpdateTimers = {};
function onCatLabelInput(id, val){
  const c = cats.find(x=>x.id===id); if(!c) return;
  c.label = val;
  buildCatPills();
  populateAddSel();
  clearTimeout(catUpdateTimers[id]);
  catUpdateTimers[id] = setTimeout(()=>saveCatRemote(id,{label:val}), 600);
}
function onCatLabelBlur(id, val){
  clearTimeout(catUpdateTimers[id]);
  saveCatRemote(id,{label:val});
}
function onCatColorInput(id, val){
  const c = cats.find(x=>x.id===id); if(!c) return;
  c.color = val;
  buildCatPills();
}
function onCatColorChange(id, val){
  saveCatRemote(id,{color:val});
}
function onCatVisibleToggle(id, cb){
  const c = cats.find(x=>x.id===id); if(!c) return;
  c.visible = cb.checked;
  buildCatPills();
  saveCatRemote(id,{visible:cb.checked});
}

async function saveCatRemote(id, data){
  try{
    const updated = await api('PATCH','/api/categories/'+id, data);
    const c = cats.find(x=>x.id===id);
    if(c) Object.assign(c, { label: updated.label, color: updated.color, visible: updated.visible });
    renderItems();
  }catch(e){toast('Save failed: '+e.message);}
}

async function deleteCat(id){
  if(cats.length<=1) return toast('Cannot delete the only category');
  try{
    await api('DELETE','/api/categories/'+id);
    cats = cats.filter(c=>c.id!==id);
    renderCatMgmt();
    buildCatPills();
    populateAddSel();
    loadMenu(); // çünkü silinen kategorideki itemlar fallback'a taşındı
    toast('Category deleted');
  }catch(e){toast('Delete failed: '+e.message);}
}

async function addCategory(){
  const colors=['#BA7517','#993556','#1D9E75','#378ADD','#A855F7'];
  try{
    const created = await api('POST','/api/categories', {
      label: 'New category',
      color: colors[cats.length%5],
    });
    cats.push({ id: created.id, code: created.code, label: created.label, color: created.color, visible: created.visible });
    renderCatMgmt();
    buildCatPills();
    populateAddSel();
    toast('Category added');
  }catch(e){toast('Failed: '+e.message);}
}

function buildCatPills(){
  const all=[{code:'all',label:'All'},...cats];
  document.getElementById('catPills').innerHTML=all.map(c=>`<button class="pill${currentFilter===c.code?' on':''}" onclick="filterItems('${c.code}')">${c.label}</button>`).join('');
}

/* MENU */
async function loadMenu(){
  try{
    const data=await api('GET','/api/menu');
    items=data;
    renderItems();
    updateStats();
  }
  catch(e){
    console.error('loadMenu error:', e);
    document.getElementById('itemRows').innerHTML='<div class="loading-msg">Failed to load: '+(e.message||'unknown error')+'</div>';
  }
}
function updateStats(){
  document.getElementById('statItems').textContent=items.length;
  document.getElementById('statPhotos').textContent=items.reduce((s,i)=>s+(i.photos?i.photos.length:0),0);
  document.getElementById('statBest').textContent=items.filter(i=>i.isBestseller).length;
}

function tagSelectHTML(itemId, type, current){
  const groups = type === 'marketing'
    ? [
        {val:'',label:'— None —'},
        {val:'NEW',label:'NEW'},
        {val:'BESTSELLER',label:'BESTSELLER'},
        {val:'OFFER',label:'OFFER'},
        {val:'LIMITED',label:'LIMITED'},
        {val:'SEASONAL',label:'SEASONAL'},
        {val:'LOCAL_FOOD',label:'LOCAL FOOD'},
        {val:'SOLD_OUT',label:'SOLD OUT'},
      ]
    : [
        {val:'',label:'— None —'},
        {val:'SPICY',label:'SPICY'},
        {val:'VEGAN',label:'VEGAN'},
        {val:'GLUTEN_FREE',label:'GLUTEN-FREE'},
        {val:'HALAL',label:'HALAL'},
        {val:'DAIRY_FREE',label:'DAIRY-FREE'},
        {val:'PROTEIN_PLUS',label:'PROTEIN+'},
      ];
  const cur = current || '';
  const cls = cur ? ' t-'+cur : '';
  const opts = groups.map(g => `<option value="${g.val}"${g.val===cur?' selected':''}>${g.label}</option>`).join('');
  return `<select class="tag-select${cls}" onchange="updateTag('${itemId}','${type}',this.value)">${opts}</select>`;
}

function renderItems(){
  const sym=getCurrencySymbol();
  const list=currentFilter==='all'?items:items.filter(i=>i.category===currentFilter);
  document.getElementById('itemRows').innerHTML=list.map(item=>{
    const cat=catById(item.category||'MAIN');
    const isEd=editingId===item.id;
    const descOpen=openDescId===item.id;
    const photos=item.photos||[];
    const desc=item.description||'';

    const tagM = tagSelectHTML(item.id, 'marketing', item.tagMarketing);
    const tagD = tagSelectHTML(item.id, 'dietary', item.tagDietary);
    const allergenCount = (item.allergens||[]).length;
    const allergenCell = `<div class="tag-cell" style="justify-content:center">
      <button onclick="openAllergenOverlay('${item.id}')" title="Edit allergens" style="width:100%;border:none;background:${allergenCount>0?'#fee2e2':'#f8fafc'};border-radius:7px;padding:5px 3px;cursor:pointer;font-size:10px;font-weight:700;color:${allergenCount>0?'#991b1b':'#94a3b8'};display:flex;flex-direction:column;align-items:center;gap:1px">
        <span style="font-size:13px">${allergenCount>0?'⚠':'○'}</span>
        <span>${allergenCount>0?allergenCount:'—'}</span>
      </button>
    </div>`;

    const mainRow=isEd
      ?`<div class="irow-main" style="background:#f8fafc">
          <div class="tag-cell">${tagM}</div>
          <div class="tag-cell">${tagD}</div>
          ${allergenCell}
          <div class="icell"><input class="edit-inp" id="en-${item.id}" value="${item.name}"/></div>
          <div class="icell"><select class="cat-sel" id="ec-${item.id}">${cats.map(c=>`<option value="${c.code}"${c.code===(item.category||'MAIN')?' selected':''}>${c.label}</option>`).join('')}</select></div>
          <div class="icell"><input class="price-inp" id="ep-${item.id}" type="number" step="0.01" value="${item.price}"/></div>
          <div class="icell"><button class="photo-ibtn" onclick="openPhoto('${item.id}')">${PHOTO_ICO} ${photos.length}/3</button></div>
          <div class="act-cell"><button class="ib save" onclick="saveEdit('${item.id}')">${CHECK}</button><button class="ib cx" onclick="cancelEdit()">${XMARK}</button></div>
        </div>`
      :`<div class="irow-main">
          <div class="tag-cell">${tagM}</div>
          <div class="tag-cell">${tagD}</div>
          ${allergenCell}
          <div class="icell" style="cursor:pointer" onclick="toggleDesc('${item.id}')">
            <div class="iname-area">
              <div class="iname-row">
                <span class="iname-text">${item.name}</span>
              </div>
              <div class="idesc-text${desc?'':' empty'}">${desc||'Tap to add description...'}</div>
            </div>
          </div>
          <div class="icell"><span class="ctag" style="border-left:3px solid ${cat.color}">${cat.label}</span></div>
          <div class="icell" style="font-size:13px;font-weight:700;color:#1e293b">${sym}${item.price}</div>
          <div class="icell"><button class="photo-ibtn" onclick="openPhoto('${item.id}')">${PHOTO_ICO} ${photos.length}/3</button></div>
          <div class="act-cell">
            ${(org?.enabledLanguages||[]).length>0?`<button class="ib" onclick="openItemTranslations('${item.id}')" title="Translations">${TRANSLATE_ICO}</button>`:''}
            <button class="ib" onclick="startEdit('${item.id}')">${PENCIL}</button>
            <button class="ib" onclick="askDelete('${item.id}','${(item.name||'').replace(/'/g,"\\'")}',\'item\')">${TRASH}</button>
          </div>
        </div>`;
    const descSec=`<div class="desc-ed${descOpen?' open':''}"><div class="desc-inner"><textarea class="desc-ta" id="dt-${item.id}" maxlength="${DESC_MAX}" placeholder="Describe this dish..." oninput="descCount('${item.id}')">${desc}</textarea><div class="desc-right"><div class="desc-cnt" id="dc-${item.id}">${desc.length}/${DESC_MAX}</div><button class="ai-gen-btn" id="ai-${item.id}" onclick="aiGenerateDesc('${item.id}')" title="Generate with AI">${SPARK}</button><button class="ok-btn" onclick="saveDesc('${item.id}')">${CHECK}</button></div></div></div>`;
    return `<div class="irow${isEd?' editing':''}">${mainRow}${descSec}</div>`;
  }).join('')||'<div class="loading-msg">No items yet. Tap + Add to start.</div>';
  updateStats();buildCatPills();
}

async function updateTag(id, type, value){
  const item = items.find(i=>i.id===id);
  if(!item) return;
  const field = type === 'marketing' ? 'tagMarketing' : 'tagDietary';
  const newVal = value || null;
  try{
    const updated = await api('PATCH','/api/menu/'+id, { [field]: newVal });
    Object.assign(item, updated);
    renderItems();
    if(newVal) toast('Tag updated');
  }catch(e){toast('Update failed: '+e.message);}
}

async function toggleStar(id){
  const item=items.find(i=>i.id===id);if(!item)return;
  const newMarketing = item.tagMarketing === 'BESTSELLER' ? null : 'BESTSELLER';
  try{
    const updated=await api('PATCH','/api/menu/'+id,{tagMarketing:newMarketing});
    Object.assign(item,updated);renderItems();
  }catch(e){toast('Failed: '+e.message);}
}

function filterItems(cat){currentFilter=cat;editingId=null;openDescId=null;renderItems();}
function populateAddSel(){document.getElementById('newCat').innerHTML=cats.map(c=>`<option value="${c.code}">${c.label}</option>`).join('');}

function startEdit(id){editingId=id;openDescId=null;renderItems();}
function cancelEdit(){editingId=null;renderItems();}
async function saveEdit(id){
  const item=items.find(i=>i.id===id);
  const name=document.getElementById('en-'+id).value.trim()||item.name;
  const category=document.getElementById('ec-'+id).value;
  const price=parseFloat(document.getElementById('ep-'+id).value)||item.price;
  try{const updated=await api('PATCH','/api/menu/'+id,{name,category,price});Object.assign(item,updated);editingId=null;renderItems();toast('Saved');}
  catch(e){toast('Save failed: '+e.message);}
}
function askDelete(id,name,type){pendingDeleteId=id;pendingDeleteType=type||'item';document.getElementById('delSub').textContent=`"${name}" will be permanently removed.`;document.getElementById('delOverlay').classList.add('open');}
document.getElementById('delCancelBtn').addEventListener('click',()=>{pendingDeleteId=null;document.getElementById('delOverlay').classList.remove('open');});
document.getElementById('delOkBtn').addEventListener('click',async()=>{
  if(!pendingDeleteId){document.getElementById('delOverlay').classList.remove('open');return;}
  try{
    if(pendingDeleteType==='item'){
      await api('DELETE','/api/menu/'+pendingDeleteId);
      items=items.filter(i=>i.id!==pendingDeleteId);renderItems();toast('Item deleted');
    } else if(pendingDeleteType==='branch'){
      await api('DELETE','/api/branches/'+pendingDeleteId);
      branches=branches.filter(b=>b.id!==pendingDeleteId);renderBranchesList();
      closeBranchEdit();toast('Branch deleted');
    }
  }catch(e){toast('Delete failed: '+e.message);}
  pendingDeleteId=null;pendingDeleteType=null;
  document.getElementById('delOverlay').classList.remove('open');
});

function toggleDesc(id){
  if(editingId===id)return;
  openDescId=openDescId===id?null:id;renderItems();
  if(openDescId===id)setTimeout(()=>{const ta=document.getElementById('dt-'+id);if(ta){ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);}},30);
}
function descCount(id){const ta=document.getElementById('dt-'+id),el=document.getElementById('dc-'+id);if(!ta||!el)return;el.textContent=ta.value.length+'/'+DESC_MAX;}
async function saveDesc(id){
  const ta=document.getElementById('dt-'+id);const item=items.find(i=>i.id===id);if(!ta||!item)return;
  const description=ta.value.trim().slice(0,DESC_MAX);
  try{await api('PATCH','/api/menu/'+id,{description});item.description=description;openDescId=null;renderItems();toast('Description saved');}
  catch(e){toast('Save failed');}
}
async function aiGenerateDesc(id){
  const item=items.find(i=>i.id===id);
  const ta=document.getElementById('dt-'+id);
  const btn=document.getElementById('ai-'+id);
  if(!item||!ta||!btn) return;
  btn.disabled=true;btn.classList.add('spinning');
  try{
    const updated=await api('POST','/api/menu/'+id+'/regenerate-description');
    item.description=updated.description;
    ta.value=updated.description||'';
    descCount(id);
    toast('Description generated');
  }catch(e){
    toast('Generation failed: '+e.message);
  }finally{
    btn.disabled=false;btn.classList.remove('spinning');
  }
}

/* ============== ALLERGENS ============== */
let _allergenItemId = null;
let _allergenSelected = new Set();

function openAllergenOverlay(itemId){
  const item = items.find(i => i.id === itemId);
  if(!item) return;
  _allergenItemId = itemId;
  _allergenSelected = new Set(item.allergens || []);
  document.getElementById('allergenItemName').textContent = item.name;
  renderAllergenGrid();
  document.getElementById('allergenOverlay').classList.add('open');
}

function renderAllergenGrid(){
  document.getElementById('allergenGrid').innerHTML = ALLERGENS.map(a => {
    const on = _allergenSelected.has(a.code);
    return `<label class="allergen-chip${on?' on':''}">
      <input type="checkbox" ${on?'checked':''} onchange="toggleAllergen('${a.code}',this.checked)"/>
      <span>${a.emoji}</span>
      <span>${a.label}</span>
    </label>`;
  }).join('');
}

function toggleAllergen(code, checked){
  if(checked) _allergenSelected.add(code);
  else _allergenSelected.delete(code);
  // Chip stilini güncelle
  const chips = document.querySelectorAll('.allergen-chip');
  ALLERGENS.forEach((a, i) => {
    if(a.code === code) chips[i]?.classList.toggle('on', checked);
  });
}

function closeAllergenOverlay(){
  document.getElementById('allergenOverlay').classList.remove('open');
  _allergenItemId = null;
}

async function saveAllergens(){
  if(!_allergenItemId) return;
  try{
    const updated = await api('PATCH','/api/menu/'+_allergenItemId, { allergens: [..._allergenSelected] });
    const item = items.find(i => i.id === _allergenItemId);
    if(item) item.allergens = updated.allergens;
    closeAllergenOverlay();
    renderItems();
    toast('Allergens saved');
  }catch(e){ toast('Failed: '+e.message); }
}
async function toggleOrderList(cb){
  try{
    const updated = await api('PATCH','/api/auth/organization', { orderListEnabled: cb.checked });
    org = {...org, ...updated};
    localStorage.setItem('ms_org', JSON.stringify(org));
    toast(cb.checked ? 'Online ordering enabled' : 'Online ordering disabled');
  }catch(e){
    toast('Failed: '+e.message);
    cb.checked = !cb.checked;
  }
}

/* ============== CROSS-SELL ============== */
let _crossSellEdits = {};

function openCrossSellOverlay(){
  _crossSellEdits = {};
  items.forEach(it => { _crossSellEdits[it.id] = it.crossSellItemId || ''; });
  renderCrossSellList();
  document.getElementById('crossSellOverlay').classList.add('open');
}

function renderCrossSellList(){
  const body = document.getElementById('crossSellList');
  if(items.length === 0){
    body.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:40px 16px;font-size:13px">No items yet. Add some menu items first.</div>';
    return;
  }
  // Kategori bazlı sırala
  const sorted = [...items].sort((a,b) => {
    const ca = cats.findIndex(c => c.code === (a.category||'MAIN'));
    const cb = cats.findIndex(c => c.code === (b.category||'MAIN'));
    if(ca !== cb) return ca - cb;
    return (a.sortOrder||0) - (b.sortOrder||0);
  });
  body.innerHTML = sorted.map(item => {
    const cat = cats.find(c => c.code === (item.category||'MAIN'));
    const catLabel = cat?.label || 'MAIN';
    const currentValue = _crossSellEdits[item.id] || '';
    const opts = items
      .filter(i => i.id !== item.id)
      .map(i => `<option value="${i.id}"${i.id===currentValue?' selected':''}>${escAdm(i.name)}</option>`)
      .join('');
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid #f1f5f9">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escAdm(item.name)}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-top:2px">${escAdm(catLabel)}</div>
      </div>
      <div style="font-size:14px;color:#cbd5e1;flex-shrink:0">→</div>
      <select onchange="_crossSellEdits['${item.id}']=this.value" style="flex:1.2;min-width:0;padding:7px 8px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;background:#fff;cursor:pointer">
        <option value="">— No suggestion —</option>
        ${opts}
      </select>
    </div>`;
  }).join('');
}

function escAdm(s){return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function closeCrossSellOverlay(){
  document.getElementById('crossSellOverlay').classList.remove('open');
}

async function saveCrossSells(){
  const changes = [];
  items.forEach(it => {
    const newVal = _crossSellEdits[it.id] || null;
    const oldVal = it.crossSellItemId || null;
    if(newVal !== oldVal) changes.push({ id: it.id, crossSellItemId: newVal });
  });
  if(changes.length === 0){
    closeCrossSellOverlay();
    toast('No changes');
    return;
  }
  try {
    for(const c of changes){
      await api('PATCH', '/api/menu/'+c.id, { crossSellItemId: c.crossSellItemId });
    }
    await loadMenu();
    closeCrossSellOverlay();
    toast(`Saved ${changes.length} cross-sell ${changes.length===1?'rule':'rules'}`);
  } catch(e){
    toast('Failed: '+e.message);
  }
}

let translationData = null;
let translationJobId = null;
let translationPolling = null;

async function loadLanguages(){
  try{
    translationData = await api('GET','/api/translations');
    renderLanguages();
  }catch(e){
    document.getElementById('langContent').innerHTML = `<div style="color:#ef4444;font-size:12px;padding:12px">Failed to load: ${e.message}</div>`;
  }
}

function renderLanguages(){
  if(!translationData) return;
  const d = translationData;
  const defaultLangName = (LANGUAGES.find(l=>l.code===d.defaultLanguage)?.name)||d.defaultLanguage;
  const enabled = d.enabledLanguages || [];
  const maxLangs = d.maxLanguages;
  
  let limitText = '';
  if(maxLangs === -1) limitText = 'Unlimited languages';
  else limitText = `${enabled.length} / ${maxLangs} additional languages`;
  
  let html = `
    <div style="font-size:11px;color:#64748b;margin-bottom:10px;font-weight:600">${limitText}</div>
    
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
      <div style="width:28px;height:28px;border-radius:7px;background:#8E1616;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">${d.defaultLanguage.toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:#1e293b">${defaultLangName}</div>
        <div style="font-size:10px;color:#64748b">Main language · ${d.totalItems} items</div>
      </div>
      <button onclick="openChangeMainLang()" style="width:28px;height:28px;border-radius:7px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;color:#64748b;display:flex;align-items:center;justify-content:center" title="Change main language">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M9 2.5l2.5 2.5M2 12V9.5L9 2.5l2.5 2.5L4.5 12H2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
  
  // Aktif diller
  for(const lang of enabled){
    const langName = (LANGUAGES.find(l=>l.code===lang)?.name)||lang;
    const cov = (d.coverage||[]).find(c=>c.language===lang);
    const pct = cov?.percentage||0;
    html += `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
        <div style="width:28px;height:28px;border-radius:7px;background:#f1f5f9;color:#475569;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">${lang.toUpperCase()}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:#1e293b">${langName}</div>
          <div style="font-size:10px;color:#64748b">${cov?.translatedCount||0} / ${cov?.totalItems||0} translated · ${pct}%</div>
        </div>
        <button onclick="removeLanguage('${lang}')" style="width:28px;height:28px;border-radius:7px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;color:#94a3b8;display:flex;align-items:center;justify-content:center" title="Remove">${TRASH}</button>
      </div>`;
  }
  
  // Add language butonu
  if(maxLangs === -1 || enabled.length < maxLangs){
    html += `<button class="btn-gh" onclick="openAddLanguage()" style="width:100%;justify-content:center;margin-top:6px">+ Add language</button>`;
  } else {
    html += `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px 12px;margin-top:6px">
      <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:2px">Plan limit reached</div>
      <div style="font-size:10px;color:#92400e">Upgrade to Pro for unlimited languages</div>
    </div>`;
  }
  
  // Translate all butonu
  if(enabled.length > 0 && d.totalItems > 0){
    html += `<button class="btn-dk" onclick="startTranslateAll()" style="width:100%;margin-top:10px">
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style="margin-right:6px"><path d="M2 4h6M5 2v8M2 10l3-6 3 6M9 11l3-3 3 3M11 8v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Re-translate all items
    </button>`;
    html += `<div style="font-size:10px;color:#94a3b8;text-align:center;margin-top:6px;line-height:1.4">Manually edited translations will not be overwritten.</div>`;
  }
  
  document.getElementById('langContent').innerHTML = html;
  document.getElementById('langSectionSub').textContent = enabled.length === 0 
    ? 'Show your menu in multiple languages' 
    : `${enabled.length} additional language${enabled.length===1?'':'s'} active`;
}

async function openChangeMainLang(){
  const currentDefault = translationData?.defaultLanguage || 'en';
  const enabled = translationData?.enabledLanguages || [];
  
  // Tüm diller seçilebilir (mevcut ana dil dahil değil)
  const html = `
    <div id="mainLangOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)">
      <div style="background:#fff;border-radius:16px;width:100%;max-width:420px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column">
        <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-size:14px;font-weight:700;color:#1e293b">Change main language</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">Current: ${(LANGUAGES.find(l=>l.code===currentDefault)?.name)||currentDefault}</div>
          </div>
          <button onclick="document.getElementById('mainLangOverlay').remove()" style="width:28px;height:28px;border-radius:6px;border:none;background:#f1f5f9;cursor:pointer;color:#475569">${XMARK}</button>
        </div>
        <div style="background:#fef9c3;border-bottom:1px solid #fde047;padding:10px 14px;font-size:11px;color:#713f12;line-height:1.5">
          <strong>Warning:</strong> Changing the main language means your existing items (in ${(LANGUAGES.find(l=>l.code===currentDefault)?.name)||currentDefault}) will be considered as the new main. Existing translations stay but may need updating. Run "Re-translate all" afterwards if needed.
        </div>
        <input type="text" id="mainLangSearch" placeholder="Search..." oninput="filterMainLangPicker(this.value)" style="margin:10px 14px;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none"/>
        <div id="mainLangList" style="flex:1;overflow-y:auto;padding:0 6px 14px">
          ${LANGUAGES.filter(l=>l.code!==currentDefault).map(l=>`<button onclick="confirmChangeMainLang('${l.code}','${(l.name||'').replace(/'/g,"\\'")}')" data-name="${l.name.toLowerCase()}" style="width:100%;padding:10px 12px;border:none;background:transparent;cursor:pointer;text-align:left;border-radius:8px;display:flex;align-items:center;gap:10px;font-size:13px" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <span style="width:26px;height:26px;border-radius:6px;background:#f1f5f9;color:#475569;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800">${l.code.toUpperCase()}</span>
            <span style="color:#1e293b;font-weight:600">${l.name}</span>
            ${enabled.includes(l.code)?'<span style="margin-left:auto;font-size:10px;color:#16a34a;font-weight:700">Currently active</span>':''}
          </button>`).join('')}
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(()=>document.getElementById('mainLangSearch').focus(), 50);
}

function filterMainLangPicker(query){
  const q = query.toLowerCase();
  document.querySelectorAll('#mainLangList button').forEach(btn=>{
    const name = btn.getAttribute('data-name');
    btn.style.display = name.includes(q) ? 'flex' : 'none';
  });
}

async function confirmChangeMainLang(code, name){
  if(!confirm(`Change main language to ${name}?\n\nThis will set ${name} as the primary language of your menu. Existing translations are preserved.`)) return;
  document.getElementById('mainLangOverlay')?.remove();
  try{
    const updated = await api('PATCH','/api/auth/organization', { defaultLanguage: code });
    org = {...org, ...updated};
    localStorage.setItem('ms_org', JSON.stringify(org));
    await loadLanguages();
    toast('Main language changed to '+name);
  }catch(e){
    toast('Failed: '+e.message);
  }
}

async function openAddLanguage(){
  const enabled = (translationData?.enabledLanguages)||[];
  const defaultLang = translationData?.defaultLanguage||'en';
  const available = LANGUAGES.filter(l => l.code !== defaultLang && !enabled.includes(l.code));
  
  // Mini overlay
  const html = `
    <div id="langPickerOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)">
      <div style="background:#fff;border-radius:16px;width:100%;max-width:380px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column">
        <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px">
          <div style="flex:1;font-size:14px;font-weight:700;color:#1e293b">Add a language</div>
          <button onclick="document.getElementById('langPickerOverlay').remove()" style="width:28px;height:28px;border-radius:6px;border:none;background:#f1f5f9;cursor:pointer;color:#475569">${XMARK}</button>
        </div>
        <input type="text" id="langSearchInput" placeholder="Search..." oninput="filterLangPicker(this.value)" style="margin:10px 14px;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none"/>
        <div id="langPickerList" style="flex:1;overflow-y:auto;padding:0 6px 14px">
          ${available.map(l=>`<button onclick="addLanguage('${l.code}')" data-name="${l.name.toLowerCase()}" style="width:100%;padding:10px 12px;border:none;background:transparent;cursor:pointer;text-align:left;border-radius:8px;display:flex;align-items:center;gap:10px;font-size:13px" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <span style="width:26px;height:26px;border-radius:6px;background:#f1f5f9;color:#475569;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800">${l.code.toUpperCase()}</span>
            <span style="color:#1e293b;font-weight:600">${l.name}</span>
          </button>`).join('')}
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(()=>document.getElementById('langSearchInput').focus(), 50);
}

function filterLangPicker(query){
  const q = query.toLowerCase();
  document.querySelectorAll('#langPickerList button').forEach(btn=>{
    const name = btn.getAttribute('data-name');
    btn.style.display = name.includes(q) ? 'flex' : 'none';
  });
}

async function addLanguage(code){
  document.getElementById('langPickerOverlay')?.remove();
  try{
    await api('POST','/api/translations/languages',{add:[code]});
    await loadLanguages();
    toast('Language added. Translating in background...');
    // Otomatik translate-all başlat
    startTranslateAll(true);
  }catch(e){
    toast('Failed: '+e.message);
  }
}

async function removeLanguage(code){
  if(!confirm(`Remove ${code.toUpperCase()}? Translations will be deleted.`)) return;
  try{
    await api('POST','/api/translations/languages',{remove:[code]});
    await loadLanguages();
    toast('Language removed');
  }catch(e){toast('Failed: '+e.message);}
}

async function startTranslateAll(silent=false){
  try{
    const res = await api('POST','/api/translations/translate-all',{});
    translationJobId = res.jobId;
    if(!silent) toast('Translation started...');
    pollTranslationJob();
  }catch(e){toast('Failed: '+e.message);}
}

async function pollTranslationJob(){
  if(!translationJobId) return;
  if(translationPolling) clearInterval(translationPolling);
  
  const updateUI = (job) => {
    const btn = document.querySelector('[onclick="startTranslateAll()"]');
    if(!btn) return;
    if(job.status === 'processing'){
      const pct = job.total > 0 ? Math.round((job.done/job.total)*100) : 0;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" style="margin-right:6px;animation:spin 1s linear infinite"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="20 8" fill="none"/></svg> Translating ${pct}% (${job.done}/${job.total})`;
      btn.disabled = true;
    } else if(job.status === 'done'){
      btn.innerHTML = `Re-translate all items`;
      btn.disabled = false;
      loadLanguages();
      toast(`Translation complete${job.failed>0?' ('+job.failed+' failed)':''}`);
    } else if(job.status === 'failed'){
      btn.innerHTML = `Re-translate all items`;
      btn.disabled = false;
      toast('Translation failed: '+(job.error||''));
    }
  };
  
  translationPolling = setInterval(async ()=>{
    try{
      const job = await api('GET','/api/translations/job/'+translationJobId);
      updateUI(job);
      if(job.status !== 'processing'){
        clearInterval(translationPolling);
        translationPolling = null;
        translationJobId = null;
      }
    }catch(e){}
  }, 2500);
  
  // İlk hemen kontrol
  setTimeout(async ()=>{
    try{
      const job = await api('GET','/api/translations/job/'+translationJobId);
      updateUI(job);
    }catch(e){}
  }, 800);
}

/* Item translation editor modal */
let currentTranslationItem = null;
let currentTranslationLang = null;

async function openItemTranslations(itemId){
  try{
    const data = await api('GET','/api/translations/item/'+itemId);
    currentTranslationItem = data;
    
    if((data.enabledLanguages||[]).length === 0){
      toast('No additional languages enabled. Add languages in Profile > Languages.');
      return;
    }
    
    currentTranslationLang = data.enabledLanguages[0];
    renderItemTranslationModal();
  }catch(e){toast('Failed: '+e.message);}
}

function renderItemTranslationModal(){
  const d = currentTranslationItem;
  if(!d) return;
  
  const lang = currentTranslationLang;
  const tr = d.translations.find(t=>t.language===lang) || {language:lang, name:'', description:'', isManualOverride:false};
  
  const langSelect = d.enabledLanguages.map(l=>{
    const ln = (LANGUAGES.find(x=>x.code===l)?.name)||l;
    return `<option value="${l}"${l===lang?' selected':''}>${ln}</option>`;
  }).join('');
  
  // Source dilini göster
  const sourceLangName = (LANGUAGES.find(l=>l.code===d.sourceLanguage)?.name)||d.sourceLanguage;
  
  let existing = document.getElementById('itemTransOverlay');
  if(existing) existing.remove();
  
  const html = `
    <div id="itemTransOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:250;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)" onclick="if(event.target===this)closeItemTranslations()">
      <div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column">
        <div style="padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-size:14px;font-weight:800;color:#1e293b">Translations</div>
            <div style="font-size:11px;color:#64748b">${d.name}</div>
          </div>
          <button onclick="closeItemTranslations()" style="width:30px;height:30px;border-radius:7px;border:none;background:#f1f5f9;cursor:pointer;color:#475569">${XMARK}</button>
        </div>
        
        <div style="padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
          <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px">Original (${sourceLangName})</div>
          <div style="font-size:13px;font-weight:700;color:#1e293b">${d.name}</div>
          <div style="font-size:12px;color:#475569;margin-top:3px">${d.description||'<em style="color:#94a3b8">No description</em>'}</div>
        </div>
        
        <div style="padding:14px 18px;flex:1;overflow-y:auto">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <label style="font-size:11px;color:#64748b;font-weight:600">Translate to:</label>
            <select onchange="switchTranslationLang(this.value)" style="flex:1;padding:7px 9px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;font-weight:600">
              ${langSelect}
            </select>
            ${tr.isManualOverride?'<span style="font-size:9px;font-weight:800;color:#8E1616;background:#fef2f2;padding:3px 8px;border-radius:10px">EDITED</span>':''}
          </div>
          
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:#64748b;font-weight:600;display:block;margin-bottom:4px">Name</label>
            <input id="itemTransName" type="text" value="${escapeAttr(tr.name||'')}" style="width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none"/>
          </div>
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:#64748b;font-weight:600;display:block;margin-bottom:4px">Description</label>
            <textarea id="itemTransDesc" rows="3" maxlength="250" style="width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none;resize:none;font-family:inherit">${escapeHtml(tr.description||'')}</textarea>
          </div>
        </div>
        
        <div style="padding:12px 18px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:space-between">
          <button class="btn-gh" onclick="resetItemTranslation()" style="font-size:12px">Reset to AI</button>
          <div style="display:flex;gap:8px">
            <button class="btn-gh" onclick="closeItemTranslations()">Cancel</button>
            <button class="btn-dk" onclick="saveItemTranslation()">Save</button>
          </div>
        </div>
      </div>
    </div>`;
  
  document.body.insertAdjacentHTML('beforeend', html);
}

function switchTranslationLang(lang){
  currentTranslationLang = lang;
  renderItemTranslationModal();
}

function closeItemTranslations(){
  document.getElementById('itemTransOverlay')?.remove();
  currentTranslationItem = null;
}

async function saveItemTranslation(){
  const name = document.getElementById('itemTransName').value.trim();
  const description = document.getElementById('itemTransDesc').value.trim();
  if(!name) return toast('Name required');
  
  try{
    await api('PATCH','/api/translations/item/'+currentTranslationItem.itemId+'/'+currentTranslationLang, { name, description });
    toast('Translation saved');
    // Re-fetch
    const data = await api('GET','/api/translations/item/'+currentTranslationItem.itemId);
    currentTranslationItem = data;
    renderItemTranslationModal();
  }catch(e){toast('Failed: '+e.message);}
}

async function resetItemTranslation(){
  if(!confirm('Reset to AI translation? Your manual edits will be lost.')) return;
  try{
    await api('DELETE','/api/translations/item/'+currentTranslationItem.itemId+'/'+currentTranslationLang);
    // Re-translate this single item to this language
    await api('POST','/api/translations/item/'+currentTranslationItem.itemId+'/translate', { languages: [currentTranslationLang] });
    const data = await api('GET','/api/translations/item/'+currentTranslationItem.itemId);
    currentTranslationItem = data;
    renderItemTranslationModal();
    toast('Reset done');
  }catch(e){toast('Failed: '+e.message);}
}
function showAddRow(){populateAddSel();document.getElementById('addRow').classList.add('show');document.getElementById('newName').focus();}
function hideAddRow(){document.getElementById('addRow').classList.remove('show');document.getElementById('newName').value='';document.getElementById('newPrice').value='';}
async function confirmAdd(){
  const name=document.getElementById('newName').value.trim();
  const price=parseFloat(document.getElementById('newPrice').value)||0;
  const category=document.getElementById('newCat').value;
  if(!name)return;
  try{const item=await api('POST','/api/menu',{name,price,category});item.photos=item.photos||[];items.push(item);hideAddRow();renderItems();toast('Item added');}
  catch(e){toast('Failed: '+e.message);}
}

/* PHOTOS */
function openPhoto(id){photoItemId=id;const item=items.find(i=>i.id===id);document.getElementById('photoTitle').textContent=item.name;renderSlots();document.getElementById('photoOverlay').classList.add('open');}
function closePhotoOverlay(){document.getElementById('photoOverlay').classList.remove('open');photoItemId=null;}
function renderSlots(){
  const item=items.find(i=>i.id===photoItemId);
  const photos=item.photos||[];
  const el=document.getElementById('photoSlots');el.innerHTML='';
  for(let s=0;s<3;s++){
    const div=document.createElement('div');div.className='pslot';
    if(photos[s]){
      div.innerHTML=`<img src="${photos[s].url}"/><button class="rm" onclick="rmPhoto('${photos[s].id}',event)">✕</button>`;
    }else{
      div.innerHTML=`<div class="pslot-plus">+</div><div class="pslot-lbl">Photo ${s+1}</div>`;
      const idx=s;div.onclick=()=>{activeSlot=idx;document.getElementById('photoInp').click();};
    }
    el.appendChild(div);
  }
}
async function rmPhoto(photoId,e){
  e.stopPropagation();
  const item=items.find(i=>i.id===photoItemId);
  try{await api('DELETE',`/api/menu/${photoItemId}/photos/${photoId}`);item.photos=item.photos.filter(p=>p.id!==photoId);renderSlots();renderItems();}
  catch(err){toast('Delete failed');}
}
async function handlePhotoUpload(e){
  const f=e.target.files[0];if(!f)return;
  const item=items.find(i=>i.id===photoItemId);
  if(!item||(item.photos||[]).length>=3)return;
  toast('Uploading...',5000);
  const fd=new FormData();fd.append('photo',f);
  try{const photo=await apiForm('POST',`/api/menu/${photoItemId}/photos`,fd);if(!item.photos)item.photos=[];item.photos.push(photo);renderSlots();renderItems();toast('Photo uploaded ✓');}
  catch(err){toast('Upload failed: '+err.message);}
  e.target.value='';
}

/* BRANCHES */
async function loadBranches(){try{branches=await api('GET','/api/branches');renderBranchesList();}catch(e){}}
function renderBranchesList(){
  const colors=['#8E1616','#0F6E56','#185FA5','#BA7517','#534AB7'];
  document.getElementById('branchListProfile').innerHTML=branches.map((b,i)=>`
    <div class="branch-item">
      <div class="branch-head" onclick="openBranchEdit('${b.id}')">
        <div class="bav" style="background:${colors[i%5]}22;color:${colors[i%5]}">${b.name.slice(0,2).toUpperCase()}</div>
        <div class="binf">
          <div class="bn">${b.name}</div>
          <div class="bs">${[b.city,b.country].filter(Boolean).join(', ')||'No address set'} · ${b.active?'Active':'Inactive'}</div>
        </div>
        <span style="font-size:10px;padding:3px 8px;border-radius:20px;background:${b.active?'#dcfce7':'#f1f5f9'};color:${b.active?'#166534':'#64748b'};font-weight:700">${b.active?'ACTIVE':'OFF'}</span>
      </div>
    </div>`).join('')||'<div class="loading-msg">No branches yet.</div>';
}

function openBranchEdit(id){
  editingBranchId=id;
  const b=id?branches.find(x=>x.id===id):{name:'',active:true,country:'',city:'',address:'',postalCode:'',phone:'',googleMapsUrl:''};
  document.getElementById('branchEditTitle').textContent=id?'Edit branch':'Add new branch';
  document.getElementById('branchDeleteBtn').style.display=id&&branches.length>1?'block':'none';
  document.getElementById('branchEditFields').innerHTML=`
    <div class="field-block"><label>Branch name</label><input id="bedit-name" value="${b.name||''}" placeholder="e.g. Downtown"/></div>
    <div class="field-block" style="display:flex;align-items:center;justify-content:space-between"><label style="margin-bottom:0">Active</label><label class="tog"><input type="checkbox" id="bedit-active" ${b.active?'checked':''}/><div class="tog-t"></div><div class="tog-th"></div></label></div>
    <div class="field-grid">
      <div class="field-block"><label>Country</label><input id="bedit-country" value="${b.country||''}"/></div>
      <div class="field-block"><label>City</label><input id="bedit-city" value="${b.city||''}"/></div>
    </div>
    <div class="field-block"><label>Street address</label><input id="bedit-address" value="${b.address||''}"/></div>
    <div class="field-grid">
      <div class="field-block"><label>Postal code</label><input id="bedit-postal" value="${b.postalCode||''}"/></div>
      <div class="field-block"><label>Phone</label><input id="bedit-phone" value="${b.phone||''}"/></div>
    </div>
    <div class="field-block"><label>Google Maps URL</label><input id="bedit-maps" value="${b.googleMapsUrl||''}" placeholder="https://maps.google.com/..."/></div>
  `;
  document.getElementById('branchEditOverlay').classList.add('open');
}
function closeBranchEdit(){document.getElementById('branchEditOverlay').classList.remove('open');editingBranchId=null;}
async function saveBranch(){
  const data={
    name:document.getElementById('bedit-name').value.trim(),
    active:document.getElementById('bedit-active').checked,
    country:document.getElementById('bedit-country').value.trim()||null,
    city:document.getElementById('bedit-city').value.trim()||null,
    address:document.getElementById('bedit-address').value.trim()||null,
    postalCode:document.getElementById('bedit-postal').value.trim()||null,
    phone:document.getElementById('bedit-phone').value.trim()||null,
    googleMapsUrl:document.getElementById('bedit-maps').value.trim()||null,
  };
  if(!data.name)return toast('Branch name required');
  try{
    if(editingBranchId){
      const updated=await api('PATCH','/api/branches/'+editingBranchId,data);
      const i=branches.findIndex(b=>b.id===editingBranchId);if(i>=0)branches[i]=updated;
    } else {
      const created=await api('POST','/api/branches',data);
      branches.push(created);
    }
    renderBranchesList();closeBranchEdit();toast('Branch saved');
  }catch(e){toast('Save failed: '+e.message);}
}
function deleteBranch(){
  if(!editingBranchId)return;
  const b=branches.find(x=>x.id===editingBranchId);
  pendingDeleteId=editingBranchId;pendingDeleteType='branch';
  document.getElementById('delSub').textContent=`Branch "${b.name}" will be permanently removed.`;
  document.getElementById('delOverlay').classList.add('open');
}

/* PREVIEW (artık kullanılmıyor, sadece eski referanslar için no-op) */
function buildPreview(){
  // Preview paneli kaldırıldı, gerekli DOM elementleri yok
  if(!document.getElementById('pslides')) return;
  const sym=getCurrencySymbol();
  const vc=visCats().map(c=>c.code);
  // Boş kategori filtresi
  const usedCats=new Set(items.map(i=>i.category));
  const visibleCatsForPreview=visCats().filter(c=>usedCats.has(c.code));
  const filtered=(pCat==='all'?items:items.filter(i=>i.category===pCat)).filter(i=>vc.includes(i.category));
  if(pCur>=filtered.length)pCur=0;
  const wrap=document.getElementById('pslides');wrap.innerHTML='';
  
  const TAG_LABELS = {
    NEW:'NEW',BESTSELLER:'BESTSELLER',OFFER:'OFFER',LIMITED:'LIMITED',SEASONAL:'SEASONAL',LOCAL_FOOD:'LOCAL FOOD',SOLD_OUT:'SOLD OUT',
    SPICY:'SPICY',VEGAN:'VEGAN',GLUTEN_FREE:'GLUTEN-FREE',HALAL:'HALAL',DAIRY_FREE:'DAIRY-FREE',PROTEIN_PLUS:'PROTEIN+'
  };
  const TAG_COLORS = {
    NEW:'#3B82F6', BESTSELLER:'#F59E0B', OFFER:'#8B5CF6', LIMITED:'#F43F5E',
    SEASONAL:'#D97706', LOCAL_FOOD:'#047857', SOLD_OUT:'#374151',
    SPICY:'#EF4444', VEGAN:'#22C55E', GLUTEN_FREE:'#06B6D4',
    HALAL:'#84CC16', DAIRY_FREE:'#64748B', PROTEIN_PLUS:'#EC4899'
  };
  function tagHTML(t){
    if(!t) return '';
    const c = TAG_COLORS[t]||'#fff';
    return `<div style="display:inline-flex;padding:3px 8px;border-radius:14px;font-size:9px;font-weight:800;letter-spacing:.4px;background:${c};color:#fff">${TAG_LABELS[t]||t}</div>`;
  }
  
  filtered.forEach((item,i)=>{
    const cat=catById(item.category||'MAIN');
    const photos=item.photos||[];
    const slide=document.createElement('div');slide.className='slide';
    slide.style.transform=`translateY(${(i-pCur)*100}%)`;
    const desc=item.description||'';
    let mTag = item.tagMarketing;
    if(!mTag && item.isBestseller) mTag = 'BESTSELLER';
    const dTag = item.tagDietary;
    const tagsRow = (mTag||dTag) ? `<div style="display:flex;gap:5px;margin-bottom:7px;flex-wrap:wrap">${tagHTML(mTag)}${tagHTML(dTag)}</div>` : '';
    
    slide.innerHTML=`<div style="width:100%;height:100%;background:${cat.color}22;display:flex;align-items:center;justify-content:center">${photos[0]?`<img src="${photos[0].url}" style="width:100%;height:100%;object-fit:cover"/>`:`<svg width="60" height="60" viewBox="0 0 60 60" fill="none" opacity=".2"><rect x="8" y="8" width="44" height="44" rx="8" stroke="${cat.color}" stroke-width="2"/></svg>`}</div><div class="sgrad"></div><div class="sinfo">${tagsRow}<div class="scat-tag">${cat.label}</div><div class="sname">${item.name}</div>${desc?`<div class="sdesc">${desc}</div>`:''}<div class="sprice">${sym}${item.price}</div></div>`;
    wrap.appendChild(slide);
  });
  document.getElementById('pprogf').style.width=filtered.length?Math.round((pCur+1)/filtered.length*100)+'%':'0%';
  document.getElementById('pcount').textContent=filtered.length?`${pCur+1} / ${filtered.length}`:'0 / 0';
  // Top logo - tam ortala, kırpma yok
  const lg=document.getElementById('pTopLogo');
  if(org&&org.logoUrl){
    lg.innerHTML=`<img src="${org.logoUrl}" style="width:100%;height:100%;object-fit:cover;display:block"/>`;
  }
  // Cats - only with content
  const allC=[{code:'all',label:'All'},...visibleCatsForPreview];
  document.getElementById('pcatBar').innerHTML=allC.map(c=>`<div class="pcat${c.code===pCat?' on':''}" onclick="setPCat('${c.code}')">${c.label}</div>`).join('');
}
function setPCat(c){pCat=c;pCur=0;buildPreview();}
function pnext(){const f=(pCat==='all'?items:items.filter(i=>i.category===pCat)).filter(i=>visCats().map(c=>c.code).includes(i.category));if(pCur<f.length-1){pCur++;buildPreview();}}
function pprev(){if(pCur>0){pCur--;buildPreview();}}

/* QR */
function buildQrBranchSelector(){
  const sel=document.getElementById('qrBranchSelect');
  if(branches.length>1){
    document.getElementById('qrBranchSelectorWrap').style.display='block';
    sel.innerHTML='<option value="">Main menu (all branches)</option>'+branches.map(b=>`<option value="${b.slug}">${b.name}${b.city?' — '+b.city:''}</option>`).join('');
  } else {
    document.getElementById('qrBranchSelectorWrap').style.display='none';
  }
}
let _qrMode = 'single'; // 'single' or 'perTable'
let _qrSignatures = null; // cached from API

function setQrMode(mode){
  _qrMode = mode;
  document.getElementById('qrModeSingle').style.background = mode==='single' ? 'var(--accent)' : '';
  document.getElementById('qrModeSingle').style.color = mode==='single' ? '#fff' : '';
  document.getElementById('qrModePerTable').style.background = mode==='perTable' ? 'var(--accent)' : '';
  document.getElementById('qrModePerTable').style.color = mode==='perTable' ? '#fff' : '';
  document.getElementById('qrSingleView').style.display = mode==='single' ? '' : 'none';
  document.getElementById('qrPerTableView').style.display = mode==='perTable' ? '' : 'none';
  document.getElementById('qrModeHint').textContent = mode==='single'
    ? 'One QR code for all tables. Customers pick their table when ordering.'
    : 'Each table gets its own QR. Table is auto-assigned on scan.';
  if(mode==='perTable') renderPerTableQrs();
}

async function loadQrSignatures(){
  try{
    _qrSignatures = await api('GET','/api/qr/signatures-bulk');
  }catch(e){
    console.error('[qr] failed to load signatures:', e);
    _qrSignatures = { allTablesSignature:'', perTable:[] };
  }
}

function getQrUrl(tableId){
  if(!org || !_qrSignatures) return '';
  const branchSlug = document.getElementById('qrBranchSelect')?.value;
  const base = window.location.origin+'/menu/'+org.slug+(branchSlug?'/'+branchSlug:'');
  if(tableId){
    const sig = (_qrSignatures.perTable||[]).find(t=>t.tableId===tableId);
    return base+'?s='+(sig?sig.signature:'')+'&t='+tableId;
  }
  return base+'?s='+(_qrSignatures.allTablesSignature||'');
}

async function qrGenerate(){
  if(!org) return;
  await loadQrSignatures();
  const url = getQrUrl();
  document.getElementById('qrUrlDisplay').textContent = url;
  document.getElementById('qrLinkBox').textContent = url;
  const canvas = document.getElementById('qrCanvas');
  if(typeof QRCode==='undefined'||!canvas) return;
  QRCode.toCanvas(canvas,url,{width:200,margin:2,color:{dark:'#1D1616',light:'#ffffff'},errorCorrectionLevel:'H'},()=>{});
  setQrMode(_qrMode);
}

function qrDlPNG(){
  const url=getQrUrl();
  const tmp=document.createElement('canvas');
  QRCode.toCanvas(tmp,url,{width:1000,margin:2,errorCorrectionLevel:'H'},()=>{
    const a=document.createElement('a');a.download='qr-'+org.slug+'.png';a.href=tmp.toDataURL('image/png');
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  });
}
function qrDlSVG(){
  const url=getQrUrl();
  QRCode.toString(url,{type:'svg',width:500,margin:2,errorCorrectionLevel:'H'},(err,svgStr)=>{
    if(err)return;
    const blob=new Blob([svgStr],{type:'image/svg+xml'});const burl=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=burl;a.download='qr-'+org.slug+'.svg';
    document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(burl),1000);
  });
}
function qrCopy(){
  const url=getQrUrl();const btn=document.getElementById('qrCopyBtn');
  navigator.clipboard.writeText(url).then(()=>{btn.textContent='Copied!';setTimeout(()=>btn.textContent='Copy',1500);});
}

function renderPerTableQrs(){
  const list = document.getElementById('qrTableList');
  if(!_qrSignatures || !_qrSignatures.perTable || _qrSignatures.perTable.length===0){
    list.innerHTML='<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px">No tables defined yet. Add tables in the Tables section first.</div>';
    return;
  }
  list.innerHTML = _qrSignatures.perTable.map(t => {
    const url = getQrUrl(t.tableId);
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#f8fafc;border-radius:10px">
      <div style="min-width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:var(--accent);color:#fff;border-radius:8px;font-weight:700;font-size:14px">${escapeHtml(t.label)}</div>
      <div style="flex:1;font-size:11px;color:#64748b;word-break:break-all;line-height:1.4">${escapeHtml(url)}</div>
      <button onclick="qrDlTablePNG('${t.tableId}','${escapeHtml(t.label)}')" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;font-size:11px;cursor:pointer;white-space:nowrap">PNG</button>
    </div>`;
  }).join('');
}

function qrDlTablePNG(tableId, label){
  const url = getQrUrl(tableId);
  const tmp = document.createElement('canvas');
  QRCode.toCanvas(tmp,url,{width:1000,margin:2,errorCorrectionLevel:'H'},()=>{
    const a=document.createElement('a');a.download='qr-'+org.slug+'-table-'+label+'.png';a.href=tmp.toDataURL('image/png');
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  });
}

async function qrBulkDownloadPNG(){
  if(!_qrSignatures || !_qrSignatures.perTable) return;
  const JSZip = window.JSZip;
  if(!JSZip){
    alert('Loading ZIP library...');
    return;
  }
  const zip = new JSZip();
  const tables = _qrSignatures.perTable;

  for(const t of tables){
    const url = getQrUrl(t.tableId);
    const canvas = document.createElement('canvas');
    await new Promise(resolve => {
      QRCode.toCanvas(canvas,url,{width:1000,margin:2,errorCorrectionLevel:'H'},resolve);
    });
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    zip.file('qr-table-'+t.label+'.png', base64, {base64:true});
  }

  const blob = await zip.generateAsync({type:'blob'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='qr-codes-'+org.slug+'.zip';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

async function qrBulkDownloadSVG(){
  if(!_qrSignatures || !_qrSignatures.perTable) return;
  const JSZip = window.JSZip;
  if(!JSZip){
    alert('Loading ZIP library...');
    return;
  }
  const zip = new JSZip();
  const tables = _qrSignatures.perTable;

  for(const t of tables){
    const url = getQrUrl(t.tableId);
    const svgStr = await new Promise((resolve,reject)=>{
      QRCode.toString(url,{type:'svg',width:500,margin:2,errorCorrectionLevel:'H'},(err,s)=>{
        if(err) reject(err); else resolve(s);
      });
    });
    zip.file('qr-table-'+t.label+'.svg', svgStr);
  }

  const blob = await zip.generateAsync({type:'blob'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='qr-codes-svg-'+org.slug+'.zip';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

/* TABLES */
let tablesData = [];

async function loadTables(){
  try{
    tablesData = await api('GET','/api/tables');
    renderTablesList();
  }catch(e){
    document.getElementById('tablesList').innerHTML = `<div style="text-align:center;padding:30px;color:#dc2626;font-size:13px">Failed to load tables: ${e.message}</div>`;
  }
}

function renderTablesList(){
  const list = document.getElementById('tablesList');
  if(tablesData.length === 0){
    list.innerHTML = `<div style="text-align:center;padding:40px 20px;background:#f8fafc;border-radius:12px;color:#94a3b8">
      <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px">No tables yet</div>
      <div style="font-size:12px;max-width:260px;margin:0 auto;line-height:1.5">Add your first table above. Customers won't be required to pick a table if you skip this step.</div>
    </div>`;
    return;
  }
  list.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px">
    ${tablesData.map(t => `
      <div style="position:relative;aspect-ratio:1;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transition:.15s" onmouseover="this.style.borderColor='#cbd5e1';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.06)'" onmouseout="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">
        <div style="font-size:22px;font-weight:800;color:#1e293b;line-height:1;text-align:center;word-break:break-word;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escapeHtml(t.label)}</div>
        <div style="font-size:9px;color:${t.active?'#16a34a':'#94a3b8'};font-weight:700;letter-spacing:0.4px;text-transform:uppercase">${t.active?'Active':'Inactive'}</div>
        <div style="position:absolute;top:6px;right:6px;display:flex;gap:3px;opacity:0.7">
          <button onclick="openEditTable('${t.id}')" style="width:24px;height:24px;border-radius:6px;background:#f1f5f9;border:none;cursor:pointer;color:#475569;display:flex;align-items:center;justify-content:center" title="Edit">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M9 2.5l2.5 2.5M2 12V9.5L9 2.5l2.5 2.5L4.5 12H2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          </button>
          <button onclick="deleteTable('${t.id}')" style="width:24px;height:24px;border-radius:6px;background:#fef2f2;border:none;cursor:pointer;color:#dc2626;display:flex;align-items:center;justify-content:center" title="Delete">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5C5 2 5.5 2 6 2h2c.5 0 1 0 1 .5V4M3.5 4l.5 8h6l.5-8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>`).join('')}
  </div>
  <div style="text-align:center;margin-top:14px;font-size:11px;color:#94a3b8">${tablesData.length} table${tablesData.length===1?'':'s'} total</div>`;
}

function openAddTableSingle(){
  const label = prompt('Table label (e.g. "1", "Bahçe 1", "VIP"):');
  if(!label || !label.trim()) return;
  api('POST','/api/tables',{ label: label.trim() })
    .then(() => { loadTables(); toast('Table added'); })
    .catch(e => toast('Failed: '+e.message));
}

function openAddTablesBulk(){
  const countStr = prompt('How many tables to create? (1-50)');
  const count = parseInt(countStr);
  if(!count || count < 1 || count > 50){ toast('Invalid count'); return; }
  const prefix = prompt('Prefix (optional, e.g. "Table" or leave blank for just numbers):') || '';
  api('POST','/api/tables/bulk',{ count, prefix: prefix.trim() })
    .then(() => { loadTables(); toast(count+' tables created'); })
    .catch(e => toast('Failed: '+e.message));
}

function openEditTable(id){
  const t = tablesData.find(x => x.id === id);
  if(!t) return;
  const newLabel = prompt('Edit table label:', t.label);
  if(newLabel === null) return;
  if(!newLabel.trim()){ toast('Label cannot be empty'); return; }
  api('PATCH','/api/tables/'+id,{ label: newLabel.trim() })
    .then(() => { loadTables(); toast('Updated'); })
    .catch(e => toast('Failed: '+e.message));
}

function deleteTable(id){
  const t = tablesData.find(x => x.id === id);
  if(!t) return;
  if(!confirm(`Delete table "${t.label}"?`)) return;
  api('DELETE','/api/tables/'+id,null)
    .then(() => { loadTables(); toast('Deleted'); })
    .catch(e => toast('Failed: '+e.message));
}

/* ANALYTICS */
/* GOOGLE INSIGHTS */
async function loadGoogleInsights(){
  try {
    const data = await api('GET','/api/google-insights');
    renderGoogleInsightsCard(data);
  } catch(e) {
    document.getElementById('googleInsightsContent').textContent = 'Could not load';
  }
}

function renderGoogleInsightsCard(data){
  const content = document.getElementById('googleInsightsContent');
  if(!content) return;
  if(!data.insights){
    if(!data.hasGoogleUrl){
      content.innerHTML = '<em>Add your Google Maps URL above first, then click Refresh.</em>';
    } else {
      content.innerHTML = '<em>No data yet. Click Refresh to fetch insights from Google.</em>';
    }
    return;
  }
  const ins = data.insights;
  if(!ins.popularDishes || ins.popularDishes.length === 0){
    content.innerHTML = '<em>'+escapeHtml(ins.notes || 'No popular dishes found yet.')+'</em>';
    return;
  }
  const fetched = ins.fetchedAt ? new Date(ins.fetchedAt) : null;
  const ago = fetched ? timeAgoSimple(fetched) : '';
  
  let html = '<div style="font-weight:600;margin-bottom:6px">Popular dishes from Google reviews:</div><ul style="margin:0;padding-left:18px;line-height:1.6">';
  for(const d of ins.popularDishes.slice(0,5)){
    html += '<li><strong>'+escapeHtml(d.name)+'</strong> <span style="opacity:0.7">('+d.mentions+' mentions)</span></li>';
  }
  html += '</ul>';
  if(ago) html += '<div style="font-size:10px;opacity:0.7;margin-top:8px">Updated '+ago+'</div>';
  content.innerHTML = html;
}

function timeAgoSimple(d){
  const diff = (Date.now() - d.getTime()) / 1000;
  if(diff < 60) return 'just now';
  if(diff < 3600) return Math.floor(diff/60)+' min ago';
  if(diff < 86400) return Math.floor(diff/3600)+' hours ago';
  if(diff < 86400*7) return Math.floor(diff/86400)+' days ago';
  return Math.floor(diff/(86400*7))+' weeks ago';
}

async function refreshGoogleInsights(){
  const btn = document.getElementById('refreshInsightsBtn');
  const lbl = document.getElementById('refreshInsightsLabel');
  if(btn) btn.disabled = true;
  if(lbl) lbl.textContent = 'Fetching...';
  try {
    const data = await api('POST','/api/google-insights/refresh');
    renderGoogleInsightsCard({ insights: data.insights, hasGoogleUrl: true });
    if(data.notFound){
      toast('⚠ ' + (data.message || 'Restaurant not found on Google. Try updating the restaurant name in Profile.'));
    } else {
      toast('✓ ' + (data.message || 'Insights updated'));
    }
  } catch(e) {
    toast('Failed: '+e.message);
  } finally {
    if(btn) btn.disabled = false;
    if(lbl) lbl.textContent = 'Refresh now';
  }
}

/* ANALYTICS V2 */
let _anPeriod = 'today';
let _anData = null;
let _anSelectedCard = 'revenue';
let _anCustomStart = null;
let _anCustomEnd = null;

const AN_CARDS = [
  { key:'revenue', label:'Revenue', icon:`<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M3.5 3.5h3.5c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5h-2c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5h3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>` },
  { key:'orders', label:'Orders', icon:`<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 4h6l-1 6H4L3 4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5 4V3a1 1 0 012 0v1" stroke="currentColor" stroke-width="1.3"/></svg>` },
  { key:'avgCart', label:'Avg cart', icon:`<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/><path d="M6 3.5v3l2 1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>` },
  { key:'categories', label:'Categories', icon:`<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.3"/><path d="M6 2v4l3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>` },
  { key:'topItems', label:'Top seller', icon:`<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1l1.5 3 3.5.5-2.5 2.5.5 3.5L6 9l-3 1.5.5-3.5L1 4.5l3.5-.5L6 1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>` },
  { key:'views', label:'Views', icon:`<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 6c1.5-2.5 3-3.5 5-3.5s3.5 1 5 3.5c-1.5 2.5-3 3.5-5 3.5s-3.5-1-5-3.5z" stroke="currentColor" stroke-width="1.3"/><circle cx="6" cy="6" r="1.3" stroke="currentColor" stroke-width="1.3"/></svg>` },
];

function setAnalyticsPeriod(p){
  if(p === 'custom') return; // custom için ayrı fonksiyon
  _anPeriod = p;
  _anCustomStart = null;
  _anCustomEnd = null;
  document.getElementById('customDateBox').style.display = 'none';
  document.querySelectorAll('.an-period-btn').forEach(b => b.classList.toggle('on', b.dataset.period === p));
  loadAnalytics();
}

function openCustomDateRange(){
  document.querySelectorAll('.an-period-btn').forEach(b => b.classList.toggle('on', b.dataset.period === 'custom'));
  const box = document.getElementById('customDateBox');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
  if(box.style.display === 'block'){
    // Default: son 7 gün
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7*86400000);
    document.getElementById('customEnd').value = today.toISOString().slice(0,10);
    document.getElementById('customStart').value = weekAgo.toISOString().slice(0,10);
  }
}

function applyCustomRange(){
  const s = document.getElementById('customStart').value;
  const e = document.getElementById('customEnd').value;
  if(!s || !e){ toast('Pick both dates'); return; }
  _anCustomStart = s;
  _anCustomEnd = e + 'T23:59:59';
  _anPeriod = 'custom';
  loadAnalytics();
}

function getCurrencySym(code){
  const map={USD:'$',EUR:'€',GBP:'£',TRY:'₺',JPY:'¥',CNY:'¥',RUB:'₽',INR:'₹',AED:'د.إ',KRW:'₩',CHF:'CHF',CAD:'$',AUD:'$',SEK:'kr',NOK:'kr',DKK:'kr',PLN:'zł'};
  return map[code]||code||'$';
}

function fmtNum(n){
  if(n === null || n === undefined) return '—';
  if(n >= 1000000) return (n/1000000).toFixed(1)+'M';
  if(n >= 1000) return (n/1000).toFixed(1)+'K';
  return Math.round(n).toString();
}

function fmtMoney(n, sym){
  if(n === null || n === undefined) return '—';
  if(n >= 1000) return sym + (n/1000).toFixed(1) + 'K';
  return sym + n.toFixed(2);
}

function fmtDelta(d, isCount){
  if(d === null || d === undefined) return { text:'', cls:'neutral' };
  if(isCount){
    const sign = d >= 0 ? '+' : '';
    return { text: sign + d, cls: d > 0 ? 'up' : (d < 0 ? 'down' : 'neutral') };
  }
  const sign = d >= 0 ? '+' : '';
  return { text: sign + d.toFixed(1) + '%', cls: d > 0 ? 'up' : (d < 0 ? 'down' : 'neutral') };
}

async function loadAnalytics(){
  document.getElementById('analyticsHero').innerHTML = '<div class="an-empty">Loading...</div>';
  document.getElementById('analyticsCards').innerHTML = '';
  
  try {
    let url = '/api/analytics/v2?period=' + _anPeriod;
    if(_anPeriod === 'custom' && _anCustomStart && _anCustomEnd){
      url += '&start='+_anCustomStart+'&end='+_anCustomEnd;
    }
    const data = await api('GET', url);
    _anData = data;
    renderAnalyticsCards();
    renderAnalyticsHero();
  } catch(e) {
    console.error('analytics error:', e);
    document.getElementById('analyticsHero').innerHTML = `<div class="an-empty">Failed to load: ${e.message||'unknown error'}</div>`;
  }
}

function renderAnalyticsCards(){
  if(!_anData) return;
  const sym = getCurrencySym(_anData.currency);
  const k = _anData.kpis;
  
  const topItem = _anData.topItemsByQty[0];
  const topCat = _anData.categoryBreakdown[0];
  
  const cardValues = {
    revenue: { val: fmtMoney(k.revenue.value, sym), delta: fmtDelta(k.revenue.delta) },
    orders: { val: fmtNum(k.orders.value), delta: fmtDelta(k.orders.delta, true) },
    avgCart: { val: k.orders.value > 0 ? fmtMoney(k.avgCart.value, sym) : '—', delta: fmtDelta(k.avgCart.delta) },
    categories: { val: topCat ? (catById(topCat.category).label + ' ' + Math.round(topCat.percent) + '%') : '—', delta: { text: _anData.categoryBreakdown.length + ' cats', cls: 'neutral' } },
    topItems: { val: topItem ? topItem.name : '—', delta: { text: topItem ? topItem.qty + ' orders' : '0', cls: 'neutral' } },
    views: { val: fmtNum(k.views.value), delta: fmtDelta(k.views.delta) },
  };
  
  document.getElementById('analyticsCards').innerHTML = AN_CARDS.map(c => {
    const v = cardValues[c.key];
    const active = c.key === _anSelectedCard ? 'on' : '';
    return `<div class="an-card ${active}" onclick="selectAnalyticsCard('${c.key}')">
      <div class="an-card-head">
        <div class="an-card-icon">${c.icon}</div>
        <span class="an-card-label">${c.label}</span>
      </div>
      <div class="an-card-value" style="${(c.key==='categories'||c.key==='topItems')?'font-size:13px':''}">${escapeHtml(v.val)}</div>
      <div class="an-card-sub ${v.delta.cls}">${v.delta.text}</div>
    </div>`;
  }).join('');
}

function selectAnalyticsCard(key){
  _anSelectedCard = key;
  renderAnalyticsCards();
  renderAnalyticsHero();
}

function renderAnalyticsHero(){
  if(!_anData) return;
  const sym = getCurrencySym(_anData.currency);
  const hero = document.getElementById('analyticsHero');
  const k = _anData.kpis;
  
  const periodLabel = {today:'today', week:'this week', month:'this month', custom:'selected range'}[_anData.period] || _anData.period;
  
  if(_anSelectedCard === 'revenue' || _anSelectedCard === 'orders' || _anSelectedCard === 'avgCart' || _anSelectedCard === 'views'){
    // Line/sparkline view
    let label, value, deltaText, deltaCls;
    if(_anSelectedCard === 'revenue'){
      label = 'Total revenue · ' + periodLabel;
      value = fmtMoney(k.revenue.value, sym);
      const d = fmtDelta(k.revenue.delta);
      deltaText = d.text; deltaCls = d.cls;
    } else if(_anSelectedCard === 'orders'){
      label = 'Orders · ' + periodLabel;
      value = fmtNum(k.orders.value);
      const d = fmtDelta(k.orders.delta, true);
      deltaText = d.text; deltaCls = d.cls;
    } else if(_anSelectedCard === 'avgCart'){
      label = 'Average cart · ' + periodLabel;
      value = k.orders.value > 0 ? fmtMoney(k.avgCart.value, sym) : '—';
      const d = fmtDelta(k.avgCart.delta);
      deltaText = d.text; deltaCls = d.cls;
    } else {
      label = 'Menu views · ' + periodLabel;
      value = fmtNum(k.views.value);
      const d = fmtDelta(k.views.delta);
      deltaText = d.text; deltaCls = d.cls;
    }
    
    // Sparkline çiz
    const timeline = _anData.timeline || [];
    const key = _anSelectedCard === 'revenue' ? 'revenue' : (_anSelectedCard === 'views' ? 'revenue' : 'orders');
    const values = timeline.map(b => b[key] || 0);
    const sparkline = buildSparkline(values);
    
    hero.innerHTML = `
      <div class="an-hero-label">${label}</div>
      <div class="an-hero-value">${value}</div>
      <div class="an-hero-delta">
        ${deltaText ? `<span class="delta-pill ${deltaCls}">${deltaText}</span><span class="delta-note">vs previous</span>` : '<span class="delta-note">No previous data</span>'}
      </div>
      ${sparkline}
    `;
  } else if(_anSelectedCard === 'categories'){
    // Donut chart
    hero.innerHTML = buildCategoryDonut(_anData.categoryBreakdown, sym, periodLabel);
  } else if(_anSelectedCard === 'topItems'){
    // Horizontal bar
    hero.innerHTML = buildTopItemsBars(_anData.topItemsByQty, periodLabel);
  }
}

function buildSparkline(values){
  if(!values || values.length === 0){
    return '<div class="an-empty" style="padding:24px">No data in this period</div>';
  }
  const max = Math.max(...values, 1);
  const w = 300, h = 60;
  const stepX = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = h - (v / max) * (h - 8) - 4;
    return `${x},${y}`;
  });
  const pathStr = 'M' + points.join(' L');
  const fillPath = pathStr + ` L${w},${h} L0,${h} Z`;
  
  // Son nokta
  const lastIdx = values.length - 1;
  const lastX = lastIdx * stepX;
  const lastY = h - (values[lastIdx] / max) * (h - 8) - 4;
  
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;max-width:100%" preserveAspectRatio="none">
    <defs>
      <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#8E1616" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#8E1616" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${fillPath}" fill="url(#sparkfill)"/>
    <path d="${pathStr}" fill="none" stroke="#8E1616" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="3.5" fill="#8E1616" stroke="#fff" stroke-width="1.5"/>
  </svg>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:6px">
    <span>${_anData.timeline[0]?.label || ''}</span>
    <span>${_anData.timeline[Math.floor(_anData.timeline.length/2)]?.label || ''}</span>
    <span>${_anData.timeline[_anData.timeline.length-1]?.label || ''}</span>
  </div>`;
}

const DONUT_COLORS = ['#8E1616','#3b82f6','#f59e0b','#1a8754','#a855f7','#ec4899','#06b6d4','#84cc16'];

function buildCategoryDonut(cats, sym, periodLabel){
  if(!cats || cats.length === 0){
    return `<div class="an-hero-label">Revenue by category · ${periodLabel}</div><div class="an-empty">No completed orders yet</div>`;
  }
  
  const total = cats.reduce((s,c)=>s+c.revenue,0);
  const circumference = 2 * Math.PI * 45; // 282.74
  let offset = 0;
  
  const segments = cats.map((c, i) => {
    const dash = (c.percent / 100) * circumference;
    const seg = `<circle cx="60" cy="60" r="45" fill="none" stroke="${DONUT_COLORS[i % DONUT_COLORS.length]}" stroke-width="18" stroke-dasharray="${dash.toFixed(2)} ${circumference}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
    offset += dash;
    return seg;
  }).join('');
  
  const legend = cats.map((c, i) => `
    <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;margin-bottom:5px">
      <div style="width:9px;height:9px;border-radius:2px;background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></div>
      <span style="flex:1;color:#1e293b;font-weight:500">${escapeHtml(catById(c.category).label)}</span>
      <span style="color:#64748b;font-weight:600">${Math.round(c.percent)}%</span>
    </div>`).join('');
  
  return `<div class="an-hero-label">Revenue by category · ${periodLabel}</div>
    <div style="display:flex;align-items:center;gap:18px;margin-top:8px">
      <svg width="120" height="120" viewBox="0 0 120 120" style="flex-shrink:0">
        <circle cx="60" cy="60" r="45" fill="none" stroke="#f1f5f9" stroke-width="18"/>
        ${segments}
        <text x="60" y="56" text-anchor="middle" font-size="10" fill="#64748b" font-weight="500">Total</text>
        <text x="60" y="72" text-anchor="middle" font-size="13" fill="#1e293b" font-weight="700">${fmtMoney(total, sym)}</text>
      </svg>
      <div style="flex:1;min-width:0">${legend}</div>
    </div>`;
}

function buildTopItemsBars(items, periodLabel){
  if(!items || items.length === 0){
    return `<div class="an-hero-label">Top selling items · ${periodLabel}</div><div class="an-empty">No completed orders yet</div>`;
  }
  const max = Math.max(...items.map(i=>i.qty), 1);
  const rows = items.slice(0, 8).map(it => `
    <div class="an-bar-row">
      <div class="an-bar-meta">
        <span class="lbl">${escapeHtml(it.name)}</span>
        <span class="val">${it.qty}</span>
      </div>
      <div class="an-bar-track">
        <div class="an-bar-fill" style="width:${(it.qty/max*100).toFixed(1)}%"></div>
      </div>
    </div>`).join('');
  
  return `<div class="an-hero-label">Top selling items · ${periodLabel}</div>${rows}`;
}

/* OLD ANALYTICS — uyumluluk için, eski elementler artık gizli */
async function loadAnalyticsOld(){
  // No-op
}

/* INIT */
(async () => {
  if (!token) {
    // Token yok, login ekranı göster
    document.getElementById('authScreen').style.display = '';
    return;
  }
  try {
    // Token'ı backend'e doğrulat
    const data = await api('GET', '/api/auth/me');
    org = data.organization;
    localStorage.setItem('ms_org', JSON.stringify(org));
    startApp();
  } catch (e) {
    // 401 gelirse api() zaten reload yapıyor
    // Başka hata olursa login'e düş
    if (e.message !== 'Session expired') {
      localStorage.removeItem('ms_token');
      localStorage.removeItem('ms_org');
      document.getElementById('authScreen').style.display = '';
    }
  }
})();