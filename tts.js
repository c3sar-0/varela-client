const synth = window.speechSynthesis;

function getVoicesES() {
  return synth.getVoices().filter(v =>
    (v.lang || "").toLowerCase().startsWith("es")
  );
}

// Rellena el selector de voces (cuando cargan)
function populateVoices() {
  const voices = getVoicesES();
  const sel = document.getElementById("tts-voice");
  sel.innerHTML = "";
  voices.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(opt);
  });
  if (!voices.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Voz ES no disponible (usa voz por defecto)";
    sel.appendChild(opt);
  }
}
populateVoices();
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.onvoiceschanged = populateVoices;
}

// Troceo seguro (frases ~200–250 chars)
function chunkText(text, maxLen = 240) {
  const parts = [];
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[\.\?\!…;:])\s+/);

  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length <= maxLen) {
      cur = (cur ? cur + " " : "") + s;
    } else {
      if (cur) parts.push(cur);
      if (s.length <= maxLen) {
        cur = s;
      } else {
        // Partir frases muuuy largas por comas o a trozos
        let tmp = s;
        while (tmp.length > maxLen) {
          const cut = tmp.lastIndexOf(",", maxLen) > 80
            ? tmp.lastIndexOf(",", maxLen)
            : maxLen;
          parts.push(tmp.slice(0, cut));
          tmp = tmp.slice(cut);
        }
        cur = tmp;
      }
    }
  }
  if (cur) parts.push(cur);
  return parts.filter(Boolean);
}

function getSelectedVoice() {
  const name = document.getElementById("tts-voice").value;
  return synth.getVoices().find(v => v.name === name) || null;
}

function speak(text) {
  // cancelar lo anterior si había algo
  synth.cancel();

  const rate = parseFloat(document.getElementById("tts-rate").value || "1");
  const pitch = parseFloat(document.getElementById("tts-pitch").value || "1");
  const voice = getSelectedVoice();

  const chunks = chunkText(text);
  chunks.forEach((chunk, idx) => {
    const u = new SpeechSynthesisUtterance(chunk);
    u.rate = rate;
    u.pitch = pitch;
    u.lang = voice?.lang || "es-ES"; // mejor resultado con ES
    if (voice) u.voice = voice;

    // ejemplo: cuando termina el último, podrías hacer algo
    if (idx === chunks.length - 1) {
      u.onend = () => console.log("TTS terminado");
    }
    synth.speak(u);
  });
}

// Controles
document.getElementById("tts-play").onclick = () => {
  // iOS/Safari requiere gesto del usuario antes de la 1ª reproducción
  // este botón ya lo cumple; si querés, podés hacer un primer utter corto.
  const text = window.LAST_TTS_TEXT || "No hay texto para leer.";
  speak(text);
};
document.getElementById("tts-pause").onclick = () => synth.pause();
document.getElementById("tts-resume").onclick = () => synth.resume();
document.getElementById("tts-stop").onclick = () => synth.cancel();

// Llamalo cuando recibas la respuesta del /rag:
async function askRag(question) {
  const res = await fetch(API_URL + "/rag", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({ question }),
  });
  const data = await res.json(); // { output, sources }
  document.querySelector("#answer").textContent = data.output;
  window.LAST_TTS_TEXT = data.output;      // <-- guardar para TTS
  // si querés auto-leer apenas llega:
  // speak(data.output);
}