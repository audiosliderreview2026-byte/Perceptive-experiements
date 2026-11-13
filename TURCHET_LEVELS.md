# Turchet intensity calibration

The Turchet baseline varies both footstep cadence (H2H) and intensity (PK). At a fixed cadence, the four PK settings should produce a clear progression in playback level. We want listeners to hear that progression at a fixed device volume so that ratings can reflect the intended intensity manipulation.

PK is the intensity setting encoded in the filename. WAV RMS in dBFS measures the digital level of the rendered clip, including the gaps between footsteps. The original WAVs follow the intended PK order at fixed source, cadence and excerpt, but the full sweep changes measured RMS by only 2.7–3.2 dB across the 192 matched groups. The filename settings span a much larger range. Sending the original signal to the player preserves the small change already present in the file.

The adjusted baseline uses the 1.2× spacing selected in the listening preview. For each source, cadence and five-second excerpt, the highest-PK WAV is the reference and is copied byte for byte. The target for each lower setting is calculated as

```
target RMS (dBFS) = reference RMS (dBFS) + 1.2 × (clip PK − reference PK)
gain (dB)        = target RMS (dBFS) − measured clip RMS (dBFS)
```

The generator applies that gain uniformly to the waveform. This keeps each clip’s timing and waveform shape, preserves the order and relative spacing of the PK settings, and makes the level differences more audible. All gains are attenuations, which avoids introducing clipping. In the preview group, the original RMS sweep spans 3.2 dB and the adjusted sweep spans 30.3 dB. The 1.2× factor sets the digital level contrast. Perceived loudness also depends on the signal, listening equipment, background noise and listener.

New sessions use the versioned WAVs whenever they are assigned a Turchet grid stimulus. The app records the actual playback path in the result. Previously registered sessions use their saved stimuli and historical results keep their original paths. Original reference clips and other editing methods retain their existing levels.

## Build and use the retest

Run `python turchet_levels.py` from the application directory after deploying the code and before reloading the web app. The generator reads the deployed original WAVs and creates a separate versioned directory. It verifies each adjusted RMS level. Allow approximately 324 MiB of disk space for the generated WAVs.

Open `/phase2?prolificID=turchet-retest`. Anyone who opens this temporary link can submit retest answers under `etienne`. This runs the 64 Turchet reference/baseline pairs in the Phase 2 USER ID 1 order. It skips calibration, practice and attention checks. Responses save under `etienne`, USER ID 1, section `turchet_retest`. The retest resumes on reload and leaves earlier Phase 2 results available for comparison.
