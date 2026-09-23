// ══════════════════════════════════════════════════════════
//  TRAINING-SOUND EXPERIMENT
// ══════════════════════════════════════════════════════════

const jsPsych = makeJsPsych('results_training_experiment.csv');
window.EXPERIMENT_PHASE = 'training_experiment';

function buildTrial(pair, questions, isTraining = false) {
  const stimA = pair.original;
  const stimB = pair.edited;

  const baseData = {
    phase     : 'training_experiment',
    soundId   : pair.soundId,
    stimTypeA : stimA.stimType,
    stimTypeB : stimB.stimType,
    segment   : pair.segment,
    alpha     : pair.alpha,
    soundType : pair.soundType,
    training  : isTraining,
  };

  const listenA = buildListenTrial({
    audioPath: stimA.audioPath,
    choices  : ['Listen to Sound B →'],
    prompt   : listenHtml({ label: 'Listen to Sound A', role: 'A', isTraining }),
    data     : Object.assign({ step: 'listenA' }, baseData),
  });

  const listenB = buildListenTrial({
    audioPath: stimB.audioPath,
    choices  : ['Answer →'],
    prompt   : listenHtml({ label: 'Listen to Sound B', role: 'B', isTraining }),
    data     : Object.assign({ step: 'listenB' }, baseData),
  });

  const surveyTrial = buildSurveyTrial(jsPsych, questions, { data: baseData, isTraining });

  return [listenA, listenB, surveyTrial];
}

async function initExpApprentissage() {
  const [stimuliRes, questionsRes] = await Promise.all([
    fetch('/static/js/stimuli.json', { cache: 'no-store' }),
    fetch('/static/js/questions_phase2.json', { cache: 'no-store' }),
  ]);

  const { apprentissage: PAIRS } = await stimuliRes.json();
  const QUESTIONS = await questionsRes.json();

  // Convert paths from the old dataset layout to Flask static paths.
  PAIRS.training.concat(PAIRS.testing).forEach(pair => {
    pair.original.audioPath = resolveAudioPath(pair.original.audioPath);
    pair.edited.audioPath = resolveAudioPath(pair.edited.audioPath);
  });

  const trainingPairs = PAIRS.training;
  const testPairs      = shuffle(PAIRS.testing);
  const midPoint        = Math.floor(testPairs.length / 2);

  const allAudioPaths = [
      '/static/stimulis/calibration/test_sound.wav',
      '/static/stimulis/calibration/left.wav',

      ...PAIRS.training.concat(PAIRS.testing)
        .flatMap(p => [p.original.audioPath, p.edited.audioPath]),
    ];


  const preload = {
    type             : jsPsychPreload,
    audio            : allAudioPaths,
    message          : '<p>Loading audio files, please wait…</p>',
    error_message    : '<p>Loading error. Please refresh the page.</p>',
    show_progress_bar: true,
  };

  const intro = {
    type    : jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="screen">
        <h2>Audio Experiment — Pair Evaluation</h2>
        <p>In this experiment, you will listen to <strong>pairs of sounds</strong> (Sound A followed by Sound B).</p>
        <ul>
          <li>Use <strong>headphones or earphones</strong>.</li>
          <li>Make sure you are in a <strong>quiet environment</strong>.</li>
          <li>Each sound lasts <strong>5 seconds</strong> and must be listened to in full before answering.</li>
        </ul>
        <p>For each pair, you will answer <strong>${QUESTIONS.length} questions</strong> using continuous sliders.</p>
        <p>We will begin with <strong>${trainingPairs.length} training pair${trainingPairs.length > 1 ? 's' : ''}</strong> to familiarize you with the task.</p>
      </div>`,
    choices: ["Start calibration"],
  };

  const trainingDone = {
    type    : jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="screen">
        <h3>Training complete ✓</h3>
        <p>You will now evaluate <strong>${testPairs.length} pairs</strong>.</p>
        <p>The task is the same as during training.</p>
      </div>`,
    choices: ['Start'],
  };

  const midBreak = {
    type    : jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="screen">
        <h3>Break</h3>
        <p>You have completed half of the pairs — take a short break if needed.</p>
        <p>There are <strong>${testPairs.length - midPoint} pairs</strong> remaining.</p>
      </div>`,
    choices: ['Continue'],
  };
  const calibrationTrials = buildCalibrationTrials();
  const trainingTrials = trainingPairs.flatMap(p => buildTrial(p, QUESTIONS, true));
  const testTrialsA    = testPairs.slice(0, midPoint).flatMap(p => buildTrial(p, QUESTIONS));
  const testTrialsB    = testPairs.slice(midPoint).flatMap(p => buildTrial(p, QUESTIONS));

  jsPsych.run([
    preload,
    intro,

    // Audio calibration
    ...calibrationTrials,

    // Training
    ...trainingTrials,
    trainingDone,

    // Main experiment
    ...testTrialsA,
    midBreak,
    ...testTrialsB,
  ]);
}

initExpApprentissage();
