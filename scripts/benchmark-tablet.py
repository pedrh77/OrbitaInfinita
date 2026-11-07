"""Reproducible debug-only benchmark. Does not change app data or device power/network settings."""
import argparse
import hashlib
import json
import re
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--adb', default=str(Path.home() / 'AppData/Local/Android/Sdk/platform-tools/adb.exe'))
parser.add_argument('--serial', default='4ZHBB25506200120')
parser.add_argument('--renderer', choices=['canvas', 'pixi'], default='canvas')
parser.add_argument('--scenario', choices=['suite', 'menu', 'start', 'aim', 'flight', 'stress', 'particles', 'long'], default='suite')
parser.add_argument('--quality', choices=['high', 'balanced', 'eco'], default='balanced')
parser.add_argument('--seconds', type=int, default=15)
parser.add_argument('--label', required=True)
parser.add_argument('--background', action='store_true')
parser.add_argument('--redraw', action='store_true', help='Debug-only native vsync invalidation experiment.')
parser.add_argument('--surface', action='store_true', help='Collect app-window presentation timings from SurfaceFlinger.')
parser.add_argument('--no-native-pulse', action='store_true', help='Debug control: disable native presentation synchronization.')
parser.add_argument('--screenshots', action='store_true', help='Capture during measurement; may perturb GPU timing. Off by default.')
parser.add_argument('--apk', type=Path, help='Optional local APK to hash and compare with the installed package.')
args = parser.parse_args()
if not 5 <= args.seconds <= 900:
    parser.error('--seconds must be between 5 and 900')
output = Path(__file__).resolve().parents[1] / 'docs/benchmarks'
output.mkdir(parents=True, exist_ok=True)
if not re.fullmatch(r'[A-Za-z0-9_-]+', args.label):
    parser.error('label must contain only letters, digits, hyphens or underscores')
base = [args.adb, '-s', args.serial]
package = 'com.orbita.infinita.debug'

def adb(*command, timeout=25, check=True):
    result = subprocess.run(base + list(command), capture_output=True, text=True,
                            encoding='utf-8', errors='replace', timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or str(command))
    return result.stdout


def probe(*command):
    """Retain unsupported probe errors instead of treating missing GPU data as zero."""
    try:
        return {'stdout': adb(*command).strip(), 'error': None}
    except Exception as error:
        return {'stdout': None, 'error': str(error)}


def screen_state():
    value = probe('shell', 'dumpsys', 'power')
    raw = value['stdout'] or ''
    wake = re.search(r'mWakefulness=(\w+)', raw)
    display = re.search(r'Display Power:\s*state=(\w+)', raw)
    focus = probe('shell', 'dumpsys', 'window') if wake and wake[1] == 'Awake' else {'stdout': None}
    current = re.search(r'mCurrentFocus=(.+)', focus['stdout'] or '')
    return {'error': value['error'], 'wakefulness': wake[1] if wake else None,
            'display': display[1] if display else None,
            'gameFocused': bool(current and package in current[1]),
            'focusObserved': current is not None,
            'awake': bool(wake and display and wake[1] == 'Awake' and display[1] == 'ON')}


def device_metadata():
    package_path = probe('shell', 'pm', 'path', package)
    paths = re.findall(r'^package:(.+)$', package_path['stdout'] or '', re.MULTILINE)
    installed = []
    for path in paths:
        result = probe('shell', 'sha256sum', path)
        match = re.match(r'^([0-9a-fA-F]{64})\s', result['stdout'] or '')
        installed.append({'path': path, 'sha256': match[1].lower() if match else None, 'probe': result})
    local = None
    if args.apk:
        local = {'path': str(args.apk.resolve()), 'sha256': hashlib.sha256(args.apk.read_bytes()).hexdigest()}
        local['matchesInstalledBase'] = next((item['sha256'] == local['sha256'] for item in installed if item['path'].endswith('/base.apk') and item['sha256']), None)
    return {'model': probe('shell', 'getprop', 'ro.product.model'),
            'manufacturer': probe('shell', 'getprop', 'ro.product.manufacturer'),
            'androidSDK': probe('shell', 'getprop', 'ro.build.version.sdk'),
            'androidRelease': probe('shell', 'getprop', 'ro.build.version.release'),
            'webView': probe('shell', 'dumpsys', 'webviewupdate'),
            'batteryBefore': probe('shell', 'dumpsys', 'battery'),
            'lowPowerBefore': probe('shell', 'settings', 'get', 'global', 'low_power'),
            'installedAPKs': installed, 'packagePathProbe': package_path, 'localAPK': local,
            'measurementScope': {'memoryAndGfxinfo': 'debug application process; WebView renderer may run separately',
                                 'renderPrep': 'JavaScript command preparation; not GPU execution time',
                                 'touchLatency': 'not measured by this runner', 'gpuTime': 'not measured by this runner'},
            'screenCaptureMode': 'during-measurement' if args.screenshots else 'disabled'}

records = []
seen = set()
captured = set()
started = time.monotonic()
status = 'timeout'
raw_logs = ''
pid = ''
device = None
surface_windows = []
surface_started = False
screen_samples = []
try:
    device = device_metadata()
    device['screenBefore'] = screen_state()
    if not device['screenBefore']['awake']:
        raise RuntimeError('Tablet screen is off or locked; unlock it before benchmarking.')
    if args.surface:
        setup = probe('shell', 'dumpsys', 'SurfaceFlinger', '--timestats', '-clear', '-enable')
        surface_started = setup['error'] is None
        device['surfaceSetup'] = setup
    adb('shell', 'am', 'force-stop', package)
    launch = adb('shell', 'am', 'start', '-W', '--windowingMode', '1', '-n', package + '/com.orbita.infinita.MainActivity',
                 '--es', 'orbita.benchmark', args.scenario, '--es', 'orbita.renderer', args.renderer,
                 '--es', 'orbita.quality', args.quality, '--ei', 'orbita.seconds', str(args.seconds),
                 '--ez', 'orbita.force_redraw', str(args.redraw).lower(),
                 '--ez', 'orbita.disable_pulse', str(args.no_native_pulse).lower(), timeout=55)
    benchmark_started = time.monotonic()
    pid = adb('shell', 'pidof', package).strip()
    before_memory = adb('shell', 'dumpsys', 'meminfo', package)
    adb('shell', 'dumpsys', 'gfxinfo', package, 'reset')
    count = 6 if args.scenario == 'suite' else 1
    deadline = time.monotonic() + count * (args.seconds + 3) + 60
    switched = False
    next_screen_check = time.monotonic() + 5
    while time.monotonic() < deadline:
        if time.monotonic() >= next_screen_check:
            state = screen_state()
            screen_samples.append({'elapsedWallSeconds': round(time.monotonic() - benchmark_started, 2), **state})
            next_screen_check = time.monotonic() + 5
            if not state['awake'] or not state['gameFocused']:
                raise RuntimeError('Screen switched off or game lost foreground focus; this run is invalid.')
        raw_logs = adb('logcat', '-d', '--pid=' + pid, '-s', 'OrbitaPerf:I', 'OrbitaBench:I', '*:S')
        for line in raw_logs.splitlines():
            if line in seen:
                continue
            seen.add(line)
            match = re.search(r' (OrbitaPerf|OrbitaBench): (\{.*\})$', line)
            if not match:
                continue
            value = json.loads(match[2]); value['tag'] = match[1]
            records.append(value)
            if value.get('tag') == 'OrbitaPerf':
                print(json.dumps({key: value.get(key) for key in ('scenario', 'renderer', 'fps', 'frameP95', 'frameP99', 'updateP95', 'predictionP95', 'renderPrepP95')}, ensure_ascii=False), flush=True)
                if args.surface:
                    surface_windows.append({'scenario': value.get('scenario'), 'sampleIndex': len(surface_windows),
                        'timings': probe('shell', 'dumpsys', 'SurfaceFlinger', '--latency', package + '/com.orbita.infinita.MainActivity#0')})
                scene = value.get('scenario', 'unknown')
                if args.screenshots and scene not in captured and re.fullmatch(r'[A-Za-z0-9_-]+', scene):
                    image = subprocess.check_output(base + ['exec-out', 'screencap', '-p'], timeout=15)
                    (output / (args.label + '-' + scene + '.png')).write_bytes(image)
                    captured.add(scene)
            else:
                print(json.dumps(value, ensure_ascii=False), flush=True)
            if value.get('type') == 'benchmark-complete' and status != 'error':
                status = 'complete'
            if value.get('type') == 'benchmark-stopped' and status != 'error':
                status = 'stopped'
            if value.get('type') in ('benchmark-error', 'renderer-fallback'):
                status = 'error'
        if status in ('complete', 'error', 'stopped'):
            break
        if args.background and not switched and time.monotonic() - benchmark_started > 12:
            adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
            time.sleep(3)
            adb('shell', 'am', 'start', '-n', package + '/com.orbita.infinita.MainActivity')
            switched = True
        time.sleep(1)
    if status == 'timeout':
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK', check=False)
    metadata = dict(vars(args)); metadata.pop('serial', None); metadata.pop('adb', None)
    metadata['apk'] = str(args.apk) if args.apk else None
    device['surfaceLatencyAfter'] = probe('shell', 'dumpsys', 'SurfaceFlinger', '--latency',
                                        package + '/com.orbita.infinita.MainActivity#0')
    device['surfaceLatencyScope'] = 'last available app-window presentation timestamps, potentially including restored menu; columns are desired/actual/ready nanoseconds, not per-scene GPU time'
    device['batteryAfter'] = probe('shell', 'dumpsys', 'battery')
    if surface_started:
        native = probe('shell', 'dumpsys', 'SurfaceFlinger', '--timestats', '-dump')
        blocks = re.split(r'(?=layerName = )', native['stdout'] or '')
        device['surfaceTimeStats'] = {'error': native['error'], 'appLayers': [block for block in blocks
            if block.startswith('layerName = ') and package in block.splitlines()[0]]}
    device['lowPowerAfter'] = probe('shell', 'settings', 'get', 'global', 'low_power')
    result = {'configuration': metadata, 'status': status, 'records': records, 'logcat': raw_logs,
              'device': device,
              'surfaceWindows': surface_windows,
              'screenSamples': screen_samples,
              'launch': launch, 'memoryBefore': before_memory,
              'memoryAfter': adb('shell', 'dumpsys', 'meminfo', package),
              'gfxinfo': adb('shell', 'dumpsys', 'gfxinfo', package),
              'runtimeErrors': adb('logcat', '-d', '--pid=' + pid, '-s', 'AndroidRuntime:E', 'OrbitaJS:E', '*:S'),
              'durationWallSeconds': round(time.monotonic() - started, 2)}
except (Exception, KeyboardInterrupt) as error:
    result = {'status': 'error', 'message': str(error) or type(error).__name__, 'records': records, 'logcat': raw_logs, 'device': device,
              'screenSamples': screen_samples, 'surfaceWindows': surface_windows}
    status = 'error'
    print(str(error), flush=True)
    # Stop a partially executed diagnostic and restore its captured in-memory state.
    if pid:
        try:
            adb('shell', 'am', 'force-stop', package, check=False)
        except Exception:
            pass
path = output / (args.label + '.json')
if surface_started:
    probe('shell', 'dumpsys', 'SurfaceFlinger', '--timestats', '-disable')
path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(str(path), flush=True)
raise SystemExit(0 if status == 'complete' else 1)
