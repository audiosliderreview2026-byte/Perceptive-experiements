const params = new URLSearchParams(window.location.search);

const nextPage = params.get("next") || "index.html";


function audioOK() {

  document.getElementById("audioWarning").textContent = "";

  document.getElementById("step1").classList.add("hidden");
  document.getElementById("step2").classList.remove("hidden");

}


function audioNotOK() {

  document.getElementById("audioWarning").textContent =
    "Please check your audio output, connect headphones, and adjust your volume before continuing.";

}


function headphoneAnswer(answer) {

  const feedback = document.getElementById("headphoneFeedback");

  if (answer === "left") {

    feedback.textContent = "Correct.";
    feedback.className = "success";

    setTimeout(() => {

      document.getElementById("step2").classList.add("hidden");
      document.getElementById("success").classList.remove("hidden");

    }, 500);

  } else {

    feedback.textContent =
      "That was not correct. Please check that your headphones are connected and worn correctly.";

    feedback.className = "warning";

  }

}


function startExperiment() {

  window.location.href = nextPage;

}