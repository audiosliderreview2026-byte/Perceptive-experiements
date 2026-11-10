/// ==========================================================
// EXPERIMENT STIMULUS CONFIGURATION
// ==========================================================
//
// CENTRAL CONFIGURATION.
//
// Folder probabilities:
//   - used by Phase 1 directly
//   - renormalized over the eligible folders in Phases 2/3
//
// "originals" is already declared for future use but has
// probability 0 for now.
//
// Sampling is WITH replacement.
// ==========================================================

const STIMULUS_CONFIG = {

  probabilities: {
    baseline : 0.20,
    train    : 0.40,
    test     : 0.40,
    originals: 0.00,
  },

  // Deliberate Phase-1 test/retest observations.
  repeatedStimuliPerParticipant: 3,

  // Calibration is NOT affected by this limit.
  maxAudioDurationSeconds: 5,
};


const PHASE_STIMULUS_CONFIG = {

  phase1: {
    allowedCategories: [
      'baseline',
      'train',
      'test',
    ],
  },

  phase2: {
    allowedCategories: [
      'baseline',
      'test',
    ],
  },

  phase3: {
    allowedCategories: [
      'train',
      'test',
    ],
  },

};


// ==========================================================
// GENERAL HELPERS
// ==========================================================

function randomChoice(array) {

  if (!Array.isArray(array) || array.length === 0) {
    throw new Error(
      'Cannot choose from an empty array.'
    );
  }

  return array[
    Math.floor(Math.random() * array.length)
  ];
}


function sampleWeightedCategory(
  stimulusPools,
  allowedCategories,
  minimumPoolSize = 1
) {

  const available =
    allowedCategories
      .map(category => [
        category,
        STIMULUS_CONFIG.probabilities[category] ?? 0,
      ])
      .filter(
        ([category, weight]) =>
          weight > 0 &&
          Array.isArray(stimulusPools[category]) &&
          stimulusPools[category].length >= minimumPoolSize
      );


  if (available.length === 0) {
    throw new Error(
      'No eligible stimulus category contains enough WAV files.'
    );
  }


  const totalWeight =
    available.reduce(
      (sum, [, weight]) => sum + weight,
      0
    );


  let r =
    Math.random() * totalWeight;


  for (const [category, weight] of available) {

    r -= weight;

    if (r <= 0) {
      return category;
    }
  }


  return available[available.length - 1][0];
}


// ==========================================================
// SINGLE-STIMULUS SAMPLING — PHASE 1
// ==========================================================

function sampleSoundFromPool(
  pool,
  previousAudioPath = null
) {

  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error(
      'Cannot sample from an empty stimulus pool.'
    );
  }


  let candidates = pool;


  // Do not play the exact same WAV twice in a row.
  if (
    previousAudioPath !== null &&
    pool.length > 1
  ) {

    candidates =
      pool.filter(
        stimulus =>
          stimulus.audioPath !== previousAudioPath
      );
  }


  return randomChoice(candidates);
}


// ----------------------------------------------------------
// Generates a Phase-1 plan.
//
// The requested number of deliberate repetitions is included
// INSIDE numberOfTrials.
//
// Example:
//   numberOfTrials = 61
//   repeatedStimuliPerParticipant = 3
//
// gives:
//   58 independently sampled trials
//   + 3 deliberate repeats
//   = 61 trials total.
//
// repeatOfTrialIndex identifies deliberate test/retest items.
// ----------------------------------------------------------

function generateStimulusPlan(
  stimulusPools,
  numberOfTrials,
  allowedCategories =
    PHASE_STIMULUS_CONFIG.phase1.allowedCategories
) {

  const repeatCount =
    Math.min(
      STIMULUS_CONFIG.repeatedStimuliPerParticipant,
      Math.max(0, numberOfTrials - 1)
    );


  const originalCount =
    numberOfTrials - repeatCount;


  const originals = [];

  let previousAudioPath = null;


  for (
    let i = 0;
    i < originalCount;
    i++
  ) {

    const category =
      sampleWeightedCategory(
        stimulusPools,
        allowedCategories,
        1
      );


    const stimulus =
      sampleSoundFromPool(
        stimulusPools[category],
        previousAudioPath
      );


    originals.push({
      soundId:
        stimulus.soundId,

      soundType:
        stimulus.soundType,

      audioPath:
        stimulus.audioPath,

      repeatOfTrialIndex:
        null,
    });


    previousAudioPath =
      stimulus.audioPath;
  }


  // --------------------------------------------------------
  // Choose deliberate repeat sources.
  //
  // Prefer different source trials when possible.
  // --------------------------------------------------------

  const sourceIndexes =
    shuffle(
      Array.from(
        { length: originals.length },
        (_, index) => index
      )
    ).slice(
      0,
      Math.min(
        repeatCount,
        originals.length
      )
    );


  const items =
    originals.map(
      (stimulus, sourceIndex) => ({
        ...stimulus,
        _repeatSourceIndex: sourceIndex,
      })
    );


  sourceIndexes.forEach(
    sourceIndex => {

      const source =
        originals[sourceIndex];


      items.push({
        soundId:
          source.soundId,

        soundType:
          source.soundType,

        audioPath:
          source.audioPath,

        repeatOfTrialIndex:
          sourceIndex,

        _repeatSourceIndex:
          sourceIndex,
      });
    }
  );


  // --------------------------------------------------------
  // Shuffle, while preventing identical consecutive WAVs.
  // --------------------------------------------------------

  let shuffled =
    shuffle(items);


  for (
    let i = 1;
    i < shuffled.length;
    i++
  ) {

    if (
      shuffled[i].audioPath ===
      shuffled[i - 1].audioPath
    ) {

      const swapIndex =
        shuffled.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex > i &&
            candidate.audioPath !==
              shuffled[i - 1].audioPath
        );


      if (swapIndex !== -1) {

        [
          shuffled[i],
          shuffled[swapIndex],
        ] = [
          shuffled[swapIndex],
          shuffled[i],
        ];
      }
    }
  }


  // --------------------------------------------------------
  // After shuffling, translate repeatOfTrialIndex so it
  // refers to the FINAL persistent trial index.
  // --------------------------------------------------------

  const finalIndexOfSource =
    new Map();


  shuffled.forEach(
    (item, finalIndex) => {

      if (
        item.repeatOfTrialIndex === null
      ) {

        finalIndexOfSource.set(
          item._repeatSourceIndex,
          finalIndex
        );
      }
    }
  );


  return shuffled.map(
    (item, trialIndex) => ({

      trialIndex,

      soundId:
        item.soundId,

      soundType:
        item.soundType,

      audioPath:
        item.audioPath,

      repeatOfTrialIndex:
        item.repeatOfTrialIndex === null
          ? null
          : finalIndexOfSource.get(
              item._repeatSourceIndex
            ),
    })
  );
}


// ==========================================================
// PAIR SAMPLING — PHASES 2 / 3
// ==========================================================
//
// For now:
//   Phase 2 -> baseline OR test
//   Phase 3 -> train OR test
//
// A and B are always sampled from the SAME folder.
// A and B are always different WAVs.
//
// This representation deliberately keeps soundA and soundB
// independent. Later Phase 3 can therefore easily use:
//
//   soundA = originals/<id>.wav
//   soundB = test/<corresponding-id>.wav
//
// without changing the database/timeline architecture.
// ==========================================================

function sampleSoundPairFromPool(pool) {

  if (
    !Array.isArray(pool) ||
    pool.length < 2
  ) {

    throw new Error(
      'At least two WAV files are required to create a pair.'
    );
  }


  const soundA =
    randomChoice(pool);


  const candidatesB =
    pool.filter(
      stimulus =>
        stimulus.audioPath !== soundA.audioPath
    );


  const soundB =
    randomChoice(candidatesB);


  return [
    soundA,
    soundB,
  ];
}


function generatePairStimulusPlan(
  stimulusPools,
  numberOfTrials,
  allowedCategories
) {

  const plan = [];


  for (
    let trialIndex = 0;
    trialIndex < numberOfTrials;
    trialIndex++
  ) {

    const category =
      sampleWeightedCategory(
        stimulusPools,
        allowedCategories,
        2
      );


    const [soundA, soundB] =
      sampleSoundPairFromPool(
        stimulusPools[category]
      );


    plan.push({

      trialIndex,

      pairType:
        'same-folder',

      soundType:
        category,

      soundA: {
        soundId:
          soundA.soundId,

        soundType:
          soundA.soundType,

        audioPath:
          soundA.audioPath,
      },

      soundB: {
        soundId:
          soundB.soundId,

        soundType:
          soundB.soundType,

        audioPath:
          soundB.audioPath,
      },
    });
  }


  return plan;
}

// ----------------------------------------------------------
// Select a category using the global configured weights,
// restricted to the categories allowed for this phase.
// ----------------------------------------------------------

function sampleStimulusCategoryFromAllowed(
  stimulusPools,
  allowedCategories
) {

  const available =
    allowedCategories
      .map(category => [
        category,
        STIMULUS_CONFIG.probabilities[category] ?? 0
      ])
      .filter(
        ([category, weight]) =>
          weight > 0 &&
          Array.isArray(stimulusPools[category]) &&
          stimulusPools[category].length >= 2
      );


  if (available.length === 0) {
    throw new Error(
      'No allowed stimulus category contains at least two WAV files.'
    );
  }


  const totalWeight =
    available.reduce(
      (sum, [, weight]) =>
        sum + weight,
      0
    );


  let r =
    Math.random() * totalWeight;


  for (const [category, weight] of available) {

    r -= weight;

    if (r <= 0) {
      return category;
    }
  }


  return available[
    available.length - 1
  ][0];
}


// ----------------------------------------------------------
// Uniformly sample two DIFFERENT WAV files from one pool.
// ----------------------------------------------------------

function sampleSoundPairFromPool(pool) {

  if (
    !Array.isArray(pool) ||
    pool.length < 2
  ) {
    throw new Error(
      'At least two WAV files are required to create a pair.'
    );
  }


  const indexA =
    Math.floor(
      Math.random() * pool.length
    );


  let indexB =
    Math.floor(
      Math.random() * pool.length
    );


  while (indexB === indexA) {

    indexB =
      Math.floor(
        Math.random() * pool.length
      );
  }


  return [
    pool[indexA],
    pool[indexB],
  ];
}


// ----------------------------------------------------------
// Generate a complete plan of A/B pairs.
//
// - Folder is sampled according to STIMULUS_CONFIG.
// - Only allowedCategories can be selected.
// - A and B always belong to the SAME folder.
// - A and B are always different WAVs.
// - Sampling across trials is WITH replacement.
// ----------------------------------------------------------

function generatePairStimulusPlan(
  stimulusPools,
  numberOfTrials,
  allowedCategories
) {

  const plan = [];


  for (
    let trialIndex = 0;
    trialIndex < numberOfTrials;
    trialIndex++
  ) {

    const category =
      sampleStimulusCategoryFromAllowed(
        stimulusPools,
        allowedCategories
      );


    const [soundA, soundB] =
      sampleSoundPairFromPool(
        stimulusPools[category]
      );


    plan.push({

      trialIndex,

      soundType:
        category,

      soundA: {
        soundId:
          soundA.soundId,

        audioPath:
          soundA.audioPath,
      },

      soundB: {
        soundId:
          soundB.soundId,

        audioPath:
          soundB.audioPath,
      },
    });
  }


  return plan;
}



// ==========================================================
// SERVER / DATABASE
// ==========================================================

async function saveTrialToServer({
  phase,
  trialKey,
  trialIndex = null,
  section,
  soundId = null,
  training = false,
  payload = {},
}) {

  if (!window.PROLIFIC_ID) {
    throw new Error('Missing prolificID');
  }

  const dataToSend = {
    prolificID : window.PROLIFIC_ID,
    phase      : String(phase),
    trial_key  : trialKey,
    trial_index: trialIndex,
    section    : section,
    sound_id   : soundId,
    training   : training,
    payload    : { ...payload, userID: window.ASSIGNED_USER_ID },
  };

  console.log(
    '[DB] Saving trial:',
    dataToSend
  );

  const response = await durableStudyPost(
    '/api/save-trial',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify(
        dataToSend
      ),
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {

    console.error(
      '[DB] Server error:',
      response.status,
      responseText
    );

    throw new Error(
      `Could not save trial: HTTP ${response.status}`
    );
  }

  let result;

  try {
    result =
      JSON.parse(responseText);
  } catch {
    result =
      responseText;
  }

  console.log(
    '[DB] Trial saved successfully:',
    result
  );

  return result;
}


// ==========================================================
// LOAD COMPLETED TRIALS
// ==========================================================

async function loadCompletedTrials(phase) {

  if (!window.PROLIFIC_ID) {
    throw new Error('Missing prolificID');
  }

  const url =
    `/api/progress?prolificID=${encodeURIComponent(window.PROLIFIC_ID)}` +
    `&phase=${encodeURIComponent(String(phase))}`;

  const response = await fetch(
    url,
    {
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(
      `Could not load progress: HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  return data.completed;
}


// ==========================================================
// PERSISTENT PHASE SESSION
// ==========================================================

async function loadPhaseSession(phase) {

  if (!window.PROLIFIC_ID) {
    throw new Error('Missing prolificID');
  }

  const url =
    `/api/session?prolificID=${encodeURIComponent(window.PROLIFIC_ID)}` +
    `&phase=${encodeURIComponent(String(phase))}`;

  const response = await fetch(
    url,
    {
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(
      `Could not load phase session: HTTP ${response.status}`
    );
  }

  return await response.json();
}


async function createPhaseSession(
  phase,
  trialOrder
) {

  if (!window.PROLIFIC_ID) {
    throw new Error('Missing prolificID');
  }

  const response = await fetch(
    '/api/session',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        prolificID: window.PROLIFIC_ID,
        phase      : String(phase),
        trial_order: trialOrder,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Could not create phase session: HTTP ${response.status}`
    );
  }

  return await response.json();
}


// ==========================================================
// COMPLETED-TRIAL HELPERS
// ==========================================================

function completedTrialKeySet(completed) {

  return new Set(
    (completed || []).map(
      row => row.trial_key
    )
  );
}


// ==========================================================
// STABLE TRIAL KEYS
// ==========================================================
//
// IMPORTANT:
//
// trialIndex is now the identity of an experimental unit.
//
// This allows the same WAV, or even the same A/B pair,
// to occur several times without colliding in SQLite.
// ==========================================================

function experimentalTrialKey(
  section,
  trialIndex
) {

  return [
    section,
    String(trialIndex),
    'ratings',
  ].join('|');
}


function stimulusTrialKey(
  stimulus,
  section
) {

  return experimentalTrialKey(
    section,
    stimulus.trialIndex
  );
}


function pairTrialKey(
  pair,
  section
) {

  return experimentalTrialKey(
    section,
    pair.trialIndex
  );
}


// ==========================================================
// EXPERIMENT PROGRESS COUNTER
// ==========================================================
//
// This counter represents completed MAIN experimental units,
// not jsPsych timeline nodes.
//
// Calibration and training therefore do not increment it.
// ==========================================================

let experimentProgress = {
  completed: 0,
  total    : 0,
};


function setExperimentProgress(
  completed,
  total
) {

  experimentProgress.completed =
    completed;

  experimentProgress.total =
    total;

  updateExperimentProgressDisplay();


  // Synchronize the visual progress bar.
  if (
    typeof jsPsych !== 'undefined' &&
    jsPsych.progressBar &&
    total > 0
  ) {

    const proportion =
      Math.max(
        0,
        Math.min(
          1,
          completed / total
        )
      );

    jsPsych.progressBar.progress =
      proportion;
  }
}


function incrementExperimentProgress() {

  if (
    experimentProgress.completed <
    experimentProgress.total
  ) {

    experimentProgress.completed +=
      1;
  }


  updateExperimentProgressDisplay();


  // Synchronize the visual progress bar.
  if (
    typeof jsPsych !== 'undefined' &&
    jsPsych.progressBar &&
    experimentProgress.total > 0
  ) {

    const proportion =
      Math.max(
        0,
        Math.min(
          1,
          experimentProgress.completed /
            experimentProgress.total
        )
      );

    jsPsych.progressBar.progress =
      proportion;
  }
}


let experimentStageLabel = null;
function setStudyStage(label = null) {
  experimentStageLabel = label;
  updateExperimentProgressDisplay();
}
function updateExperimentProgressDisplay() {

  let counter =
    document.getElementById(
      'experiment-progress-counter'
    );

  if (!counter) {

    counter =
      document.createElement('div');

    counter.id =
      'experiment-progress-counter';

    // Place it next to the jsPsych progress bar.
    counter.style.cssText = [
      'position:fixed',
      'top:8px',
      'right:18px',
      'z-index:10000',
      'font-size:14px',
      'font-weight:600',
      'line-height:20px',
      'padding:2px 7px',
      'background:rgba(255,255,255,0.9)',
      'border-radius:4px',
    ].join(';');

    document.body.appendChild(
      counter
    );
  }

  counter.textContent =
    experimentStageLabel || `${experimentProgress.completed} / ${experimentProgress.total}`;
}


// ==========================================================
// FLASK STATIC PATH HELPERS
// ==========================================================

function resolveAudioPath(path) {

  if (!path) {
    return path;
  }


  // --------------------------------------------------------
  // Already a correct Flask static URL.
  // --------------------------------------------------------

  if (
    path.startsWith('/static/')
  ) {

    return path;
  }


  // --------------------------------------------------------
  // Python pathlib paths stored in phase2_trial_orders.json
  //
  // Example:
  //
  //   static/stimulis/stimulis_first_half/...
  //
  // becomes:
  //
  //   /static/stimulis/stimulis_first_half/...
  // --------------------------------------------------------

  if (
    path.startsWith('static/')
  ) {

    return '/' + path;
  }


  // --------------------------------------------------------
  // Old dataset structure — retained for Phase 1 / Phase 3
  // compatibility.
  // --------------------------------------------------------

  if (
    path.startsWith(
      'assets/audio/testing_samples/'
    )
  ) {

    return path.replace(
      'assets/audio/testing_samples/',
      '/static/stimulis/test/'
    );
  }


  if (
    path.startsWith(
      'assets/audio/training_samples/'
    )
  ) {

    return path.replace(
      'assets/audio/training_samples/',
      '/static/stimulis/train/'
    );
  }


  if (
    path.startsWith(
      'assets/audio/baseline_samples/'
    )
  ) {

    return path.replace(
      'assets/audio/baseline_samples/',
      '/static/stimulis/baseline/'
    );
  }


  console.warn(
    'Unrecognized audio path:',
    path
  );


  return path;
}


// ==========================================================
// CSV EXPORT
// ==========================================================

function resultsToCsv(jsPsych) {

  return jsPsych.data
    .get()
    .filter({
      step    : 'ratings',
      training: false,
    })
    .ignore('training')
    .ignore('response')
    .ignore('trial_type')
    .ignore('plugin_version')
    .ignore('internal_node_id')
    .csv();
}


function downloadCsv(
  csv,
  filename
) {

  const blob =
    new Blob(
      [csv],
      {
        type: 'text/csv',
      }
    );

  const a =
    document.createElement('a');

  a.href =
    URL.createObjectURL(blob);

  a.download =
    filename;

  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);

  URL.revokeObjectURL(a.href);
}


// ==========================================================
// DEVELOPMENT CSV BUTTON
// ==========================================================

function addPartialDownloadButton(
  jsPsych,
  downloadFilename
) {

  const btn =
    document.createElement('button');

  btn.textContent =
    'Download partial results';

  btn.style.cssText =
    'position:fixed;bottom:14px;right:14px;z-index:9999;padding:9px 16px;' +
    'font-size:12.5px;background:#1e508c;color:#fff;border:none;border-radius:8px;' +
    'cursor:pointer;opacity:.85;box-shadow:0 1px 6px rgba(0,0,0,.25);';

  btn.addEventListener(
    'mouseenter',
    () => {
      btn.style.opacity = '1';
    }
  );

  btn.addEventListener(
    'mouseleave',
    () => {
      btn.style.opacity = '.85';
    }
  );

  btn.addEventListener(
    'click',
    () => {

      downloadCsv(
        resultsToCsv(jsPsych),
        'partial_' + downloadFilename
      );
    }
  );

  document.body.appendChild(
    btn
  );
}


// ==========================================================
// INITIALIZE JSPsych
// ==========================================================

function renderStudyCompletion(target) {
  target.innerHTML = `
            <div
              style="
                text-align:center;
                padding:120px 20px;
              "
            >
              <h2 style="color:#1e508c">
                Thank you for your participation!
              </h2>

              <p>
                Your responses have been saved.
              </p>
            </div>
          `;
}

function makeJsPsych(
  downloadFilename
) {

  let finished = false;

  const jsPsych =
    initJsPsych({

      show_progress_bar: true,

      auto_update_progress_bar: false,

      on_data_update(data) {
        if (window.STUDY_COMPLETION_PREVIEW || !window.ASSIGNED_USER_ID) return;
        durableStudyPost('/api/event', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: crypto.randomUUID(),
            prolificID: window.PROLIFIC_ID, userID: window.ASSIGNED_USER_ID,
            phase: window.EXPERIMENT_PHASE, client_time: new Date().toISOString(), payload: data }),
        }).catch(showSavingStatus);
      },
      async on_finish() {
        if (window.STUDY_COMPLETION_PREVIEW) {
          finished = true;
          renderStudyCompletion(jsPsych.getDisplayElement());
          return;
        }
        await waitForStudySaves();
        finished = true;

        // Keep the local CSV download as a temporary
        // development safety net.
        downloadCsv(
          resultsToCsv(jsPsych),
          downloadFilename
        );

        renderStudyCompletion(jsPsych.getDisplayElement());
      },
    });


  window.addEventListener(
    'beforeunload',
    event => {

      if (finished || window.STUDY_COMPLETION_PREVIEW) {
        return;
      }

      event.preventDefault();

      event.returnValue = '';
    }
  );


  // Development only:
  //
  // addPartialDownloadButton(
  //   jsPsych,
  //   downloadFilename
  // );


  return jsPsych;
}


// ==========================================================
// GENERIC LISTENING SCREEN
// ==========================================================

function listenHtml({ role = null } = {}) {
  return `<div class="listen-wrap">${role ? `<div class="sound-role">${role}</div>` : ''}<div class="listen-hint">Listen carefully before continuing.</div></div>`;
}

// ==========================================================
// GENERIC LISTENING TRIAL
// ==========================================================

function buildListenTrial({
  audioPath,
  choices,
  prompt,
  data,
}) {

  return {
    type:
      jsPsychAudioButtonResponse,

    stimulus:
      audioPath,

    choices:
      choices,

    prompt:
      prompt,

    // Every experimental sound is presented for at most
    // five seconds.
    //
    // If the WAV is shorter, its natural duration is used.
    // If it is longer, playback stops after five seconds.
    stimulus_duration:
      STIMULUS_CONFIG.maxAudioDurationSeconds * 1000,

    // The participant cannot continue while the sound
    // presentation is still running.
    response_allowed_while_playing:
      false,

    data:
      data,
  };
}


// ==========================================================
// AUDIO CALIBRATION
// ==========================================================
//
// During calibration ONLY, participants may replay sounds.
//
// Calibration answers are stored in the database.
//
// completedKeys allows a returning participant to skip
// calibration questions that have already been answered.
// ==========================================================

const CALIBRATION_AUDIO = [
  '/static/stimulis/calibration/pink_noise.wav',
  '/static/stimulis/training/phase1/02_sound.wav',
  '/static/stimulis/calibration/extreme_negative.wav',
  '/static/stimulis/calibration/quiet_alpha_minus8.wav',
];
function buildCalibrationTrials(completedKeys = new Set()) {
  let replay = null;
  const stop = () => { if (replay) { replay.pause(); replay.currentTime = 0; replay = null; } };
  const save = (key, payload) => saveTrialToServer({
    phase: window.EXPERIMENT_PHASE, trialKey: `calibration|${key}`,
    section: 'calibration', training: false, payload,
  }).catch(error => console.error('Calibration save failed:', error));
  const volume = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="screen"><h2>Audio Calibration</h2>
      <p>As a reminder, you should wear <strong>headphones or earphones</strong> and be in a <strong>quiet environment</strong>.</p>
      <p>Listen to all four sounds below. Use your device volume control to find a <strong>comfortable listening level</strong> for all four.</p>
      <p>While most sounds in the study feel nice or neutral, sound 2 and 3 may feel a little unpleasant. We included them here to make sure you select a sound level at which they do not sound too uncomfortable. At the same time, make sure that sound 4, which is quieter, remains clearly audible at the selected sound level. You may replay these sounds while adjusting your volume.</p>
      <div class="calibration-samples">${CALIBRATION_AUDIO.map((path, i) => `<button type="button" class="jspsych-btn calibration-sample" data-index="${i}">▶ Play sound ${i + 1}</button>`).join('')}</div>
      <p id="calibration-play-status" role="status">Listen to each sound before answering.</p>
      <p><strong>How would you describe the current volume?</strong></p></div>`,
    choices: ['Too quiet', 'Comfortable', 'Too loud'],
    data: { step: 'calibration', calibration_test: 'volume', audio_paths: CALIBRATION_AUDIO, instructions_version: '2026-11-10' },
    on_load() {
      setStudyStage('Calibration 1 / 2');
      const heard = new Set();
      const answers = [...document.querySelectorAll('#jspsych-html-button-response-btngroup button')];
      const plays = [...document.querySelectorAll('.calibration-sample')];
      const status = document.getElementById('calibration-play-status');
      answers.forEach(button => button.disabled = true);
      plays.forEach(button => button.addEventListener('click', () => {
        stop();
        const index = Number(button.dataset.index);
        plays.forEach(item => item.disabled = true);
        answers.forEach(item => item.disabled = true);
        status.textContent = `Playing sound ${index + 1}…`;
        const audio = replay = new Audio(CALIBRATION_AUDIO[index]);
        const failed = () => {
          stop(); plays.forEach(item => item.disabled = false);
          status.textContent = 'Audio could not play. Please try again.';
        };
        audio.addEventListener('error', failed, { once: true });
        audio.addEventListener('ended', () => {
          heard.add(index); replay = null;
          button.textContent = `↻ Replay sound ${index + 1} ✓`;
          plays.forEach(item => item.disabled = false);
          answers.forEach(item => item.disabled = heard.size !== CALIBRATION_AUDIO.length);
          status.textContent = heard.size === CALIBRATION_AUDIO.length ? 'All four sounds played. You may answer or replay a sound.' : `${heard.size} / ${CALIBRATION_AUDIO.length} sounds played.`;
        }, { once: true });
        audio.play().catch(failed);
      }));
    },
    on_finish(data) {
      stop(); data.answer = ['too_quiet', 'comfortable', 'too_loud'][data.response];
      data.acceptable_volume = data.response === 1;
    },
  };
  const volumeLoop = { timeline: [volume], loop_function(data) {
    const last = data.values().at(-1);
    if (last.acceptable_volume) { save('volume', last); return false; }
    return true;
  } };
  const locked = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="screen"><h2>Listening volume set ✓</h2><p>Your listening volume is now set.</p><p><strong>Please do not change the volume on your computer, device, or headphones for the rest of the experiment.</strong></p><p>Keeping the same listening level throughout the experiment is important for the scientific validity of the experiment.</p></div>`,
    choices: ['Continue'], data: { step: 'calibration_volume_confirmed' },
    on_load() { setStudyStage('Calibration 1 / 2'); },
  };
  let side = Math.random() < 0.5 ? 'left' : 'right';
  let retry = false;
  const stereo = {
    type: jsPsychAudioButtonResponse,
    stimulus: () => `/static/stimulis/calibration/${side}.wav`,
    prompt: '<div class="screen"><h2>2. Headphone check</h2><p>Keep your headphones or earphones on and indicate where you hear the sound.</p><p><strong>Where do you hear the sound?</strong></p></div>',
    choices: ['Left', 'Center', 'Right'], response_allowed_while_playing: false,
    data: { step: 'calibration', calibration_test: 'stereo' },
    on_load() { setStudyStage('Calibration 2 / 2'); },
    on_finish(data) {
      data.correct_answer = side;
      data.audioPath = `/static/stimulis/calibration/${side}.wav`;
      data.answer = ['left', 'center', 'right'][data.response];
      data.correct = data.answer === side;
    },
  };
  const retryMessage = {
    timeline: [{ type: jsPsychHtmlButtonResponse,
      stimulus: '<div class="screen"><h2>Make sure you are wearing your headphones right</h2><p>Check that the left and right earpieces are in the correct ears.</p></div>',
      choices: ['Play the sound'], data: { step: 'calibration_stereo_retry' },
      on_load() { setStudyStage('Calibration 2 / 2'); },
    }], conditional_function: () => retry,
  };
  const stereoLoop = { timeline: [retryMessage, stereo], loop_function(data) {
    const last = data.values().at(-1);
    if (last.correct) { save('stereo', last); return false; }
    side = side === 'left' ? 'right' : 'left'; retry = true;
    return true;
  } };
  const trials = [];
  if (!completedKeys.has('calibration|volume')) trials.push(volumeLoop, locked);
  if (!completedKeys.has('calibration|stereo')) trials.push(stereoLoop);
  if (trials.length) trials.push({ type: jsPsychHtmlButtonResponse,
    stimulus: '<div class="screen"><h2>Audio Calibration complete</h2></div>',
    choices: ['Start training'], data: { step: 'calibration_complete' },
    on_load() { setStudyStage('Calibration 2 / 2'); },
  });
  return trials;
}

// ==========================================================
// GENERIC QUESTIONNAIRE
// ==========================================================

function buildSliderSurveyTrial(
  jsPsych,
  questions,
  {
    data,
    isTraining = false,
    tagLabel = 'Training',
    onRatingChange = () => {},
  } = {}
) {

  const state = {};
  const moved = new Set();


  const tag = '';


  const html =
    '<div class="survey-wrap">' +
    tag +

    questions
      .map(
        (question, index) => `
          <div class="survey-item">

            <p class="survey-question">
              ${question.text}
            </p>

            <div class="slider-row">

              <span class="slider-lbl lbl-left">
                ${question.left}
              </span>

              <div class="rating-track"><input
                type="range"
                id="q${index}"
                class="survey-slider"
                min="0"
                max="100"
                step="1"
                value="50"
                aria-label="${question.text}"
              ><span class="rating-midpoint" aria-hidden="true"></span><span class="rating-midpoint-label">${question.middle || ''}</span></div>

              <span class="slider-lbl lbl-right">
                ${question.right}
              </span>

            </div>

          </div>
        `
      )
      .join('') +

    '</div>';


  return {

    type:
      jsPsychHtmlButtonResponse,

    stimulus:
      html,

    choices:
      ['Submit'],

    data:
      Object.assign(
        {
          step: 'ratings', questionnaire_version: '2026-11-10',
        },
        data
      ),


    on_load() {
      moved.clear();
      const submit = document.querySelector('#jspsych-html-button-response-btngroup button');
      submit.disabled = true;
      questions.forEach(
        (_, index) => {
          state[index] = 50;
        }
      );


      questions.forEach(
        (_, index) => {

          const slider =
            document.getElementById(
              'q' + index
            );

          if (slider) {

            slider.addEventListener(
              'input',
              () => {

                moved.add(index);
                submit.disabled = moved.size !== questions.length;
                onRatingChange(moved.size === questions.length);
                state[index] =
                  parseInt(
                    slider.value
                  );
              }
            );
          }
        }
      );
    },


    on_finish(trialData) {

      const extra = {};


      questions.forEach(
        (question, index) => {

          extra[question.key] =
            trialData.ratings_skipped ? null : (state[index] !== undefined
              ? state[index]
              : 50);
        }
      );


      jsPsych.data.addDataToLastTrial(
        extra
      );


      const completeData = {
        ...trialData,
        ...extra,
      };


      const section =
        isTraining
          ? 'training'
          : 'test';


      const trialKey =
        experimentalTrialKey(
          section,
          trialData.trialIndex
        );


      // Save immediately after this questionnaire.
      //
      // For main-test trials, update x / total ONLY after
      // Flask confirms the save.
      saveTrialToServer({

        phase:
          window.EXPERIMENT_PHASE,

        trialKey:
          trialKey,

        trialIndex:
          trialData.trialIndex,

        section:
          section,

        soundId:
          trialData.soundId ?? null,

        training:
          isTraining,

        payload:
          completeData,

      }).then(result => {

        if (
          !isTraining &&
          result &&
          result.inserted === true
        ) {

          incrementExperimentProgress();
        }

      }).catch(error => {

        console.error(
          'Questionnaire save failed:',
          error
        );
      });
    },
  };
}


// ==========================================================
// TEMPLATED QUESTIONNAIRE
// ==========================================================
//
// Retained for the other experiment phases.
// We are not changing its behavior yet.
// ==========================================================

function buildTemplatedQuestionTrial(
  jsPsych,
  config,
  {
    data,
    isTraining = false,
    tagLabel = 'Training',
  } = {}
) {

  const {
    directionOptions,
    questions,
  } = config;


  const direction =
    directionOptions[
      Math.floor(
        Math.random() *
        directionOptions.length
      )
    ];


  const fill =
    text =>
      text.replace(
        /\{direction\}/g,
        direction
      );


  const state = {};


  const choiceKeys =
    questions
      .filter(
        question =>
          question.type === 'choice'
      )
      .map(
        question =>
          question.key
      );


  const tag = '';


  const html =
    '<div class="survey-wrap">' +
    tag +

    questions
      .map(
        (question, index) => {

          if (
            question.type === 'choice'
          ) {

            return `
              <div class="survey-item">

                <p class="survey-question">
                  ${fill(question.text)}
                </p>

                <div class="p2-btn-group">

                  ${question.choices
                    .map(
                      choice => `
                        <button
                          type="button"
                          class="p2-choice-btn"
                          data-key="${question.key}"
                          data-choice="${choice}"
                        >
                          ${choice}
                        </button>
                      `
                    )
                    .join('')}

                </div>

              </div>
            `;
          }


          return `
            <div class="survey-item">

              <p class="survey-question">
                ${fill(question.text)}
              </p>

              <div class="slider-row">

                <span class="slider-lbl lbl-left">
                  ${fill(question.left)}
                </span>

                <input
                  type="range"
                  id="q${index}"
                  class="survey-slider"
                  min="0"
                  max="100"
                  value="0"
                >

                <span class="slider-lbl lbl-right">
                  ${fill(question.right)}
                </span>

              </div>

            </div>
          `;
        }
      )
      .join('') +

    '</div>';


  return {

    type:
      jsPsychHtmlButtonResponse,

    stimulus:
      html,

    choices:
      ['Submit'],

    data:
      Object.assign(
        {
          step:
            'ratings',

          Direction_Question:
            direction,
        },
        data
      ),


    on_load() {

      const submitBtn =
        document.querySelector(
          '.jspsych-btn'
        );


      if (!submitBtn) {
        return;
      }


      const updateSubmit =
        () => {

          const allChosen =
            choiceKeys.every(
              key =>
                state[key] !== undefined
            );

          submitBtn.disabled =
            !allChosen;

          submitBtn.classList.toggle(
            'btn-disabled',
            !allChosen
          );
        };


      updateSubmit();


      questions.forEach(
        (question, index) => {

          if (
            question.type === 'slider'
          ) {

            state[question.key] =
              0;

            const slider =
              document.getElementById(
                'q' + index
              );

            if (slider) {

              slider.addEventListener(
                'input',
                event => {

                  state[question.key] =
                    parseInt(
                      event.target.value
                    );
                }
              );
            }
          }
        }
      );


      document
        .querySelectorAll(
          '.p2-choice-btn'
        )
        .forEach(
          button => {

            button.addEventListener(
              'click',
              () => {

                const key =
                  button.dataset.key;


                document
                  .querySelectorAll(
                    `.p2-choice-btn[data-key="${key}"]`
                  )
                  .forEach(
                    otherButton =>
                      otherButton.classList.remove(
                        'selected'
                      )
                  );


                button.classList.add(
                  'selected'
                );


                state[key] =
                  button.dataset.choice;


                updateSubmit();
              }
            );
          }
        );
    },


    on_finish() {

      jsPsych.data.addDataToLastTrial(
        state
      );
    },
  };
}

// ==========================================================
// PHASE 2 — RELATIVE EMOTION QUESTIONNAIRE
// ==========================================================
//
// Both sounds are positioned on the SAME emotional continuum.
//
// 0   = Calm / Quiet / Relaxed
// 100 = Angry / Aggressive / Furious
//
// The two positions are saved independently as:
//   Emotion_A
//   Emotion_B
//
// This function is specific to the Phase-2 pairwise task.
// ==========================================================

function buildRelativeEmotionTrial(
  jsPsych,
  {
    data,
    isTraining = false,
    tagLabel = 'Training',
    emotionQuestion = { text: 'How did sound A feel compared to sound B?', left: 'Calm, relaxed, quiet', right: 'Angry, aggressive, violent' },
    onRatingChange = () => {},
  } = {}
) {

  // Initial positions are deliberately separated slightly
  // so that both markers remain visible.
  //
  // Participants must move BOTH markers before submitting.
  const state = {
    Emotion_A: 45,
    Emotion_B: 55,
  };

  const touched = {
    A: false,
    B: false,
  };


  const tag = '';


  const html = `
    <div class="survey-wrap">
      ${tag}
      <h2 style="font-size:1.5rem;line-height:1.4">${emotionQuestion.text}</h2>
      <p>Please place both sounds on the scale below, going from <strong>${emotionQuestion.left}</strong> to <strong>${emotionQuestion.right}</strong>.</p>
      <p><strong style="color:#3273dc">● Sound A (blue)</strong> &nbsp; <strong style="color:#d95f59">● Sound B (red)</strong></p>
      <div style="display:flex;justify-content:space-between;gap:20px;margin-top:30px">
        <strong>${emotionQuestion.left}</strong><strong>${emotionQuestion.right}</strong>
      </div>
      <div id="emotion-scale-container" style="position:relative;height:130px;margin:10px 24px;touch-action:none">
        <div style="position:absolute;top:62px;left:0;right:0;height:5px;background:#b8b8b8;border-radius:3px"></div>
        <div aria-hidden="true" style="position:absolute;left:50%;top:55px;height:19px;border-left:2px solid #555"></div>
        <div id="emotion-marker-a" role="slider" tabindex="0" aria-label="Sound A emotion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="45"
          style="position:absolute;left:45%;top:16px;transform:translateX(-50%);width:44px;height:44px;border-radius:50%;background:#3273dc;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;cursor:grab;touch-action:none;user-select:none">A</div>
        <div id="emotion-marker-b" role="slider" tabindex="0" aria-label="Sound B emotion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="55"
          style="position:absolute;left:55%;top:69px;transform:translateX(-50%);width:44px;height:44px;border-radius:50%;background:#d95f59;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;cursor:grab;touch-action:none;user-select:none">B</div>
      </div>
      <p id="emotion-instruction">Drag both circles to position the sounds. You can also focus each circle and use the arrow keys. The circles may be placed at the same position.</p>
    </div>
  `;

  return {

    type:
      jsPsychHtmlButtonResponse,

    stimulus:
      html,

    choices: [
      'Submit'
    ],

    data:
      Object.assign(
        {
          step: 'ratings',
          rating_format: 'shared_emotion_v1',
          emotion_scale: { min: 0, max: 100, left: emotionQuestion.left, right: emotionQuestion.right },
          questionnaire_version: '2026-11-10',
        },
        data
      ),


    on_load() {
      const scale = document.getElementById('emotion-scale-container');
      const submit = document.querySelector('.jspsych-btn');
      const instruction = document.getElementById('emotion-instruction');
      const ready = () => {
        submit.disabled = !(touched.A && touched.B);
        onRatingChange(touched.A && touched.B);
        if (!submit.disabled) instruction.textContent = 'Both sounds have been positioned. You may adjust them further or submit.';
      };
      for (const role of ['A', 'B']) {
        const marker = document.getElementById(`emotion-marker-${role.toLowerCase()}`);
        const update = value => {
          value = Math.max(0, Math.min(100, Math.round(value)));
          if (value !== state[`Emotion_${role}`]) touched[role] = true;
          state[`Emotion_${role}`] = value;
          marker.style.left = `${value}%`;
          marker.setAttribute('aria-valuenow', value);
          ready();
        };
        let dragging = false;
        const move = event => {
          const bounds = scale.getBoundingClientRect();
          if (dragging && bounds.width) update((event.clientX - bounds.left) / bounds.width * 100);
        };
        marker.addEventListener('pointerdown', event => {
          event.preventDefault(); marker.focus(); dragging = true;
          marker.setPointerCapture(event.pointerId); move(event);
        });
        marker.addEventListener('pointermove', move);
        marker.addEventListener('pointerup', event => { move(event); dragging = false; });
        marker.addEventListener('pointercancel', () => { dragging = false; });
        marker.addEventListener('keydown', event => {
          const value = state[`Emotion_${role}`];
          const next = { ArrowLeft:value-1, ArrowDown:value-1, ArrowRight:value+1,
                         ArrowUp:value+1, Home:0, End:100 }[event.key];
          if (next !== undefined) { event.preventDefault(); update(next); }
        });
      }
      ready();
    },


    on_finish(trialData) {

      // ----------------------------------------------------
      // Add the two positions to the local jsPsych data
      // ----------------------------------------------------

      jsPsych.data.addDataToLastTrial({
        Emotion_A:
          trialData.ratings_skipped ? null : state.Emotion_A,

        Emotion_B:
          trialData.ratings_skipped ? null : state.Emotion_B,
      });


      const completeData = {
        ...trialData,

        Emotion_A:
          trialData.ratings_skipped ? null : state.Emotion_A,

        Emotion_B:
          trialData.ratings_skipped ? null : state.Emotion_B,
      };


      const section =
        isTraining
          ? 'training'
          : 'test';


      const trialKey =
        experimentalTrialKey(
          section,
          trialData.trialIndex
        );


      // ----------------------------------------------------
      // Save to database
      // ----------------------------------------------------

      saveTrialToServer({

        phase:
          window.EXPERIMENT_PHASE,

        trialKey:
          trialKey,

        trialIndex:
          trialData.trialIndex,

        section:
          section,

        soundId:
          trialData.soundId ?? null,

        training:
          isTraining,

        payload:
          completeData,

      }).then(result => {

        if (
          !isTraining &&
          result &&
          result.inserted === true
        ) {

          incrementExperimentProgress();
        }

      }).catch(error => {

        console.error(
          'Phase 2 questionnaire save failed:',
          error
        );
      });
    },
  };
}


// ==========================================================
// SHUFFLE
// ==========================================================

function shuffle(arr) {

  const a =
    [...arr];


  for (
    let i = a.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() *
        (i + 1)
      );


    [
      a[i],
      a[j],
    ] = [
      a[j],
      a[i],
    ];
  }


  return a;
}
// Notebook-assigned experiments. USER ID chooses an order; Prolific ID owns saved responses.
async function fetchExperimentJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { message = (await response.json()).error || message; } catch (_) {}
    throw new Error(`${url}: ${message}`);
  }
  return response.json();
}

function validateAssignedPlan(plan, phase, userID) {
  const counts = { phase1: 234, phase2: 190, phase3: 180 };
  if (plan?.version !== 3 || plan.phase !== phase || plan.userID !== userID ||
      !Array.isArray(plan.training) || !Array.isArray(plan.test) ||
      plan.test.length !== counts[phase]) {
    throw new Error('Invalid participant plan. Regenerate the version-3 notebook exports.');
  }
  for (const [section, trials] of [['training', plan.training], ['test', plan.test]]) {
    const keys = new Set();
    for (const trial of trials) {
      if (!Number.isInteger(trial.trialIndex) || keys.has(trial.trialIndex)) {
        throw new Error(`Invalid or duplicate ${section} trial index.`);
      }
      keys.add(trial.trialIndex);
      const sounds = phase === 'phase1' ? [trial] : [trial.soundA, trial.soundB];
      if (sounds.some(sound => !sound || !sound.audioPath?.startsWith('/static/') || sound.durationSeconds !== 5)) {
        throw new Error('Assigned trial contains an invalid five-second audio path.');
      }
    }
  }
}

function assignmentSignature(plan) {
  // Flask may reorder object keys; compare canonical representations instead.
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
  }
  return JSON.stringify(canonical(plan));
}

function showExperimentLoadingError(error) {
  console.error('Experiment initialization failed:', error);
  const panel = document.createElement('div');
  panel.style.cssText = 'max-width:720px;margin:80px auto;padding:24px';
  const title = document.createElement('h2');
  title.textContent = 'Experiment loading error';
  const detail = document.createElement('pre');
  detail.style.whiteSpace = 'pre-wrap';
  detail.textContent = String(error.message || error);
  panel.append(title, detail);
  document.body.replaceChildren(panel);
}

async function runAssignedExperiment(jsPsych, phase, buildTrial) {
  try {
    const params = new URLSearchParams(window.location.search);
    const prolificID = params.get('prolificID') || params.get('PROLIFIC_PID');
    if (!prolificID?.trim()) throw new Error('Add a non-empty prolificID to the URL.');
    window.PROLIFIC_ID = prolificID.trim();
    if (window.PROLIFIC_ID === 'last screen') {
      window.STUDY_COMPLETION_PREVIEW = true;
      await jsPsych.run([buildFinalFeedback(phase)]);
      return;
    }
    const registration = await fetch('/api/participant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prolificID: window.PROLIFIC_ID }),
    });
    const participant = await registration.json();
    if (!registration.ok) throw new Error(participant.error || 'Participant registration failed');
    const userID = participant.userID;
    window.ASSIGNED_USER_ID = userID;
    const locationURL = new URL(window.location.href);
    locationURL.searchParams.set('userID', userID);
    window.history.replaceState(null, '', locationURL);
    await flushStudyOutbox();
    window.EXPERIMENT_PHASE = phase;

    const [assigned, questions, trainingManifest] = await Promise.all([
      fetchExperimentJson(`/api/trial-order?phase=${phase}&userID=${userID}`),
      fetchExperimentJson(`/static/js/questions_${phase}.json`),
      fetchExperimentJson('/static/stimulis/training/manifest.json'),
    ]);
    validateAssignedPlan(assigned, phase, userID);
    if (!Array.isArray(questions) || !questions.length) throw new Error('Questionnaire is empty or invalid.');

    const state = await loadPhaseSession(phase);
    let session = state.session;
    if (!session) session = (await createPhaseSession(phase, assigned)).session;
    if (!session?.trial_order || assignmentSignature(session.trial_order) !== assignmentSignature(assigned)) {
      throw new Error('This Prolific ID already has a different saved assignment. Use its original userID, or a fresh test prolificID.');
    }
    const fixedTraining = trainingManifest[phase];
    if (!Array.isArray(fixedTraining) || fixedTraining.length !== (phase === 'phase1' ? 4 : 3)) {
      throw new Error('Training manifest must contain four examples for phase 1 and three for phases 2 and 3.');
    }
    const plan = { ...session.trial_order, training: fixedTraining };
    validateAssignedPlan(plan, phase, userID);
    const completed = completedTrialKeySet(state.completed);
    const isDone = (trial, section) => completed.has(experimentalTrialKey(section, trial.trialIndex));
    const remaining = plan.test.filter(trial => !isDone(trial, 'test'));
    const training = plan.training.filter(trial => !isDone(trial, 'training'));
    setExperimentProgress(plan.test.length - remaining.length, plan.test.length);

    const audioPaths = [...training, ...remaining].flatMap(trial => phase === 'phase1'
      ? [trial.audioPath] : [trial.soundA.audioPath, trial.soundB.audioPath]);
    if (!completed.has('calibration|volume')) audioPaths.push(...CALIBRATION_AUDIO);
    if (!completed.has('calibration|stereo')) audioPaths.push('/static/stimulis/calibration/left.wav', '/static/stimulis/calibration/right.wav');
    const timeline = [{
      type: jsPsychPreload, audio: [...new Set(audioPaths)], show_progress_bar: true,
      message: '<p>Loading assigned audio files, please wait…</p>',
      error_message: '<p>Audio loading failed. Check the Flask terminal and refresh.</p>',
    }];
    const paired = phase !== 'phase1';
    const qualityReminder = '<p>Please wear your headphones correctly, listen carefully, and answer honestly. We include attention checks and review response quality. Random or inattentive responding may result in rejection of your submission and non-payment after review.</p>';
    if (completed.size) {
      timeline.push({ type: jsPsychHtmlButtonResponse,
        stimulus: `<div class="screen"><h2>Welcome back</h2><p>${plan.test.length - remaining.length} / ${plan.test.length} trials completed.</p><p>Please return to a quiet environment and put your headphones on before resuming.</p><p></p></div>`,
        choices: ['Resume'] });
    } else {
      timeline.push({ type: jsPsychHtmlButtonResponse,
        stimulus: `<div class="screen"><h2>Welcome to this scientific listening study,</h2>
        <p>Please read these instructions carefully before starting.</p>
        <ul class="instruction-list"><li>Wear <strong>headphones or earphones in both ears</strong> (charged if wireless) and disable noise cancellation or any other type of audio enhancement.</li>
        <li>Make sure you are on a computer, laptop or tablet (not a smartphone) and in a quiet place.</li>
        <li>Make sure you won't be disturbed for the duration of the experiment (tell the people around you that you should not be disturbed, close all other applications on your device, put you phone away and in "do not disturb" mode, etc.)</li>
        <li>Put this browser window in <strong>full screen</strong>.</li></ul>
        <p>The study has three stages: <strong>calibration → practice → main study</strong>. It should last about <strong>1 hour</strong>.</p>
        <p>For this study to yield valid scientific conclusions, we rely on you to carefully follow the instructions, listen attentively to the sounds and answer the questions honestly and thoughtfully. Various technical and attention checks have been included and we reserve the right to reject your submission should you fail these checks.</p><p>Thank you for your time and contribution to this study!</p></div>`,
        choices: ['Continue'] });
    }
    timeline.push(...buildCalibrationTrials(completed));
    if (training.length) timeline.push({ type: jsPsychHtmlButtonResponse,
      stimulus: phase === 'phase1' ? `<div class="screen"><h2>Practice</h2>
      <p>You will now complete <strong>${plan.training.length} trials</strong> to familiarize yourself with the task. At the beginning of each trial, you will listen to a <strong>5-second sound</strong>.</p>
      <p>Then we will ask you:</p><ol class="instruction-list" type="i"><li>Whether you heard anything at all and, if you did, whether that included footsteps (or footsteps-like sounds).</li><li>Did you hear audio artefacts overlaid on the sound (crackling, electrical noise, intermittent background noise…)?</li><li>Irrespective of the presence of footsteps and ignoring any audio artefact, how realistic did the sound feel to you? Could you have heard it in the real world?</li></ol>
      <p>In practice, as in the main experiment, each sound will be played <strong>only once and cannot be replayed</strong>. Please listen carefully.</p>
      <p>If for any reason you get disconnected, use the link in Prolific to reconnect to the experiment. You will automatically continue where you left off.</p></div>` : `<div class="screen"><h2>Practice</h2>
      <p>You will now complete <strong>${plan.training.length} practice trials</strong> to familiarize yourself with the task. At the beginning of each trial, you will hear <strong>two 5-second sounds</strong>: Sound A, then Sound B.</p>
      <p>Then we will ask you:</p><ol class="instruction-list"><li>Whether you heard anything in Sound A and in Sound B, separately.</li>
      ${phase === 'phase2' ? `<li>${questions[0].text} Place <strong>blue A and red B</strong> on the same scale, from <strong>${questions[0].left}</strong> to <strong>${questions[0].right}</strong>. They may occupy the same position.</li>` : questions.map(q => `<li>${q.text} Use the scale from <strong>${q.left}</strong> to <strong>${q.right}</strong>.</li>`).join('')}
      </ol><p>There is no preferred answer: give your own impression.</p>
      <p>In practice, as in the main experiment, each sound will be played <strong>only once and cannot be replayed</strong>. Please listen carefully. Keep your headphones on and your calibrated volume unchanged.</p>
      <p>If you get disconnected, use the link in Prolific to reconnect. You will automatically continue where you left off.</p></div>`,
      choices: ['Start practice'], on_load() { setStudyStage('Practice'); } });
    timeline.push(...training.map(trial => ({
      timeline: buildTrial(trial, questions, true),
      on_timeline_start() { setStudyStage(`Practice ${plan.training.indexOf(trial) + 1} / ${plan.training.length}`); },
    })));
    if (training.length) timeline.push({ type: jsPsychHtmlButtonResponse,
      stimulus: `<div class="screen"><h3>Practice complete</h3><p>The main study has <strong>${plan.test.length} trials</strong>, with ${plan.procedure.break_after.length} optional breaks. The questions work the same way as in practice. Listen fully and read each question before responding.</p>${qualityReminder}</div>`, choices: ['Start the study'], on_load() { setStudyStage(null); } });

    const breaks = plan.procedure?.break_after || [];
    const seenBreaks = new Set();
    const catches = attentionCheckSchedule(phase, userID, plan.test.length);
    const emittedCatches = new Set();
    for (const trial of remaining) {
      // Boundaries count experimental trials, regardless of extra timeline nodes.
      // A resumed session gets only the most recent crossed boundary, not a series of missed breaks.
      const boundary = breaks.filter(value => value <= trial.trialIndex).at(-1);
      if (boundary !== undefined && !seenBreaks.has(boundary)) {
        const laterAlreadyDone = plan.test.some(t => t.trialIndex >= boundary && isDone(t, 'test'));
        if (!laterAlreadyDone) timeline.push({ type: jsPsychHtmlButtonResponse,
          stimulus: `<div class="screen"><h3>Time for a break</h3><p>You may rest for two minutes. Continue whenever you are ready.</p><p>Before continuing, put both earphones back in place, check that your surroundings are quiet, and return your attention to the recordings. Keep the calibrated volume unchanged.</p></div>`, choices: ['Continue when ready'] });
        seenBreaks.add(boundary);
      }
      // Insert due, unfinished checks, including one interrupted just before a refresh.
      for (const check of catches.filter(check => check.after <= trial.trialIndex)) {
        if (!emittedCatches.has(check.id) && !completed.has(`attention|${check.id}`)) {
          timeline.push(buildAttentionCheck(check, phase));
          emittedCatches.add(check.id);
        }
      }
      timeline.push({ timeline: buildTrial(trial, questions, false), on_timeline_start() { setStudyStage(null); } });
    }
    for (const check of catches) {
      if (!emittedCatches.has(check.id) && !completed.has(`attention|${check.id}`)) {
        timeline.push(buildAttentionCheck(check, phase));
      }
    }
    if (!completed.has('feedback|final')) timeline.push(buildFinalFeedback(phase));
    console.info(`[${phase}] USER ID ${userID}: ${plan.test.length} assigned, ${remaining.length} remaining.`);
    await jsPsych.run(timeline);
  } catch (error) {
    showExperimentLoadingError(error);
  }
}

// Audibility is recorded even when the subsequent ratings are skipped.
function buildSurveyTrial(jsPsych, questions, options = {}) {
  if (window.EXPERIMENT_PHASE === 'phase1') return buildPhaseOneSurvey(jsPsych, questions, options);
  return buildPairedSurvey(jsPsych, questions, options);
}

function buildPairedSurvey(jsPsych, questions, options = {}) {
  const heard = { A: null, B: null };
  let ratingsReady = false;
  let update = null;
  const settings = { ...options, emotionQuestion: questions[0],
    onRatingChange(ready) { ratingsReady = ready; if (update) update(); } };
  const trial = window.EXPERIMENT_PHASE === 'phase2'
    ? buildRelativeEmotionTrial(jsPsych, settings) : buildSliderSurveyTrial(jsPsych, questions, settings);
  const load = trial.on_load, finish = trial.on_finish;
  trial.stimulus = `<div class="survey-wrap paired-survey">${['A', 'B'].map(role => `<fieldset class="audibility-options"><legend>Sound ${role}: did you hear something?</legend><label><input type="radio" name="heard-${role}" value="no"> No, I didn’t hear anything</label><label><input type="radio" name="heard-${role}" value="yes"> Yes, I heard something</label></fieldset>`).join('')}<div id="paired-ratings">${trial.stimulus}</div><p id="paired-help" role="status"></p></div>`;
  trial.on_load = () => {
    heard.A = heard.B = null; ratingsReady = false; update = null;
    load();
    const submit = document.querySelector('#jspsych-html-button-response-btngroup button');
    update = () => {
      const skip = heard.A === false || heard.B === false;
      document.getElementById('paired-ratings').hidden = skip;
      submit.disabled = heard.A === null || heard.B === null || (!skip && !ratingsReady);
      document.getElementById('paired-help').textContent = skip
        ? ''
        : 'Answer for both sounds and move every slider or both circles before submitting.';
    };
    for (const role of ['A', 'B']) document.querySelectorAll(`input[name="heard-${role}"]`).forEach(input => input.addEventListener('change', () => { heard[role] = input.value === 'yes'; update(); }));
    update();
  };
  trial.on_finish = data => {
    const skip = heard.A === false || heard.B === false;
    Object.assign(data, { heard_sound_A: heard.A, heard_sound_B: heard.B,
      ratings_skipped: skip, skip_reason: skip ? 'inaudible' : null,
      questionnaire_version: '2026-11-10', question_order: questions.map(q => q.key) });
    finish(data);
  };
  return trial;
}


// Five independently stratified instruction checks; stable across refreshes.
function attentionCheckSchedule(phase, userID, count) {
  let seed = 2166136261;
  for (const char of `${phase}:${userID}:attention-v1`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: 5 }, (_, id) => {
    const low = Math.max(1, Math.floor(id * count / 5));
    const high = Math.floor((id + 1) * count / 5) - 1;
    return { id, after: low + Math.floor(random() * (high - low + 1)), expected: Math.floor(random() * 3) };
  });
}

function buildAttentionCheck(check, phase) {
  const labels = ['Left', 'Middle', 'Right'];
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="screen"><h3>Please read carefully</h3><p>For this question, select <strong>${labels[check.expected]}</strong>.</p></div>`,
    choices: labels,
    data: { step: 'attention', phase, userID: window.ASSIGNED_USER_ID, attention_id: check.id },
    async on_finish(data) {
      const correct = data.response === check.expected;
      Object.assign(data, { correct, expected_response: check.expected, after_trial_count: check.after });
      try {
        await saveTrialToServer({ phase, trialKey: `attention|${check.id}`, section: 'attention', payload: data });
      } catch (error) { showExperimentLoadingError(error); }
    },
  };
}

// Durable same-browser outbox. Each request is persisted before transmission.
const STUDY_OUTBOX_KEY = 'listening-study-outbox-v1';
function readStudyOutbox() { return JSON.parse(localStorage.getItem(STUDY_OUTBOX_KEY) || '[]'); }
function putStudyOutbox(jobs) { localStorage.setItem(STUDY_OUTBOX_KEY, JSON.stringify(jobs)); }
function showSavingStatus() {
  let status = document.getElementById('study-save-status');
  if (!status) {
    status = document.createElement('div'); status.id = 'study-save-status';
    status.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff0c2;padding:12px;z-index:20000;text-align:center';
    status.setAttribute('role', 'status'); document.body.appendChild(status);
  }
  status.textContent = 'Some responses are waiting to save. Keep this page open and reconnect to the server.';
}
async function transmitStudyJob(job) {
  const response = await fetch(job.url, job.options);
  if (!response.ok) throw new Error(`Saving failed: HTTP ${response.status}`);
  putStudyOutbox(readStudyOutbox().filter(item => item.id !== job.id));
  if (!readStudyOutbox().length) document.getElementById('study-save-status')?.remove();
  return response;
}
async function durableStudyPost(url, options) {
  const job = { id: crypto.randomUUID(), url, options };
  putStudyOutbox([...readStudyOutbox(), job]);
  return transmitStudyJob(job);
}
async function flushStudyOutbox() {
  for (const job of readStudyOutbox()) await transmitStudyJob(job);
}
async function waitForStudySaves() {
  for (;;) {
    try { await flushStudyOutbox(); return; }
    catch (_) {
      showSavingStatus();
      await new Promise(resolve => {
        const button = document.createElement('button');
        button.className = 'jspsych-btn'; button.textContent = 'Retry saving responses';
        button.onclick = () => { button.remove(); resolve(); };
        document.getElementById('study-save-status').appendChild(button);
      });
    }
  }
}
window.addEventListener('online', () => flushStudyOutbox().catch(showSavingStatus));

function buildPhaseOneSurvey(jsPsych, questions, options) {
  const trial = buildSliderSurveyTrial(jsPsych, questions.slice(1), options);
  const originalLoad = trial.on_load;
  const originalFinish = trial.on_finish;
  let answer = null;
  const moved = new Set();
  trial.stimulus = `<div class="survey-wrap phase-one-survey"><fieldset class="audibility-options"><legend>Did you hear footsteps?</legend>${[questions[0].left, questions[0].answer2, questions[0].answer3].map((label, index) => `<label><input type="radio" name="heard" value="${index}"> ${label}</label>`).join('')}</fieldset><div id="phase-one-ratings">${trial.stimulus}</div><p id="rating-help" role="status">Select an answer and move both sliders before submitting.</p></div>`;
  trial.on_load = () => {
    originalLoad(); answer = null; moved.clear();
    const submit = document.querySelector('#jspsych-html-button-response-btngroup button');
    const update = () => {
      document.getElementById('phase-one-ratings').hidden = answer === 0;
      submit.disabled = answer === null || (answer !== 0 && moved.size !== questions.length - 1);
      document.getElementById('rating-help').textContent = answer === 0 ? '' : 'Select an answer and move both sliders before submitting.';
    };
    document.querySelectorAll('input[name="heard"]').forEach(input => input.addEventListener('change', () => { answer = Number(input.value); update(); }));
    questions.slice(1).forEach((q, index) => document.getElementById(`q${index}`).addEventListener('input', () => { moved.add(index); update(); }));
    update();
  };
  trial.on_finish = data => {
    Object.assign(data, { audibilite_son: answer, heard_sound: answer !== 0,
      ratings_skipped: answer === 0, skip_reason: answer === 0 ? 'inaudible' : null,
      audibility_labels: [questions[0].left, questions[0].answer2, questions[0].answer3],
      question_order: questions.map(q => q.key) });
    originalFinish(data);
  };
  return trial;
}

function buildFinalFeedback(phase) {
  return {
    type: jsPsychHtmlButtonResponse, choices: [],
    stimulus: `<div class="screen"><h2>Before you finish</h2><form id="final-feedback">
      <fieldset class="audibility-options"><legend>Did you change the volume during the experiment?</legend>
      <label><input type="radio" name="volume_changed" value="yes" required> Yes</label>
      <label><input type="radio" name="volume_changed" value="no" required> No</label></fieldset>
      <div id="volume-reason-field" hidden><label for="volume-reason">Please explain briefly why.</label><textarea id="volume-reason" maxlength="4000" rows="3"></textarea></div>
      <label for="general-feedback">General feedback (optional)</label><p>Anything you want to tell us that could be useful to us.</p>
      <textarea id="general-feedback" maxlength="10000" rows="4"></textarea>
      <button type="submit" class="jspsych-btn">Submit and finish</button></form></div>`,
    data: { step: 'feedback', phase, questionnaire_version: '2026-11-10' },
    on_load() {
      setStudyStage('Feedback');
      const form = document.getElementById('final-feedback');
      const reason = document.getElementById('volume-reason');
      form.addEventListener('change', () => {
        const yes = form.elements.volume_changed.value === 'yes';
        document.getElementById('volume-reason-field').hidden = !yes; reason.required = yes;
        reason.setCustomValidity('');
      });
      reason.addEventListener('input', () => reason.setCustomValidity(''));
      form.addEventListener('submit', event => {
        event.preventDefault();
        const changed = form.elements.volume_changed.value === 'yes';
        if (changed && !reason.value.trim()) { reason.setCustomValidity('Please explain briefly why.'); reason.reportValidity(); return; }
        jsPsych.finishTrial({ volume_changed: changed, volume_change_reason: changed ? reason.value.trim() : null,
          general_feedback: document.getElementById('general-feedback').value.trim() });
      });
    },
    on_finish(data) {
      if (window.STUDY_COMPLETION_PREVIEW) return;
      saveTrialToServer({ phase, trialKey: 'feedback|final', section: 'feedback', training: false, payload: data })
        .catch(error => console.error('Feedback save failed:', error));
    },
  };
}
