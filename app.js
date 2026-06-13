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
        
        // Determina il tipo dal nome
        let devType = 'audio';
        const nameLower = (device.name || '').toLowerCase();
        if(nameLower.includes('watch') || nameLower.includes('band') || nameLower.includes('fit') || nameLower.includes('tracker')) {
            devType = 'tracker';
        }
        
        const newDevice = {
            id: device.id || 'bt_' + Date.now(),
            name: device.name || 'Dispositivo Sconosciuto',
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
    appState.devices.push(device);
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

function renderDevices() {
    devicesList.innerHTML = '';
    if (appState.devices.length === 0) {
        devicesList.innerHTML = '<div class="empty-state">Nessun dispositivo configurato. Clicca sul pulsante "+" in basso.</div>';
        return;
    }

    appState.devices.forEach(dev => {
        const isTracker = dev.type === 'tracker';
        devicesList.innerHTML += `
            <div class="device-item">
                <div class="device-item-info">
                    <div class="device-icon">
                        ${isTracker 
                            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>'
                            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>'
                        }
                    </div>
                    <div class="device-details">
                        <h4>${dev.name}</h4>
                        <p>Connesso il ${new Date(dev.connectedAt).toLocaleDateString()}</p>
                    </div>
                </div>
                <span class="device-type-badge ${isTracker ? 'badge-tracker' : 'badge-audio'}">
                    ${isTracker ? 'Tracker Salute' : 'Audio / Speaker'}
                </span>
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
            appState.devices.push(doc.data());
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
