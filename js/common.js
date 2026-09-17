// ══════════════════════════════════════════════════════════
//  Commun à toutes les phases de l'expérience
// ══════════════════════════════════════════════════════════

// Construit le CSV
function resultsToCsv(jsPsych) {
  return jsPsych.data.get()
    .filter({ step: 'ratings', training: false })
    .ignore('training')
    .ignore('response')
    .ignore('trial_type')
    .ignore('plugin_version')
    .ignore('internal_node_id')
    .csv();
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


// Bouton de téléchargement du CSV (version dev)
function addPartialDownloadButton(jsPsych, downloadFilename) {
  const btn = document.createElement('button');
  btn.textContent = 'Télécharger les résultats (en cours)';
  btn.style.cssText =
    'position:fixed;bottom:14px;right:14px;z-index:9999;padding:9px 16px;' +
    'font-size:12.5px;background:#1e508c;color:#fff;border:none;border-radius:8px;' +
    'cursor:pointer;opacity:.85;box-shadow:0 1px 6px rgba(0,0,0,.25);';
  btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', () => { btn.style.opacity = '.85'; });
  btn.addEventListener('click', () => {
    downloadCsv(resultsToCsv(jsPsych), 'partiel_' + downloadFilename);
  });
  document.body.appendChild(btn);
}

function makeJsPsych(downloadFilename) {
  let finished = false;

  const jsPsych = initJsPsych({
    show_progress_bar: true,
    on_finish() {
      finished = true;
      downloadCsv(resultsToCsv(jsPsych), downloadFilename);

      jsPsych.getDisplayElement().innerHTML =
        '<div style="text-align:center;padding:120px 20px">' +
        '<h2 style="color:#1e508c">Merci pour votre participation !</h2>' +
        '<p>Vos résultats ont été téléchargés automatiquement.</p></div>';
    },
  });

  window.addEventListener('beforeunload', (e) => {
    if (finished) return;
    e.preventDefault();
    e.returnValue = '';
  });

  addPartialDownloadButton(jsPsych, downloadFilename);

  return jsPsych;
}

// Écran d'écoute générique (1 son, avec ou sans étiquette de rôle A/B).
function listenHtml({ label, role = null, isTraining = false, tagLabel = 'Entraînement' } = {}) {
  const tag     = isTraining ? `<div class="screen-tag">${tagLabel}</div>` : '';
  const roleTag = role ? `<div class="sound-role">${role}</div>` : '';
  return (
    '<div class="listen-wrap">' + tag +
    `<div class="sound-label">${label}</div>` + roleTag +
    '<div class="listen-hint">Écoutez attentivement avant de continuer.</div>' +
    '</div>'
  );
}

// Essai d'écoute générique (jsPsychAudioButtonResponse).
function buildListenTrial({ audioPath, choices, prompt, data }) {
  return {
    type                          : jsPsychAudioButtonResponse,
    stimulus                      : audioPath,
    choices                       : choices,
    prompt                        : prompt,
    response_allowed_while_playing: false,
    data                          : data,
  };
}

// Questionnaire générique à partir d'une liste { key, text, left, right }.
function buildSurveyTrial(jsPsych, questions, { data, isTraining = false, tagLabel = 'Entraînement' } = {}) {
  const state = {};

  const tag = isTraining
    ? `<div class="screen-tag" style="margin-bottom:14px">${tagLabel}</div>`
    : '';

  const html =
    '<div class="survey-wrap">' + tag +
    questions.map((q, i) =>
      `<div class="survey-item">
         <p class="survey-question">${q.text}</p>
         <div class="slider-row">
           <span class="slider-lbl lbl-left">${q.left}</span>
           <input type="range" id="q${i}" class="survey-slider" min="0" max="100" value="50">
           <span class="slider-lbl lbl-right">${q.right}</span>
         </div>
       </div>`
    ).join('') +
    '</div>';

  return {
    type    : jsPsychHtmlButtonResponse,
    stimulus: html,
    choices : ['Valider'],
    data    : Object.assign({ step: 'ratings' }, data),
    on_load() {
      questions.forEach((_, i) => { state[i] = 50; });
      questions.forEach((_, i) => {
        const sl = document.getElementById('q' + i);
        if (sl) sl.addEventListener('input', () => { state[i] = parseInt(sl.value); });
      });
    },
    on_finish() {
      const extra = {};
      questions.forEach((q, i) => {
        extra[q.key] = state[i] !== undefined ? state[i] : 50;
      });
      jsPsych.data.addDataToLastTrial(extra);
    },
  };
}

function buildTemplatedQuestionTrial(jsPsych, config, { data, isTraining = false, tagLabel = 'Entraînement' } = {}) {
  const { directionOptions, questions } = config;
  const direction = directionOptions[Math.floor(Math.random() * directionOptions.length)];
  const fill = (text) => text.replace(/\{direction\}/g, direction);

  const state = {};
  const choiceKeys = questions.filter(q => q.type === 'choice').map(q => q.key);

  const tag = isTraining
    ? `<div class="screen-tag" style="margin-bottom:14px">${tagLabel}</div>`
    : '';

  const html =
    '<div class="survey-wrap">' + tag +
    questions.map((q, i) => {
      if (q.type === 'choice') {
        return `<div class="survey-item">
           <p class="survey-question">${fill(q.text)}</p>
           <div class="p2-btn-group">
             ${q.choices.map(c => `<button type="button" class="p2-choice-btn" data-key="${q.key}" data-choice="${c}">${c}</button>`).join('')}
           </div>
         </div>`;
      }
      return `<div class="survey-item">
         <p class="survey-question">${fill(q.text)}</p>
         <div class="slider-row">
           <span class="slider-lbl lbl-left">${fill(q.left)}</span>
           <input type="range" id="q${i}" class="survey-slider" min="0" max="100" value="0">
           <span class="slider-lbl lbl-right">${fill(q.right)}</span>
         </div>
       </div>`;
    }).join('') +
    '</div>';

  return {
    type    : jsPsychHtmlButtonResponse,
    stimulus: html,
    choices : ['Valider'],
    data    : Object.assign({ step: 'ratings', Direction_Question: direction }, data),
    on_load() {
      const submitBtn = document.querySelector('.jspsych-btn');
      if (!submitBtn) return; // pas de rendu réel (ex: simulation jsPsych en mode data-only)

      const updateSubmit = () => {
        const allChosen = choiceKeys.every(k => state[k] !== undefined);
        submitBtn.disabled = !allChosen;
        submitBtn.classList.toggle('btn-disabled', !allChosen);
      };
      updateSubmit();

      questions.forEach((q, i) => {
        if (q.type === 'slider') {
          state[q.key] = 0;
          const sl = document.getElementById('q' + i);
          if (sl) sl.addEventListener('input', (e) => { state[q.key] = parseInt(e.target.value); });
        }
      });

      document.querySelectorAll('.p2-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.key;
          document.querySelectorAll(`.p2-choice-btn[data-key="${key}"]`).forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          state[key] = btn.dataset.choice;
          updateSubmit();
        });
      });
    },
    on_finish() {
      jsPsych.data.addDataToLastTrial(state);
    },
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
