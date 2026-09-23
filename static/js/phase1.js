window.EXPERIMENT_PHASE = 'phase1';

// ══════════════════════════════════════════════════════════
// PHASE 1 — Individual Evaluation
// ══════════════════════════════════════════════════════════

const jsPsych =
  makeJsPsych('results_phase1.csv');


// ==========================================================
// PHASE CONFIGURATION
// ==========================================================

const N_TEST_TRIALS = 61;
const N_TRAINING_TRIALS = 1;


// ==========================================================
// BUILD ONE PHASE-1 TRIAL
// ==========================================================

function buildTrial(
  stimulus,
  questions,
  isTraining = false
) {

  const baseData = {

    phase:
      1,

    trialIndex:
      stimulus.trialIndex,

    soundId:
      stimulus.soundId,

    soundType:
      stimulus.soundType,

    audioPath:
      stimulus.audioPath,

    repeatOfTrialIndex:
      stimulus.repeatOfTrialIndex ?? null,

    training:
      isTraining,
  };


  const listenTrial =
    buildListenTrial({

      audioPath:
        stimulus.audioPath,

      choices: [
        'Answer →'
      ],

      prompt:
        listenHtml({
          label:
            'Sound to evaluate',

          isTraining,
        }),

      data:
        Object.assign(
          {
            step:
              'listen',
          },
          baseData
        ),
    });


  const surveyTrial =
    buildSurveyTrial(
      jsPsych,
      questions,
      {
        data:
          baseData,

        isTraining,
      }
    );


  return [
    listenTrial,
    surveyTrial,
  ];
}


// ==========================================================
// GENERATE TRAINING PLAN
// ==========================================================

function generateTrainingPlan(
  stimulusPools,
  numberOfTrials
) {

  const plan = [];

  let previousAudioPath = null;


  for (
    let trialIndex = 0;
    trialIndex < numberOfTrials;
    trialIndex++
  ) {

    const category =
      sampleWeightedCategory(
        stimulusPools,
        PHASE_STIMULUS_CONFIG
          .phase1
          .allowedCategories,
        1
      );


    const stimulus =
      sampleSoundFromPool(
        stimulusPools[category],
        previousAudioPath
      );


    plan.push({

      trialIndex,

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


  return plan;
}


// ==========================================================
// INITIALIZE PHASE 1
// ==========================================================

async function initPhase1() {

  try {

    // ------------------------------------------------------
    // 1. Load flat stimulus pools + questions
    // ------------------------------------------------------

    const [
      stimuliRes,
      questionsRes,
    ] =
      await Promise.all([

        fetch(
          '/api/stimuli',
          {
            cache:
              'no-store',
          }
        ),

        fetch(
          '/static/js/questions_phase1.json',
          {
            cache:
              'no-store',
          }
        ),
      ]);


    if (!stimuliRes.ok) {

      throw new Error(
        `Could not load stimulus pools: HTTP ${stimuliRes.status}`
      );
    }


    if (!questionsRes.ok) {

      throw new Error(
        `Could not load questions_phase1.json: HTTP ${questionsRes.status}`
      );
    }


    const stimulusPools =
      await stimuliRes.json();


    const QUESTIONS =
      await questionsRes.json();


    // ------------------------------------------------------
    // 2. Load persistent participant state
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
    // 3. Generate the COMPLETE participant plan exactly once
    //
    // We persist both training and test stimuli themselves.
    // ------------------------------------------------------

    if (session === null) {

      const trainingPlan =
        generateTrainingPlan(
          stimulusPools,
          N_TRAINING_TRIALS
        );


      const testPlan =
        generateStimulusPlan(
          stimulusPools,
          N_TEST_TRIALS,
          PHASE_STIMULUS_CONFIG
            .phase1
            .allowedCategories
        );


      const persistentPlan = {

        version:
          2,

        training:
          trainingPlan,

        test:
          testPlan,
      };


      const created =
        await createPhaseSession(
          window.EXPERIMENT_PHASE,
          persistentPlan
        );


      session =
        created.session;
    }


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
        'Server returned an invalid Phase 1 session plan.'
      );
    }


    const trainingStimuli =
      session.trial_order.training;


    const orderedTestStimuli =
      session.trial_order.test;


    // ------------------------------------------------------
    // 4. Progress
    // ------------------------------------------------------

    const totalTestCount =
      orderedTestStimuli.length;


    const completedMainCount =
      orderedTestStimuli.filter(
        stimulus =>
          completedKeys.has(
            stimulusTrialKey(
              stimulus,
              'test'
            )
          )
      ).length;


    const hasCompletedTraining =
      trainingStimuli.every(
        stimulus =>
          completedKeys.has(
            stimulusTrialKey(
              stimulus,
              'training'
            )
          )
      );


    const isReturningParticipant =
      completedKeys.size > 0;


    const hasStartedMainExperiment =
      hasCompletedTraining ||
      completedMainCount > 0;


    setExperimentProgress(
      completedMainCount,
      totalTestCount
    );


    // ------------------------------------------------------
    // 5. Resume screen
    // ------------------------------------------------------

    const resumeScreen = {

      type:
        jsPsychHtmlButtonResponse,

      stimulus: `
        <div class="screen">

          <h2>Welcome back</h2>

          <p>
            Your previous responses have been saved.
          </p>

          <p>
            You completed
            <strong>
              ${completedMainCount} / ${totalTestCount}
            </strong>
            sounds.
          </p>

          <p>
            The experiment will continue from where you stopped.
          </p>

          <p>
            Please make sure you are still wearing your
            <strong>headphones or earphones</strong>.
          </p>

        </div>
      `,

      choices: [
        'Resume experiment'
      ],
    };


    // ------------------------------------------------------
    // 6. Calibration
    // ------------------------------------------------------

    const calibrationTrials =
      buildCalibrationTrials(
        completedKeys
      );


    const calibrationComplete =
      completedKeys.has(
        'calibration|volume'
      ) &&
      completedKeys.has(
        'calibration|stereo'
      );


    // ------------------------------------------------------
    // 7. Remaining training
    // ------------------------------------------------------

    const remainingTrainingStimuli =
      trainingStimuli.filter(
        stimulus =>
          !completedKeys.has(
            stimulusTrialKey(
              stimulus,
              'training'
            )
          )
      );


    // ------------------------------------------------------
    // 8. Remaining test + persistent positions
    // ------------------------------------------------------

    const remainingWithIndex =
      orderedTestStimuli
        .map(
          (stimulus, index) => ({
            stimulus,
            index,
          })
        )
        .filter(
          ({ stimulus }) =>
            !completedKeys.has(
              stimulusTrialKey(
                stimulus,
                'test'
              )
            )
        );


    // ------------------------------------------------------
    // 9. Halfway break
    // ------------------------------------------------------

    const midPoint =
      Math.floor(
        totalTestCount / 2
      );


    const remainingBeforeBreak =
      remainingWithIndex
        .filter(
          item =>
            item.index < midPoint
        )
        .map(
          item =>
            item.stimulus
        );


    const remainingAfterBreak =
      remainingWithIndex
        .filter(
          item =>
            item.index >= midPoint
        )
        .map(
          item =>
            item.stimulus
        );


    const hasPassedBreak =
      orderedTestStimuli
        .slice(
          0,
          midPoint
        )
        .every(
          stimulus =>
            completedKeys.has(
              stimulusTrialKey(
                stimulus,
                'test'
              )
            )
        );


    // ------------------------------------------------------
    // 10. Preload
    // ------------------------------------------------------

    const audioToPreload = [];


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


    remainingTrainingStimuli.forEach(
      stimulus => {

        audioToPreload.push(
          stimulus.audioPath
        );
      }
    );


    remainingWithIndex.forEach(
      ({ stimulus }) => {

        audioToPreload.push(
          stimulus.audioPath
        );
      }
    );


    const preload = {

      type:
        jsPsychPreload,

      audio:
        [...new Set(audioToPreload)],

      message:
        '<p>Loading audio files, please wait…</p>',

      error_message:
        '<p>Loading error. Please refresh the page.</p>',

      show_progress_bar:
        true,
    };


    // ------------------------------------------------------
    // 11. Intro
    // ------------------------------------------------------

    const intro = {

      type:
        jsPsychHtmlButtonResponse,

      stimulus: `
        <div class="screen">

          <h2>
            Audio Experiment — Individual Evaluation
          </h2>

          <p>
            In this experiment, you will listen to footstep
            sounds and answer a few questions about each sound.
          </p>

          <ul>

            <li>
              Use <strong>headphones or earphones</strong>.
            </li>

            <li>
              Make sure you are in a
              <strong>quiet environment</strong>.
            </li>

            <li>
              Each sound will play for a maximum of
              <strong>5 seconds</strong>.
            </li>

          </ul>

          <p>
            You will hear
            <strong>${totalTestCount} sounds</strong>,
            one at a time.
          </p>

        </div>
      `,

      choices: [
        'Start calibration'
      ],
    };


    const trainingDone = {

      type:
        jsPsychHtmlButtonResponse,

      stimulus: `
        <div class="screen">

          <h3>Training complete ✓</h3>

          <p>
            You will now evaluate
            <strong>${totalTestCount} sounds</strong>.
          </p>

        </div>
      `,

      choices: [
        'Start'
      ],
    };


    const midBreak = {

      type:
        jsPsychHtmlButtonResponse,

      stimulus: `
        <div class="screen">

          <h3>Break</h3>

          <p>
            You have completed half of the sounds.
            Take a short break if needed.
          </p>

          <p>
            There are
            <strong>
              ${totalTestCount - midPoint} sounds
            </strong>
            remaining.
          </p>

        </div>
      `,

      choices: [
        'Continue'
      ],
    };


    // ------------------------------------------------------
    // 12. Build remaining experimental trials
    // ------------------------------------------------------

    const trainingTrials =
      remainingTrainingStimuli.flatMap(
        stimulus =>
          buildTrial(
            stimulus,
            QUESTIONS,
            true
          )
      );


    const testTrialsA =
      remainingBeforeBreak.flatMap(
        stimulus =>
          buildTrial(
            stimulus,
            QUESTIONS,
            false
          )
      );


    const testTrialsB =
      remainingAfterBreak.flatMap(
        stimulus =>
          buildTrial(
            stimulus,
            QUESTIONS,
            false
          )
      );


    // ------------------------------------------------------
    // 13. Timeline
    // ------------------------------------------------------

    const timeline = [
      preload,
    ];


    if (isReturningParticipant) {

      timeline.push(
        resumeScreen
      );
    }


    if (!hasStartedMainExperiment) {

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


      timeline.push(
        ...trainingTrials
      );


      if (
        trainingTrials.length > 0
      ) {

        timeline.push(
          trainingDone
        );
      }
    }


    timeline.push(
      ...testTrialsA
    );


    if (
      !hasPassedBreak &&
      testTrialsB.length > 0
    ) {

      timeline.push(
        midBreak
      );
    }


    timeline.push(
      ...testTrialsB
    );


    console.log(
      '[SESSION] Phase 1 plan:',
      session.trial_order
    );


    jsPsych.run(
      timeline
    );

  } catch (error) {

    console.error(
      'Could not initialize Phase 1:',
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
        <h2>Experiment loading error</h2>
        <p>Please refresh the page.</p>
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


initPhase1();