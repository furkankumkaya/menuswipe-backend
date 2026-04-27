// MenuSwipe Admin Panel
const API='';
let token=localStorage.getItem('ms_token')||'';
let org=JSON.parse(localStorage.getItem('ms_org')||'null');
let items=[],branches=[],cats=[],editingId=null,openDescId=null;
let currentFilter='all',currentBranchFilter='all',photoItemId=null,activeSlot=null,pendingDeleteId=null,pendingDeleteType=null;
let pCur=0,pCat='all';
let editingBranchId=null;
let currentPanel='menu', currentSubpage=null;
const DESC_MAX=120;
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_KEYS=['mon','tue','wed','thu','fri','sat','sun'];

const CURRENCIES = [
  {code:'USD',symbol:'$',name:'US Dollar'},{code:'EUR',symbol:'€',name:'Euro'},{code:'GBP',symbol:'£',name:'British Pound'},
  {code:'TRY',symbol:'₺',name:'Turkish Lira'},{code:'JPY',symbol:'¥',name:'Japanese Yen'},{code:'CNY',symbol:'¥',name:'Chinese Yuan'},
  {code:'AED',symbol:'د.إ',name:'UAE Dirham'},{code:'SAR',symbol:'﷼',name:'Saudi Riyal'},{code:'INR',symbol:'₹',name:'Indian Rupee'},
  {code:'AUD',symbol:'A$',name:'Australian Dollar'},{code:'CAD',symbol:'C$',name:'Canadian Dollar'},{code:'CHF',symbol:'Fr',name:'Swiss Franc'},
  {code:'SEK',symbol:'kr',name:'Swedish Krona'},{code:'NOK',symbol:'kr',name:'Norwegian Krone'},{code:'DKK',symbol:'kr',name:'Danish Krone'},
  {code:'PLN',symbol:'zł',name:'Polish Zloty'},{code:'CZK',symbol:'Kč',name:'Czech Koruna'},{code:'HUF',symbol:'Ft',name:'Hungarian Forint'},
  {code:'RUB',symbol:'₽',name:'Russian Ruble'},{code:'BRL',symbol:'R$',name:'Brazilian Real'},{code:'MXN',symbol:'Mex$',name:'Mexican Peso'},
  {code:'ARS',symbol:'$',name:'Argentine Peso'},{code:'ZAR',symbol:'R',name:'South African Rand'},{code:'EGP',symbol:'£',name:'Egyptian Pound'},
  {code:'NGN',symbol:'₦',name:'Nigerian Naira'},{code:'KES',symbol:'KSh',name:'Kenyan Shilling'},{code:'THB',symbol:'฿',name:'Thai Baht'},
  {code:'SGD',symbol:'S$',name:'Singapore Dollar'},{code:'HKD',symbol:'HK$',name:'Hong Kong Dollar'},{code:'KRW',symbol:'₩',name:'Korean Won'},
  {code:'IDR',symbol:'Rp',name:'Indonesian Rupiah'},{code:'MYR',symbol:'RM',name:'Malaysian Ringgit'},{code:'PHP',symbol:'₱',name:'Philippine Peso'},
  {code:'VND',symbol:'₫',name:'Vietnamese Dong'},{code:'NZD',symbol:'NZ$',name:'New Zealand Dollar'},{code:'ILS',symbol:'₪',name:'Israeli Shekel'},
  {code:'CLP',symbol:'$',name:'Chilean Peso'},{code:'COP',symbol:'$',name:'Colombian Peso'},{code:'PEN',symbol:'S/',name:'Peruvian Sol'},
  {code:'PKR',symbol:'₨',name:'Pakistani Rupee'},{code:'BDT',symbol:'৳',name:'Bangladeshi Taka'},
];

const PENCIL=`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5a1.5 1.5 0 012.12 2.12L4.5 11.75l-3 .75.75-3L9.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 4l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const TRASH=`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M5.5 6.5v5M8.5 6.5v5M2.5 4l.9 8a1 1 0 001 .9h6.2a1 1 0 001-.9l.9-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHECK=`<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const XMARK=`<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const PHOTO_ICO=`<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="2" width="9" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1"/><circle cx="4" cy="5" r="1.2" stroke="currentColor" stroke-width=".9"/><path d="M1 8l3-3 2.5 2.5 1.5-2 3 3" stroke="currentColor" stroke-width=".8" fill="none"/></svg>`;
const STAR_OUTLINE=`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l2 4.3 4.6.6-3.4 3.2.9 4.5L8 11.9 3.9 14.1l.9-4.5L1.4 6.4 6 5.8l2-4.3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const STAR_FILLED=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l2 4.3 4.6.6-3.4 3.2.9 4.5L8 11.9 3.9 14.1l.9-4.5L1.4 6.4 6 5.8l2-4.3z"/></svg>`;

function getCurrency(){return (org && org.currency) || 'USD';}
function getCurrencySymbol(){const c = CURRENCIES.find(x=>x.code===getCurrency()); return c?c.symbol:'$';}
function fmtPrice(p){return getCurrencySymbol() + Number(p).toFixed(0);}

async function api(method,path,body){
  const opts={method,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'}};
  if(body)opts.body=JSON.stringify(body);
  const r=await fetch(API+path,opts);
  const data=await r.json();
  if(!r.ok)throw new Error(data.error||'Request failed');
  return data;
}
async function apiForm(method,path,fd){
  const r=await fetch(API+path,{method,headers:{'Authorization':`Bearer ${token}`},body:fd});
  const data=await r.json();
  if(!r.ok)throw new Error(data.error||'Upload failed');
  return data;
}
function toast(msg,dur=2200){
  const el=document.getElementById('toast');
  el.textContent=msg;el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),dur);
}

/* AUTH */
function switchTab(tab){
  document.getElementById('loginForm').style.display=tab==='login'?'':'none';
  document.getElementById('registerForm').style.display=tab==='register'?'':'none';
  document.getElementById('tabLogin').classList.toggle('on',tab==='login');
  document.getElementById('tabRegister').classList.toggle('on',tab==='register');
  document.getElementById('authErr').textContent='';
}
async function doLogin(){
  const email=document.getElementById('loginEmail').value.trim();
  const password=document.getElementById('loginPassword').value;
  document.getElementById('authErr').textContent='';
  try{
    const data=await api('POST','/api/auth/login',{email,password});
    token=data.token;org=data.organization;
    localStorage.setItem('ms_token',token);
    localStorage.setItem('ms_org',JSON.stringify(org));
    startApp();
  }catch(e){document.getElementById('authErr').textContent=e.message;}
}
async function doRegister(){
  const restaurantName=document.getElementById('regName').value.trim();
  const email=document.getElementById('regEmail').value.trim();
  const password=document.getElementById('regPassword').value;
  document.getElementById('authErr').textContent='';
  if(!restaurantName)return document.getElementById('authErr').textContent='Please enter your restaurant name';
  try{
    const data=await api('POST','/api/auth/register',{restaurantName,email,password});
    token=data.token;org=data.organization;
    localStorage.setItem('ms_token',token);
    localStorage.setItem('ms_org',JSON.stringify(org));
    startApp();
  }catch(e){document.getElementById('authErr').textContent=e.message;}
}
function doLogout(){localStorage.removeItem('ms_token');localStorage.removeItem('ms_org');location.reload();}

function startApp(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('appScreen').classList.add('visible');
  populateCurrencies();
  fillProfileForm();
  if(org.logoUrl){showLogo(org.logoUrl);}
  loadAll();
}

async function loadAll(){
  await loadBranches();
  await loadMenu();
  if(cats.length===0)initDefaultCats();
  renderItems();
  renderBranchSelector();
  buildBranchSelector();
  populateAddSel();
  buildCatPills();
  setTimeout(qrGenerate,400);
}

/* NAV */
function go(id,el){
  currentPanel=id; currentSubpage=null;
  document.getElementById('backBtn').style.display='none';
  document.querySelectorAll('.nav-btn').forEach(n=>n.classList.remove('on'));
  if(el)el.classList.add('on'); else document.getElementById('nav-'+id).classList.add('on');
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
  document.getElementById('p-'+id).classList.add('on');
  const titles={menu:'Menu items',preview:'Customer preview',qr:'QR & link',analytics:'Analytics',profile:'Profile'};
  document.getElementById('ptitle').textContent=titles[id]||id;
  document.getElementById('topActs').style.display=id==='menu'?'flex':'none';
  if(id==='preview')buildPreview();
  if(id==='qr')setTimeout(qrGenerate,200);
  if(id==='analytics')loadAnalytics();
  if(id==='profile')renderBranchList();
  document.getElementById('appContent').scrollTop=0;
}

function goSubpage(id){
  currentSubpage=id;
  document.getElementById('backBtn').style.display='flex';
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
  document.getElementById('p-'+id).classList.add('on');
  document.getElementById('topActs').style.display='none';
  const titles={categories:'Categories'};
  document.getElementById('ptitle').textContent=titles[id]||id;
  if(id==='categories')renderCatList();
  document.getElementById('appContent').scrollTop=0;
}

function goBack(){
  go(currentPanel, document.getElementById('nav-'+currentPanel));
}

/* PROFILE FORM */
function populateCurrencies(){
  const sel=document.getElementById('profileCurrency');
  sel.innerHTML=CURRENCIES.map(c=>`<option value="${c.code}">${c.code} (${c.symbol}) — ${c.name}</option>`).join('');
  sel.value=getCurrency();
}

function fillProfileForm(){
  document.getElementById('profileName').value=org.name||'';
  document.getElementById('pfCountry').value=org.country||'';
  document.getElementById('pfCity').value=org.city||'';
  document.getElementById('pfPostal').value=org.postalCode||'';
  document.getElementById('pfAddress').value=org.address||'';
  document.getElementById('pfMapsUrl').value=org.googleMapsUrl||'';
  document.getElementById('pfPhone').value=org.phone||'';
  document.getElementById('pfWebsite').value=org.website||'';
  document.getElementById('pfInstagram').value=org.instagram||'';
  document.getElementById('pfFacebook').value=org.facebook||'';
  
  // Address summary
  const parts=[org.city, org.country].filter(Boolean);
  document.getElementById('addressSummary').textContent=parts.length?parts.join(', '):'Not set';
  
  // Working hours
  buildHoursForm(org.workingHours||{});
}

function buildHoursForm(wh){
  const html=DAYS.map((d,i)=>{
    const k=DAY_KEYS[i];
    const day=wh[k]||{open:'',close:'',closed:false};
    return `<div class="day-row">
      <div class="day-name">${d}</div>
      <div class="time-pair">
        <input type="time" class="time-inp" id="hr-${k}-open" value="${day.open||''}" onchange="saveHours()" ${day.closed?'disabled':''}/>
        <span style="color:#94a3b8">—</span>
        <input type="time" class="time-inp" id="hr-${k}-close" value="${day.close||''}" onchange="saveHours()" ${day.closed?'disabled':''}/>
      </div>
      <label class="tog"><input type="checkbox" id="hr-${k}-closed" ${day.closed?'checked':''} onchange="saveHours()"/><div class="tog-t"></div><div class="tog-th"></div></label>
    </div>`;
  }).join('');
  document.getElementById('hoursSection').innerHTML=html+'<div style="font-size:10px;color:#94a3b8;margin-top:8px">Toggle to mark a day as closed.</div>';
}

let saveTimer;
function debounceSaveProfile(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(saveProfile,800);
}
let nameTimer;
function debounceSaveName(){
  clearTimeout(nameTimer);
  nameTimer=setTimeout(async()=>{
    const name=document.getElementById('profileName').value.trim();
    if(!name||name===org.name)return;
    try{
      const updated=await api('PATCH','/api/auth/organization',{name});
      org.name=updated.name;
      localStorage.setItem('ms_org',JSON.stringify(org));
      toast('Name updated');
    }catch(e){toast('Failed to save name');}
  },800);
}

async function saveProfile(){
  const data={
    country:document.getElementById('pfCountry').value.trim()||null,
    city:document.getElementById('pfCity').value.trim()||null,
    address:document.getElementById('pfAddress').value.trim()||null,
    postalCode:document.getElementById('pfPostal').value.trim()||null,
    googleMapsUrl:document.getElementById('pfMapsUrl').value.trim()||null,
    phone:document.getElementById('pfPhone').value.trim()||null,
    website:document.getElementById('pfWebsite').value.trim()||null,
    instagram:document.getElementById('pfInstagram').value.trim()||null,
    facebook:document.getElementById('pfFacebook').value.trim()||null,
  };
  try{
    const updated=await api('PATCH','/api/auth/organization',data);
    Object.assign(org,updated);
    localStorage.setItem('ms_org',JSON.stringify(org));
    fillProfileForm();
  }catch(e){}
}

async function saveCurrency(){
  const currency=document.getElementById('profileCurrency').value;
  try{
    const updated=await api('PATCH','/api/auth/organization',{currency});
    org.currency=currency;
    localStorage.setItem('ms_org',JSON.stringify(org));
    renderItems();
    toast('Currency updated');
  }catch(e){toast('Failed to update currency');}
}

async function saveHours(){
  const wh={};
  DAY_KEYS.forEach(k=>{
    const open=document.getElementById('hr-'+k+'-open').value;
    const close=document.getElementById('hr-'+k+'-close').value;
    const closed=document.getElementById('hr-'+k+'-closed').checked;
    wh[k]={open,close,closed};
    document.getElementById('hr-'+k+'-open').disabled=closed;
    document.getElementById('hr-'+k+'-close').disabled=closed;
  });
  try{
    const updated=await api('PATCH','/api/auth/organization',{workingHours:wh});
    org.workingHours=wh;
    localStorage.setItem('ms_org',JSON.stringify(org));
  }catch(e){}
}

function showLogo(url){
  document.getElementById('logoImgP').src=url;
  document.getElementById('logoImgP').style.display='block';
  document.getElementById('logoSvgP').style.display='none';
  document.getElementById('pLogoImg').src=url;
  document.getElementById('pLogoImg').style.display='block';
  document.getElementById('pLogoSvg').style.display='none';
}

async function handleLogo(e){
  const f=e.target.files[0];if(!f)return;
  toast('Uploading logo...',5000);
  const fd=new FormData(); fd.append('photo',f);
  try{
    // We'll use a special endpoint or just convert to data URL for beta
    const r=new FileReader();
    r.onload=async ev=>{
      try{
        const updated=await api('PATCH','/api/auth/organization',{logoUrl:ev.target.result});
        org.logoUrl=updated.logoUrl;
        localStorage.setItem('ms_org',JSON.stringify(org));
        showLogo(ev.target.result);
        toast('Logo updated ✓');
      }catch(err){toast('Failed: '+err.message);}
    };
    r.readAsDataURL(f);
  }catch(err){toast('Upload failed');}
}

function toggleSection(header){
  const content=header.nextElementSibling;
  content.classList.toggle('collapsed');
  header.classList.toggle('open');
}

/* DELETE WIRING */
document.getElementById('delCancelBtn').addEventListener('click',()=>{
  pendingDeleteId=null; pendingDeleteType=null;
  document.getElementById('delOverlay').classList.remove('open');
});
document.getElementById('delOkBtn').addEventListener('click',async()=>{
  if(pendingDeleteId!==null){
    try{
      if(pendingDeleteType==='item'){
        await api('DELETE','/api/menu/'+pendingDeleteId);
        items=items.filter(i=>i.id!==pendingDeleteId);
        renderItems(); toast('Item deleted');
      } else if(pendingDeleteType==='branch'){
        await api('DELETE','/api/branches/'+pendingDeleteId);
        await loadBranches();
        renderBranchList(); buildBranchSelector(); renderBranchSelector();
        toast('Branch deleted');
      }
    }catch(e){toast('Failed: '+e.message);}
  }
  pendingDeleteId=null; pendingDeleteType=null;
  document.getElementById('delOverlay').classList.remove('open');
});

function askDeleteItem(id,name){
  pendingDeleteId=id; pendingDeleteType='item';
  document.getElementById('delTitle').textContent='Delete item?';
  document.getElementById('delSub').textContent=`"${name}" will be permanently removed.`;
  document.getElementById('delOverlay').classList.add('open');
}
function askDeleteBranch(id,name){
  pendingDeleteId=id; pendingDeleteType='branch';
  document.getElementById('delTitle').textContent='Delete branch?';
  document.getElementById('delSub').textContent=`"${name}" branch will be permanently deleted.`;
  document.getElementById('delOverlay').classList.add('open');
}

/* MENU */
async function loadMenu(){
  try{
    items=await api('GET','/api/menu');
  }catch(e){
    document.getElementById('itemRows').innerHTML='<div class="loading-msg">Failed to load. Refresh page.</div>';
  }
}

function initDefaultCats(){
  cats=[
    {id:'MAIN',label:'Main',color:'#993C1D',visible:true},
    {id:'STARTER',label:'Starter',color:'#0F6E56',visible:true},
    {id:'DRINK',label:'Drink',color:'#185FA5',visible:true},
    {id:'DESSERT',label:'Dessert',color:'#534AB7',visible:true},
  ];
}
function catById(id){return cats.find(c=>c.id===id)||{label:id,color:'#888',visible:true};}
function visCats(){return cats.filter(c=>c.visible);}
function categoriesWithItems(){
  // Returns categories that have at least one item assigned
  const usedIds=new Set(items.map(i=>i.category));
  return cats.filter(c=>c.visible && usedIds.has(c.id));
}

function updateStats(){
  document.getElementById('statItems').textContent=items.length;
  document.getElementById('statPhotos').textContent=items.reduce((s,i)=>s+(i.photos?i.photos.length:0),0);
  document.getElementById('statBest').textContent=items.filter(i=>i.isBestseller).length;
}

function getFilteredItems(){
  let list=items;
  if(currentFilter!=='all') list=list.filter(i=>i.category===currentFilter);
  if(currentBranchFilter!=='all'){
    list=list.filter(i=>(i.itemBranches||[]).some(ib=>ib.branchId===currentBranchFilter));
  }
  return list;
}

function renderItems(){
  const list=getFilteredItems();
  document.getElementById('itemRows').innerHTML=list.map(item=>{
    const catId=item.category||'MAIN';
    const cat=catById(catId);
    const isEd=editingId===item.id;
    const descOpen=openDescId===item.id;
    const photos=item.photos||[];
    const pcnt=photos.length;
    const desc=item.description||'';
    
    const starBtn=`<button class="star-btn ${item.isBestseller?'on':''}" onclick="toggleBestseller('${item.id}')" title="Best seller">${item.isBestseller?STAR_FILLED:STAR_OUTLINE}</button>`;
    
    const mainRow=isEd
      ?`<div class="irow-main" style="background:#fef9f9">
          <div class="icell star-cell">${starBtn}</div>
          <div class="icell"><input class="edit-inp" id="en-${item.id}" value="${item.name}"/></div>
          <div class="icell"><select class="cat-sel" id="ec-${item.id}">${cats.map(c=>`<option value="${c.id}"${c.id===catId?' selected':''}>${c.label}</option>`).join('')}</select></div>
          <div class="icell"><input class="price-inp" id="ep-${item.id}" type="number" value="${item.price}"/></div>
          <div class="icell"><button class="photo-ibtn" onclick="openPhoto('${item.id}')">${PHOTO_ICO} ${pcnt}/3</button></div>
          <div class="act-cell"><button class="ib save" onclick="saveEdit('${item.id}')">${CHECK}</button><button class="ib cx" onclick="cancelEdit()">${XMARK}</button></div>
        </div>`
      :`<div class="irow-main">
          <div class="icell star-cell">${starBtn}</div>
          <div class="icell" style="cursor:pointer" onclick="toggleDesc('${item.id}')">
            <div class="iname-area">
              <div class="iname-text">${item.name}${item.isBestseller?'<span class="bestseller-badge">★ BEST</span>':''}</div>
              <div class="idesc-text${desc?'':' empty'}">${desc||'Tap to add description...'}</div>
            </div>
          </div>
          <div class="icell"><span class="ctag" style="border-left:3px solid ${cat.color}">${cat.label}</span></div>
          <div class="icell" style="font-size:13px;font-weight:700;color:#1e293b">${fmtPrice(item.price)}</div>
          <div class="icell"><button class="photo-ibtn" onclick="openPhoto('${item.id}')">${PHOTO_ICO} ${pcnt}/3</button></div>
          <div class="act-cell"><button class="ib" onclick="startEdit('${item.id}')">${PENCIL}</button><button class="ib" onclick="askDeleteItem('${item.id}','${item.name.replace(/'/g,"\\'")}')">${TRASH}</button></div>
        </div>`;
    const descSec=`<div class="desc-ed${descOpen?' open':''}" id="de-${item.id}"><div class="desc-inner"><textarea class="desc-ta" id="dt-${item.id}" maxlength="${DESC_MAX}" placeholder="Describe this dish..." oninput="descCount('${item.id}')">${desc}</textarea><div class="desc-right"><div class="desc-cnt" id="dc-${item.id}">${desc.length}/${DESC_MAX}</div><button class="ok-btn" onclick="saveDesc('${item.id}')">${CHECK}</button></div></div></div>`;
    return `<div class="irow${isEd?' editing':''}" id="ir-${item.id}">${mainRow}${descSec}</div>`;
  }).join('')||'<div class="loading-msg">No items yet. Tap + Add to start.</div>';
  updateStats();
}

async function toggleBestseller(id){
  const item=items.find(i=>i.id===id);
  if(!item)return;
  try{
    const updated=await api('PATCH','/api/menu/'+id,{isBestseller:!item.isBestseller});
    Object.assign(item,updated);
    renderItems();
    toast(updated.isBestseller?'Marked as best seller':'Removed best seller');
  }catch(e){toast('Failed: '+e.message);}
}

function buildCatPills(){
  // Show all cats here for filtering, even empty ones (admin sees them)
  const all=[{id:'all',label:'All'},...cats];
  document.getElementById('catPills').innerHTML=all.map(c=>`<button class="pill${currentFilter===c.id?' on':''}" onclick="filterItems('${c.id}')">${c.label}</button>`).join('');
}
function filterItems(cat){currentFilter=cat;editingId=null;openDescId=null;renderItems();buildCatPills();}
function populateAddSel(){
  document.getElementById('newCat').innerHTML=cats.map(c=>`<option value="${c.id}">${c.label}</option>`).join('');
}

function buildBranchSelector(){
  // The bar above menu items showing all branches
  const bar=document.getElementById('branchSelector');
  if(branches.length<=1){bar.style.display='none';return;}
  bar.style.display='flex';
  const all=[{id:'all',name:'All branches'}, ...branches];
  bar.innerHTML=all.map(b=>`<button class="bp${currentBranchFilter===b.id?' on':''}" onclick="setBranchFilter('${b.id}')">${b.name}</button>`).join('');
}
function setBranchFilter(id){currentBranchFilter=id;buildBranchSelector();renderItems();}

function startEdit(id){editingId=id;openDescId=null;renderItems();}
function cancelEdit(){editingId=null;renderItems();}
async function saveEdit(id){
  const item=items.find(i=>i.id===id);
  const name=document.getElementById('en-'+id).value.trim()||item.name;
  const category=document.getElementById('ec-'+id).value;
  const price=parseFloat(document.getElementById('ep-'+id).value)||item.price;
  try{
    const updated=await api('PATCH','/api/menu/'+id,{name,category,price});
    Object.assign(item,updated);editingId=null;renderItems();toast('Saved');
  }catch(e){toast('Save failed');}
}

function toggleDesc(id){
  if(editingId===id)return;
  openDescId=openDescId===id?null:id;
  renderItems();
  if(openDescId===id)setTimeout(()=>{const ta=document.getElementById('dt-'+id);if(ta){ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);}},30);
}
function descCount(id){const ta=document.getElementById('dt-'+id),el=document.getElementById('dc-'+id);if(!ta||!el)return;el.textContent=ta.value.length+'/'+DESC_MAX;el.classList.toggle('warn',ta.value.length>=DESC_MAX);}
async function saveDesc(id){
  const ta=document.getElementById('dt-'+id);
  const item=items.find(i=>i.id===id);
  if(!ta||!item)return;
  const description=ta.value.trim().slice(0,DESC_MAX);
  try{
    await api('PATCH','/api/menu/'+id,{description});
    item.description=description;
    openDescId=null;renderItems();toast('Description saved');
  }catch(e){toast('Save failed');}
}

function showAddRow(){populateAddSel();document.getElementById('addRow').classList.add('show');document.getElementById('newName').focus();}
function hideAddRow(){document.getElementById('addRow').classList.remove('show');document.getElementById('newName').value='';document.getElementById('newPrice').value='';}
async function confirmAdd(){
  const name=document.getElementById('newName').value.trim();
  const price=parseFloat(document.getElementById('newPrice').value)||0;
  const category=document.getElementById('newCat').value;
  if(!name)return;
  try{
    const item=await api('POST','/api/menu',{name,price,category});
    item.photos=item.photos||[];
    items.push(item);hideAddRow();renderItems();toast('Item added');
  }catch(e){toast('Failed: '+e.message);}
}

/* PHOTOS */
function openPhoto(id){
  photoItemId=id;
  const item=items.find(i=>i.id===id);
  document.getElementById('photoTitle').textContent=item.name;
  renderSlots();document.getElementById('photoOverlay').classList.add('open');
}
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
  try{
    await api('DELETE',`/api/menu/${photoItemId}/photos/${photoId}`);
    item.photos=item.photos.filter(p=>p.id!==photoId);
    renderSlots();renderItems();
  }catch(err){toast('Delete failed');}
}
async function handlePhotoUpload(e){
  const f=e.target.files[0];if(!f)return;
  const item=items.find(i=>i.id===photoItemId);
  if(!item||(item.photos||[]).length>=3)return;
  toast('Uploading...',5000);
  const fd=new FormData();fd.append('photo',f);
  try{
    const photo=await apiForm('POST',`/api/menu/${photoItemId}/photos`,fd);
    if(!item.photos)item.photos=[];
    item.photos.push(photo);renderSlots();renderItems();toast('Photo uploaded ✓');
  }catch(err){toast('Upload failed');}
  e.target.value='';
}

/* CATEGORIES */
function renderCatList(){
  document.getElementById('catList').innerHTML=cats.map(c=>{
    const count=items.filter(i=>i.category===c.id).length;
    return `<div class="cat-item">
      <input type="color" value="${c.color}" onchange="catColor('${c.id}',this.value)" style="width:24px;height:24px;border:none;background:none;cursor:pointer;border-radius:50%"/>
      <input class="cat-name-inp" value="${c.label}" placeholder="Category name" oninput="catLabel('${c.id}',this.value)"/>
      <span class="cat-count">${count}</span>
      <label class="tog"><input type="checkbox" ${c.visible?'checked':''} onchange="catToggle('${c.id}',this)"/><div class="tog-t"></div><div class="tog-th"></div></label>
      <button onclick="deleteCat('${c.id}')" class="ib" style="color:#ef4444">${TRASH}</button>
    </div>`;
  }).join('')||'<div class="loading-msg">No categories. Add one below.</div>';
}
function catLabel(id,val){const c=cats.find(x=>x.id===id);if(c){c.label=val;buildCatPills();populateAddSel();}}
function catColor(id,val){const c=cats.find(x=>x.id===id);if(c)c.color=val;renderItems();}
function catToggle(id,cb){const c=cats.find(x=>x.id===id);if(c){c.visible=cb.checked;buildCatPills();renderCatList();}}
function deleteCat(id){if(cats.length<=1)return;cats=cats.filter(c=>c.id!==id);renderCatList();buildCatPills();populateAddSel();}
function addCategory(){const colors=['#BA7517','#993556','#1D9E75','#378ADD','#7B3F00','#5D3FD3'];cats.push({id:'CAT'+Date.now(),label:'New category',color:colors[cats.length%6],visible:true});renderCatList();buildCatPills();populateAddSel();}

/* BRANCHES */
async function loadBranches(){
  try{branches=await api('GET','/api/branches');}catch(e){branches=[];}
}

function renderBranchList(){
  document.getElementById('branchList').innerHTML=branches.map(b=>{
    const initials=b.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
    const addr=[b.city, b.country].filter(Boolean).join(', ') || 'No address';
    return `<div class="branch-card" onclick="openBranchModal('${b.id}')">
      <div class="bav">${initials}</div>
      <div class="binf">
        <div class="bn">${b.name}</div>
        <div class="bs">${addr} · ${b.active?'Active':'Inactive'}</div>
      </div>
      <span style="font-size:10px;padding:3px 8px;border-radius:10px;background:${b.active?'#EAF3DE':'#f1f5f9'};color:${b.active?'#27500A':'#64748b'};font-weight:700">${b.active?'ACTIVE':'OFF'}</span>
    </div>`;
  }).join('')||'<div class="loading-msg" style="padding:14px">No branches yet</div>';
  document.getElementById('branchSummary').textContent=branches.length+' branch'+(branches.length===1?'':'es');
}

function renderBranchSelector(){
  // QR panel branch select dropdown
  const sel=document.getElementById('qrBranchSelect');
  if(!sel)return;
  sel.innerHTML=branches.map(b=>`<option value="${b.id}">${b.name} (${b.slug})</option>`).join('');
}

function openBranchModal(id){
  editingBranchId=id||null;
  const branch=id?branches.find(b=>b.id===id):{name:'',active:true};
  if(!branch)return;
  
  document.getElementById('branchModalTitle').textContent=id?'Edit branch':'Add branch';
  document.getElementById('branchModalBody').innerHTML=`
    <div class="field-row">
      <div class="field-lbl">Branch name</div>
      <input class="field-inp" id="bm-name" value="${branch.name||''}" placeholder="e.g. Karaköy"/>
    </div>
    <div class="field-row">
      <div class="field-lbl">Country</div>
      <input class="field-inp" id="bm-country" value="${branch.country||''}" placeholder="Turkey"/>
    </div>
    <div class="field-row-2">
      <div class="field-row">
        <div class="field-lbl">City</div>
        <input class="field-inp" id="bm-city" value="${branch.city||''}" placeholder="Istanbul"/>
      </div>
      <div class="field-row">
        <div class="field-lbl">Postal code</div>
        <input class="field-inp" id="bm-postal" value="${branch.postalCode||''}" placeholder="34000"/>
      </div>
    </div>
    <div class="field-row">
      <div class="field-lbl">Address</div>
      <input class="field-inp" id="bm-address" value="${branch.address||''}" placeholder="Street, building"/>
    </div>
    <div class="field-row">
      <div class="field-lbl">Phone</div>
      <input class="field-inp" id="bm-phone" value="${branch.phone||''}" placeholder="+90 555 555 5555"/>
    </div>
    <div class="field-row">
      <div class="field-lbl">Google Maps URL</div>
      <input class="field-inp" id="bm-maps" value="${branch.googleMapsUrl||''}" placeholder="https://maps.app.goo.gl/..."/>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0">
      <label class="tog"><input type="checkbox" id="bm-active" ${branch.active?'checked':''}/><div class="tog-t"></div><div class="tog-th"></div></label>
      <span style="font-size:13px;font-weight:500;color:#1e293b">Active branch</span>
    </div>
    <div class="m-row">
      ${id?`<button class="btn-danger" onclick="deleteBranchPrompt('${id}','${branch.name.replace(/'/g,"\\'")}')" style="margin-right:auto">Delete</button>`:''}
      <button class="btn-gh" onclick="closeBranchModal()">Cancel</button>
      <button class="btn-dk" onclick="saveBranch()">Save</button>
    </div>`;
  document.getElementById('branchOverlay').classList.add('open');
}

function closeBranchModal(){
  document.getElementById('branchOverlay').classList.remove('open');
  editingBranchId=null;
}

async function saveBranch(){
  const data={
    name:document.getElementById('bm-name').value.trim(),
    country:document.getElementById('bm-country').value.trim()||null,
    city:document.getElementById('bm-city').value.trim()||null,
    postalCode:document.getElementById('bm-postal').value.trim()||null,
    address:document.getElementById('bm-address').value.trim()||null,
    phone:document.getElementById('bm-phone').value.trim()||null,
    googleMapsUrl:document.getElementById('bm-maps').value.trim()||null,
    active:document.getElementById('bm-active').checked,
  };
  if(!data.name)return toast('Branch name required');
  try{
    if(editingBranchId){
      await api('PATCH','/api/branches/'+editingBranchId,data);
      toast('Branch updated');
    } else {
      await api('POST','/api/branches',data);
      toast('Branch added');
    }
    await loadBranches();
    renderBranchList();
    buildBranchSelector();
    renderBranchSelector();
    closeBranchModal();
  }catch(e){toast('Failed: '+e.message);}
}

function deleteBranchPrompt(id,name){
  closeBranchModal();
  setTimeout(()=>askDeleteBranch(id,name),100);
}

/* PREVIEW */
function buildPreview(){
  const visibleCats=categoriesWithItems().map(c=>c.id);
  const filtered=(pCat==='all'?items:items.filter(i=>i.category===pCat)).filter(i=>visibleCats.includes(i.category));
  if(pCur>=filtered.length)pCur=0;
  const wrap=document.getElementById('pslides');wrap.innerHTML='';
  filtered.forEach((item,i)=>{
    const cat=catById(item.category||'MAIN');
    const photos=item.photos||[];
    const slide=document.createElement('div');slide.className='slide';
    slide.style.transform=`translateY(${(i-pCur)*100}%)`;
    const desc=item.description||'';
    const bestBadge=item.isBestseller?'<span style="background:rgba(245,158,11,0.9);color:#fff;padding:2px 6px;border-radius:6px;font-size:8px;font-weight:700;margin-right:5px">★ BEST</span>':'';
    slide.innerHTML=`<div style="width:100%;height:100%;background:${cat.color}22;display:flex;align-items:center;justify-content:center">${photos[0]?`<img src="${photos[0].url}" style="width:100%;height:100%;object-fit:cover"/>`:`<svg width="60" height="60" viewBox="0 0 60 60" fill="none" opacity=".2"><rect x="8" y="8" width="44" height="44" rx="8" stroke="${cat.color}" stroke-width="2"/></svg>`}</div><div class="sgrad"></div><div class="sinfo"><div class="scat-tag">${bestBadge}${cat.label}</div><div class="sname">${item.name}</div>${desc?`<div class="sdesc">${desc}</div>`:''}<div class="sprice">${fmtPrice(item.price)}</div><div class="sdots">${[0,1,2].map(d=>`<div class="sd${d===0?' on':''}"></div>`).join('')}</div></div>`;
    wrap.appendChild(slide);
  });
  document.getElementById('pprogf').style.width=filtered.length?Math.round((pCur+1)/filtered.length*100)+'%':'0%';
  document.getElementById('pcount').textContent=filtered.length?`${pCur+1} / ${filtered.length}`:'0 / 0';
  // Only show categories that have items
  const allC=[{id:'all',label:'All'}, ...categoriesWithItems()];
  document.getElementById('pcatBar').innerHTML=allC.map(c=>`<div class="pcat${c.id===pCat?' on':''}" onclick="setPCat('${c.id}')">${c.label}</div>`).join('');
}
function setPCat(c){pCat=c;pCur=0;buildPreview();}
function pnext(){const visibleCats=categoriesWithItems().map(c=>c.id);const f=(pCat==='all'?items:items.filter(i=>i.category===pCat)).filter(i=>visibleCats.includes(i.category));if(pCur<f.length-1){pCur++;buildPreview();}}
function pprev(){if(pCur>0){pCur--;buildPreview();}}

/* QR */
function getCurrentQrUrl(){
  if(!org)return '';
  const branchId=document.getElementById('qrBranchSelect').value;
  const branch=branches.find(b=>b.id===branchId);
  const base=window.location.origin+'/menu/'+org.slug;
  if(branch && branch.slug && branch.slug!=='main' && branches.length>1){
    return `${base}/${branch.slug}?from=qr`;
  }
  return base+'?from=qr';
}

function qrGenerate(){
  if(!org)return;
  const url=getCurrentQrUrl();
  document.getElementById('qrUrlDisplay').textContent=url;
  const canvas=document.getElementById('qrCanvas');
  if(typeof QRCode==='undefined'||!canvas)return;
  QRCode.toCanvas(canvas,url,{width:200,margin:2,color:{dark:'#1D1616',light:'#ffffff'},errorCorrectionLevel:'H'},()=>{});
}
function qrDlPNG(){
  const url=getCurrentQrUrl();
  const branchId=document.getElementById('qrBranchSelect').value;
  const branch=branches.find(b=>b.id===branchId);
  const slug=org.slug+(branch&&branch.slug!=='main'?'-'+branch.slug:'');
  const tmp=document.createElement('canvas');
  QRCode.toCanvas(tmp,url,{width:1000,margin:2,errorCorrectionLevel:'H'},()=>{
    const a=document.createElement('a');a.download='qr-'+slug+'.png';a.href=tmp.toDataURL('image/png');
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  });
}
function qrDlSVG(){
  const url=getCurrentQrUrl();
  const branchId=document.getElementById('qrBranchSelect').value;
  const branch=branches.find(b=>b.id===branchId);
  const slug=org.slug+(branch&&branch.slug!=='main'?'-'+branch.slug:'');
  QRCode.toString(url,{type:'svg',width:500,margin:2,errorCorrectionLevel:'H'},(err,svgStr)=>{
    if(err)return;
    const blob=new Blob([svgStr],{type:'image/svg+xml'});
    const burl=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=burl;a.download='qr-'+slug+'.svg';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(burl),1000);
  });
}
function qrCopy(){
  const url=getCurrentQrUrl();
  const btn=document.getElementById('qrCopyBtn');
  navigator.clipboard.writeText(url).then(()=>{btn.textContent='Copied!';setTimeout(()=>btn.textContent='Copy link',1500);});
}

/* ANALYTICS */
async function loadAnalytics(){
  try{
    const data=await api('GET','/api/analytics/summary');
    document.getElementById('anToday').textContent=data.today;
    document.getElementById('anWeek').textContent=data.week;
    document.getElementById('anMonth').textContent=data.month;
    document.getElementById('anQR').textContent=data.qrScans;
    
    const maxViews=Math.max(...data.branches.map(b=>b.views), 1);
    if(data.branches.length===0){
      document.getElementById('branchStats').innerHTML='<div class="loading-msg" style="padding:14px">No views yet</div>';
    } else {
      document.getElementById('branchStats').innerHTML=data.branches.map(b=>`
        <div class="bar-row">
          <div class="bar-name">${b.branchName}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(b.views/maxViews*100).toFixed(0)}%"></div></div>
          <div class="bar-num">${b.views}</div>
        </div>
      `).join('');
    }
  }catch(e){
    document.getElementById('branchStats').innerHTML='<div class="loading-msg" style="padding:14px">Failed to load</div>';
  }
}

/* INIT */
if(token&&org){startApp();}
else{document.getElementById('authScreen').style.display='';}
