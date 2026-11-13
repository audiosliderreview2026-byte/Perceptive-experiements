"""Version and generate the 1.2× PK-spacing Turchet WAVs."""
import argparse
import math
import re
import shutil
import struct
import wave
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = 'Turchet_baseline'
VERSION = 'Turchet_baseline_pk1p2_v1'
FACTOR = 1.2
PATTERN = re.compile(r'(.+)__PK_([\d.]+)dB__(.+\.wav)')


def versioned_stimulus(value):
    if isinstance(value, dict):
        result = {key: versioned_stimulus(item) for key, item in value.items()}
        path = result.get('audioPath')
        if isinstance(path, str) and f'/{SOURCE}/' in path:
            result['audioPath'] = path.replace(f'/{SOURCE}/', f'/{VERSION}/')
            result['turchet_level_version'] = VERSION
        return result
    if isinstance(value, list):
        return [versioned_stimulus(item) for item in value]
    return value


def read_pcm(path):
    with wave.open(str(path), 'rb') as stream:
        params = stream.getparams()
        if params.sampwidth != 2:
            raise ValueError(f'Expected 16-bit PCM in {path}')
        data = stream.readframes(params.nframes)
    samples = struct.unpack(f'<{len(data)//2}h', data)
    rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples))
    if not rms:
        raise ValueError(f'Silent source {path}')
    return params, samples, rms


def build(root=ROOT):
    segments = root / 'static/stimulis/segments_5s'
    groups = defaultdict(list)
    for path in sorted((segments / SOURCE).glob('*.wav')):
        group, pk, excerpt = PATTERN.fullmatch(path.name).groups()
        groups[group, excerpt].append((float(pk), path))
    if not groups or any(len(group) != 4 for group in groups.values()):
        raise ValueError('Expected four PK settings per Turchet source, cadence and excerpt.')
    target = segments / VERSION
    target.mkdir(exist_ok=True)
    for group in groups.values():
        group.sort()
        high_pk, high_path = group[-1]
        _, _, high_rms = read_pcm(high_path)
        for pk, path in group:
            output = target / path.name
            temporary = output.with_suffix('.tmp')
            if path == high_path:
                shutil.copyfile(path, temporary)
            else:
                params, samples, original_rms = read_pcm(path)
                delta = FACTOR * (pk - high_pk)
                desired_rms = high_rms * 10 ** (delta / 20)
                gain = desired_rms / original_rms
                if gain > 1:
                    raise ValueError(f'Unexpected amplification for {path}')
                with wave.open(str(temporary), 'wb') as stream:
                    stream.setparams(params)
                    stream.writeframes(struct.pack(f'<{len(samples)}h', *(round(sample * gain) for sample in samples)))
                measured = read_pcm(temporary)[2]
                if abs(20 * math.log10(measured / high_rms) - delta) > .05:
                    raise ValueError(f'RMS verification failed for {path}')
            temporary.replace(output)
    return sum(map(len, groups.values()))


if __name__ == '__main__':
    argparse.ArgumentParser(description=__doc__).parse_args()
    print(f'Built and verified {build()} WAVs in {VERSION}.')
