window.EXPERIMENT_PHASE = 'phase1';
const jsPsych = makeJsPsych('results_phase1.csv');

function buildTrial(
  stimulus,
  questions,
  isTraining = false
) {

  const baseData = {
    ...stimulus,
    userID: window.ASSIGNED_USER_ID,

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

runAssignedExperiment(jsPsych, 'phase1', buildTrial);
