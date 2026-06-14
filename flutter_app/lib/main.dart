import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:permission_handler/permission_handler.dart';

void main() {
  runApp(const SmartDevicesApp());
}

enum DeviceKind { tracker, audio, bluetooth }

class SmartDevicesApp extends StatelessWidget {
  const SmartDevicesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'SmartHub',
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF3B82F6),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        cardTheme: CardThemeData(
          color: const Color(0xFF1E293B),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: Colors.white12),
          ),
        ),
        useMaterial3: true,
      ),
      home: const DashboardPage(),
    );
  }
}

class ConnectedDevice {
  ConnectedDevice({
    required this.device,
    required this.name,
    required this.kind,
  });

  final BluetoothDevice device;
  final String name;
  final DeviceKind kind;
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  final List<ScanResult> _scanResults = [];
  final List<ConnectedDevice> _connectedDevices = [];
  StreamSubscription<List<ScanResult>>? _scanSubscription;
  StreamSubscription<bool>? _scanStateSubscription;
  bool _isScanning = false;
  String _status = 'Pronto per cercare orologi, band e sensori BLE';

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

    final bluetoothResults = await <Permission>[
      Permission.bluetoothScan,
      Permission.bluetoothConnect,
    ].request();

    final deniedBluetooth = bluetoothResults.entries
        .where((entry) => !entry.value.isGranted)
        .map((entry) => entry.key)
        .toList();

    if (deniedBluetooth.isNotEmpty) {
      final permanentlyDenied = bluetoothResults.values.any(
        (status) => status.isPermanentlyDenied,
      );
      if (permanentlyDenied) {
        throw Exception(
          'Apri Impostazioni app e abilita "Dispositivi nelle vicinanze"',
        );
      }

      throw Exception('Permessi Bluetooth non concessi');
    }

    await Permission.locationWhenInUse.request();
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

  Future<void> _handleDeviceAction(ScanResult result) async {
    final name = _deviceName(result);
    final kind = _deviceKind(name);

    if (kind == DeviceKind.audio) {
      setState(() {
        _status =
            '$name sembra una cassa/cuffia Bluetooth classica: abbinala dalle Impostazioni Bluetooth Android, poi usa Spotify.';
      });
      return;
    }

    await _connect(result);
  }

  Future<void> _connect(ScanResult result) async {
    final device = result.device;
    final name = _deviceName(result);
    final kind = _deviceKind(name);

    try {
      setState(() => _status = 'Connessione BLE a $name...');
      await device.connect(
        license: License.nonprofit,
        timeout: const Duration(seconds: 30),
      );

      if (!mounted) return;
      setState(() {
        _connectedDevices.removeWhere(
          (item) => item.device.remoteId == device.remoteId,
        );
        _connectedDevices.add(
          ConnectedDevice(device: device, name: name, kind: kind),
        );
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
          _connectedDevices.add(
            ConnectedDevice(device: device, name: name, kind: kind),
          );
          _status = '$name gia connesso';
        });
        return;
      }

      final friendlyMessage =
          message.toLowerCase().contains('timed out') ||
              message.toLowerCase().contains('fbp-code: 1')
          ? '$name non ha accettato la connessione BLE. Se e una cassa/cuffia, abbinala dalle Impostazioni Bluetooth Android.'
          : 'Connessione fallita: $message';

      if (!mounted) return;
      setState(() => _status = friendlyMessage);
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

  DeviceKind _deviceKind(String name) {
    final value = name.toLowerCase();
    if (value.contains('watch') ||
        value.contains('band') ||
        value.contains('fit') ||
        value.contains('tracker') ||
        value.contains('mi smart') ||
        value.contains('galaxy watch')) {
      return DeviceKind.tracker;
    }

    if (value.contains('speaker') ||
        value.contains('audio') ||
        value.contains('cassa') ||
        value.contains('jbl') ||
        value.contains('sony') ||
        value.contains('buds') ||
        value.contains('airpods') ||
        value.contains('headphone') ||
        value.contains('wh-') ||
        value.contains('wf-')) {
      return DeviceKind.audio;
    }

    return DeviceKind.bluetooth;
  }

  List<ScanResult> _resultsFor(DeviceKind kind) {
    return _scanResults
        .where((result) => _deviceKind(_deviceName(result)) == kind)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final trackers = _resultsFor(DeviceKind.tracker);
    final audio = _resultsFor(DeviceKind.audio);
    final other = _resultsFor(DeviceKind.bluetooth);

    return Scaffold(
      appBar: AppBar(
        title: const Text('SmartHub'),
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
            _WelcomeCard(
              status: _status,
              isScanning: _isScanning,
              onScan: _isScanning ? _stopScan : _startScan,
            ),
            const SizedBox(height: 14),
            const _DashboardCards(),
            const SizedBox(height: 18),
            _SectionTitle(
              title: 'Dispositivi collegati',
              count: _connectedDevices.length,
            ),
            const SizedBox(height: 8),
            if (_connectedDevices.isEmpty)
              const _EmptyState(text: 'Nessun dispositivo BLE collegato')
            else
              ..._connectedDevices.map(
                (item) => _ConnectedTile(
                  device: item,
                  onDelete: () => _removeDevice(item),
                ),
              ),
            const SizedBox(height: 20),
            _DeviceGroup(
              title: 'Orologi e tracker',
              subtitle: 'Band, smartwatch e sensori salute BLE',
              kind: DeviceKind.tracker,
              results: trackers,
              onAction: _handleDeviceAction,
            ),
            const SizedBox(height: 14),
            _DeviceGroup(
              title: 'Casse e audio',
              subtitle:
                  'Le casse classiche si collegano dalle Impostazioni Android',
              kind: DeviceKind.audio,
              results: audio,
              onAction: _handleDeviceAction,
            ),
            const SizedBox(height: 14),
            _DeviceGroup(
              title: 'Altri Bluetooth BLE',
              subtitle: 'Sensori e dispositivi BLE generici',
              kind: DeviceKind.bluetooth,
              results: other,
              onAction: _handleDeviceAction,
            ),
          ],
        ),
      ),
    );
  }
}

class _WelcomeCard extends StatelessWidget {
  const _WelcomeCard({
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
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.hub, color: Color(0xFF60A5FA), size: 30),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Benvenuto in SmartHub',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'Salute, Bluetooth e Spotify in una sola app.',
                        style: TextStyle(color: Colors.blueGrey.shade200),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(status, style: Theme.of(context).textTheme.bodyMedium),
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

class _DashboardCards extends StatelessWidget {
  const _DashboardCards();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: const [
        _InfoCard(
          icon: Icons.favorite,
          color: Color(0xFFF87171),
          title: 'Salute e orologi',
          body:
              'Collega band e smartwatch BLE per vedere dispositivi salute e tracker.',
        ),
        SizedBox(height: 10),
        _InfoCard(
          icon: Icons.speaker,
          color: Color(0xFF34D399),
          title: 'Casse e cuffie',
          body:
              'Per audio Bluetooth classico usa le Impostazioni Android; qui le distingui dalla lista BLE.',
        ),
        SizedBox(height: 10),
        _InfoCard(
          icon: Icons.music_note,
          color: Color(0xFF1DB954),
          title: 'Spotify',
          body:
              'Dopo aver collegato una cassa al telefono, apri Spotify e scegli quel dispositivo come uscita audio.',
        ),
      ],
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.18),
              foregroundColor: color,
              child: Icon(icon),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    body,
                    style: TextStyle(
                      color: Colors.blueGrey.shade200,
                      fontSize: 12.5,
                    ),
                  ),
                ],
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

class _DeviceGroup extends StatelessWidget {
  const _DeviceGroup({
    required this.title,
    required this.subtitle,
    required this.kind,
    required this.results,
    required this.onAction,
  });

  final String title;
  final String subtitle;
  final DeviceKind kind;
  final List<ScanResult> results;
  final ValueChanged<ScanResult> onAction;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionTitle(title: title, count: results.length),
        const SizedBox(height: 3),
        Text(subtitle, style: TextStyle(color: Colors.blueGrey.shade200)),
        const SizedBox(height: 8),
        if (results.isEmpty)
          _EmptyState(text: 'Nessun dispositivo in questa categoria')
        else
          ...results.map(
            (result) => _ScanTile(
              name: _deviceName(result),
              id: result.device.remoteId.toString(),
              rssi: result.rssi,
              kind: kind,
              onAction: () => onAction(result),
            ),
          ),
      ],
    );
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
}

class _ConnectedTile extends StatelessWidget {
  const _ConnectedTile({required this.device, required this.onDelete});

  final ConnectedDevice device;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(_kindIcon(device.kind), color: _kindColor(device.kind)),
        title: Text(device.name),
        subtitle: Text(_kindLabel(device.kind)),
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
    required this.kind,
    required this.onAction,
  });

  final String name;
  final String id;
  final int rssi;
  final DeviceKind kind;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final isAudio = kind == DeviceKind.audio;
    return Card(
      child: ListTile(
        leading: Icon(_kindIcon(kind), color: _kindColor(kind)),
        title: Text(name),
        subtitle: Text('${_kindLabel(kind)} - RSSI $rssi'),
        trailing: FilledButton(
          onPressed: onAction,
          child: Text(isAudio ? 'Info' : 'Connetti'),
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
      width: double.infinity,
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

IconData _kindIcon(DeviceKind kind) {
  return switch (kind) {
    DeviceKind.tracker => Icons.watch,
    DeviceKind.audio => Icons.speaker,
    DeviceKind.bluetooth => Icons.bluetooth,
  };
}

Color _kindColor(DeviceKind kind) {
  return switch (kind) {
    DeviceKind.tracker => const Color(0xFFF87171),
    DeviceKind.audio => const Color(0xFF34D399),
    DeviceKind.bluetooth => const Color(0xFF60A5FA),
  };
}

String _kindLabel(DeviceKind kind) {
  return switch (kind) {
    DeviceKind.tracker => 'Orologio / Tracker',
    DeviceKind.audio => 'Cassa / Audio',
    DeviceKind.bluetooth => 'Bluetooth BLE',
  };
}
