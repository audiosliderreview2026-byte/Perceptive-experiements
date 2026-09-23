// ══════════════════════════════════════════════════════════
//  PHASE 2 — Semantic Controllability
// ══════════════════════════════════════════════════════════
//
// Main experiment:
//   - 192 precomputed original/edit pairs
//   - participant-specific order generated offline in Python
//
// Training:
//   - 3 fixed pairs
//   - identical for every participant
//
// Additional features:
//   - persistent resume
//   - 3 regular breaks after pairs 48, 96, 144
//   - optional development break after pair 1
//   - 5 random persistent catch trials
//   - optional development catch trial after pair 1
//
// ══════════════════════════════════════════════════════════


window.EXPERIMENT_PHASE = 'phase2';


const jsPsych =
  makeJsPsych('results_phase2.csv');


// ==========================================================
// PHASE CONFIGURATION
// ==========================================================

const N_TEST_PAIRS = 192;

const N_TRAINING_PAIRS = 3;

const MIN_PARTICIPANT_ID = 1;
const MAX_PARTICIPANT_ID = 256;

const PHASE2_TRIAL_ORDERS_URL =
  '/static/js/phase2_trial_orders.json';


// ==========================================================
// TRAINING PAIRS
// ==========================================================
//
// These are identical for every participant.
//
// Expected folder structure:
//
// static/stimulis/calibration/phase2_test_trials/
//   pair1/
//     soundA.wav
//     soundB.wav
//   pair2/
//     soundA.wav
//     soundB.wav
//   pair3/
//     soundA.wav
//     soundB.wav
//
// Training indices deliberately use 0, 1, 2.
// They cannot collide with main trials because the database
// keys include the section ("training" vs "test").
// ==========================================================

function buildFixedTrainingPairs(
  participantId
) {

  return Array.from(
    { length: N_TRAINING_PAIRS },
    (_, index) => {

      const pairNumber =
        index + 1;

      const basePath =
        '/static/stimulis/calibration/' +
        'phase2_test_trials/' +
        `pair${pairNumber}`;


      return {

        trialIndex:
          index,

        participantId:
          participantId,

        pairType:
          'fixed-training',

        condition:
          'training',

        half:
          null,

        refId:
          `training_pair_${pairNumber}`,

        editId:
          null,

        originalFilename:
          null,

        originalPath:
          null,

        editedFilename:
          null,

        editedPath:
          null,

        soundA: {

          soundId:
            `training_pair_${pairNumber}_A`,

          soundType:
            'training',

          audioPath:
            `${basePath}/soundA.wav`,
        },

        soundB: {

          soundId:
            `training_pair_${pairNumber}_B`,

          soundType:
            'training',

          audioPath:
            `${basePath}/soundB.wav`,
        },
      };
    }
  );
}


// ==========================================================
// BREAK CONFIGURATION
// ==========================================================
//
// Regular breaks occur after:
//   48 / 192
//   96 / 192
//   144 / 192
//
// DEVELOPMENT ONLY:
// there is also currently a break after pair 1.
// ==========================================================

const BREAK_AFTER_PAIRS = [
  48,
  96,
  144,
];


// DEVELOPMENT ONLY.
//
// Change this to [] for the final experiment.
const TEST_BREAK_AFTER_PAIRS = [
  1,
];


const ALL_BREAK_AFTER_PAIRS =
  [
    ...TEST_BREAK_AFTER_PAIRS,
    ...BREAK_AFTER_PAIRS,
  ].sort(
    (a, b) => a - b
  );


// ==========================================================
// CATCH-TRIAL CONFIGURATION
// ==========================================================

const N_CATCH_TRIALS = 5;


// DEVELOPMENT ONLY.
//
// Set to false for the final experiment.
const ENABLE_TEST_CATCH_TRIAL =
  true;


const TEST_CATCH_AFTER_PAIR =
  1;


// Random real catch trials are placed only within this range.
const CATCH_MIN_POSITION =
  12;

const CATCH_MAX_POSITION =
  180;


// Minimum number of experimental pairs separating two
// real catch trials.
const CATCH_MIN_DISTANCE =
  12;


// ==========================================================
// CATCH QUESTIONS
// ==========================================================

const CATCH_QUESTIONS = [

  {
    id:
      'animal_meow',

    question:
      'Which animal typically says "meow"?',

    choices: [
      'Dog',
      'Cat',
      'Horse',
      'Bird',
    ],

    correctAnswer:
      'Cat',
  },


  {
    id:
      'tell_time',

    question:
      'Which of these is normally used to tell the time?',

    choices: [
      'Spoon',
      'Clock',
      'Pillow',
      'Shoe',
    ],

    correctAnswer:
      'Clock',
  },


  {
    id:
      'coldest_season',

    question:
      'Which season is usually the coldest?',

    choices: [
      'Summer',
      'Winter',
      'Spring',
      'Autumn',
    ],

    correctAnswer:
      'Winter',
  },


  {
    id:
      'normally_drink',

    question:
      'Which of these would you normally drink?',

    choices: [
      'Water',
      'Chair',
      'Pencil',
      'Shirt',
    ],

    correctAnswer:
      'Water',
  },


  {
    id:
      'days_week',

    question:
      'How many days are there in a week?',

    choices: [
      '5',
      '6',
      '7',
      '8',
    ],

    correctAnswer:
      '7',
  },

];


// ==========================================================
// PARTICIPANT ID
// ==========================================================

function getParticipantIdFromUrl() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const raw =
    params.get('PARTICIPANT_ID') ??
    params.get('participantID') ??
    params.get('participant_id');


  if (raw === null) {

    throw new Error(
      'Missing PARTICIPANT_ID in the URL. ' +
      'Example: ' +
      '/phase2?prolificID=test001&participantID=1'
    );
  }


  const participantId =
    Number.parseInt(
      raw,
      10
    );


  if (
    !Number.isInteger(participantId) ||
    participantId < MIN_PARTICIPANT_ID ||
    participantId > MAX_PARTICIPANT_ID
  ) {

    throw new Error(
      `Invalid PARTICIPANT_ID="${raw}". ` +
      `Expected an integer between ` +
      `${MIN_PARTICIPANT_ID} and ` +
      `${MAX_PARTICIPANT_ID}.`
    );
  }


  return participantId;
}


// ==========================================================
// LOAD PRECOMPUTED PHASE-2 ORDER
// ==========================================================

async function loadPrecomputedPhase2Order(
  participantId
) {

  const response =
    await fetch(
      PHASE2_TRIAL_ORDERS_URL,
      {
        cache:
          'no-store',
      }
    );


  if (!response.ok) {

    throw new Error(
      'Could not load Phase 2 trial-order file: ' +
      `HTTP ${response.status}`
    );
  }


  const allOrders =
    await response.json();


  const rawPlan =
    allOrders[
      String(participantId)
    ];


  if (!Array.isArray(rawPlan)) {

    throw new Error(
      `No Phase 2 trial order found for ` +
      `PARTICIPANT_ID=${participantId}.`
    );
  }


  if (
    rawPlan.length !==
    N_TEST_PAIRS
  ) {

    throw new Error(
      `PARTICIPANT_ID=${participantId} has ` +
      `${rawPlan.length} Phase 2 trials; ` +
      `expected ${N_TEST_PAIRS}.`
    );
  }


  return rawPlan;
}


// ==========================================================
// NORMALIZE PYTHON TRIAL RECORD
// ==========================================================

function normalizePrecomputedPair(
  rawPair,
  expectedParticipantId
) {

  if (
    Number(rawPair.participant_id) !==
    Number(expectedParticipantId)
  ) {

    throw new Error(
      'Participant ID mismatch inside ' +
      'phase2_trial_orders.json.'
    );
  }


  const trialIndex =
    Number(
      rawPair.trial_index
    );


  if (
    !Number.isInteger(
      trialIndex
    )
  ) {

    throw new Error(
      'Invalid trial_index in Phase 2 plan.'
    );
  }


  const soundAPath =
    resolveAudioPath(
      rawPair.sound_A_path
    );


  const soundBPath =
    resolveAudioPath(
      rawPair.sound_B_path
    );


  const originalPath =
    resolveAudioPath(
      rawPair.original_path
    );


  const editedPath =
    resolveAudioPath(
      rawPair.edited_path
    );


  if (
    !soundAPath ||
    !soundBPath
  ) {

    throw new Error(
      `Missing audio path for Phase 2 ` +
      `trial ${trialIndex}.`
    );
  }


  const soundAId =
    rawPair.sound_A_type ===
      'original'
      ? rawPair.original_filename
      : rawPair.edited_filename;


  const soundBId =
    rawPair.sound_B_type ===
      'original'
      ? rawPair.original_filename
      : rawPair.edited_filename;


  return {

    trialIndex:
      trialIndex,

    participantId:
      expectedParticipantId,

    pairType:
      'precomputed-original-edit',

    condition:
      rawPair.condition,

    half:
      rawPair.half,

    refId:
      rawPair.ref_id,

    editId:
      rawPair.edit_id,


    originalFilename:
      rawPair.original_filename,

    originalPath:
      originalPath,

    editedFilename:
      rawPair.edited_filename,

    editedPath:
      editedPath,


    soundA: {

      soundId:
        soundAId,

      soundType:
        rawPair.sound_A_type,

      audioPath:
        soundAPath,
    },


    soundB: {

      soundId:
        soundBId,

      soundType:
        rawPair.sound_B_type,

      audioPath:
        soundBPath,
    },
  };
}


// ==========================================================
// VALIDATE COMPLETE PRECOMPUTED PLAN
// ==========================================================

function validatePrecomputedPlan(
  pairs,
  participantId
) {

  if (!Array.isArray(pairs)) {

    throw new Error(
      'Phase 2 plan is not an array.'
    );
  }


  if (
    pairs.length !==
    N_TEST_PAIRS
  ) {

    throw new Error(
      `Participant ${participantId}: ` +
      `expected ${N_TEST_PAIRS} pairs, ` +
      `found ${pairs.length}.`
    );
  }


  const indexes =
    pairs.map(
      pair =>
        pair.trialIndex
    );


  const uniqueIndexes =
    new Set(
      indexes
    );


  if (
    uniqueIndexes.size !==
    N_TEST_PAIRS
  ) {

    throw new Error(
      `Participant ${participantId}: ` +
      'duplicate Phase 2 trialIndex values.'
    );
  }


  for (
    let i = 0;
    i < N_TEST_PAIRS;
    i++
  ) {

    if (
      !uniqueIndexes.has(i)
    ) {

      throw new Error(
        `Participant ${participantId}: ` +
        `missing trialIndex ${i}.`
      );
    }
  }


  pairs.forEach(
    pair => {

      const types =
        [
          pair.soundA.soundType,
          pair.soundB.soundType,
        ].sort();


      if (
        types[0] !== 'edited' ||
        types[1] !== 'original'
      ) {

        throw new Error(
          `Participant ${participantId}, ` +
          `trial ${pair.trialIndex}: ` +
          'pair must contain exactly one ' +
          'original and one edited sound.'
        );
      }
    }
  );
}


// ==========================================================
// GENERATE RANDOM CATCH POSITIONS
// ==========================================================
//
// Generated only when the persistent session is first
// created.
//
// They are then stored in SQLite with the session so a
// refresh cannot change their positions.
// ==========================================================

function generateCatchPositions() {

  const forbidden =
    new Set(
      BREAK_AFTER_PAIRS
    );


  const candidates =
    [];


  for (
    let position =
      CATCH_MIN_POSITION;

    position <=
      CATCH_MAX_POSITION;

    position++
  ) {

    if (
      forbidden.has(
        position
      )
    ) {
      continue;
    }


    candidates.push(
      position
    );
  }


  const shuffled =
    shuffle(
      candidates
    );


  const selected =
    [];


  for (
    const position of shuffled
  ) {

    const farEnough =
      selected.every(
        existing =>
          Math.abs(
            existing -
            position
          ) >=
          CATCH_MIN_DISTANCE
      );


    if (!farEnough) {
      continue;
    }


    selected.push(
      position
    );


    if (
      selected.length ===
      N_CATCH_TRIALS
    ) {
      break;
    }
  }


  if (
    selected.length !==
    N_CATCH_TRIALS
  ) {

    throw new Error(
      'Could not generate sufficiently separated ' +
      'catch trials.'
    );
  }


  return selected.sort(
    (a, b) =>
      a - b
  );
}


// ==========================================================
// PROGRESS DISPLAY HELPERS
// ==========================================================
//
// common.js owns the normal experimental counter.
//
// During training we temporarily replace its text with:
//     Training x / 3
//
// At the end of training we restore:
//     x / 192
// ==========================================================

function setTrainingProgressDisplay(
  completed
) {

  updateExperimentProgressDisplay();


  const counter =
    document.getElementById(
      'experiment-progress-counter'
    );


  if (counter) {

    counter.textContent =
      `Training ${completed} / ${N_TRAINING_PAIRS}`;
  }
}


function restoreMainProgressDisplay() {

  updateExperimentProgressDisplay();
}


// ==========================================================
// BUILD ONE PHASE-2 PAIR
// ==========================================================

function buildTrial(
  pair,
  isTraining = false,
  trainingPosition = null
) {

  const baseData = {

    phase:
      2,

    participantId:
      pair.participantId,

    trialIndex:
      pair.trialIndex,

    pairType:
      pair.pairType,

    condition:
      pair.condition,

    half:
      pair.half,

    refId:
      pair.refId,

    editId:
      pair.editId,


    originalFilename:
      pair.originalFilename,

    originalPath:
      pair.originalPath,

    editedFilename:
      pair.editedFilename,

    editedPath:
      pair.editedPath,


    soundAId:
      pair.soundA.soundId,

    soundAType:
      pair.soundA.soundType,

    soundAPath:
      pair.soundA.audioPath,

    soundBId:
      pair.soundB.soundId,

    soundBType:
      pair.soundB.soundType,

    soundBPath:
      pair.soundB.audioPath,

    training:
      isTraining,
  };


  // --------------------------------------------------------
  // Sound A
  // --------------------------------------------------------

  const listenA =
    buildListenTrial({

      audioPath:
        pair.soundA.audioPath,

      choices: [
        'Listen to Sound B →'
      ],

      prompt:
        listenHtml({

          label:
            'Listen to Sound A',

          role:
            'A',

          isTraining:
            isTraining,
        }),

      data:
        Object.assign(
          {
            step:
              'listenA',
          },
          baseData
        ),

      on_load:
        undefined,
    });


  // buildListenTrial does not currently accept an on_load
  // argument, so attach it directly to the returned object.
  if (
    isTraining &&
    trainingPosition !== null
  ) {

    listenA.on_load =
      () => {

        setTrainingProgressDisplay(
          trainingPosition
        );
      };
  }


  // --------------------------------------------------------
  // Sound B
  // --------------------------------------------------------

  const listenB =
    buildListenTrial({

      audioPath:
        pair.soundB.audioPath,

      choices: [
        'Answer →'
      ],

      prompt:
        listenHtml({

          label:
            'Listen to Sound B',

          role:
            'B',

          isTraining:
            isTraining,
        }),

      data:
        Object.assign(
          {
            step:
              'listenB',
          },
          baseData
        ),
    });


  if (
    isTraining &&
    trainingPosition !== null
  ) {

    listenB.on_load =
      () => {

        setTrainingProgressDisplay(
          trainingPosition
        );
      };
  }


  // --------------------------------------------------------
  // Questionnaire
  // --------------------------------------------------------

  const surveyTrial =
    buildRelativeEmotionTrial(
      jsPsych,
      {

        data:
          baseData,

        isTraining:
          isTraining,
      }
    );


  if (
    isTraining &&
    trainingPosition !== null
  ) {

    const originalOnLoad =
      surveyTrial.on_load;


    surveyTrial.on_load =
      () => {

        setTrainingProgressDisplay(
          trainingPosition
        );


        if (
          typeof originalOnLoad ===
          'function'
        ) {

          originalOnLoad();
        }
      };
  }


  return [
    listenA,
    listenB,
    surveyTrial,
  ];
}


// ==========================================================
// BREAK SCREEN
// ==========================================================

function buildBreakScreen(
  completedPairs
) {

  return {

    type:
      jsPsychHtmlButtonResponse,

    stimulus: `
      <div class="screen">

        <h2>
          Break
        </h2>

        <p>
          Please take a
          <strong>2 minute break</strong>
          to rest.
        </p>

        <p>
          Click on continue once you are ready to resume.
        </p>

      </div>
    `,

    choices: [
      'Continue'
    ],

    data: {

      step:
        'break',

      afterPairs:
        completedPairs,
    },

    on_load() {

      restoreMainProgressDisplay();
    },
  };
}


// ==========================================================
// CATCH TRIAL
// ==========================================================

function buildCatchTrial({
  question,
  catchIndex,
  afterPair,
  developmentTest = false,
}) {

  return {

    type:
      jsPsychHtmlButtonResponse,

    stimulus: `
      <div class="screen">

        <h2>
          Quick question
        </h2>

        <p>
          This is just to check that you are still with us.
          Please answer the question below.
        </p>

        <p
          style="
            margin-top:30px;
            font-size:1.15em;
            font-weight:600;
          "
        >
          ${question.question}
        </p>

      </div>
    `,

    choices:
      question.choices,

    data: {

      step:
        'catch',

      catchId:
        question.id,

      catchIndex:
        catchIndex,

      afterPair:
        afterPair,

      correctAnswer:
        question.correctAnswer,

      developmentTest:
        developmentTest,
    },


    on_load() {

      restoreMainProgressDisplay();
    },


    on_finish(data) {

      const selectedAnswer =
        question.choices[
          data.response
        ];


      data.selectedAnswer =
        selectedAnswer;

      data.correct =
        selectedAnswer ===
        question.correctAnswer;


      const trialKey =
        developmentTest
          ? 'catch|development'
          : `catch|${catchIndex}`;


      saveTrialToServer({

        phase:
          window.EXPERIMENT_PHASE,

        trialKey:
          trialKey,

        trialIndex:
          afterPair,

        section:
          'catch',

        training:
          false,

        payload: {
          ...data,

          selectedAnswer:
            selectedAnswer,

          correct:
            data.correct,
        },

      }).catch(
        error => {

          console.error(
            'Catch-trial save failed:',
            error
          );
        }
      );
    },
  };
}


// ==========================================================
// TRAINING COMPLETE SCREEN
// ==========================================================

function buildTrainingCompleteScreen() {

  return {

    type:
      jsPsychHtmlButtonResponse,

    stimulus: `
      <div class="screen">

        <h2>
          Training complete ✓
        </h2>

        <p>
          You are now ready to begin the experiment.
        </p>

        <p>
          You will evaluate
          <strong>192 pairs of sounds</strong>.
        </p>

        <p>
          For each pair, listen carefully to Sound A and
          Sound B, then position both sounds on the
          emotional scale.
        </p>

        <p>
          Each sound will be played only once.
        </p>

        <p>
          Please keep your
          <strong>headphones or earphones on</strong>
          throughout the experiment.
        </p>

      </div>
    `,

    choices: [
      'Start experiment'
    ],

    data: {
      step:
        'training_complete',
    },

    on_load() {

      setTrainingProgressDisplay(
        N_TRAINING_PAIRS
      );
    },

    on_finish() {

      restoreMainProgressDisplay();
    },
  };
}


// ==========================================================
// INITIALIZE PHASE 2
// ==========================================================

async function initPhase2() {

  try {

    // ------------------------------------------------------
    // 1. Participant assignment
    // ------------------------------------------------------

    const participantId =
      getParticipantIdFromUrl();


    window.PARTICIPANT_ID =
      participantId;


    if (
      !window.PROLIFIC_ID ||
      window.PROLIFIC_ID === 'None' ||
      window.PROLIFIC_ID === 'null' ||
      window.PROLIFIC_ID === 'undefined'
    ) {

      throw new Error(
        'Missing or invalid prolificID. ' +
        'The experiment cannot start.'
      );
    }


    console.log(
      '[PHASE 2] PROLIFIC_ID:',
      window.PROLIFIC_ID
    );


    console.log(
      '[PHASE 2] PARTICIPANT_ID:',
      participantId
    );


    // ------------------------------------------------------
    // 2. Load participant's precomputed main plan
    // ------------------------------------------------------

    const rawPrecomputedPlan =
      await loadPrecomputedPhase2Order(
        participantId
      );


    const precomputedPairs =
      rawPrecomputedPlan.map(
        rawPair =>
          normalizePrecomputedPair(
            rawPair,
            participantId
          )
      );


    validatePrecomputedPlan(
      precomputedPairs,
      participantId
    );


    // ------------------------------------------------------
    // 3. Fixed training plan
    // ------------------------------------------------------

    const fixedTrainingPairs =
      buildFixedTrainingPairs(
        participantId
      );


    if (
      fixedTrainingPairs.length !==
      N_TRAINING_PAIRS
    ) {

      throw new Error(
        `Expected ${N_TRAINING_PAIRS} training pairs.`
      );
    }


    // ------------------------------------------------------
    // 4. Load persistent state
    // ------------------------------------------------------

    const serverState =
      await loadPhaseSession(
        window.EXPERIMENT_PHASE
      );


    let session =
      serverState.session;


    const completed =
      serverState.completed || [];


    const completedKeys =
      completedTrialKeySet(
        completed
      );


    // ------------------------------------------------------
    // 5. Create persistent session
    // ------------------------------------------------------

    if (session === null) {

      console.log(
        '[SESSION] No existing Phase 2 session. ' +
        'Saving participant plan.'
      );


      const persistentPlan = {

        version:
          5,

        participantId:
          participantId,

        source:
          'phase2_trial_orders.json',

        training:
          fixedTrainingPairs,

        test:
          precomputedPairs,

        catchPositions:
          generateCatchPositions(),
      };


      const created =
        await createPhaseSession(
          window.EXPERIMENT_PHASE,
          persistentPlan
        );


      session =
        created.session;
    }


    // ------------------------------------------------------
    // 6. Validate stored session
    // ------------------------------------------------------

    if (
      !session ||
      !session.trial_order ||
      !Array.isArray(
        session.trial_order.training
      ) ||
      !Array.isArray(
        session.trial_order.test
      )
    ) {

      throw new Error(
        'Server returned an invalid Phase 2 session plan. ' +
        'Use a new prolificID for testing.'
      );
    }


    const storedParticipantId =
      Number(
        session.trial_order.participantId
      );


    if (
      storedParticipantId !==
      participantId
    ) {

      throw new Error(
        `This prolificID already has a Phase 2 ` +
        `session assigned to participantID=` +
        `${session.trial_order.participantId}, ` +
        `but the current URL requests ` +
        `participantID=${participantId}.`
      );
    }


    // ------------------------------------------------------
    // 7. Restore exact stored plans
    // ------------------------------------------------------

    const trainingPairs =
      session.trial_order.training;


    const orderedTestPairs =
      session.trial_order.test;


    const catchPositions =
      session.trial_order.catchPositions;


    if (
      trainingPairs.length !==
      N_TRAINING_PAIRS
    ) {

      throw new Error(
        `Stored Phase 2 session contains ` +
        `${trainingPairs.length} training pairs; ` +
        `expected ${N_TRAINING_PAIRS}. ` +
        'Use a new prolificID for testing.'
      );
    }


    if (
      orderedTestPairs.length !==
      N_TEST_PAIRS
    ) {

      throw new Error(
        `Stored Phase 2 session contains ` +
        `${orderedTestPairs.length} test pairs; ` +
        `expected ${N_TEST_PAIRS}. ` +
        'Use a new prolificID for testing.'
      );
    }


    if (
      !Array.isArray(
        catchPositions
      ) ||
      catchPositions.length !==
      N_CATCH_TRIALS
    ) {

      throw new Error(
        'Stored Phase 2 session does not contain ' +
        'a valid catch-trial plan. ' +
        'Use a new prolificID for testing.'
      );
    }


    console.log(
      '[PHASE 2] Catch trials after pairs:',
      catchPositions
    );


    // ------------------------------------------------------
    // 8. Persisted progress
    // ------------------------------------------------------

    const totalTestCount =
      orderedTestPairs.length;


    const completedMainCount =
      orderedTestPairs.filter(
        pair => {

          const key =
            pairTrialKey(
              pair,
              'test'
            );


          return completedKeys.has(
            key
          );
        }
      ).length;


    const completedTrainingCount =
      trainingPairs.filter(
        pair =>
          completedKeys.has(
            pairTrialKey(
              pair,
              'training'
            )
          )
      ).length;


    const hasCompletedTraining =
      completedTrainingCount ===
      N_TRAINING_PAIRS;


    const calibrationComplete =
      completedKeys.has(
        'calibration|volume'
      ) &&
      completedKeys.has(
        'calibration|stereo'
      );


    const isReturningParticipant =
      completedKeys.size > 0;


    const hasStartedMainExperiment =
      completedMainCount > 0;


    setExperimentProgress(
      completedMainCount,
      totalTestCount
    );


    console.log(
      `[SESSION] Phase 2 progress: ` +
      `${completedMainCount}/${totalTestCount}`
    );


    console.log(
      `[SESSION] Phase 2 training: ` +
      `${completedTrainingCount}/${N_TRAINING_PAIRS}`
    );


    // ------------------------------------------------------
    // 9. Resume screen
    // ------------------------------------------------------

    const resumeScreen = {

      type:
        jsPsychHtmlButtonResponse,

      stimulus: `
        <div class="screen">

          <h2>
            Welcome back
          </h2>

          <p>
            Your previous responses have been saved.
          </p>

          ${
            hasStartedMainExperiment
              ? `
                <p>
                  You completed
                  <strong>
                    ${completedMainCount} / ${totalTestCount}
                  </strong>
                  experimental pairs.
                </p>
              `
              : `
                <p>
                  The experiment will continue from where
                  you stopped.
                </p>
              `
          }

          <p>
            Please make sure you are still wearing your
            <strong>headphones or earphones</strong>
            before continuing.
          </p>

        </div>
      `,

      choices: [
        'Resume experiment'
      ],
    };


    // ------------------------------------------------------
    // 10. Calibration
    // ------------------------------------------------------

    const calibrationTrials =
      buildCalibrationTrials(
        completedKeys
      );


    // ------------------------------------------------------
    // 11. Remaining training pairs
    // ------------------------------------------------------

    const remainingTrainingWithPosition =
      trainingPairs
        .map(
          (pair, index) => ({

            pair:
              pair,

            position:
              index + 1,
          })
        )
        .filter(
          ({ pair }) =>
            !completedKeys.has(
              pairTrialKey(
                pair,
                'training'
              )
            )
        );


    // ------------------------------------------------------
    // 12. Remaining main pairs
    // ------------------------------------------------------

    const remainingWithIndex =
      orderedTestPairs
        .map(
          (pair, index) => ({

            pair:
              pair,

            index:
              index,
          })
        )
        .filter(
          ({ pair }) => {

            const key =
              pairTrialKey(
                pair,
                'test'
              );


            return !completedKeys.has(
              key
            );
          }
        );


    // ------------------------------------------------------
    // 13. Preload only audio still needed
    // ------------------------------------------------------

    const audioToPreload =
      [];


    if (!calibrationComplete) {

      if (
        !completedKeys.has(
          'calibration|volume'
        )
      ) {

        audioToPreload.push(
          '/static/stimulis/calibration/test_sound.wav'
        );
      }


      if (
        !completedKeys.has(
          'calibration|stereo'
        )
      ) {

        audioToPreload.push(
          '/static/stimulis/calibration/left.wav'
        );
      }
    }


    remainingTrainingWithPosition.forEach(
      ({ pair }) => {

        audioToPreload.push(
          pair.soundA.audioPath,
          pair.soundB.audioPath
        );
      }
    );


    remainingWithIndex.forEach(
      ({ pair }) => {

        audioToPreload.push(
          pair.soundA.audioPath,
          pair.soundB.audioPath
        );
      }
    );


    const uniqueAudioToPreload =
      [
        ...new Set(
          audioToPreload
        ),
      ];


    console.log(
      '[PHASE 2] Unique audio files to preload:',
      uniqueAudioToPreload.length
    );


    const preload = {

      type:
        jsPsychPreload,

      audio:
        uniqueAudioToPreload,

      message:
        '<p>Loading audio files, please wait…</p>',

      error_message:
        '<p>Loading error. Please refresh the page.</p>',

      show_progress_bar:
        true,
    };


    // ------------------------------------------------------
    // 14. Intro
    // ------------------------------------------------------

    const intro = {

      type:
        jsPsychHtmlButtonResponse,

      stimulus: `
        <div class="screen">

          <h2>
            Audio Experiment
          </h2>

          <p>
            In this experiment, you will listen to
            <strong>footstep sounds</strong>.
          </p>

          <ul>

            <li>
              Use
              <strong>headphones or earphones</strong>.
            </li>

            <li>
              Make sure you are in a
              <strong>quiet environment</strong>.
            </li>

          </ul>

          <p>
            You will listen to pairs of sounds:
            <strong>Sound A</strong> followed by
            <strong>Sound B</strong>.
          </p>

          <p>
            After listening to both sounds, you will
            position each one on an emotional scale ranging
            from
            <strong>calm, tranquil, relaxed</strong>
            to
            <strong>angry, aggressive, furious</strong>.
          </p>

          <p>
            Before the main experiment, you will complete
            <strong>${N_TRAINING_PAIRS} training pairs</strong>
            to familiarize yourself with the task.
          </p>

          <p>
            Each sound is played only once.
            Please listen carefully.
          </p>

        </div>
      `,

      choices: [
        'Start calibration'
      ],
    };


    // ------------------------------------------------------
    // 15. Training complete
    // ------------------------------------------------------

    const trainingCompleteScreen =
      buildTrainingCompleteScreen();


    // ------------------------------------------------------
    // 16. Build remaining training trials
    // ------------------------------------------------------

    const trainingTrials =
      remainingTrainingWithPosition.flatMap(
        ({ pair, position }) =>
          buildTrial(
            pair,
            true,
            position
          )
      );


    // ------------------------------------------------------
    // 17. Build main experiment + catch trials + breaks
    // ------------------------------------------------------

    const testTrials =
      [];


    remainingWithIndex.forEach(
      ({ pair, index }) => {

        const completedPosition =
          index + 1;


        // --------------------------------------------------
        // Experimental pair
        // --------------------------------------------------

        testTrials.push(
          ...buildTrial(
            pair,
            false
          )
        );


        // --------------------------------------------------
        // Temporary DEVELOPMENT catch trial
        // --------------------------------------------------

        if (
          ENABLE_TEST_CATCH_TRIAL &&
          completedPosition ===
            TEST_CATCH_AFTER_PAIR &&
          !completedKeys.has(
            'catch|development'
          )
        ) {

          testTrials.push(
            buildCatchTrial({

              question:
                CATCH_QUESTIONS[0],

              catchIndex:
                'development',

              afterPair:
                completedPosition,

              developmentTest:
                true,
            })
          );
        }


        // --------------------------------------------------
        // Real persistent catch trial
        // --------------------------------------------------

        const catchIndex =
          catchPositions.indexOf(
            completedPosition
          );


        if (
          catchIndex !== -1 &&
          !completedKeys.has(
            `catch|${catchIndex}`
          )
        ) {

          testTrials.push(
            buildCatchTrial({

              question:
                CATCH_QUESTIONS[
                  catchIndex
                ],

              catchIndex:
                catchIndex,

              afterPair:
                completedPosition,

              developmentTest:
                false,
            })
          );
        }


        // --------------------------------------------------
        // Break
        // --------------------------------------------------

        if (
          ALL_BREAK_AFTER_PAIRS.includes(
            completedPosition
          )
        ) {

          testTrials.push(
            buildBreakScreen(
              completedPosition
            )
          );
        }
      }
    );


    // ------------------------------------------------------
    // 18. Build resume-aware timeline
    // ------------------------------------------------------

    const timeline =
      [
        preload,
      ];


    if (
      isReturningParticipant
    ) {

      timeline.push(
        resumeScreen
      );
    }


    // ------------------------------------------------------
    // Fresh / calibration / training stage
    // ------------------------------------------------------

    if (
      !hasStartedMainExperiment
    ) {

      const calibrationStarted =
        completedKeys.has(
          'calibration|volume'
        ) ||
        completedKeys.has(
          'calibration|stereo'
        );


      if (
        !calibrationStarted &&
        !calibrationComplete
      ) {

        timeline.push(
          intro
        );
      }


      timeline.push(
        ...calibrationTrials
      );


      // ----------------------------------------------------
      // Remaining training
      // ----------------------------------------------------

      if (
        !hasCompletedTraining
      ) {

        timeline.push(
          ...trainingTrials
        );
      }


      // ----------------------------------------------------
      // Training-complete transition
      //
      // Show this once training has either already been
      // completed or will be completed in this session.
      // ----------------------------------------------------

      if (
        hasCompletedTraining ||
        trainingTrials.length > 0
      ) {

        timeline.push(
          trainingCompleteScreen
        );
      }
    }


    // ------------------------------------------------------
    // 19. Main experiment
    // ------------------------------------------------------

    timeline.push(
      ...testTrials
    );


    // ------------------------------------------------------
    // 20. Debug information
    // ------------------------------------------------------

    console.log(
      '[SESSION] Phase 2 persistent plan:',
      session.trial_order
    );


    console.log(
      '[SESSION] Remaining training pairs:',
      remainingTrainingWithPosition.length
    );


    console.log(
      '[SESSION] Remaining Phase 2 pairs:',
      remainingWithIndex.length
    );


    console.log(
      '[SESSION] Participant assignment:',
      {

        prolificID:
          window.PROLIFIC_ID,

        participantID:
          participantId,

        totalPairs:
          totalTestCount,

        remainingPairs:
          remainingWithIndex.length,

        trainingCompleted:
          completedTrainingCount,

        catchPositions:
          catchPositions,
      }
    );


    // ------------------------------------------------------
    // 21. Run
    // ------------------------------------------------------

    jsPsych.run(
      timeline
    );

  } catch (error) {

    console.error(
      'Could not initialize Phase 2:',
      error
    );


    document.body.innerHTML = `
      <div
        style="
          max-width:700px;
          margin:100px auto;
          padding:30px;
          text-align:center;
        "
      >

        <h2>
          Experiment loading error
        </h2>

        <p>
          The experiment could not be initialized.
        </p>

        <p>
          Please check the participant link or refresh the page.
        </p>

        <pre
          style="
            text-align:left;
            white-space:pre-wrap;
            margin-top:30px;
          "
        >${String(error)}</pre>

      </div>
    `;
  }
}


initPhase2();