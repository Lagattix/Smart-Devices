// State
let appState = {
    devices: [],
    spotifyToken: null,
    activeDevice: null,
    currentUser: null
};

// DOM Elements
const views = {
    dashboard: document.getElementById('view-dashboard'),
    settings: document.getElementById('view-settings')
};
const navItems = document.querySelectorAll('.nav-item[data-view]'); // Solo quelli con data-view
const addDeviceBtn = document.getElementById('add-device-btn');
const devicesList = document.getElementById('devices-list');

const deviceTypeLabels = {
    tracker: 'Tracker Salute',
    audio: 'Audio / Speaker',
    bluetooth: 'Bluetooth'
};

const deviceTypeIcons = {
    tracker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>',
    bluetooth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"></polyline></svg>'
};
const nativeBleServices = {
    battery: '0000180f-0000-1000-8000-00805f9b34fb',
    heartRate: '0000180d-0000-1000-8000-00805f9b34fb'
};

// Auth DOM
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const loginContainer = document.getElementById('login-form-container');
const signupContainer = document.getElementById('signup-form-container');

// Forms
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const settingsForm = document.getElementById('settings-form');

// Inputs
const spClientIdInput = document.getElementById('sp-clientid');

// Dashboard Elements
const bpmVal = document.getElementById('bpm-val');
const stressVal = document.getElementById('stress-val');
const sleepVal = document.getElementById('sleep-val');
const userEmailDisplay = document.getElementById('user-email-display');

// Toggle Login / Signup View
document.getElementById('show-signup').addEventListener('click', () => {
    loginContainer.classList.add('hidden');
    signupContainer.classList.remove('hidden');
});
document.getElementById('show-login').addEventListener('click', () => {
    signupContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
});

// Navigation Logic
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        const targetView = item.getAttribute('data-view');
        
        Object.keys(views).forEach(key => {
            views[key].classList.add('hidden');
        });
        if(views[targetView]) {
            views[targetView].classList.remove('hidden');
        }
    });
});

// Load Settings
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('smartHubSettings') || '{}');
    if(settings.spClientId) spClientIdInput.value = settings.spClientId;
    return settings;
}

// Save Settings
settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const settings = {
        spClientId: spClientIdInput.value
    };
    localStorage.setItem('smartHubSettings', JSON.stringify(settings));
    alert('Impostazioni salvate con successo!');
});

// Firebase Init
let db;
let auth;
function initFirebase() {
    // Configurazione Hardcoded
    const firebaseConfig = {
        apiKey: "AIzaSyAd7L7tuQebHWBRsGdyYCfPuBpOmXykRgw",
        authDomain: "chill-chat-c2102.firebaseapp.com",
        databaseURL: "https://chill-chat-c2102-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "chill-chat-c2102",
        storageBucket: "chill-chat-c2102.firebasestorage.app",
        messagingSenderId: "422354667072",
        appId: "1:422354667072:web:2adcea70879d45f71001a5"
    };
    
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        auth = firebase.auth();
        console.log("Firebase Inizializzato");
        setupAuthListener();
        return true;
    } catch (e) {
        console.error("Errore inizializzazione Firebase:", e);
        return false;
    }
}

// Auth Listener
function setupAuthListener() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            // Loggato
            appState.currentUser = user;
            authScreen.classList.add('hidden');
            appContainer.classList.remove('hidden');
            userEmailDisplay.innerText = user.email.split('@')[0];
            loadDevicesFromFirebase();
        } else {
            // Disconnesso
            appState.currentUser = null;
            appContainer.classList.add('hidden');
            authScreen.classList.remove('hidden');
        }
    });
}

// Auth Actions
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!auth) return;
    const email = document.getElementById('signup-email').value;
    const pwd = document.getElementById('signup-pwd').value;
    try {
        await auth.createUserWithEmailAndPassword(email, pwd);
    } catch(err) {
        alert("Errore registrazione: " + err.message);
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!auth) return;
    const email = document.getElementById('login-email').value;
    const pwd = document.getElementById('login-pwd').value;
    try {
        await auth.signInWithEmailAndPassword(email, pwd);
    } catch(err) {
        alert("Errore accesso: " + err.message);
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    if(auth) auth.signOut();
});

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function getDeviceType(deviceName = '') {
    const nameLower = deviceName.toLowerCase();

    if (nameLower.includes('watch') || nameLower.includes('band') || nameLower.includes('fit') || nameLower.includes('tracker')) {
        return 'tracker';
    }

    if (nameLower.includes('airpods') || nameLower.includes('buds') || nameLower.includes('headphone') || nameLower.includes('speaker') || nameLower.includes('audio') || nameLower.includes('sony') || nameLower.includes('jbl')) {
        return 'audio';
    }

    return 'bluetooth';
}

function getFriendlyDeviceName(device) {
    const advertisedName = (device && device.name || '').trim();
    if (advertisedName && advertisedName.toLowerCase() !== 'dispositivo sconosciuto') return advertisedName;

    const shortId = (device && device.id || '').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase();
    return shortId ? `Dispositivo Bluetooth ${shortId}` : `Dispositivo Bluetooth ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
}

function normalizeDeviceRecord(device, fallbackId) {
    const normalizedDevice = {
        ...device,
        id: device.id || device.deviceId || fallbackId || `bt_${Date.now()}`,
        connectedAt: device.connectedAt || new Date().toISOString()
    };

    normalizedDevice.name = getFriendlyDeviceName(normalizedDevice);
    normalizedDevice.type = normalizedDevice.type || getDeviceType(normalizedDevice.name);

    return normalizedDevice;
}

function getNativeBluetoothPlugin() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BluetoothLe;
}

async function requestNativeBluetoothDevice() {
    const bluetooth = getNativeBluetoothPlugin();
    if (!bluetooth) return false;

    await bluetooth.initialize({ androidNeverForLocation: true });

    try {
        const enabled = await bluetooth.isEnabled();
        const isBluetoothOn = enabled === true || enabled.value === true || enabled.enabled === true;
        if (!isBluetoothOn) {
            await bluetooth.requestEnable();
        }
    } catch (error) {
        console.warn("Impossibile verificare lo stato Bluetooth:", error);
    }

    if (bluetooth.setDisplayStrings) {
        await bluetooth.setDisplayStrings({
            scanning: 'Ricerca dispositivi...',
            cancel: 'Annulla',
            availableDevices: 'Dispositivi disponibili',
            noDeviceFound: 'Nessun dispositivo trovato'
        });
    }

    const device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [nativeBleServices.battery, nativeBleServices.heartRate]
    });

    await bluetooth.connect({ deviceId: device.deviceId });

    const friendlyName = getFriendlyDeviceName({
        id: device.deviceId,
        name: device.name || device.localName
    });
    const devType = getDeviceType(friendlyName);

    const newDevice = {
        id: device.deviceId,
        name: friendlyName,
        rawName: device.name || device.localName || '',
        type: devType,
        source: 'capacitor-ble',
        connectedAt: new Date().toISOString()
    };

    saveDevice(newDevice);
    if(devType === 'tracker') simulateHealthData();
    document.querySelector('[data-view="dashboard"]').click();
    return true;
}

// Bluetooth Simulator & Real API
function runSimulator() {
    const iconContainer = addDeviceBtn.querySelector('.action-icon');
    iconContainer.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21.5 2v6h-6M2.13 15.57a9 9 0 1 0 3.84-10.36L2 8"/></svg>';
    
    setTimeout(() => {
        const types = ['tracker', 'audio'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        const newDevice = {
            id: 'bt_' + Date.now(),
            name: type === 'tracker' ? 'SmartBand Pro X' : 'Sony Audio WH-1000',
            type: type,
            connectedAt: new Date().toISOString()
        };
        
        saveDevice(newDevice);
        
        // Reset bottone
        iconContainer.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        
        if(type === 'tracker') simulateHealthData();
        
        // Vai alla Home per vederlo
        document.querySelector('[data-view="dashboard"]').click();
    }, 2000);
}

addDeviceBtn.addEventListener('click', async () => {
    try {
        const handledByNativeBluetooth = await requestNativeBluetoothDevice();
        if (handledByNativeBluetooth) return;
    } catch (error) {
        console.error("Errore Bluetooth nativo:", error);
        alert("Errore Bluetooth nativo: " + (error.message || "connessione non riuscita"));
        return;
    }

    // Il Web Bluetooth richiede protocollo HTTPS o Localhost. Su file:// spesso è disabilitato.
    if (!navigator.bluetooth) {
        alert("Il tuo browser blocca il Bluetooth aprendo il file localmente (richiede HTTPS). Avvio simulazione temporanea...");
        runSimulator();
        return;
    }

    try {
        // Richiama il menu nativo del browser
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['battery_service', 'heart_rate'] // Servizi BLE standard
        });
        
        const friendlyName = getFriendlyDeviceName(device);
        const devType = getDeviceType(friendlyName);
        
        const newDevice = {
            id: device.id || 'bt_' + Date.now(),
            name: friendlyName,
            rawName: device.name || '',
            type: devType,
            connectedAt: new Date().toISOString()
        };
        
        saveDevice(newDevice);
        if(devType === 'tracker') simulateHealthData();
        document.querySelector('[data-view="dashboard"]').click();

    } catch (error) {
        console.error("Errore Bluetooth:", error);
        if (error.name === 'NotFoundError') {
            // L'utente ha chiuso il menu senza selezionare nulla
            return;
        } else if (error.name === 'SecurityError') {
            alert("Sicurezza: devi pubblicare l'app su GitHub Pages per usare il Bluetooth reale. Avvio simulazione...");
            runSimulator();
        } else {
            alert("Errore Bluetooth: " + error.message + ". Avvio simulazione...");
            runSimulator();
        }
    }
});

// Aggiungiamo animazione spin per il loader
const style = document.createElement('style');
style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`;
document.head.appendChild(style);

// Save Device (Per-User)
async function saveDevice(device) {
    device = normalizeDeviceRecord(device);
    const existingIndex = appState.devices.findIndex((savedDevice) => savedDevice.id === device.id);
    if (existingIndex >= 0) {
        appState.devices[existingIndex] = device;
    } else {
        appState.devices.push(device);
    }
    renderDevices();
    
    if (db && appState.currentUser) {
        try {
            await db.collection("users").doc(appState.currentUser.uid).collection("devices").doc(device.id).set(device);
        } catch (e) {
            console.error("Errore salvataggio Firebase", e);
        }
    }
    alert(`Dispositivo configurato: ${device.name}`);
}

async function deleteDevice(deviceId) {
    const device = appState.devices.find((savedDevice) => savedDevice.id === deviceId);
    if (!device) return;

    const confirmed = confirm(`Eliminare ${device.name}?`);
    if (!confirmed) return;

    appState.devices = appState.devices.filter((savedDevice) => savedDevice.id !== deviceId);
    renderDevices();

    if (db && appState.currentUser) {
        try {
            await db.collection("users").doc(appState.currentUser.uid).collection("devices").doc(deviceId).delete();
        } catch (e) {
            console.error("Errore eliminazione Firebase", e);
            alert("Dispositivo rimosso dalla schermata, ma non sono riuscito a cancellarlo dal cloud.");
        }
    }
}

devicesList.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('.btn-delete-device');
    if (!deleteButton) return;
    deleteDevice(deleteButton.dataset.deviceId);
});

function renderDevices() {
    devicesList.innerHTML = '';
    if (appState.devices.length === 0) {
        devicesList.innerHTML = '<div class="empty-state">Nessun dispositivo configurato. Clicca sul pulsante "+" in basso.</div>';
        return;
    }

    appState.devices.forEach(dev => {
        const deviceType = dev.type || 'bluetooth';
        const typeClass = deviceType === 'tracker' ? 'badge-tracker' : deviceType === 'audio' ? 'badge-audio' : 'badge-bluetooth';
        devicesList.innerHTML += `
            <div class="device-item">
                <div class="device-item-info">
                    <div class="device-icon">
                        ${deviceTypeIcons[deviceType] || deviceTypeIcons.bluetooth}
                    </div>
                    <div class="device-details">
                        <h4>${escapeHtml(dev.name)}</h4>
                        <p>Connesso il ${new Date(dev.connectedAt).toLocaleDateString()}</p>
                    </div>
                </div>
                <div class="device-actions">
                    <span class="device-type-badge ${typeClass}">
                        ${deviceTypeLabels[deviceType] || deviceTypeLabels.bluetooth}
                    </span>
                    <button type="button" class="btn-delete-device" data-device-id="${escapeHtml(dev.id)}" aria-label="Elimina ${escapeHtml(dev.name)}" title="Elimina dispositivo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
                    </button>
                </div>
            </div>
        `;
    });
}

// Load per-user devices
function loadDevicesFromFirebase() {
    if(!db || !appState.currentUser) return;
    
    db.collection("users").doc(appState.currentUser.uid).collection("devices").get().then((querySnapshot) => {
        appState.devices = [];
        querySnapshot.forEach((doc) => {
            appState.devices.push(normalizeDeviceRecord(doc.data(), doc.id));
        });
        renderDevices();
    });
}

// Simulate Health Data
function simulateHealthData() {
    setInterval(() => {
        const baseBpm = 75;
        bpmVal.innerText = baseBpm + Math.floor(Math.random() * 15) - 5;
        stressVal.innerText = (Math.floor(Math.random() * 30) + 20) + '%';
        sleepVal.innerText = '7.5h';
    }, 2000);
}

// Spotify Logic
const spotifyLoginBtn = document.getElementById('spotify-login-btn');
const spotifyLoginSection = document.getElementById('spotify-login-section');
const spotifyPlayerSection = document.getElementById('spotify-player-section');

spotifyLoginBtn.addEventListener('click', () => {
    const settings = loadSettings();
    if(!settings.spClientId) {
        document.querySelector('[data-view="settings"]').click();
        return alert("Inserisci prima il Client ID di Spotify!");
    }
    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${settings.spClientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user-read-playback-state%20user-modify-playback-state`;
    window.location.href = authUrl;
});

function checkSpotifyAuth() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
        appState.spotifyToken = hash.split('&')[0].split('=')[1];
        window.history.pushState("", document.title, window.location.pathname);
        spotifyLoginSection.classList.add('hidden');
        spotifyPlayerSection.classList.remove('hidden');
        fetchSpotifyPlayback();
    }
}

async function fetchSpotifyPlayback() {
    if (!appState.spotifyToken) return;
    try {
        const res = await fetch('https://api.spotify.com/v1/me/player', {
            headers: { 'Authorization': 'Bearer ' + appState.spotifyToken }
        });
        if(res.status === 200) {
            const data = await res.json();
            document.getElementById('track-name').innerText = data.item.name;
            document.getElementById('artist-name').innerText = data.item.artists[0].name;
            if(data.item.album.images.length > 0) {
                document.getElementById('album-art').style.backgroundImage = `url(${data.item.album.images[0].url})`;
            }
        }
    } catch(e) { console.error("Spotify Fetch Error", e); }
}

document.getElementById('sp-play-pause').addEventListener('click', () => {
    if(appState.spotifyToken) {
        fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + appState.spotifyToken }
        });
    } else {
        alert("Simulazione: Riproduzione avviata");
    }
});

// Init App
function initApp() {
    loadSettings();
    initFirebase();
    checkSpotifyAuth();
}

initApp();
