# Shelly Gen3 & Gen4 / BLU Motion Hybrid Script with ioBroker Fallback Watchdog

A high-reliability lighting automation system for Shelly Gen3 devices (e.g., Shelly 1PM Mini Gen3) and Bluetooth motion sensors (Shelly BLU Motion), integrated with an ioBroker fallback watchdog.

---

## 🇩🇪 Deutsch

### Funktionsweise
Dieses Projekt kombiniert das Beste aus zwei Welten: **Lokale Ausführung** auf dem Shelly für minimale Latenzzeiten und **zentrale Ausfallsicherheit** über ioBroker, falls das lokale Shelly-Skript blockiert oder das Gerät die Verbindung verliert.

1. **Normalbetrieb (Shelly-Skript):** Das Skript läuft direkt auf dem Shelly. Bewegungs- und Helligkeitsdaten werden lokal verarbeitet, was eine nahezu verzögerungsfreie Lichtschaltung ermöglicht. Einstellungen (Lux-Schwellen, Timer-Laufzeiten) werden live aus den Virtuellen Komponenten der Shelly-App ausgelesen.
2. **Watchdog (ioBroker):** Der Shelly sendet alle 30 Sekunden ein Lebenszeichen (Heartbeat) per HTTP-GET an ioBroker.
3. **Fallback-Modus:** Bleibt das Lebenszeichen länger als 90 Sekunden aus, aktiviert ioBroker automatisch die Fallback-Steuerung. ioBroker übernimmt nun die Auswertung des Bewegungsmelders und schaltet das Licht.
4. **Auto-Recovery:** Sobald der Shelly wieder Heartbeats sendet, übergibt ioBroker die Steuerung nahtlos zurück an den Shelly.

---

### Features
*   **Minimale Latenz:** Lokale Auswertung direkt auf dem Shelly.
*   **Virtual UI Integration:** Schwellenwerte für Helligkeit (Lux) und Timer (Bewegung/Manuell) lassen sich bequem per Regler in der Shelly-App einstellen.
*   **Rausgeh-Sperre (Manual Lockout):** Nach manuellem Ausschalten wird die Bewegungserkennung für 4 Sekunden gesperrt, um den Raum ungestört verlassen zu können.
*   **Dynamischer Heartbeat:** Der Shelly ermittelt seine ID beim Booten selbstständig und registriert sich dynamisch im ioBroker. Es ist keine manuelle Geräte-Konfiguration im Shelly-Skript nötig.
*   **Watchdog:** Automatische Umschaltung auf ioBroker-Steuerung bei Skript-Hängern.

---

### Installationsanleitung

#### 1. Shelly einrichten
1. Erstelle auf deinem Shelly Gen3 folgende **Virtuelle Komponenten** (Virtual Components) im Shelly-Webinterface oder der App:
   *   `number:200` -> Lux-Schwelle (Helligkeits-Limit für Automatik)
   *   `number:201` -> Laufzeit Bewegung in Sekunden
   *   `number:202` -> Laufzeit Manuell in Minuten
   *   `text:200` (Optional) -> IP-Adresse des Partner-Geräts (falls `RelayMode = false` genutzt wird)
2. Erstelle ein neues Skript im Shelly-Editor, füge den Inhalt von `shelly_hybrid.js` ein und passe im Konfigurationsbereich (`CFG`) die IP deines ioBrokers an (`ioBrokerIp: "DEINE_IOBROKER_IP"`).
3. Starte das Skript. Es registriert sich automatisch beim ioBroker.

#### 2. ioBroker einrichten
1. Stelle sicher, dass der **simpleAPI-Adapter** installiert ist (Standardport: `8087`).
2. Erstelle ein neues Skript im **ioBroker Javascript-Adapter** und füge den Inhalt von `iobroker_fallback_watchdog.js` ein.
3. Starte das Skript. Die Datenpunkte unter `0_userdata.0.Shelly.<Geräte-ID>` werden beim ersten Heartbeat des Shelly vollautomatisch angelegt.

---

## 🇺🇸 English

### How it works
This project combines **local execution** on the Shelly device for sub-millisecond switching latencies with **central fallback reliability** via ioBroker.

1. **Normal Operation (Shelly Script):** The script runs locally on the Shelly device. Motion and lux values are processed instantly. Settings are read live from Virtual UI components in the Shelly App.
2. **Watchdog (ioBroker):** Every 30 seconds, the Shelly sends a heartbeat HTTP request to ioBroker.
3. **Fallback Mode:** If no heartbeat is received for 90 seconds, ioBroker assumes the script is frozen and automatically activates its fallback watchdog logic to process the motion sensor and switch the relay.
4. **Auto-Recovery:** As soon as heartbeats resume, ioBroker disables the fallback mode and hands control back to the local Shelly script.

---

### Features
*   **Zero Latency:** Local execution directly on the Shelly microchip.
*   **Virtual UI Integration:** Control lux thresholds and timers via sliders in the Shelly App.
*   **Manual Lockout:** Turning the switch off manually disables motion triggering for 4 seconds, allowing you to leave the room.
*   **Dynamic Heartbeat:** The Shelly auto-detects its MAC address/ID on boot. No manual ID configuration is required in the script.
*   **Multi-Device Support:** The ioBroker script dynamically manages watchdogs for any Shelly device sending heartbeats.

---

### Setup Guide

#### 1. Shelly Configuration
1. Create the following **Virtual Components** on your Shelly Gen3 device:
   *   `number:200` -> Lux Threshold
   *   `number:201` -> Motion Time (Seconds)
   *   `number:202` -> Manual Time (Minutes)
   *   `text:200` (Optional) -> IP address of remote Duo light (if `RelayMode = false`)
2. Create a new script on the Shelly device, paste the code from `shelly_hybrid.js`, and update `ioBrokerIp` in the `CFG` block.
3. Start the script. It will begin pinging ioBroker immediately.

#### 2. ioBroker Configuration
1. Ensure the **simpleAPI adapter** is installed (default port: `8087`).
2. Create a new script in the **ioBroker Javascript adapter** and paste the code from `iobroker_fallback_watchdog.js`.
3. Start the script. The states under `0_userdata.0.Shelly.<Device-ID>` will be created automatically on the first heartbeat.

---

## License / Lizenz
Licensed under the **MIT License**. See the [LICENSE](file:///C:/Users/marku/.gemini/antigravity/scratch/shelly-hybrid-watchdog/LICENSE) file for more information.  
Lizenziert unter der **MIT-Lizenz**. Siehe die [LICENSE](file:///C:/Users/marku/.gemini/antigravity/scratch/shelly-hybrid-watchdog/LICENSE)-Datei für weitere Informationen.
