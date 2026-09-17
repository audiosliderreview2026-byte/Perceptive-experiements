import os
import random
import re
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# --- Configuration des chemins ---
TESTING_DIR  = Path("assets/audio/testing_samples")
TRAINING_DIR = Path("assets/audio/training_samples")
BASELINE_DIR = Path("assets/audio/baseline_samples")

# Liste des 10 dossiers à traiter (sons de test)
TARGET_FOLDERS = [
    "asphalt", "dress_shoes", "dress_shoes_2", "gravel",
    "hallway_walk", "hay_1", "hay_2", "heels_concrete",
    "leaving_walk", "wood"
]

# Couples chaussure/surface disponibles pour les sons "baseline"
BASELINE_COMBOS = [
    ("dress", "gravel"), ("dress", "metal"), ("dress", "wood"),
    ("sneakers", "gravel"), ("sneakers", "metal"), ("sneakers", "wood"),
]

# aggressive/tender (noms des dossiers baseline) <-> angry/calm (vocabulaire utilisé partout ailleurs)
BASELINE_EMOTION_TO_STIMTYPE = {"aggressive": "baseline_angry", "tender": "baseline_calm"}


# -- Configuration des stimulis --

# Phase 1 — évaluation individuelle
PHASE1_N_SLIDERS_PER_TEST_SOUND = 3   # nb de valeurs alpha testées par son de test
PHASE1_N_TRAINING_SOUNDS        = 5   # nb de sons du corpus d'entraînement inclus (1 édition prompt chacun)

# Phase 2 — contrôlabilité sémantique
PHASE2_N_SLIDERS_PER_TEST_SOUND = 3   # nb de paires original/valeur alpha par son de test
PHASE2_N_TRAINING_PAIRS         = 5   # nb de paires calme/énervé tirées du corpus d'entraînement
PHASE2_INCLUDE_BASELINE         = True
PHASE2_N_PRACTICE_PAIRS         = 4   # nb de paires d'essai présentées avant les vraies paires

# Phase 3 — préservation de l'identité
PHASE3_N_SLIDERS_PER_TEST_SOUND = 3
PHASE3_N_TRAINING_PAIRS         = 0
PHASE3_INCLUDE_BASELINE         = False
PHASE3_N_PRACTICE_PAIRS         = 1

# Dossiers de test utilisés pour les paires d'essai
# tous les participants voient exactement les mêmes). Un son de test = 1 paire
# (original vs édition par prompt énervé, segment "début").
PRACTICE_PAIR_FOLDERS = ["gravel", "wood", "asphalt", "heels_concrete"]


def parse_alpha(filename):
    """
    Extrait la valeur de l'alpha depuis le nom du fichier.
    Gère 'sp' (positif), 'sm' (négatif) et 'd' (décimal).
    Exemples: 'alpha_000_sp0d485598' -> 0.485598 / 'sm3' -> -3.0
    """
    match = re.search(r's([pm])(\d+)(?:d(\d+))?', filename)
    if match:
        sign = -1.0 if match.group(1) == 'm' else 1.0
        integer_part = match.group(2)
        decimal_part = match.group(3) if match.group(3) else "0"
        value = float(f"{integer_part}.{decimal_part}") * sign
        return value
    return "null"


def extract_segment(filename):
    """Cherche _d ou _f dans le nom du fichier pour déterminer le segment."""
    if "_d" in filename: return "d"
    if "_f" in filename: return "f"
    return "null"


def build_stimulus(file_path, sound_id, stim_type, sound_type, alpha_val="null", custom_label=None):
    """Construit le dictionnaire de données pour un stimulus."""
    filename = file_path.name
    segment = extract_segment(filename)

    # .as_posix() garantit des slashes '/' parfaits pour le web
    web_path = file_path.as_posix()

    label = custom_label if custom_label else f"{sound_id} ({stim_type})"

    return {
        "soundId": sound_id,
        "stimType": stim_type,
        "soundType": sound_type,
        "segment": segment,
        "alpha": alpha_val,
        "audioPath": web_path,
        "soundLabel": label
    }


def make_pair(original, edited):
    """Construit une paire (son A = original, son B = édité) pour les Phases 2/3."""
    return {
        "original": original,
        "edited": edited,
        "soundId": edited["soundId"],
        "stimType": edited["stimType"],
        "segment": edited["segment"],
        "alpha": edited["alpha"],
        "soundType": edited["soundType"],
    }


def make_pair_random_order(stim1, stim2):
    """Comme make_pair, mais l'ordre A/B est tiré au hasard entre les deux sons."""
    if random.random() < 0.5:
        return make_pair(stim1, stim2)
    return make_pair(stim2, stim1)


def original_for_segment(originals, segment):
    """Choisit l'original du même segment (d/f) qu'un édit donné."""
    matching = [o for o in originals if extract_segment(o.name) == segment]
    return random.choice(matching) if matching else random.choice(originals)


# --- PHASE 1 : sons individuels ---

def build_phase1_stimuli(n_sliders=PHASE1_N_SLIDERS_PER_TEST_SOUND, n_training_sounds=PHASE1_N_TRAINING_SOUNDS):
    stimuli = []

    # 1. Sons de test
    if TESTING_DIR.exists():
        for folder_name in TARGET_FOLDERS:
            folder_path = TESTING_DIR / folder_name
            if not folder_path.exists():
                print(f"⚠️ Dossier introuvable, ignoré : {folder_path}")
                continue

            # A) Original (1 fichier)
            originals = list(folder_path.glob(f"{folder_name}_[df].wav"))
            if originals:
                chosen = random.choice(originals)
                stimuli.append(build_stimulus(chosen, folder_name, "original", "testing", "null", f"{folder_name} (Original)"))

            # B) Lora Slider (n_sliders fichiers)
            lora_dir = folder_path / "lora_slider"
            if lora_dir.exists():
                lora_files = list(lora_dir.glob("*.wav"))
                chosen_loras = random.sample(lora_files, min(n_sliders, len(lora_files)))
                for f in chosen_loras:
                    alpha = parse_alpha(f.name)
                    stimuli.append(build_stimulus(f, folder_name, "slider", "testing", alpha, f"{folder_name} (Alpha: {alpha})"))

            # C) Prompt Only (1 seul fichier choisi entre negative et positive)
            prompt_dir = folder_path / "prompt_only"
            if prompt_dir.exists():
                valid_prompts = [f for f in prompt_dir.glob("*.wav")
                                  if "negative" in f.name.lower() or "positive" in f.name.lower()]
                if valid_prompts:
                    chosen_prompt = random.choice(valid_prompts)
                    if "positive" in chosen_prompt.name.lower():
                        stimuli.append(build_stimulus(chosen_prompt, folder_name, "prompt_angry", "testing", "null", f"{folder_name} (Prompt Angry)"))
                    else:
                        stimuli.append(build_stimulus(chosen_prompt, folder_name, "prompt_calm", "testing", "null", f"{folder_name} (Prompt Calm)"))
    else:
        print(f"❌ Erreur : Le dossier {TESTING_DIR} n'existe pas.")

    # 2. Sons d'entraînement (édit par prompt uniquement : plus d'original brut)
    if TRAINING_DIR.exists():
        training_folders = [d for d in TRAINING_DIR.iterdir() if d.is_dir()]
        chosen_training_folders = random.sample(training_folders, min(n_training_sounds, len(training_folders)))

        for folder_path in chosen_training_folders:
            sound_id = folder_path.name
            prompt_dir = folder_path / "prompt_only"
            if prompt_dir.exists():
                prompt_files = list(prompt_dir.glob("*.wav"))
                if prompt_files:
                    chosen_prompt = random.choice(prompt_files)
                    if "angry2" in chosen_prompt.name.lower():
                        stim_type, label_suffix = "prompt_angry", "Prompt Angry"
                    elif "calm2" in chosen_prompt.name.lower():
                        stim_type, label_suffix = "prompt_calm", "Prompt Calm"
                    else:
                        stim_type, label_suffix = "prompt_edited", "Prompt Edited"
                    stimuli.append(build_stimulus(chosen_prompt, sound_id, stim_type, "training", "null", f"Entraînement : {sound_id} ({label_suffix})"))
    else:
        print(f"❌ Erreur : Le dossier {TRAINING_DIR} n'existe pas.")

    # 3. Sons baseline (1 par couple chaussure/surface, calme ou énervé au hasard)
    stimuli.extend(build_baseline_phase1_stimuli())

    return stimuli


def build_baseline_phase1_stimuli():
    stimuli = []
    if not BASELINE_DIR.exists():
        print(f"❌ Erreur : Le dossier {BASELINE_DIR} n'existe pas.")
        return stimuli

    for shoe, surface in BASELINE_COMBOS:
        combo_id = f"{shoe}_{surface}"
        emotion = random.choice(list(BASELINE_EMOTION_TO_STIMTYPE.keys()))
        emotion_dir = BASELINE_DIR / shoe / surface / emotion
        files = list(emotion_dir.glob("*.wav")) if emotion_dir.exists() else []
        if not files:
            print(f"⚠️ Aucun son baseline trouvé pour {combo_id}/{emotion}, ignoré.")
            continue
        chosen = random.choice(files)
        stim_type = BASELINE_EMOTION_TO_STIMTYPE[emotion]
        label = "Baseline Angry" if stim_type == "baseline_angry" else "Baseline Calm"
        stimuli.append(build_stimulus(chosen, combo_id, stim_type, "baseline", "null", f"{combo_id} ({label})"))

    return stimuli


def build_phase1_practice_stimulus():
    """Son d'entraînement de la Phase 1 : fixe (pas de tirage), un original de test."""
    practice_file = TESTING_DIR / "gravel" / "gravel_d.wav"
    if not practice_file.exists():
        print(f"⚠️ Son d'entraînement introuvable : {practice_file}")
        return None
    return build_stimulus(practice_file, "gravel", "original", "testing", "null", "Entraînement : gravel (Original)")


# --- PHASES 2 & 3 : paires ---

def build_test_pairs(n_sliders=3):
    """n_sliders paires slider + 1 paire prompt, par son de test."""
    pairs = []
    if not TESTING_DIR.exists():
        return pairs

    for folder_name in TARGET_FOLDERS:
        folder_path = TESTING_DIR / folder_name
        if not folder_path.exists():
            continue

        originals = list(folder_path.glob(f"{folder_name}_[df].wav"))
        if not originals:
            continue

        # Paires slider (n_sliders)
        lora_dir = folder_path / "lora_slider"
        if lora_dir.exists():
            lora_files = list(lora_dir.glob("*.wav"))
            for f in random.sample(lora_files, min(n_sliders, len(lora_files))):
                alpha = parse_alpha(f.name)
                edited = build_stimulus(f, folder_name, "slider", "testing", alpha, f"{folder_name} (Alpha: {alpha})")
                orig   = original_for_segment(originals, edited["segment"])
                orig_stim = build_stimulus(orig, folder_name, "original", "testing", "null", f"{folder_name} (Original)")
                pairs.append(make_pair(orig_stim, edited))

        # Paire prompt (1 direction tirée au hasard)
        prompt_dir = folder_path / "prompt_only"
        if prompt_dir.exists():
            valid_prompts = [f for f in prompt_dir.glob("*.wav")
                              if "negative" in f.name.lower() or "positive" in f.name.lower()]
            if valid_prompts:
                chosen_prompt = random.choice(valid_prompts)
                stim_type = "prompt_angry" if "positive" in chosen_prompt.name.lower() else "prompt_calm"
                label = "Prompt Angry" if stim_type == "prompt_angry" else "Prompt Calm"
                edited = build_stimulus(chosen_prompt, folder_name, stim_type, "testing", "null", f"{folder_name} ({label})")
                orig   = original_for_segment(originals, edited["segment"])
                orig_stim = build_stimulus(orig, folder_name, "original", "testing", "null", f"{folder_name} (Original)")
                pairs.append(make_pair(orig_stim, edited))

    return pairs


def build_training_practice_pairs(n=1):
    """n paires d'essai, fixes : original vs prompt énervé (début),
    une par dossier de PRACTICE_PAIR_FOLDERS, dans l'ordre."""
    pairs = []
    for folder_name in PRACTICE_PAIR_FOLDERS[:n]:
        original_file = TESTING_DIR / folder_name / f"{folder_name}_d.wav"
        edited_file   = TESTING_DIR / folder_name / "prompt_only" / "positive_prompt_only_d.wav"
        if not original_file.exists() or not edited_file.exists():
            print(f"⚠️ Paire d'entraînement introuvable : {original_file} / {edited_file}")
            continue

        original_stim = build_stimulus(original_file, folder_name, "original", "testing", "null", f"Entraînement : {folder_name} (Original)")
        edited_stim   = build_stimulus(edited_file, folder_name, "prompt_angry", "testing", "null", f"Entraînement : {folder_name} (Prompt Angry)")
        pairs.append(make_pair(original_stim, edited_stim))

    return pairs


def build_baseline_pairs():
    """1 paire (calme, énervé) par couple chaussure/surface — Phase 2 uniquement. Ordre A/B aléatoire."""
    pairs = []
    if not BASELINE_DIR.exists():
        return pairs

    for shoe, surface in BASELINE_COMBOS:
        combo_id = f"{shoe}_{surface}"
        calm_files  = list((BASELINE_DIR / shoe / surface / "tender").glob("*.wav"))
        angry_files = list((BASELINE_DIR / shoe / surface / "aggressive").glob("*.wav"))
        if not calm_files or not angry_files:
            print(f"⚠️ Sons baseline incomplets pour {combo_id}, paire ignorée.")
            continue

        calm_file  = random.choice(calm_files)
        angry_file = random.choice(angry_files)
        calm_stim  = build_stimulus(calm_file, combo_id, "baseline_calm", "baseline", "null", f"{combo_id} (Baseline Calm)")
        angry_stim = build_stimulus(angry_file, combo_id, "baseline_angry", "baseline", "null", f"{combo_id} (Baseline Angry)")
        pairs.append(make_pair_random_order(calm_stim, angry_stim))

    return pairs


def build_training_calm_angry_pairs(n=5):
    """n paires (calme, énervé) tirées du corpus d'entraînement (toutes si n vaut None). Ordre A/B aléatoire."""
    pairs = []
    if not TRAINING_DIR.exists():
        return pairs

    training_folders = [d for d in TRAINING_DIR.iterdir() if d.is_dir()]
    random.shuffle(training_folders)

    for folder_path in training_folders:
        if n is not None and len(pairs) >= n:
            break
        sound_id = folder_path.name
        prompt_dir = folder_path / "prompt_only"
        if not prompt_dir.exists():
            continue
        calm_files  = list(prompt_dir.glob("*calm2*.wav"))
        angry_files = list(prompt_dir.glob("*angry2*.wav"))
        if not calm_files or not angry_files:
            continue

        calm_file  = random.choice(calm_files)
        angry_file = random.choice(angry_files)
        calm_stim  = build_stimulus(calm_file, sound_id, "prompt_calm", "training", "null", f"{sound_id} (Prompt Calm)")
        angry_stim = build_stimulus(angry_file, sound_id, "prompt_angry", "training", "null", f"{sound_id} (Prompt Angry)")
        pairs.append(make_pair_random_order(calm_stim, angry_stim))

    return pairs


def build_test_calm_angry_pairs():
    """1 paire (calme, énervé) par son de test, à partir des éditions par prompt. Ordre A/B aléatoire."""
    pairs = []
    if not TESTING_DIR.exists():
        return pairs

    for folder_name in TARGET_FOLDERS:
        prompt_dir = TESTING_DIR / folder_name / "prompt_only"
        if not prompt_dir.exists():
            continue
        calm_files  = list(prompt_dir.glob("negative_prompt_only_*.wav"))
        angry_files = list(prompt_dir.glob("positive_prompt_only_*.wav"))
        if not calm_files or not angry_files:
            continue

        calm_file  = random.choice(calm_files)
        angry_file = random.choice(angry_files)
        calm_stim  = build_stimulus(calm_file, folder_name, "prompt_calm", "testing", "null", f"{folder_name} (Prompt Calm)")
        angry_stim = build_stimulus(angry_file, folder_name, "prompt_angry", "testing", "null", f"{folder_name} (Prompt Angry)")
        pairs.append(make_pair_random_order(calm_stim, angry_stim))

    return pairs


def build_apprentissage_pairs():
    """Exp sons d'apprentissage : toutes les paires calme/énervé, corpus training + corpus test."""
    testing = build_training_calm_angry_pairs(n=None) + build_test_calm_angry_pairs()
    random.shuffle(testing)

    return {"training": build_training_practice_pairs(n=1), "testing": testing}


def build_phase_pairs(include_baseline=False, n_training_pairs=0, n_sliders=3, n_practice_pairs=1):
    testing = build_test_pairs(n_sliders=n_sliders)
    if include_baseline:
        testing += build_baseline_pairs()
    if n_training_pairs:
        testing += build_training_calm_angry_pairs(n_training_pairs)
    random.shuffle(testing)

    return {"training": build_training_practice_pairs(n=n_practice_pairs), "testing": testing}


def main():
    # Phase 1 — évaluation individuelle
    practice_stimulus = build_phase1_practice_stimulus()
    phase1_stimuli = build_phase1_stimuli()
    random.shuffle(phase1_stimuli)
    phase1 = {
        "training": [practice_stimulus] if practice_stimulus else [],
        "testing": phase1_stimuli,
    }

    # Phase 2 — contrôlabilité sémantique
    phase2_pairs = build_phase_pairs(
        include_baseline=PHASE2_INCLUDE_BASELINE,
        n_training_pairs=PHASE2_N_TRAINING_PAIRS,
        n_sliders=PHASE2_N_SLIDERS_PER_TEST_SOUND,
        n_practice_pairs=PHASE2_N_PRACTICE_PAIRS,
    )

    # Phase 3 — préservation de l'identité
    phase3_pairs = build_phase_pairs(
        include_baseline=PHASE3_INCLUDE_BASELINE,
        n_training_pairs=PHASE3_N_TRAINING_PAIRS,
        n_sliders=PHASE3_N_SLIDERS_PER_TEST_SOUND,
        n_practice_pairs=PHASE3_N_PRACTICE_PAIRS,
    )

    # Exp sons d'apprentissage
    apprentissage_pairs = build_apprentissage_pairs()

    output_dir = Path(__file__).resolve().parent / "stimulis"
    output_dir.mkdir(exist_ok=True)
    output_file = output_dir / "stimuli.json"
    output_data = {
        "phase1": phase1,
        "phase2": phase2_pairs,
        "phase3": phase3_pairs,
        "apprentissage": apprentissage_pairs,
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Fichier '{output_file}' généré avec succès !")
    print(f"   Phase 1 : {len(phase1['training'])} entraînement + {len(phase1['testing'])} sons")
    print(f"   Phase 2 : {len(phase2_pairs['training'])} paire(s) d'entraînement + {len(phase2_pairs['testing'])} paires")
    print(f"   Phase 3 : {len(phase3_pairs['training'])} paire(s) d'entraînement + {len(phase3_pairs['testing'])} paires")
    print(f"   Exp sons d'apprentissage : {len(apprentissage_pairs['training'])} paire(s) d'entraînement + {len(apprentissage_pairs['testing'])} paires")


if __name__ == "__main__":
    main()
