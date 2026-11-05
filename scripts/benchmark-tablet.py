"""Reproducible debug-only benchmark. Does not change app data or device power/network settings."""
import argparse
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
args = parser.parse_args()
if not 5 <= args.seconds <= 180:
    parser.error('--seconds must be between 5 and 180')
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

records = []
seen = set()
captured = set()
started = time.monotonic()
status = 'timeout'
raw_logs = ''
pid = ''
try:
    adb('shell', 'am', 'force-stop', package)
    launch = adb('shell', 'am', 'start', '-W', '-n', package + '/com.orbita.infinita.MainActivity',
                 '--es', 'orbita.benchmark', args.scenario, '--es', 'orbita.renderer', args.renderer,
                 '--es', 'orbita.quality', args.quality, '--ei', 'orbita.seconds', str(args.seconds), timeout=55)
    pid = adb('shell', 'pidof', package).strip()
    before_memory = adb('shell', 'dumpsys', 'meminfo', package)
    adb('shell', 'dumpsys', 'gfxinfo', package, 'reset')
    count = 6 if args.scenario == 'suite' else 1
    deadline = time.monotonic() + count * (args.seconds + 3) + 60
    switched = False
    while time.monotonic() < deadline:
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
                scene = value.get('scenario', 'unknown')
                if scene not in captured and re.fullmatch(r'[A-Za-z0-9_-]+', scene):
                    image = subprocess.check_output(base + ['exec-out', 'screencap', '-p'], timeout=15)
                    (output / (args.label + '-' + scene + '.png')).write_bytes(image)
                    captured.add(scene)
            else:
                print(json.dumps(value, ensure_ascii=False), flush=True)
            if value.get('type') == 'benchmark-complete':
                status = 'complete'
            if value.get('type') in ('benchmark-error', 'renderer-fallback'):
                status = 'error'
        if status in ('complete', 'error'):
            break
        if args.background and not switched and time.monotonic() - started > 12:
            adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
            time.sleep(3)
            adb('shell', 'am', 'start', '-n', package + '/com.orbita.infinita.MainActivity')
            switched = True
        time.sleep(1)
    if status == 'timeout':
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK', check=False)
    metadata = dict(vars(args)); metadata.pop('serial', None); metadata.pop('adb', None)
    result = {'configuration': metadata, 'status': status, 'records': records, 'logcat': raw_logs,
              'launch': launch, 'memoryBefore': before_memory,
              'memoryAfter': adb('shell', 'dumpsys', 'meminfo', package),
              'gfxinfo': adb('shell', 'dumpsys', 'gfxinfo', package),
              'runtimeErrors': adb('logcat', '-d', '--pid=' + pid, '-s', 'AndroidRuntime:E', 'OrbitaJS:E', '*:S'),
              'durationWallSeconds': round(time.monotonic() - started, 2)}
except Exception as error:
    result = {'status': 'error', 'message': str(error), 'records': records, 'logcat': raw_logs}
    status = 'error'
    print(str(error), flush=True)
    # Stop a partially executed diagnostic and restore its captured in-memory state.
    if pid:
        try:
            adb('shell', 'input', 'keyevent', 'KEYCODE_BACK', check=False)
        except Exception:
            pass
path = output / (args.label + '.json')
path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(str(path), flush=True)
raise SystemExit(0 if status == 'complete' else 1)
