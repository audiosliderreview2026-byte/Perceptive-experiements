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
    payload    : payload,
  };

  console.log(
    '[DB] Saving trial:',
    dataToSend
  );

  const response = await fetch(
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
    `${experimentProgress.completed} / ${experimentProgress.total}`;
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

function makeJsPsych(
  downloadFilename
) {

  let finished = false;

  const jsPsych =
    initJsPsych({

      show_progress_bar: true,

      auto_update_progress_bar: false,

      on_finish() {

        finished = true;

        // Keep the local CSV download as a temporary
        // development safety net.
        downloadCsv(
          resultsToCsv(jsPsych),
          downloadFilename
        );

        jsPsych
          .getDisplayElement()
          .innerHTML = `
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
      },
    });


  window.addEventListener(
    'beforeunload',
    event => {

      if (finished) {
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

function listenHtml({
  label,
  role = null,
  isTraining = false,
  tagLabel = 'Training',
} = {}) {

  const tag =
    isTraining
      ? `<div class="screen-tag">${tagLabel}</div>`
      : '';

  const roleTag =
    role
      ? `<div class="sound-role">${role}</div>`
      : '';

  return (
    '<div class="listen-wrap">' +
    tag +
    `<div class="sound-label">${label}</div>` +
    roleTag +
    '<div class="listen-hint">' +
    'Listen carefully before continuing.' +
    '</div>' +
    '</div>'
  );
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

function buildCalibrationTrials(
  completedKeys = new Set()
) {

  // --------------------------------------------------------
  // Calibration audio
  // --------------------------------------------------------

  // Recommended:
  // 5–8 seconds of stereo pink noise at a moderate level.
  const volumeAudio =
    '/static/stimulis/calibration/pink_noise.wav';

  // Sound present only in the LEFT channel.
  const stereoAudio =
    '/static/stimulis/calibration/left.wav';

  function setCalibrationProgressDisplay(
    step
  ) {

    updateExperimentProgressDisplay();


    const counter =
      document.getElementById(
        'experiment-progress-counter'
      );


    if (counter) {

      counter.textContent =
        `Calibration ${step} / 2`;
    }
  }
  // --------------------------------------------------------
  // Currently playing replay audio
  // --------------------------------------------------------
  //
  // jsPsych handles the initial playback itself.
  //
  // We separately keep track of audio created by the Replay
  // button so that it can always be stopped before the
  // participant leaves the current calibration screen.
  // --------------------------------------------------------

  let replayAudio =
    null;


  function stopReplayAudio() {

    if (!replayAudio) {
      return;
    }


    try {

      replayAudio.pause();

      replayAudio.currentTime =
        0;

    } catch (error) {

      console.warn(
        'Could not stop calibration replay audio:',
        error
      );
    }


    replayAudio =
      null;
  }


  // --------------------------------------------------------
  // Calibration HTML
  // --------------------------------------------------------

  function calibrationScreen({
    title,
    text,
    question,
    audioPath,
    feedbackId,
  }) {

    return `
      <div class="screen">

        <div class="screen-tag">
          Audio calibration
        </div>

        <h2>
          ${title}
        </h2>

        ${text}

        <div
          style="
            margin:24px 0 18px 0;
          "
        >

          <button
            type="button"
            class="jspsych-btn calibration-replay-btn"
            data-audio="${audioPath}"
          >
            ▶ Replay sound
          </button>

        </div>

        <div
          style="
            margin-top:20px;
          "
        >

          <p
            style="
              margin-bottom:12px;
            "
          >
            <strong>
              ${question}
            </strong>
          </p>

          <!--
            jsPsych's answer buttons will be moved here
            when the trial loads.
          -->
          <div
            id="calibration-answer-container"
            style="
              display:flex;
              justify-content:center;
              align-items:center;
              gap:10px;
              flex-wrap:wrap;
              margin-top:8px;
            "
          ></div>

          <div
            id="${feedbackId}"
            style="
              min-height:24px;
              margin-top:12px;
            "
          ></div>

        </div>

      </div>
    `;
  }


  // --------------------------------------------------------
  // Replay functionality
  // --------------------------------------------------------

  function enableReplayButton() {

    const button =
      document.querySelector(
        '.calibration-replay-btn'
      );


    if (!button) {
      return;
    }


    button.addEventListener(
      'click',
      event => {

        // Prevent the replay button from doing anything
        // other than replaying the calibration sound.
        event.preventDefault();


        // If a replay is already running, stop it first.
        stopReplayAudio();


        const audioPath =
          button.dataset.audio;


        replayAudio =
          new Audio(
            audioPath
          );


        button.disabled =
          true;

        button.textContent =
          'Playing…';


        replayAudio
          .play()
          .catch(
            error => {

              console.error(
                'Could not replay calibration audio:',
                error
              );


              button.disabled =
                false;

              button.textContent =
                '▶ Replay sound';


              replayAudio =
                null;
            }
          );


        replayAudio.addEventListener(
          'ended',
          () => {

            button.disabled =
              false;

            button.textContent =
              '▶ Replay sound';

            replayAudio =
              null;
          }
        );


        replayAudio.addEventListener(
          'error',
          () => {

            button.disabled =
              false;

            button.textContent =
              '▶ Replay sound';


            console.error(
              'Could not replay calibration audio:',
              audioPath
            );


            replayAudio =
              null;
          }
        );
      }
    );
  }


  // --------------------------------------------------------
  // Move jsPsych answer buttons directly below question
  // --------------------------------------------------------
  //
  // jsPsychAudioButtonResponse normally puts the response
  // buttons outside the prompt.
  //
  // We move its button group immediately below our question
  // so that the visual order becomes:
  //
  //     question
  //     answer buttons
  //     feedback
  //
  // --------------------------------------------------------

  function moveAnswerButtonsBelowQuestion() {

    const destination =
      document.getElementById(
        'calibration-answer-container'
      );


    if (!destination) {

      console.warn(
        'Calibration answer container not found.'
      );

      return;
    }


    // jsPsych 8 AudioButtonResponse normally creates
    // a button group with this ID.
    let buttonGroup =
      document.getElementById(
        'jspsych-audio-button-response-btngroup'
      );


    // Fallback for slightly different plugin versions.
    if (!buttonGroup) {

      buttonGroup =
        document.querySelector(
          '.jspsych-audio-button-response-btngroup'
        );
    }


    if (!buttonGroup) {

      console.warn(
        'jsPsych audio response button group not found.'
      );

      return;
    }


    destination.appendChild(
      buttonGroup
    );
  }


  // --------------------------------------------------------
  // Stop replay as soon as an answer is clicked
  // --------------------------------------------------------

  function stopReplayOnAnswer() {

    const buttonGroup =
      document.getElementById(
        'jspsych-audio-button-response-btngroup'
      );


    if (!buttonGroup) {
      return;
    }


    const answerButtons =
      buttonGroup.querySelectorAll(
        'button'
      );


    answerButtons.forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            stopReplayAudio();
          }
        );
      }
    );
  }



  // ========================================================
  // STEP 1 — LISTENING LEVEL
  // ========================================================
  //
  // Unlike the headphone test, this trial does NOT start
  // playing automatically.
  //
  // Flow:
  //   1. Read instructions
  //   2. Click "Play sound"
  //   3. Sound plays
  //   4. Answer choices appear
  //   5. Replay remains available
  //
  // ========================================================

  const volumeCheck = {

    type:
      jsPsychHtmlButtonResponse,


    stimulus: `
      <div class="screen">

        <div class="screen-tag">
          Audio calibration
        </div>

        <h2>
          1. Set your listening volume
        </h2>

        <p>
          Please put on your
          <strong>headphones or earphones</strong>
          and make sure you are in a quiet environment.
        </p>

        <p>
          You will hear a short calibration sound.
          Use your computer or device volume control to
          adjust it to a
          <strong>comfortable listening level</strong>.
        </p>

        <p>
          The sound should be
          <strong>clearly audible without feeling loud</strong>.
          It should feel comfortable to listen to for an
          extended period of time.
        </p>

        <p>
          You may replay the sound as many times as
          necessary while adjusting your volume.
        </p>


        <!-- Play / Replay -->

        <div
          style="
            margin:28px 0 24px 0;
          "
        >

          <button
            type="button"
            id="volume-play-button"
            class="jspsych-btn"
          >
            ▶ Play sound
          </button>

        </div>


        <!-- Question + answers.
            Hidden until sound has been played once. -->

        <div
          id="volume-answer-section"
          style="
            display:none;
            margin-top:20px;
          "
        >

          <p
            style="
              margin-bottom:12px;
            "
          >
            <strong>
              How would you describe the current volume?
            </strong>
          </p>

          <div
            style="
              display:flex;
              justify-content:center;
              gap:10px;
              flex-wrap:wrap;
            "
          >

            <button
              type="button"
              class="jspsych-btn volume-answer-btn"
              data-response="0"
            >
              Too quiet
            </button>

            <button
              type="button"
              class="jspsych-btn volume-answer-btn"
              data-response="1"
            >
              Comfortable
            </button>

            <button
              type="button"
              class="jspsych-btn volume-answer-btn"
              data-response="2"
            >
              Too loud
            </button>

          </div>

        </div>

      </div>
    `,


    // jsPsychHtmlButtonResponse expects choices, but we are
    // providing our own buttons because their visibility is
    // controlled manually.
    choices:
      [],


    data: {

      step:
        'calibration',

      calibration_test:
        'volume',
    },


    on_load() {

      setCalibrationProgressDisplay(
        1
      );


      const playButton =
        document.getElementById(
          'volume-play-button'
        );


      const answerSection =
        document.getElementById(
          'volume-answer-section'
        );


      const answerButtons =
        document.querySelectorAll(
          '.volume-answer-btn'
        );


      let hasPlayedOnce =
        false;


      // ------------------------------------------------------
      // PLAY / REPLAY
      // ------------------------------------------------------

      playButton.addEventListener(
        'click',
        () => {

          // Stop a previous replay if necessary.
          stopReplayAudio();


          replayAudio =
            new Audio(
              volumeAudio
            );


          playButton.disabled =
            true;

          playButton.textContent =
            'Playing…';


          replayAudio
            .play()
            .then(
              () => {

                // The first successful click permanently
                // changes this trial from "Play" to "Replay".
                hasPlayedOnce =
                  true;
              }
            )
            .catch(
              error => {

                console.error(
                  'Could not play calibration audio:',
                  error
                );


                playButton.disabled =
                  false;

                playButton.textContent =
                  hasPlayedOnce
                    ? '▶ Replay sound'
                    : '▶ Play sound';


                replayAudio =
                  null;
              }
            );


          replayAudio.addEventListener(
            'ended',
            () => {

              replayAudio =
                null;


              playButton.disabled =
                false;

              playButton.textContent =
                '▶ Replay sound';


              // Only now reveal the question answers.
              answerSection.style.display =
                'block';
            }
          );


          replayAudio.addEventListener(
            'error',
            () => {

              console.error(
                'Could not play calibration audio:',
                volumeAudio
              );


              replayAudio =
                null;


              playButton.disabled =
                false;

              playButton.textContent =
                hasPlayedOnce
                  ? '▶ Replay sound'
                  : '▶ Play sound';
            }
          );
        }
      );


      // ------------------------------------------------------
      // ANSWERS
      // ------------------------------------------------------

      answerButtons.forEach(
        button => {

          button.addEventListener(
            'click',
            () => {

              // In case the participant answers while a replay
              // is still playing, stop it immediately.
              stopReplayAudio();


              const response =
                Number(
                  button.dataset.response
                );


              jsPsych.finishTrial({

                step:
                  'calibration',

                calibration_test:
                  'volume',

                response:
                  response,

                answer:
                  [
                    'too_quiet',
                    'comfortable',
                    'too_loud',
                  ][response],

                acceptable_volume:
                  response === 1,
              });
            }
          );
        }
      );
    },


    on_finish(data) {

      // Extra safety in case any audio still exists when
      // jsPsych closes the trial.
      stopReplayAudio();
    },
  };


  // --------------------------------------------------------
  // Volume calibration loop
  // --------------------------------------------------------
  //
  // "Too quiet" / "Too loud":
  //     repeat calibration.
  //
  // "Comfortable":
  //     save and continue.
  //
  // --------------------------------------------------------

  const volumeLoop = {

    timeline: [
      volumeCheck
    ],


    loop_function(data) {

      const lastTrial =
        data.values()[0];


      if (
        lastTrial.response === 1
      ) {

        // Comfortable → calibration accepted.

        saveTrialToServer({

          phase:
            window.EXPERIMENT_PHASE,

          trialKey:
            'calibration|volume',

          section:
            'calibration',

          training:
            false,

          payload:
            lastTrial,

        }).catch(
          error => {

            console.error(
              'Calibration save failed:',
              error
            );
          }
        );


        return false;
      }


      // Too quiet / Too loud:
      // show the volume calibration again so that the
      // participant adjusts the volume and listens again.

      return true;
    },
  };


  // ========================================================
  // STEP 1B — VOLUME LOCK MESSAGE
  // ========================================================
  //
  // This deliberately gets its own screen because this
  // instruction is important for the validity of the
  // listening experiment.
  // ========================================================

  const volumeLocked = {

    type:
      jsPsychHtmlButtonResponse,


    stimulus: `
      <div class="screen">

        <div class="screen-tag">
          Audio calibration
        </div>

        <h2>
          Listening volume set ✓
        </h2>

        <p>
          Your listening volume is now set.
        </p>

        <p>
          <strong>
            Please do not change the volume on your
            computer, device, or headphones for the rest
            of the experiment.
          </strong>
        </p>

        <p>
          Keeping the same listening level throughout the
          experiment is important for comparing your
          responses across sounds.
        </p>

      </div>
    `,


    choices: [
      'Continue'
    ],


    data: {

      step:
        'calibration_volume_confirmed',
    },
  };


  // ========================================================
  // STEP 2 — HEADPHONE / STEREO CHECK
  // ========================================================

  const stereoCheck = {

    type:
      jsPsychAudioButtonResponse,

    stimulus:
      stereoAudio,


    prompt:
      calibrationScreen({

        title:
          '2. Headphone check',

        text: `
          <p>
            You will now hear another short sound.
          </p>

          <p>
            Keep your
            <strong>headphones or earphones on</strong>
            and indicate where you hear the sound.
          </p>

          <p>
            You may replay this calibration sound if
            necessary.
          </p>
        `,

        question:
          'Where do you hear the sound?',

        audioPath:
          stereoAudio,

        feedbackId:
          'stereo-calibration-feedback',
      }),


    choices: [
      'Left',
      'Center',
      'Right',
    ],


    response_allowed_while_playing:
      false,


    data: {

      step:
        'calibration',

      calibration_test:
        'stereo',

      correct_answer:
        'left',
    },


    on_load() {

      enableReplayButton();

      moveAnswerButtonsBelowQuestion(
        'stereo-calibration-feedback'
      );

      stopReplayOnAnswer();
    },


    on_finish(data) {

      stopReplayAudio();


      const answers = [
        'left',
        'center',
        'right',
      ];


      data.answer =
        answers[
          data.response
        ];


      data.correct =
        data.response === 0;
    },
  };


  // --------------------------------------------------------
  // Headphone-check loop
  // --------------------------------------------------------
  //
  // We only save calibration|stereo when the participant
  // gives the correct answer.
  //
  // An incorrect response simply repeats the headphone
  // check.
  // --------------------------------------------------------

  const stereoLoop = {

    timeline: [
      stereoCheck
    ],


    loop_function(data) {

      const lastTrial =
        data.values()[0];


      if (
        lastTrial.response === 0
      ) {

        saveTrialToServer({

          phase:
            window.EXPERIMENT_PHASE,

          trialKey:
            'calibration|stereo',

          section:
            'calibration',

          training:
            false,

          payload:
            lastTrial,

        }).catch(
          error => {

            console.error(
              'Calibration save failed:',
              error
            );
          }
        );


        return false;
      }


      return true;
    },
  };


  // ========================================================
  // CALIBRATION COMPLETE
  // ========================================================

  const calibrationDone = {

    type:
      jsPsychHtmlButtonResponse,


    stimulus: `
      <div class="screen">

        <h2>
          Audio calibration complete ✓
        </h2>

        <p>
          Your headphones and listening level are ready.
        </p>

        <p>
          Please keep your
          <strong>headphones or earphones on</strong>
          throughout the experiment.
        </p>

        <p>
          <strong>
            Do not change your listening volume for the
            remainder of the experiment.
          </strong>
        </p>

        <p>
          You will now complete
          <strong>3 training pairs</strong>
          to familiarize yourself with the task.
        </p>

        <p>
          During training and the main experiment,
          each sound will be played
          <strong>only once</strong>
          and cannot be replayed.
          Please listen carefully.
        </p>

      </div>
    `,


    choices: [
      'Start training'
    ],


    data: {

      step:
        'calibration_complete',
    },
  };


  // ========================================================
  // RESUME-AWARE CALIBRATION TIMELINE
  // ========================================================

  const trials =
    [];


  const needsVolume =
    !completedKeys.has(
      'calibration|volume'
    );


  const needsStereo =
    !completedKeys.has(
      'calibration|stereo'
    );


  if (needsVolume) {

    trials.push(
      volumeLoop
    );


    // Only display this immediately after actually performing
    // the volume calibration in this browser session.
    trials.push(
      volumeLocked
    );
  }


  if (needsStereo) {

    trials.push(
      stereoLoop
    );
  }


  // Only show "Calibration complete" if calibration work was
  // actually required during this browser session.
  if (
    needsVolume ||
    needsStereo
  ) {

    trials.push(
      calibrationDone
    );
  }


  return trials;
}


// ==========================================================
// GENERIC QUESTIONNAIRE
// ==========================================================

function buildSurveyTrial(
  jsPsych,
  questions,
  {
    data,
    isTraining = false,
    tagLabel = 'Training',
  } = {}
) {

  const state = {};


  const tag =
    isTraining
      ? `<div
           class="screen-tag"
           style="margin-bottom:14px"
         >${tagLabel}</div>`
      : '';


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

              <input
                type="range"
                id="q${index}"
                class="survey-slider"
                min="0"
                max="100"
                value="50"
              >

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
          step: 'ratings',
        },
        data
      ),


    on_load() {

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
            state[index] !== undefined
              ? state[index]
              : 50;
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


  const tag =
    isTraining
      ? `<div
           class="screen-tag"
           style="margin-bottom:14px"
         >${tagLabel}</div>`
      : '';


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


  const tag =
    isTraining
      ? `<div
           class="screen-tag"
           style="margin-bottom:14px"
         >${tagLabel}</div>`
      : '';


  const html = `
    <div class="survey-wrap">

      ${tag}

      <div class="survey-item emotion-relative-question">

        <p
          class="survey-question"
          style="
            font-size:1.5rem;
            font-weight:600;
            line-height:1.35;
            text-align:center;
            margin-bottom:10px;
          "
        >
          How do Sounds A and B relate to each other
          on the emotional scale below?
        </p>

        <p
          style="
            text-align:center;
            margin:8px auto 30px auto;
            max-width:700px;
            line-height:1.5;
          "
        >
          Place each sound on the scale according to
          how the <strong>footsteps feel</strong>.
        </p>


        <!-- Semantic endpoints -->

        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:flex-end;
            margin:0 3% 8px 3%;
            gap:20px;
          "
        >

          <div
            style="
              text-align:left;
              line-height:1.35;
            "
          >
            <strong>Calm</strong><br>
            Quiet · Relaxed
          </div>

          <div
            style="
              text-align:right;
              line-height:1.35;
            "
          >
            <strong>Angry</strong><br>
            Aggressive · Furious
          </div>

        </div>


        <!-- Shared scale -->

        <div
          id="emotion-scale-container"
          style="
            position:relative;
            width:94%;
            height:115px;
            margin:0 auto 18px auto;
          "
        >

          <!-- Horizontal scale line -->

          <div
            style="
              position:absolute;
              left:0;
              right:0;
              top:55px;
              height:5px;
              background:#b8b8b8;
              border-radius:3px;
            "
          ></div>


          <!-- Invisible range input for A -->

          <input
            id="emotion-slider-a"
            type="range"
            min="0"
            max="100"
            value="45"
            style="
              position:absolute;
              left:0;
              top:25px;
              width:100%;
              height:60px;
              opacity:0;
              cursor:pointer;
              z-index:3;
            "
          >


          <!-- Marker A -->

          <div
            id="emotion-marker-a"
            style="
              position:absolute;
              left:45%;
              top:34px;
              transform:translateX(-50%);
              width:42px;
              height:42px;
              border-radius:50%;
              background:#3273dc;
              color:white;
              display:flex;
              align-items:center;
              justify-content:center;
              font-weight:bold;
              font-size:18px;
              pointer-events:none;
              z-index:5;
              box-shadow:0 2px 5px rgba(0,0,0,.25);
            "
          >
            A
          </div>


          <!-- Invisible range input for B -->

          <input
            id="emotion-slider-b"
            type="range"
            min="0"
            max="100"
            value="55"
            style="
              position:absolute;
              left:0;
              top:25px;
              width:100%;
              height:60px;
              opacity:0;
              cursor:pointer;
              z-index:4;
            "
          >


          <!-- Marker B -->

          <div
            id="emotion-marker-b"
            style="
              position:absolute;
              left:55%;
              top:34px;
              transform:translateX(-50%);
              width:42px;
              height:42px;
              border-radius:50%;
              background:#d95f59;
              color:white;
              display:flex;
              align-items:center;
              justify-content:center;
              font-weight:bold;
              font-size:18px;
              pointer-events:none;
              z-index:5;
              box-shadow:0 2px 5px rgba(0,0,0,.25);
            "
          >
            B
          </div>

        </div>


        <!-- Explicit controls -->

        <div
          style="
            max-width:650px;
            margin:20px auto 0 auto;
          "
        >

          <div
            style="
              display:flex;
              align-items:center;
              gap:14px;
              margin-bottom:16px;
            "
          >

            <div
              style="
                width:34px;
                height:34px;
                flex:0 0 34px;
                border-radius:50%;
                background:#3273dc;
                color:white;
                display:flex;
                align-items:center;
                justify-content:center;
                font-weight:bold;
              "
            >
              A
            </div>

            <input
              id="emotion-control-a"
              type="range"
              class="survey-slider"
              min="0"
              max="100"
              value="45"
              style="flex:1;"
            >

          </div>


          <div
            style="
              display:flex;
              align-items:center;
              gap:14px;
            "
          >

            <div
              style="
                width:34px;
                height:34px;
                flex:0 0 34px;
                border-radius:50%;
                background:#d95f59;
                color:white;
                display:flex;
                align-items:center;
                justify-content:center;
                font-weight:bold;
              "
            >
              B
            </div>

            <input
              id="emotion-control-b"
              type="range"
              class="survey-slider"
              min="0"
              max="100"
              value="55"
              style="flex:1;"
            >

          </div>

        </div>


        <p
          id="emotion-instruction"
          style="
            text-align:center;
            margin-top:24px;
            font-size:0.9em;
            opacity:0.75;
          "
        >
          Move both A and B before submitting your response.
        </p>

      </div>

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
        },
        data
      ),


    on_load() {

      const sliderA =
        document.getElementById(
          'emotion-control-a'
        );

      const sliderB =
        document.getElementById(
          'emotion-control-b'
        );

      const markerA =
        document.getElementById(
          'emotion-marker-a'
        );

      const markerB =
        document.getElementById(
          'emotion-marker-b'
        );

      const submitBtn =
        document.querySelector(
          '.jspsych-btn'
        );

      const instruction =
        document.getElementById(
          'emotion-instruction'
        );


      // ----------------------------------------------------
      // Submit remains disabled until BOTH markers moved.
      // ----------------------------------------------------

      const updateSubmitState = () => {

        const ready =
          touched.A &&
          touched.B;


        if (submitBtn) {

          submitBtn.disabled =
            !ready;

          submitBtn.classList.toggle(
            'btn-disabled',
            !ready
          );
        }


        if (
          ready &&
          instruction
        ) {

          instruction.textContent =
            'Both sounds have been positioned.';
        }
      };


      // ----------------------------------------------------
      // Update visual marker positions
      // ----------------------------------------------------

      const updateMarkerA =
        value => {

          state.Emotion_A =
            parseInt(value);

          if (markerA) {

            markerA.style.left =
              `${state.Emotion_A}%`;
          }
        };


      const updateMarkerB =
        value => {

          state.Emotion_B =
            parseInt(value);

          if (markerB) {

            markerB.style.left =
              `${state.Emotion_B}%`;
          }
        };


      // ----------------------------------------------------
      // A
      // ----------------------------------------------------

      if (sliderA) {

        sliderA.addEventListener(
          'input',
          event => {

            touched.A =
              true;

            updateMarkerA(
              event.target.value
            );

            updateSubmitState();
          }
        );
      }


      // ----------------------------------------------------
      // B
      // ----------------------------------------------------

      if (sliderB) {

        sliderB.addEventListener(
          'input',
          event => {

            touched.B =
              true;

            updateMarkerB(
              event.target.value
            );

            updateSubmitState();
          }
        );
      }


      updateSubmitState();
    },


    on_finish(trialData) {

      // ----------------------------------------------------
      // Add the two positions to the local jsPsych data
      // ----------------------------------------------------

      jsPsych.data.addDataToLastTrial({
        Emotion_A:
          state.Emotion_A,

        Emotion_B:
          state.Emotion_B,
      });


      const completeData = {
        ...trialData,

        Emotion_A:
          state.Emotion_A,

        Emotion_B:
          state.Emotion_B,
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