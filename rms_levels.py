"""Build versioned RMS-matched study audio from the deployed WAVs."""
import json
import math
import re
import struct
import wave
from functools import lru_cache
from pathlib import Path

import turchet_levels

ROOT = Path(__file__).resolve().parent
PREFIX = '/static/stimulis/'
VERSION = 'rms_matched_v1'
EDIT_REFERENCES = {
    'test_plugin_edits': 'test_plugin_originals',
    'test_plugin_turchet_centers_edits': 'test_plugin_turchet_centers_edits/originals',
    'test_yt_edits': 'test_yt_originals_separated',
    'yt_edit+residual': 'test_yt_originals',
}
MAX_PEAK = 10 ** (-1 / 20)


def versioned_stimulus(value):
    value = turchet_levels.versioned_stimulus(value)
    return _version_paths(value)


def _version_paths(value):
    if isinstance(value, dict):
        result = {key: _version_paths(item) for key, item in value.items()}
        path = result.get('audioPath')
        if isinstance(path, str) and path.startswith(PREFIX):
            relative = path.removeprefix(PREFIX)
            if relative.startswith(('segments_5s/', 'training/')) and not relative.startswith(
                ('segments_5s/' + turchet_levels.SOURCE + '/', 'segments_5s/' + turchet_levels.VERSION + '/')
            ):
                result['audioPath'] = f'{PREFIX}{VERSION}/{relative}'
                result['audio_level_version'] = VERSION
        return result
    if isinstance(value, list):
        return [_version_paths(item) for item in value]
    return value


def source_key(source):
    source = re.sub(r'_(target|residual)$', '', source)
    clip = re.fullmatch(r'clip_?(\d+)(?:_\d+m\d+s)?', source)
    return f'clip:{int(clip[1])}' if clip else source


def read_wave(path):
    with wave.open(str(path), 'rb') as audio:
        channels, rate, width = audio.getnchannels(), audio.getframerate(), audio.getsampwidth()
        raw = audio.readframes(audio.getnframes())
    if width == 2:
        samples = struct.unpack(f'<{len(raw) // 2}h', raw)
    elif width == 3:
        # Decode signed 24-bit PCM without dropping low bits.
        samples = tuple(int.from_bytes(raw[i:i+3], 'little', signed=True) / 256
                        for i in range(0, len(raw), 3))
    else:
        raise ValueError(f'Unsupported PCM width {width} in {path}')
    return channels, rate, samples


def measure(samples, channels):
    # Digital DC adds RMS without adding useful audible signal.
    means = [sum(samples[channel::channels]) / (len(samples) // channels)
             for channel in range(channels)]
    centered = tuple(value - means[index % channels] for index, value in enumerate(samples))
    rms = math.sqrt(sum(value * value for value in centered) / len(centered)) / 32768
    peak = max(map(abs, centered)) / 32768
    return centered, rms, peak


def build(root=ROOT):
    stimuli = root / PREFIX.strip('/')
    segments = stimuli / 'segments_5s'
    calibration = json.loads((stimuli / 'calibration/sources.json').read_text())['calibration_order']
    training_sources = json.loads((stimuli / 'training/sources.json').read_text())
    calibration_rms = []
    for path in calibration[:3]:
        channels, _, samples = read_wave(root / path.lstrip('/'))
        calibration_rms.append(measure(samples, channels)[1])
    ceiling = min(calibration_rms) * 10 ** (-8 / 20)
    floor = ceiling * 10 ** (-14 / 20)

    references = {}
    for folder in set(EDIT_REFERENCES.values()):
        for path in (segments / folder).glob('*.wav'):
            source, excerpt = path.stem.split('__')
            key = folder, source_key(source), excerpt
            if key in references:
                raise ValueError(f'Ambiguous reference for {path}')
            references[key] = path

    def reference(path):
        url = '/' + path.relative_to(root).as_posix()
        while url in training_sources:
            url = training_sources[url]
        source_path = root / url.lstrip('/')
        if not source_path.is_relative_to(segments):
            return path
        folder = source_path.parent.relative_to(segments).as_posix()
        if folder not in EDIT_REFERENCES:
            return source_path
        source = source_path.stem.split('__', 1)[0]
        excerpt = source_path.stem.rsplit('__', 1)[-1]
        if source == 'sneakers_metal' and folder == 'test_plugin_turchet_centers_edits':
            source = 'sneakers_metal_neutral_0244'
        key = EDIT_REFERENCES[folder], source_key(source), excerpt
        if key not in references:
            raise ValueError(f'No original for {path}')
        return references[key]

    paths = [path for path in segments.rglob('*.wav')
             if path.relative_to(segments).parts[0] not in (turchet_levels.SOURCE, turchet_levels.VERSION)]
    manifest = json.loads((stimuli / 'training/manifest.json').read_text())
    for phase, trials in manifest.items():
        for trial in trials:
            sounds = [trial] if phase == 'phase1' else [trial['soundA'], trial['soundB']]
            paths.extend(root / sound['audioPath'].lstrip('/') for sound in sounds)
    paths = sorted(set(paths))
    if not paths:
        raise ValueError('No study audio found.')

    @lru_cache(maxsize=None)
    def metrics(path):
        channels, _, samples = read_wave(path)
        return measure(samples, channels)[1:]

    # One shared RMS target per source excerpt, reduced as needed for headroom.
    # Ignore effectively silent clips and keep their original low level.
    groups = {}
    for path in paths:
        original = reference(path)
        rms, peak = metrics(path)
        if original not in groups:
            original_rms, original_peak = metrics(original)
            groups[original] = min(max(original_rms, floor), ceiling,
                                   MAX_PEAK * original_rms / original_peak if original_peak else ceiling)
        if rms >= 1e-4 and peak:
            groups[original] = min(groups[original], MAX_PEAK * rms / peak)

    output_root = stimuli / VERSION
    output_root.mkdir(exist_ok=True)
    metadata = {}
    for path in paths:
        original = reference(path)
        channels, rate, samples = read_wave(path)
        centered, rms, peak = measure(samples, channels)
        target = groups[original]
        quiet = rms < 1e-4
        gain = 1 if quiet else target / rms
        output = output_root / path.relative_to(stimuli)
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix('.tmp')
        quantized = tuple(round(value * gain) for value in centered)
        if max(map(abs, quantized)) > round(MAX_PEAK * 32768):
            raise ValueError(f'Peak limit exceeded for {path}')
        measured = math.sqrt(sum(value * value for value in quantized) / len(quantized)) / 32768
        if not quiet and abs(20 * math.log10(measured / target)) > .1:
            raise ValueError(f'RMS verification failed for {path}')
        with wave.open(str(temporary), 'wb') as audio:
            audio.setparams((channels, 2, rate, 0, 'NONE', 'not compressed'))
            audio.writeframes(struct.pack(f'<{len(quantized)}h', *quantized))
        temporary.replace(output)
        metadata['/' + output.relative_to(root).as_posix()] = {
            'source': '/' + path.relative_to(root).as_posix(),
            'reference': '/' + original.relative_to(root).as_posix(),
            'rms_dbfs': 20 * math.log10(measured) if measured else None,
            'gain_db': 20 * math.log10(gain),
            'quiet_source': quiet,
        }
    temporary = output_root / 'levels.tmp'
    temporary.write_text(json.dumps(metadata, indent=2) + '\n')
    temporary.replace(output_root / 'levels.json')
    return len(metadata), 20 * math.log10(floor), 20 * math.log10(ceiling)


if __name__ == '__main__':
    count, floor, ceiling = build()
    print(f'Built and verified {count} WAVs. Nominal RMS range: {floor:.1f} to {ceiling:.1f} dBFS.')
