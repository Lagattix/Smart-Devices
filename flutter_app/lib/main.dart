import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:permission_handler/permission_handler.dart';

void main() {
  runApp(const SmartDevicesApp());
}

class SmartDevicesApp extends StatelessWidget {
  const SmartDevicesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Smart Devices',
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF3B82F6),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        useMaterial3: true,
      ),
      home: const DevicesPage(),
    );
  }
}

class ConnectedDevice {
  ConnectedDevice({required this.device, required this.name});

  final BluetoothDevice device;
  final String name;
}

class DevicesPage extends StatefulWidget {
  const DevicesPage({super.key});

  @override
  State<DevicesPage> createState() => _DevicesPageState();
}

class _DevicesPageState extends State<DevicesPage> {
  final List<ScanResult> _scanResults = [];
  final List<ConnectedDevice> _connectedDevices = [];
  StreamSubscription<List<ScanResult>>? _scanSubscription;
  StreamSubscription<bool>? _scanStateSubscription;
  bool _isScanning = false;
  String _status = 'Pronto per cercare dispositivi BLE';

  @override
  void initState() {
    super.initState();
    FlutterBluePlus.setLogLevel(LogLevel.warning, color: false);
    _scanSubscription = FlutterBluePlus.scanResults.listen((results) {
      if (!mounted) return;
      setState(() {
        _scanResults
          ..clear()
          ..addAll(_dedupeResults(results));
      });
    });
    _scanStateSubscription = FlutterBluePlus.isScanning.listen((isScanning) {
      if (!mounted) return;
      setState(() => _isScanning = isScanning);
    });
  }

  @override
  void dispose() {
    _scanSubscription?.cancel();
    _scanStateSubscription?.cancel();
    super.dispose();
  }

  Future<void> _requestPermissions() async {
    if (!Platform.isAndroid) return;

    final permissions = <Permission>[
      Permission.bluetoothScan,
      Permission.bluetoothConnect,
      Permission.locationWhenInUse,
    ];

    final results = await permissions.request();
    final denied = results.entries.where((entry) => !entry.value.isGranted);
    if (denied.isNotEmpty) {
      throw Exception('Permessi Bluetooth non concessi');
    }
  }

  Future<void> _startScan() async {
    try {
      setState(() => _status = 'Controllo Bluetooth...');

      if (!await FlutterBluePlus.isSupported) {
        throw Exception('Bluetooth non supportato da questo telefono');
      }

      await _requestPermissions();

      if (Platform.isAndroid) {
        await FlutterBluePlus.turnOn();
      }

      await FlutterBluePlus.adapterState
          .where((state) => state == BluetoothAdapterState.on)
          .first
          .timeout(const Duration(seconds: 10));

      setState(() {
        _scanResults.clear();
        _status = 'Scansione dispositivi BLE...';
      });

      await FlutterBluePlus.startScan(timeout: const Duration(seconds: 12));
      await FlutterBluePlus.isScanning.where((value) => value == false).first;

      if (!mounted) return;
      setState(() {
        _status = _scanResults.isEmpty
            ? 'Nessun dispositivo BLE trovato'
            : 'Trovati ${_scanResults.length} dispositivi';
      });
    } catch (error) {
      if (!mounted) return;
      setState(
        () => _status = error.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> _stopScan() async {
    await FlutterBluePlus.stopScan();
    if (!mounted) return;
    setState(() => _status = 'Scansione fermata');
  }

  Future<void> _connect(ScanResult result) async {
    final device = result.device;
    final name = _deviceName(result);

    try {
      setState(() => _status = 'Connessione a $name...');
      await device.connect(timeout: const Duration(seconds: 15));

      if (!mounted) return;
      setState(() {
        _connectedDevices.removeWhere(
          (item) => item.device.remoteId == device.remoteId,
        );
        _connectedDevices.add(ConnectedDevice(device: device, name: name));
        _status = '$name connesso';
      });
    } catch (error) {
      final message = error.toString();
      if (message.toLowerCase().contains('already_connected')) {
        if (!mounted) return;
        setState(() {
          _connectedDevices.removeWhere(
            (item) => item.device.remoteId == device.remoteId,
          );
          _connectedDevices.add(ConnectedDevice(device: device, name: name));
          _status = '$name gia connesso';
        });
        return;
      }

      if (!mounted) return;
      setState(() => _status = 'Connessione fallita: $message');
    }
  }

  Future<void> _removeDevice(ConnectedDevice connectedDevice) async {
    try {
      await connectedDevice.device.disconnect();
    } catch (_) {
      // The device may already be disconnected.
    }

    if (!mounted) return;
    setState(() {
      _connectedDevices.remove(connectedDevice);
      _status = '${connectedDevice.name} eliminato';
    });
  }

  List<ScanResult> _dedupeResults(List<ScanResult> results) {
    final byId = <String, ScanResult>{};
    for (final result in results) {
      byId[result.device.remoteId.toString()] = result;
    }
    final deduped = byId.values.toList()
      ..sort((a, b) => b.rssi.compareTo(a.rssi));
    return deduped;
  }

  String _deviceName(ScanResult result) {
    final advName = result.advertisementData.advName.trim();
    final platformName = result.device.platformName.trim();
    if (advName.isNotEmpty) return advName;
    if (platformName.isNotEmpty) return platformName;

    final id = result.device.remoteId.toString();
    final suffix = id.length > 4
        ? id.substring(id.length - 4).toUpperCase()
        : id;
    return 'Dispositivo BLE $suffix';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Smart Devices'),
        actions: [
          IconButton(
            tooltip: _isScanning ? 'Ferma scansione' : 'Scansiona',
            onPressed: _isScanning ? _stopScan : _startScan,
            icon: Icon(
              _isScanning
                  ? Icons.stop_circle_outlined
                  : Icons.bluetooth_searching,
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _HeaderCard(
              status: _status,
              isScanning: _isScanning,
              onScan: _isScanning ? _stopScan : _startScan,
            ),
            const SizedBox(height: 16),
            _SectionTitle(
              title: 'Dispositivi collegati',
              count: _connectedDevices.length,
            ),
            const SizedBox(height: 8),
            if (_connectedDevices.isEmpty)
              const _EmptyState(text: 'Nessun dispositivo collegato')
            else
              ..._connectedDevices.map(
                (item) => _ConnectedTile(
                  device: item,
                  onDelete: () => _removeDevice(item),
                ),
              ),
            const SizedBox(height: 20),
            _SectionTitle(
              title: 'Dispositivi trovati',
              count: _scanResults.length,
            ),
            const SizedBox(height: 8),
            if (_scanResults.isEmpty)
              const _EmptyState(
                text: 'Avvia una scansione per trovare dispositivi BLE',
              )
            else
              ..._scanResults.map(
                (result) => _ScanTile(
                  name: _deviceName(result),
                  id: result.device.remoteId.toString(),
                  rssi: result.rssi,
                  onConnect: () => _connect(result),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({
    required this.status,
    required this.isScanning,
    required this.onScan,
  });

  final String status;
  final bool isScanning;
  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.bluetooth, color: Color(0xFF60A5FA)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    status,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onScan,
                icon: Icon(isScanning ? Icons.stop : Icons.search),
                label: Text(
                  isScanning ? 'Ferma scansione' : 'Cerca dispositivi',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.count});

  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        Text('$count', style: Theme.of(context).textTheme.labelLarge),
      ],
    );
  }
}

class _ConnectedTile extends StatelessWidget {
  const _ConnectedTile({required this.device, required this.onDelete});

  final ConnectedDevice device;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.check_circle, color: Color(0xFF34D399)),
        title: Text(device.name),
        subtitle: Text(device.device.remoteId.toString()),
        trailing: IconButton(
          tooltip: 'Elimina',
          onPressed: onDelete,
          icon: const Icon(Icons.delete_outline, color: Color(0xFFF87171)),
        ),
      ),
    );
  }
}

class _ScanTile extends StatelessWidget {
  const _ScanTile({
    required this.name,
    required this.id,
    required this.rssi,
    required this.onConnect,
  });

  final String name;
  final String id;
  final int rssi;
  final VoidCallback onConnect;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.bluetooth_connected),
        title: Text(name),
        subtitle: Text('$id - RSSI $rssi'),
        trailing: FilledButton(
          onPressed: onConnect,
          child: const Text('Connetti'),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white12),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(color: Colors.blueGrey.shade200),
      ),
    );
  }
}
