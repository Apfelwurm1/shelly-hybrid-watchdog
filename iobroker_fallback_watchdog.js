// === DYNAMISCHER IOBROKER FALLBACK WATCHDOG FÜR SHELLY GEN3 & GEN4 ===
// Dieses Skript läuft in ioBroker (JavaScript-Adapter) und überwacht automatisch
// alle Shellys im Netzwerk, die Heartbeats an ioBroker senden. 
// Es sind keine manuellen IP- oder ID-Konfigurationen pro Gerät nötig.

const TIMEOUT_MS = 90000;          // 90 Sekunden ohne Lebenszeichen -> Shelly gilt als offline/gehängt
const FALLBACK_DURATION_SEC = 60; // Standardlaufzeit für das Licht bei Bewegung im Fallback-Modus (Sekunden)
const LUX_THRESHOLD = 30;          // Standard-Helligkeitsschwelle

let deviceTimers = {};             // Speichert die Ausschalt-Timer pro Shelly
let activeWatchdogs = {};          // Speichert die Watchdog-Intervalle pro Shelly

// 1. DYNAMISCHES LAUSCHEN AUF ALLE HEARTBEATS
// Erkennt automatisch neue Shellys unter 0_userdata.0.Shelly.<DeviceID>.Heartbeat
on({ id: /^0_userdata\.0\.Shelly\.[^.]+\.Heartbeat$/, change: "any" }, (obj) => {
    let stateId = obj.id; // z.B. "0_userdata.0.Shelly.shelly1pmminig3-28372f24e8a4.Heartbeat"
    let parts = stateId.split('.');
    let devId = parts[3]; // Extrahiert "shelly1pmminig3-28372f24e8a4"
    
    // Fallback-Zustand für dieses Gerät dynamisch anlegen, falls noch nicht vorhanden
    let fallbackActiveId = "0_userdata.0.Shelly." + devId + ".FallbackActive";
    if (!existsState(fallbackActiveId)) {
        createState(fallbackActiveId, false, { type: 'boolean', name: 'Fallback Aktiv für ' + devId, role: 'state' }, () => {
            setupWatchdog(devId, stateId, fallbackActiveId);
        });
    } else {
        setupWatchdog(devId, stateId, fallbackActiveId);
    }
});

// Watchdog einrichten, um Ausfall des Shelly-Skripts zu erkennen
function setupWatchdog(devId, heartbeatId, fallbackActiveId) {
    if (activeWatchdogs[devId]) return; // Watchdog läuft bereits für diesen Shelly
    
    activeWatchdogs[devId] = setInterval(() => {
        let lastHeartbeat = getState(heartbeatId).val;
        let now = Date.now();
        
        if (!lastHeartbeat || (now - lastHeartbeat) > TIMEOUT_MS) {
            // Shelly meldet sich nicht mehr -> Fallback aktivieren
            if (!getState(fallbackActiveId).val) {
                setState(fallbackActiveId, true, true);
                log("Shelly " + devId + " antwortet nicht mehr! Fallback-Steuerung AKTIVIERT.", "warn");
            }
        } else {
            // Shelly sendet wieder Heartbeats -> Fallback deaktivieren
            if (getState(fallbackActiveId).val) {
                setState(fallbackActiveId, false, true);
                log("Shelly " + devId + " läuft wieder normal. Fallback-Steuerung DEAKTIVIERT.", "info");
            }
        }
    }, 10000); // Alle 10 Sek. prüfen
}

// 2. DYNAMISCHES SCHALTEN BEI BEWEGUNG (NUR BEI AKTIVEM FALLBACK)
// Reagiert auf alle Bewegungsmelder-Events der im ioBroker registrierten Shellys
on({ id: /^shelly\.[0-9]+\.[^.]+\.value$/, change: "ne" }, (obj) => {
    // Nur reagieren, wenn es sich um den Bewegungsmelder (ID 202) handelt
    if (obj.id.indexOf("bthomesensor#202.value") === -1) return;
    
    let motion = obj.state.val;
    if (!motion) return; // Nur beim Erkennen von Bewegung einschalten (nicht beim Ausgehen)
    
    // Datenpunkt-Pfad zusammensetzen (z.B. "shelly.0.shelly1pmminig3#28372f24e8a4#1")
    let stateParts = obj.id.split('.');
    let shellyDevicePath = stateParts[0] + "." + stateParts[1] + "." + stateParts[2];
    
    // MAC-Adresse extrahieren und in das Dynamic-ID Format umwandeln (z.B. "shelly1pmminig3-28372f24e8a4")
    let mac = stateParts[2].split('#')[1];
    let devId = "shelly1pmminig3-" + mac;
    let fallbackActiveId = "0_userdata.0.Shelly." + devId + ".FallbackActive";
    
    // Prüfen, ob der Fallback-Modus für diesen Shelly active ist
    if (!existsState(fallbackActiveId) || !getState(fallbackActiveId).val) return;
    
    // Helligkeits-Wert (Lux) vom Sensor (ID 201) abfragen
    let luxId = shellyDevicePath + ".bthomesensor#201.value";
    let lux = existsState(luxId) ? getState(luxId).val : null;
    
    if (lux === null || lux < LUX_THRESHOLD) {
        let switchId = shellyDevicePath + ".Relay0.Switch";
        log("Fallback für " + devId + ": Bewegung erkannt & Lux passt -> Schalte Licht AN");
        setState(switchId, true);
        
        // Timer für das Ausschalten setzen/verlängern
        if (deviceTimers[devId]) clearTimeout(deviceTimers[devId]);
        deviceTimers[devId] = setTimeout(() => {
            log("Fallback für " + devId + ": Timer abgelaufen -> Schalte Licht AUS");
            setState(switchId, false);
            delete deviceTimers[devId];
        }, FALLBACK_DURATION_SEC * 1000);
    }
});

log("Dynamischer Shelly-Fallback-Watchdog geladen!");
