window.EXPERIMENT_PHASE = 'phase2';
const jsPsych = makeJsPsych('results_phase2.csv');

function buildTrial(pair, questions, isTraining = false) {
  const stimA = pair.soundA;
  const stimB = pair.soundB;

  const baseData = {
    ...pair,
    userID: window.ASSIGNED_USER_ID,
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

  // Shared A/B emotion scale, preceded by the common audibility checks.
  const surveyTrial = buildSurveyTrial(jsPsych, questions, { data: baseData, isTraining });

  return [listenA, listenB, surveyTrial];
}

runAssignedExperiment(jsPsych, 'phase2', buildTrial);
