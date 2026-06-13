
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

// Auth DOM
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
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
        id: device.id || fallbackId || `bt_${Date.now()}`,
        connectedAt: device.connectedAt || new Date().toISOString()
    };

    normalizedDevice.name = getFriendlyDeviceName(normalizedDevice);
    normalizedDevice.type = normalizedDevice.type || getDeviceType(normalizedDevice.name);

    return normalizedDevice;
}

// Bluetooth Simulator & Real API
function runSimulator() {
    const iconContainer = addDeviceBtn.querySelector('.action-icon');
            optionalServices: ['battery_service', 'heart_rate'] // Servizi BLE standard
        });
        
        // Determina il tipo dal nome
        let devType = 'audio';
        const nameLower = (device.name || '').toLowerCase();
        if(nameLower.includes('watch') || nameLower.includes('band') || nameLower.includes('fit') || nameLower.includes('tracker')) {
            devType = 'tracker';
        }
        const friendlyName = getFriendlyDeviceName(device);
        const devType = getDeviceType(friendlyName);
        
        const newDevice = {
            id: device.id || 'bt_' + Date.now(),
            name: device.name || 'Dispositivo Sconosciuto',
            name: friendlyName,
            rawName: device.name || '',
            type: devType,
            connectedAt: new Date().toISOString()
        };

// Save Device (Per-User)
async function saveDevice(device) {
    appState.devices.push(device);
    device = normalizeDeviceRecord(device);
    const existingIndex = appState.devices.findIndex((savedDevice) => savedDevice.id === device.id);
    if (existingIndex >= 0) {
        appState.devices[existingIndex] = device;
    } else {
        appState.devices.push(device);
    }
