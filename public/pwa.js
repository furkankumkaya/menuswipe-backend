/**
 * MenuSwipe PWA installer
 * Handles service worker registration + install button logic
 * Auto-shows install banner on Chrome/Edge/Android
 * Detects iOS and shows manual instructions
 */

(function () {
  if (!("serviceWorker" in navigator)) return;
  
  // Register service worker - scope only admin pages, NOT customer menus
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[PWA] Service worker registered");
        
        // Yeni versiyon varsa otomatik aktive et
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // Yeni SW hazır, hemen aktive et
              newWorker.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch((err) => console.warn("[PWA] SW registration failed:", err));
  });
  
  // Install prompt management
  let deferredPrompt = null;
  let installBtn = null;
  
  // Helper: check if already installed
  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }
  
  // iOS detection
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
  
  // Show iOS instructions modal
  function showIOSInstructions() {
    const modal = document.createElement("div");
    modal.id = "pwaIOSModal";
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;
      display:flex;align-items:center;justify-content:center;padding:20px;
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:18px;padding:24px;max-width:340px;width:100%;text-align:center">
        <div style="width:64px;height:64px;border-radius:16px;background:#8E1616;margin:0 auto 16px;display:flex;align-items:center;justify-content:center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M12 16V4M12 4l-4 4M12 4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px">Install MenuSwipe</div>
        <div style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:18px">Add this app to your home screen for quick access to your orders.</div>
        <div style="background:#f1f5f9;border-radius:12px;padding:14px;text-align:left;font-size:13px;color:#1e293b;line-height:1.7;margin-bottom:18px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="background:#8E1616;color:#fff;width:22px;height:22px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</span>
            Tap the <strong>Share</strong> button
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#1e293b"><path d="M16 5l-4-4-4 4M12 1v14M5 12v7h14v-7"/></svg>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="background:#8E1616;color:#fff;width:22px;height:22px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</span>
            Scroll down and tap <strong>Add to Home Screen</strong>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="background:#8E1616;color:#fff;width:22px;height:22px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</span>
            Tap <strong>Add</strong> in the top corner
          </div>
        </div>
        <button onclick="document.getElementById('pwaIOSModal').remove()" style="width:100%;padding:13px;background:#1D1616;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer">Got it</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
  }
  
  // Chrome/Edge: capture install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = "";
  });
  
  // After install
  window.addEventListener("appinstalled", () => {
    console.log("[PWA] App installed");
    deferredPrompt = null;
    if (installBtn) installBtn.style.display = "none";
    // Local storage flag - bir daha gösterme
    try { localStorage.setItem("pwa_installed", "1"); } catch (e) {}
  });
  
  // Trigger install (Chrome/Edge) or show iOS instructions
  window.installPWA = async function () {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        console.log("[PWA] User accepted install");
      }
      deferredPrompt = null;
      if (installBtn) installBtn.style.display = "none";
    } else if (isIOS()) {
      showIOSInstructions();
    } else {
      // Browser desteklemiyor veya zaten yüklü
      alert("To install: open this page in Chrome or Safari and use the browser menu to 'Add to Home Screen'.");
    }
  };
  
  // Mount install button - bir element id'si verilirse oraya yerleşir
  // Otomatik: id="installPwaBtn" varsa onu kullanır
  window.mountInstallButton = function (elementId) {
    const id = elementId || "installPwaBtn";
    const el = document.getElementById(id);
    if (!el) return;
    installBtn = el;
    
    const installedMsg = document.getElementById("pwaInstalledMsg");
    
    // Zaten yüklüyse gizle
    if (isStandalone() || localStorage.getItem("pwa_installed") === "1") {
      el.style.display = "none";
      if (installedMsg) installedMsg.style.display = "";
      return;
    }
    
    // iOS'ta her zaman göster (beforeinstallprompt yok)
    if (isIOS()) {
      el.style.display = "";
    } else if (deferredPrompt) {
      // Chrome/Edge prompt hazırsa göster
      el.style.display = "";
    } else {
      // Henüz prompt gelmedi, gizli kalsın
      el.style.display = "none";
    }
    
    el.onclick = window.installPWA;
  };
  
  // Auto-mount on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.mountInstallButton());
  } else {
    window.mountInstallButton();
  }
})();
