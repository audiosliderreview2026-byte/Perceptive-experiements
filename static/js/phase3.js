// ══════════════════════════════════════════════════════════
//  PHASE 3 — Identity Preservation
// ══════════════════════════════════════════════════════════

window.EXPERIMENT_PHASE = 'phase3';

const jsPsych =
  makeJsPsych('results_phase3.csv');


// ==========================================================
// PHASE CONFIGURATION
// ==========================================================

const N_TEST_PAIRS = 61;
const N_TRAINING_PAIRS = 1;


// ==========================================================
// BUILD ONE PHASE-3 PAIR
// ==========================================================
//
// IMPORTANT FOR FUTURE "originals" SUPPORT:
//
// Phase 3 deliberately does NOT assume that A and B have
// the same source type.
//
// At present generatePairStimulusPlan() creates:
//
//   A and B from the same folder.
//
// Later we can generate:
//
//   A = originals/<original>
//   B = test/<corresponding edit>
//
// without changing this trial-building function, the
// database representation, or the resume logic.
// ==========================================================

function buildTrial(
  pair,
  questions,
  isTraining = false
) {

  const baseData = {

    phase:
      3,

    trialIndex:
      pair.trialIndex,

    pairType:
      pair.pairType,

    soundType:
      pair.soundType,

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
    });


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


  // --------------------------------------------------------
  // Identity-preservation questionnaire
  // --------------------------------------------------------

  const surveyTrial =
    buildSurveyTrial(
      jsPsych,
      questions,
      {

        data:
          baseData,

        isTraining:
          isTraining,
      }
    );


  return [
    listenA,
    listenB,
    surveyTrial,
  ];
}


// ==========================================================
// INITIALIZE PHASE 3
// ==========================================================

async function initPhase3() {

  try {

    // ------------------------------------------------------
    // 1. Load available WAV pools + Phase-3 questions
    //
    // /api/stimuli provides the current audio files.
    //
    // questions_phase3.json remains useful because Phase 3
    // still uses the standard questionnaire builder.
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
          '/static/js/questions_phase3.json',
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
        `Could not load questions_phase3.json: HTTP ${questionsRes.status}`
      );
    }


    const stimulusPools =
      await stimuliRes.json();


    const QUESTIONS =
      await questionsRes.json();


    // ------------------------------------------------------
    // 2. Load participant's persistent state
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
    // 3. Generate COMPLETE participant plan exactly once
    //
    // Phase 3 currently samples pairs from:
    //
    //   train
    //   test
    //
    // according to PHASE_STIMULUS_CONFIG.phase3.
    //
    // Both sounds currently come from the same category.
    //
    // Later, a different generator can create
    // original -> corresponding edited pairs while keeping
    // exactly the same stored representation.
    // ------------------------------------------------------

    if (session === null) {

      console.log(
        '[SESSION] No existing Phase 3 session. ' +
        'Generating persistent stimulus plan.'
      );


      const trainingPlan =
        generatePairStimulusPlan(
          stimulusPools,
          N_TRAINING_PAIRS,
          PHASE_STIMULUS_CONFIG
            .phase3
            .allowedCategories
        );


      const testPlan =
        generatePairStimulusPlan(
          stimulusPools,
          N_TEST_PAIRS,
          PHASE_STIMULUS_CONFIG
            .phase3
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


    // ------------------------------------------------------
    // 4. Validate stored session
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
        'Server returned an invalid Phase 3 session plan. ' +
        'If this participant ID was used before the new ' +
        'sampling system was introduced, use a new test ID.'
      );
    }


    // ------------------------------------------------------
    // 5. Restore exact stored plans
    // ------------------------------------------------------

    const trainingPairs =
      session.trial_order.training;


    const orderedTestPairs =
      session.trial_order.test;


    // ------------------------------------------------------
    // 6. Persisted progress
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


    const hasCompletedTraining =
      trainingPairs.every(
        pair =>
          completedKeys.has(
            pairTrialKey(
              pair,
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


    console.log(
      `[SESSION] Phase 3 progress: ` +
      `${completedMainCount}/${totalTestCount}`
    );


    // ------------------------------------------------------
    // 7. Resume screen
    //
    // Besides informing the participant, the button provides
    // the browser interaction required to resume audio.
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

          <p>
            You completed
            <strong>
              ${completedMainCount} / ${totalTestCount}
            </strong>
            pairs.
          </p>

          <p>
            The experiment will continue from where you stopped.
          </p>

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
    // 8. Calibration resume
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
    // 9. Training resume
    // ------------------------------------------------------

    const remainingTrainingPairs =
      trainingPairs.filter(
        pair => {

          const key =
            pairTrialKey(
              pair,
              'training'
            );

          return !completedKeys.has(
            key
          );
        }
      );


    // ------------------------------------------------------
    // 10. Remaining main pairs + persistent positions
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
    // 11. Persistent halfway point
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
            item.pair
        );


    const remainingAfterBreak =
      remainingWithIndex
        .filter(
          item =>
            item.index >= midPoint
        )
        .map(
          item =>
            item.pair
        );


    const hasPassedBreak =
      orderedTestPairs
        .slice(
          0,
          midPoint
        )
        .every(
          pair =>
            completedKeys.has(
              pairTrialKey(
                pair,
                'test'
              )
            )
        );


    // ------------------------------------------------------
    // 12. Preload only audio that can still be needed
    // ------------------------------------------------------

    const audioToPreload =
      [];


    // Calibration.
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


    // Remaining training pairs.
    remainingTrainingPairs.forEach(
      pair => {

        audioToPreload.push(
          pair.soundA.audioPath,
          pair.soundB.audioPath
        );
      }
    );


    // Remaining main pairs.
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
    // 13. Intro
    // ------------------------------------------------------

    const intro = {

      type:
        jsPsychHtmlButtonResponse,

      stimulus: `
        <div class="screen">

          <h2>
            Audio Experiment — Pair Evaluation
          </h2>

          <p>
            In this experiment, you will listen to
            <strong>pairs of footstep sounds</strong>:
            Sound A followed by Sound B.
          </p>

          <p>
            You will evaluate how much characteristics of
            the footsteps and their acoustic environment
            change between the two sounds.
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

            <li>
              Each sound will play for a maximum of
              <strong>5 seconds</strong>.
            </li>

          </ul>

          <p>
            For each pair, you will answer
            <strong>
              ${QUESTIONS.length}
              question${QUESTIONS.length !== 1 ? 's' : ''}
            </strong>
            using continuous sliders.
          </p>

          <p>
            You will evaluate
            <strong>
              ${totalTestCount} pairs
            </strong>.
          </p>

          <p>
            We will begin with
            <strong>
              ${trainingPairs.length}
              training pair${trainingPairs.length !== 1 ? 's' : ''}
            </strong>
            to familiarize you with the task.
          </p>

        </div>
      `,

      choices: [
        'Start calibration'
      ],
    };


    // ------------------------------------------------------
    // 14. Training complete
    // ------------------------------------------------------

    const trainingDone = {

      type:
        jsPsychHtmlButtonResponse,

      stimulus: `
        <div class="screen">

          <h3>
            Training complete ✓
          </h3>

          <p>
            You will now evaluate
            <strong>
              ${totalTestCount} pairs
            </strong>.
          </p>

          <p>
            The task is the same as during training.
          </p>

        </div>
      `,

      choices: [
        'Start'
      ],
    };


    // ------------------------------------------------------
    // 15. Halfway break
    // ------------------------------------------------------

    const pairsAfterBreak =
      totalTestCount - midPoint;


    const midBreak = {

      type:
        jsPsychHtmlButtonResponse,

      stimulus: `
        <div class="screen">

          <h3>
            Break
          </h3>

          <p>
            You have completed half of the pairs —
            take a short break if needed.
          </p>

          <p>
            There are
            <strong>
              ${pairsAfterBreak} pairs
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
    // 16. Build remaining trials
    // ------------------------------------------------------

    const trainingTrials =
      remainingTrainingPairs.flatMap(
        pair =>
          buildTrial(
            pair,
            QUESTIONS,
            true
          )
      );


    const testTrialsA =
      remainingBeforeBreak.flatMap(
        pair =>
          buildTrial(
            pair,
            QUESTIONS,
            false
          )
      );


    const testTrialsB =
      remainingAfterBreak.flatMap(
        pair =>
          buildTrial(
            pair,
            QUESTIONS,
            false
          )
      );


    // ------------------------------------------------------
    // 17. Build resume-aware timeline
    // ------------------------------------------------------

    const timeline = [
      preload,
    ];


    // Returning participant:
    //
    // This is intentionally shown even at 0/N when
    // calibration/training has already been saved.
    if (isReturningParticipant) {

      timeline.push(
        resumeScreen
      );
    }


    // ------------------------------------------------------
    // Calibration + training
    // ------------------------------------------------------

    if (!hasStartedMainExperiment) {

      const calibrationStarted =
        completedKeys.has(
          'calibration|volume'
        ) ||
        completedKeys.has(
          'calibration|stereo'
        );


      // Fresh participant.
      if (
        !calibrationStarted &&
        !calibrationComplete
      ) {

        timeline.push(
          intro
        );
      }


      // Only unfinished calibration trials.
      timeline.push(
        ...calibrationTrials
      );


      // Only unfinished training pairs.
      timeline.push(
        ...trainingTrials
      );


      // Only show if training actually occurred during this
      // browser session.
      if (
        trainingTrials.length > 0
      ) {

        timeline.push(
          trainingDone
        );
      }
    }


    // ------------------------------------------------------
    // 18. Main experiment
    // ------------------------------------------------------

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


    // ------------------------------------------------------
    // 19. Debug information
    // ------------------------------------------------------

    console.log(
      '[SESSION] Phase 3 persistent plan:',
      session.trial_order
    );


    console.log(
      '[SESSION] Remaining Phase 3 pairs:',
      remainingWithIndex.length
    );


    // ------------------------------------------------------
    // 20. Run
    // ------------------------------------------------------

    jsPsych.run(
      timeline
    );

  } catch (error) {

    console.error(
      'Could not initialize Phase 3:',
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
          Please refresh the page.
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


initPhase3();