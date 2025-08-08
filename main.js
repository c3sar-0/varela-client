// 🔧 Cambiá esto por tu endpoint backend
const SERVER_URL = "https://tu-dominio.com/api/transcripts";

// Compatibilidad básica
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  alert("Este navegador no soporta SpeechRecognition. Probá en Chrome/Edge, o usa STT en el servidor (Whisper, etc.).");
}

let recognition = null;
let listening = false;
let bufferInterim = "";
const textarea = document.getElementById("transcript");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");
const langSel  = document.getElementById("lang");
const autoRestart = document.getElementById("autoRestart");

function setUI(state) {
  listening = state === "listening";
  startBtn.disabled = listening;
  stopBtn.disabled  = !listening;
  statusEl.textContent = listening ? "Escuchando…" : "Inactivo";
}

function initRecognition() {
  if (!SR) return;
  if (recognition) recognition.abort();

  recognition = new SR();
  recognition.lang = langSel.value || "es-UY";
  recognition.continuous = true;      // escucha prolongada
  recognition.interimResults = true;  // resultados parciales

  recognition.onstart = () => setUI("listening");

  recognition.onend = () => {
    setUI("idle");
    if (autoRestart.checked && listening) {
      // Chrome a veces corta sesiones largas; reintentamos
      setTimeout(() => { try { recognition.start(); } catch {} }, 300);
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
        finalTextToAppend += (text + ". ");
        // Enviamos cada segmento final al backend
        sendToServer(text).catch(err => console.error("POST failed:", err));
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
      window.__interimTimer = setTimeout(() => { textarea.value = base; }, 200);
    }
    textarea.scrollTop = textarea.scrollHeight;
  };
}

async function sendToServer(text) {
  // Envía JSON {text, timestamp, lang}
  const payload = {
    text,
    lang: recognition?.lang || langSel.value,
    timestamp: new Date().toISOString()
  };
  const res = await fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    // Si tu API necesita credenciales/cookies: credentials: "include"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

startBtn.addEventListener("click", () => {
  if (!SR) return;
  initRecognition();
  try { recognition.start(); } catch {} // start puede tirar si ya está en marcha
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
    try { recognition.start(); } catch {}
  }
});