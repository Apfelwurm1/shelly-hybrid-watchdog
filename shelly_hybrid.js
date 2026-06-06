// === Shelly Gen3 Gen4 | BLU Motion | HYBRID V4.0 (Virtual Components UI) ===
// NEU:
// - Holt sich die Einstellungen direkt aus deinen virtuellen Komponenten (siehe Screenshot)
// - Manuelle Zeit (ID 202) wird automatisch von Minuten in Sekunden umgerechnet
// - Live-Update: Wenn du in der App den Regler schiebst, übernimmt das Skript das sofort.
// - Fehlerbehebungen: Fehlende stopTimer-Funktion hinzugefügt, Switch.SetConfig Parameter-Struktur korrigiert.

//////////////// KONFIGURATION (Fallback Werte) ////////////////
let CFG = {
  RelayMode: true,            // true=Relais | false=Duo
  LuxTooBright: 150,          // Abbrechen bei Sonne
  LuxOnlyFirst: true,         
  
  // Diese Werte werden normalerweise von den virtuellen Komponenten überschrieben:
  LuxThreshold: 30,           
  MotionTimeSec: 60,         
  ManualTimeSec: 1800,        
  
  FirmwareAutoOffSec: 3600,   // Not-Aus (1h)
  IP_Duo: "192.168.200.121",
  Debug: false,

  BypassLuxForMs: 60000,      // Boot-Ignorier-Zeit
  ManualLockoutMs: 4000,      // Rausgeh-Sperre nach manuellem Aus
  IgnoreLuxAfterOffMs: 300000,// 5 Min Blindzeit nach Ausgehen (Lux-Falle Fix)
  
  // IDs der Sensoren
  IdLux: 201,
  IdMotion: 202,

  // IDs deiner Virtuellen Komponenten (aus dem Screenshot)
  VcIdLux: 200,          // number:200 -> Lux Schwelle
  VcIdMotionTime: 201,   // number:201 -> Laufzeit Bewegung (Sekunden)
  VcIdManualTime: 202,   // number:202 -> Laufzeit Manuell (Minuten!)
  VcIdIpDuo: 200,        // text:200   -> IP Adresse (falls vorhanden)

  // Backup-Konfiguration (ioBroker Fallback):
  ioBrokerIp: "192.168.200.8",             // IP deines ioBrokers (z.B. "192.168.200.8"). Leer lassen zum Deaktivieren.
  ioBrokerPort: 8087,         // Port des simpleAPI-Adapters (8087) oder Web-Adapters (8082)
  ioBrokerUseWeb: false,      // true = nutzt Web-Adapter (/simpleapi/set/), false = simpleAPI-Adapter (/set/)
  HeartbeatDp: "0_userdata.0.Shelly.Heartbeat" // Datenpunkt für das Lebenszeichen
};

// ---- Laufzeit-Variablen ----
let motionActive = false;
let isManualMode = false;   
let manualOffUntil = 0;
let lastLightOffTs = 0;
let lastLux = null;
let timerHandle = null;     
let holdTimer = null;       
let lastInputState = null;  
let bootTs = Date.now();

// ---------- HELPER: Config Sync ----------
// Liest die Werte aus den grafischen Reglern in der App
function syncConfigFromComponents() {
  // 1. Lux Schwelle (ID 200)
  let cLux = Shelly.getComponentStatus("number", CFG.VcIdLux);
  if (cLux && typeof cLux.value === "number") {
    CFG.LuxThreshold = cLux.value;
  }

  // 2. Motion Zeit in Sek (ID 201)
  let cMot = Shelly.getComponentStatus("number", CFG.VcIdMotionTime);
  if (cMot && typeof cMot.value === "number") {
    CFG.MotionTimeSec = cMot.value;
  }

  // 3. Manuelle Zeit in MINUTEN (ID 202) -> Umrechnung in Sekunden
  let cMan = Shelly.getComponentStatus("number", CFG.VcIdManualTime);
  if (cMan && typeof cMan.value === "number") {
    CFG.ManualTimeSec = cMan.value * 60; // Minuten * 60 = Sekunden
  }

  // 4. IP (Optional, text:200)
  // Hinweis: Text-Komponenten sind beim Gen3 manchmal "text", manchmal "script" type,
  // wir prüfen hier einfach sicherheitshalber.
  try {
      let cIp = Shelly.getComponentStatus("text", CFG.VcIdIpDuo); // ID anpassen falls Text ID abweicht
      if (cIp && cIp.value) CFG.IP_Duo = cIp.value;
  } catch(e) {}

  if(CFG.Debug) {
    print("[CFG UPDATE] Lux:", CFG.LuxThreshold, 
          "| Motion:", CFG.MotionTimeSec, "s", 
          "| Manual:", (CFG.ManualTimeSec/60), "min");
  }
}

// ---------- LOGGING ----------
function log(msg, v) { if(CFG.Debug) print("[SCRIPT] " + msg + (v !== undefined ? " " + JSON.stringify(v) : "")); }

// ---------- ACTIONS ----------
function actOn() {
  if (CFG.RelayMode) {
    Shelly.call("Switch.Set", { id: 0, on: true });
    startHoldLoop(); 
  } else {
    Shelly.call("HTTP.GET", { url: "http://" + CFG.IP_Duo + "/light/0?turn=on&brightness=100", timeout: 1 });
  }
  log("TURN ON");
}

function actOff() {
  isManualMode = false;
  motionActive = false;
  lastLightOffTs = Date.now(); 

  if (CFG.RelayMode) {
    stopHoldLoop();
    Shelly.call("Switch.Set", { id: 0, on: false });
  } else {
    Shelly.call("HTTP.GET", { url: "http://" + CFG.IP_Duo + "/light/0?turn=off", timeout: 1 });
  }
  log("TURN OFF");
}

// ---------- TIMER ----------
function startTimer() {
  if (timerHandle) { Timer.clear(timerHandle); timerHandle = null; }
  
  // Hole aktuelle Werte sicherheitshalber nochmal (falls Regler gerade bewegt wurde)
  syncConfigFromComponents();

  let duration = isManualMode ? CFG.ManualTimeSec : CFG.MotionTimeSec;
  
  timerHandle = Timer.set(duration * 1000, false, function() {
    log("Timer abgelaufen (" + duration + "s)");
    timerHandle = null;
    actOff();
  });
  if(CFG.Debug) log("Timer gestartet:", duration + "s");
}

function stopTimer() {
  if (timerHandle) {
    Timer.clear(timerHandle);
    timerHandle = null;
  }
  if(CFG.Debug) log("Timer gestoppt");
}

// ---------- HOLD LOOP ----------
function startHoldLoop() {
  if (!CFG.RelayMode || holdTimer) return;
  holdTimer = Timer.set(3000, true, function() {
    if (!motionActive && !isManualMode) { stopHoldLoop(); return; }
    Shelly.call("Switch.GetStatus", {id:0}, function(res){
      if(res && res.output === false) {
        log("Watchdog: Relais war aus, schalte ein!");
        Shelly.call("Switch.Set", { id: 0, on: true });
      }
    });
  });
}
function stopHoldLoop() { if(holdTimer) { Timer.clear(holdTimer); holdTimer = null; } }

// ---------- LOGIK ----------
function checkLux() {
  let now = Date.now();
  if ((now - bootTs) < CFG.BypassLuxForMs) return true;
  if ((now - lastLightOffTs) < CFG.IgnoreLuxAfterOffMs) {
      log("Lux ignoriert (Grace Period)");
      return true;
  }
  if (lastLux === null) return true;
  return lastLux < CFG.LuxThreshold;
}

function onMotionDetected() {
  if (Date.now() < manualOffUntil) return;

  if (!motionActive && !isManualMode) {
    // ---> NEUSTART (Automatik)
    if (checkLux()) {
      motionActive = true;
      actOn();
      startTimer();
    } else {
      if(CFG.Debug) log("Zu hell (" + lastLux + ")");
    }
  } else {
    // ---> VERLÄNGERUNG
    if (!isManualMode && !CFG.LuxOnlyFirst && lastLux !== null && lastLux > CFG.LuxTooBright) {
       if ((Date.now() - lastLightOffTs) > CFG.IgnoreLuxAfterOffMs) return;
    }
    startTimer();
  }
}

// ---------- SCHALTER ----------
function handleInputEdge() {
  if (motionActive || isManualMode) {
    // -> AUSSCHALTEN
    log("Schalter: Manuell AUS");
    manualOffUntil = Date.now() + CFG.ManualLockoutMs;
    stopTimer();
    actOff(); 
  } else {
    // -> EINSCHALTEN (Manuell Modus)
    log("Schalter: Manuell EIN");
    isManualMode = true;
    actOn();
    startTimer();
  }
}

// ---------- EVENTS ----------
Shelly.addEventHandler(function(ev) {
  if (!ev || !ev.info) return;

  // 1. MOTION
  if (ev.component === "bthomesensor:" + CFG.IdMotion) {
    if (ev.info.value === true || ev.info.value === 1) onMotionDetected();
  }
  // 2. LUX
  else if (ev.component === "bthomesensor:" + CFG.IdLux) {
    if (typeof ev.info.value === "number") lastLux = ev.info.value;
  }
  // 3. INPUT (Kippschalter)
  else if (ev.component === "input:0" && typeof ev.info.state === "boolean") {
    if (lastInputState !== null && lastInputState !== ev.info.state) {
        handleInputEdge();
    }
    lastInputState = ev.info.state;
  }
  // 4. APP / DISPLAY / CLOUD
  else if (ev.component === "switch:0" && typeof ev.info.output === "boolean") {
     let out = ev.info.output;
     if (out === true) {
       if (!motionActive && !isManualMode) {
         log("Externes AN -> Manuell Modus Start");
         isManualMode = true;
         startTimer();
       }
     } else {
       if (motionActive || isManualMode) {
         log("Externes AUS -> Reset");
         isManualMode = false;
         motionActive = false;
         stopTimer();
       }
     }
  }
  // 5. VIRTUELLE KOMPONENTEN (Live Config Update)
  // Wenn du in der App den Regler bewegst, kommt ein Event "number:200", "number:202" etc.
  else if (typeof ev.component === "string" && (ev.component.indexOf("number:") === 0 || ev.component.indexOf("text:") === 0)) {
      // Wir aktualisieren einfach alles, wenn irgendeine Nummer oder Text geändert wurde
      syncConfigFromComponents();
  }
});

// ---------- POLLING BACKUP ----------
Timer.set(2500, true, function() {
  let ls = Shelly.getComponentStatus("bthomesensor", CFG.IdLux);
  if (ls && typeof ls.value === "number") lastLux = ls.value;
  
  if (!motionActive && !isManualMode && (Date.now() > manualOffUntil)) {
     let ms = Shelly.getComponentStatus("bthomesensor", CFG.IdMotion);
     if (ms && (ms.value === true || ms.value === 1)) {
       if(checkLux()) onMotionDetected();
     }
  }
});

// ---------- INIT ----------
if (CFG.RelayMode) {
  Shelly.call("Switch.SetConfig", { id: 0, config: { auto_off: true, auto_off_delay: CFG.FirmwareAutoOffSec } });
}
let curIn = Shelly.getComponentStatus("input", 0);
if(curIn) lastInputState = curIn.state;

// Initiale Konfig laden
syncConfigFromComponents();

// ---------- HEARTBEAT (ioBroker Fallback) ----------
if (CFG.ioBrokerIp && CFG.ioBrokerIp !== "") {
  let devInfo = Shelly.getDeviceInfo();
  let devId = devInfo ? devInfo.id : "unknown";

  Timer.set(30000, true, function() {
    let apiPath = CFG.ioBrokerUseWeb ? "/simpleapi/set/" : "/set/";
    let dp = "0_userdata.0.Shelly." + devId + ".Heartbeat";
    let url = "http://" + CFG.ioBrokerIp + ":" + CFG.ioBrokerPort + apiPath + dp + "?value=" + Date.now();
    Shelly.call("HTTP.GET", { url: url, timeout: 2 }, function(res, err) {
      if (err && CFG.Debug) {
        log("Heartbeat an ioBroker fehlgeschlagen:", err);
      }
    });
  });
}

log("Gestartet V4.0 (UI Integration)");