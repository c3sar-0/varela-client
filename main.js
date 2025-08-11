// 🔧 Cambiá esto por tu endpoint backend
const SERVER_URL = "https://varela1879.c3sar.dev/rag";

// Compatibilidad básica
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  alert(
    "Este navegador no soporta SpeechRecognition. Probá en Chrome/Edge, o usa STT en el servidor (Whisper, etc.)."
  );
}

let recognition = null;
let listening = false;
let bufferInterim = "";
const textarea = document.getElementById("transcript");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const langSel = document.getElementById("lang");
const autoRestart = document.getElementById("autoRestart");

function setUI(state) {
  listening = state === "listening";
  startBtn.disabled = listening;
  stopBtn.disabled = !listening;
  statusEl.textContent = listening ? "Escuchando…" : "Inactivo";
}

function initRecognition() {
  if (!SR) return;
  if (recognition) recognition.abort();

  recognition = new SR();
  recognition.lang = langSel.value || "es-UY";
  recognition.continuous = true; // escucha prolongada
  recognition.interimResults = true; // resultados parciales

  recognition.onstart = () => setUI("listening");

  recognition.onend = () => {
    setUI("idle");
    if (autoRestart.checked && listening) {
      // Chrome a veces corta sesiones largas; reintentamos
      setTimeout(() => {
        try {
          recognition.start();
        } catch {}
      }, 300);
    }
  };

  recognition.onerror = (e) => {
    console.warn("Speech error:", e.error);
    statusEl.textContent = `Error: ${e.error}`;
  };

  // En cada resultado, agregamos parciales y enviamos los finales
  recognition.onresult = (event) => {
    let finalTextToAppend = "";
    bufferInterim = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const text = res[0].transcript.trim();

      if (res.isFinal) {
        finalTextToAppend += text + ". ";
        // Enviamos cada segmento final al backend
        console.log("ENVIANDO: ", text);
        sendToServer(text).then(res => res.json())
        .then(data => {
          if (data.output) {
            // document.querySelector("#answer").textContent = data.output;
            window.LAST_TTS_TEXT = data.output;      // <-- guardar para TTS
            console.log(data.output)
            // speak(data.output);
          }
        })
        .catch((err) => console.error("POST failed:", err));
      } else {
        bufferInterim += text + " ";
      }
    }

    if (finalTextToAppend) textarea.value += finalTextToAppend;
    // Mostramos el parcial en “tiempo real”
    if (bufferInterim) {
      // Pintamos el parcial al final sin “fijarlo”
      const base = textarea.value;
      textarea.value = base + "[" + bufferInterim + "]";
      // Volvemos a dejar solo lo fijo en ~200 ms para que no se amontone
      clearTimeout(window.__interimTimer);
      window.__interimTimer = setTimeout(() => {
        textarea.value = base;
      }, 200);
    }
    textarea.scrollTop = textarea.scrollHeight;
  };
}

async function sendToServer(text) {
  // Envía JSON {text, timestamp, lang}
  const payload = {
    question: text,
  };
  const res = await fetch(SERVER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + document.getElementById("hola").value,
    },
    body: JSON.stringify(payload),
    // Si tu API necesita credenciales/cookies: credentials: "include"
    // credentials: "include",    
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

startBtn.addEventListener("click", () => {
  if (!SR) return;
  initRecognition();
  try {
    recognition.start();
  } catch {} // start puede tirar si ya está en marcha
});

stopBtn.addEventListener("click", () => {
  if (!recognition) return;
  // Detenemos y evitamos reintentos
  autoRestart.checked = false;
  recognition.stop();
  setUI("idle");
});

langSel.addEventListener("change", () => {
  if (listening) {
    // Reinicia con el nuevo idioma
    autoRestart.checked = true;
    initRecognition();
    try {
      recognition.start();
    } catch {}
  }
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

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