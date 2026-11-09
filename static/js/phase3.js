window.EXPERIMENT_PHASE = 'phase3';
const jsPsych = makeJsPsych('results_phase3.csv');

function buildTrial(
  pair,
  questions,
  isTraining = false
) {

  const baseData = {
    ...pair,
    userID: window.ASSIGNED_USER_ID,

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

runAssignedExperiment(jsPsych, 'phase3', buildTrial);
