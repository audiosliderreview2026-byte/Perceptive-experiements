// ══════════════════════════════════════════════════════════
//  PHASE 2 — Contrôlabilité sémantique
// ══════════════════════════════════════════════════════════

const jsPsych = makeJsPsych('resultats_phase2.csv');

function buildTrial(pair, questions, isTraining = false) {
  const stimA = pair.original;
  const stimB = pair.edited;

  const baseData = {
    phase     : 2,
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
    choices  : ['Écouter le Son B →'],
    prompt   : listenHtml({ label: 'Son A à écouter', role: 'A', isTraining }),
    data     : Object.assign({ step: 'listenA' }, baseData),
  });

  const listenB = buildListenTrial({
    audioPath: stimB.audioPath,
    choices  : ['Répondre →'],
    prompt   : listenHtml({ label: 'Son B à écouter', role: 'B', isTraining }),
    data     : Object.assign({ step: 'listenB' }, baseData),
  });

  const surveyTrial = buildSurveyTrial(jsPsych, questions, { data: baseData, isTraining });

  return [listenA, listenB, surveyTrial];
}

async function initPhase2() {
  const [stimuliRes, questionsRes] = await Promise.all([
    fetch('stimulis/stimuli.json', { cache: 'no-store' }),
    fetch('js/questions_phase2.json', { cache: 'no-store' }),
  ]);
  const { phase2: PAIRS } = await stimuliRes.json();
  const QUESTIONS = await questionsRes.json();

  const trainingPairs = PAIRS.training;
  const testPairs      = shuffle(PAIRS.testing);
  const midPoint        = Math.floor(testPairs.length / 2);

  const allAudioPaths = PAIRS.training.concat(PAIRS.testing)
    .flatMap(p => [p.original.audioPath, p.edited.audioPath]);

  const preload = {
    type             : jsPsychPreload,
    audio            : allAudioPaths,
    message          : '<p>Chargement des fichiers audio, veuillez patienter…</p>',
    error_message    : '<p>Erreur de chargement. Veuillez rafraîchir la page.</p>',
    show_progress_bar: true,
  };

  const intro = {
    type    : jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="screen">
        <h2>Expérience Audio — Evaluation de paires</h2>
        <p>Dans cette expérience, vous allez écouter des <strong>paires de sons</strong> (Son A puis Son B).</p>
        <ul>
          <li>Utilisez un <strong>casque ou des écouteurs</strong>.</li>
          <li>Placez-vous dans un <strong>environnement calme</strong>.</li>
          <li>Chaque son dure <strong>5 secondes</strong> et doit être écouté jusqu'au bout avant de répondre.</li>
        </ul>
        <p>Pour chaque paire, vous répondrez à <strong>${QUESTIONS.length} questions</strong> à l'aide de curseurs continus.</p>
        <p>Nous commençons par <strong>${trainingPairs.length} paire${trainingPairs.length > 1 ? 's' : ''} d'entraînement</strong> pour vous familiariser avec la tâche.</p>
      </div>`,
    choices: ["Commencer l'entraînement"],
  };

  const trainingDone = {
    type    : jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="screen">
        <h3>Entraînement terminé ✓</h3>
        <p>Vous allez maintenant évaluer <strong>${testPairs.length} paires</strong>.</p>
        <p>La tâche est identique à l'entraînement.</p>
      </div>`,
    choices: ['Commencer'],
  };

  const midBreak = {
    type    : jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="screen">
        <h3>Pause</h3>
        <p>Vous avez complété la moitié des paires — prenez une courte pause si nécessaire.</p>
        <p>Il reste <strong>${testPairs.length - midPoint} paires</strong>.</p>
      </div>`,
    choices: ['Reprendre'],
  };

  const trainingTrials = trainingPairs.flatMap(p => buildTrial(p, QUESTIONS, true));
  const testTrialsA    = testPairs.slice(0, midPoint).flatMap(p => buildTrial(p, QUESTIONS));
  const testTrialsB    = testPairs.slice(midPoint).flatMap(p => buildTrial(p, QUESTIONS));

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

initPhase2();
