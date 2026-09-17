// ══════════════════════════════════════════════════════════
//  PHASE 1 — Évaluation individuelle
// ══════════════════════════════════════════════════════════

const jsPsych = makeJsPsych('resultats_phase1.csv');

function buildTrial(stimulus, questions, isTraining = false) {
  const baseData = {
    phase    : 1,
    soundId  : stimulus.soundId,
    stimType : stimulus.stimType,
    segment  : stimulus.segment,
    alpha    : stimulus.alpha,
    soundType: stimulus.soundType,
    training : isTraining,
  };

  const listenTrial = buildListenTrial({
    audioPath: stimulus.audioPath,
    choices  : ['Répondre →'],
    prompt   : listenHtml({ label: 'Son à évaluer', isTraining }),
    data     : Object.assign({ step: 'listen' }, baseData),
  });

  const surveyTrial = buildSurveyTrial(jsPsych, questions, { data: baseData, isTraining });

  return [listenTrial, surveyTrial];
}

async function initPhase1() {
  const [stimuliRes, questionsRes] = await Promise.all([
    fetch('stimulis/stimuli.json', { cache: 'no-store' }),
    fetch('js/questions_phase1.json', { cache: 'no-store' }),
  ]);
  const { phase1: DATA } = await stimuliRes.json();
  const QUESTIONS = await questionsRes.json();

  const trainingStimuli = DATA.training.slice(0, 1);
  const testStimuli     = shuffle(DATA.testing);
  const midPoint         = Math.floor(testStimuli.length / 2);

  const preload = {
    type             : jsPsychPreload,
    audio            : DATA.training.concat(DATA.testing).map(s => s.audioPath),
    message          : '<p>Chargement des fichiers audio, veuillez patienter…</p>',
    error_message    : '<p>Erreur de chargement. Veuillez rafraîchir la page.</p>',
    show_progress_bar: true,
  };

  const intro = {
    type    : jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="screen">
        <h2>Expérience Audio — Évaluation individuelle</h2>
        <p>Dans cette expérience, vous allez écouter des bruits de pas et répondre à quelques questions sur chaque son.</p>
        <ul>
          <li>Utilisez un <strong>casque ou des écouteurs</strong>.</li>
          <li>Placez-vous dans un <strong>environnement calme</strong>.</li>
          <li>Chaque son dure <strong>5 secondes</strong> et doit être écouté jusqu'au bout avant de répondre.</li>
        </ul>
        <p>Vous allez entendre <strong>${testStimuli.length} sons</strong>, un par un, et répondre à
        <strong>${QUESTIONS.length} questions</strong> par son à l'aide de curseurs continus.</p>
        <p>Nous commençons par un son d'entraînement pour vous familiariser avec la tâche.</p>
      </div>`,
    choices: ["Commencer l'entraînement"],
  };

  const trainingDone = {
    type    : jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="screen">
        <h3>Entraînement terminé ✓</h3>
        <p>Vous allez maintenant évaluer <strong>${testStimuli.length} sons</strong>.</p>
        <p>La tâche est identique à l'entraînement.</p>
      </div>`,
    choices: ['Commencer'],
  };

  const midBreak = {
    type    : jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="screen">
        <h3>Pause</h3>
        <p>Vous avez complété la moitié des sons — prenez une courte pause si nécessaire.</p>
        <p>Il reste <strong>${testStimuli.length - midPoint} sons</strong>.</p>
      </div>`,
    choices: ['Reprendre'],
  };

  const trainingTrials = trainingStimuli.flatMap(s => buildTrial(s, QUESTIONS, true));
  const testTrialsA    = testStimuli.slice(0, midPoint).flatMap(s => buildTrial(s, QUESTIONS));
  const testTrialsB    = testStimuli.slice(midPoint).flatMap(s => buildTrial(s, QUESTIONS));

  jsPsych.run([
    preload,
    intro,
    ...trainingTrials,
    trainingDone,
    ...testTrialsA,
    midBreak,
    ...testTrialsB,
  ]);
}

initPhase1();
