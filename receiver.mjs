import { createGgwaveInstance, decodeTone, loadGgwave } from './audio-engine.mjs';

const campaignCode = 'CUPON004';
const heading = document.querySelector('#status');
const instructions = document.querySelector('#instructions');
const button = document.querySelector('#listen');
const result = document.querySelector('#result');
let session;

function show(state, title, text, action) {
  document.body.dataset.state = state;
  heading.textContent = title;
  instructions.textContent = text;
  button.textContent = action;
  button.disabled = state === 'starting';
  result.hidden = state !== 'detected';
}

function stop() {
  const current = session;
  session = undefined;
  if (!current) return;
  current.stream?.getTracks().forEach(track => track.stop());
  if (current.node) current.node.port.onmessage = null;
  if (current.decoder !== undefined) current.engine.free(current.decoder);
  current.context?.close().catch(() => {});
}

function ready() {
  stop();
  show('idle', 'Detecta la cuña',
    'Activa el micrófono y reproduce la cuña desde otro dispositivo cercano.', 'Activar micrófono');
}

async function listen() {
  show('starting', 'Preparando la escucha', 'Autoriza el micrófono si tu navegador te lo pide.', 'Preparando…');
  const current = {};
  session = current;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone unavailable');
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    current.context = new AudioContextType();
    const resumed = current.context.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (session !== current) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    current.stream = stream;
    current.engine = await loadGgwave();
    if (session !== current) return;
    await resumed;
    await current.context.audioWorklet.addModule('./collector.js');
    if (session !== current) return;
    current.decoder = createGgwaveInstance(current.engine, current.context.sampleRate);
    current.node = new AudioWorkletNode(current.context, 'audio-collector');
    current.node.port.onmessage = ({ data }) => {
      if (data.type !== 'samples' || session !== current) return;
      const code = decodeTone(current.engine, current.decoder, Float32Array.from(data.samples));
      if (code?.trim().toUpperCase() !== campaignCode) return;
      stop();
      show('detected', 'Señal detectada', 'La cuña activó la campaña de prueba.', 'Probar otra vez');
    };

    const input = current.context.createMediaStreamSource(stream);
    const mute = current.context.createGain();
    mute.gain.value = 0;
    input.connect(current.node).connect(mute).connect(current.context.destination);
    show('listening', 'Escuchando…',
      'Mantén esta página abierta y reproduce la cuña cerca del micrófono.', 'Detener escucha');
  } catch (error) {
    if (session !== current) return;
    stop();
    const denied = error?.name === 'NotAllowedError';
    show('error', denied ? 'Permiso denegado' : 'Micrófono no disponible',
      denied ? 'Permite el acceso al micrófono desde los ajustes del navegador.' :
        'Prueba desde Safari o Chrome en un dispositivo con micrófono.', 'Reintentar');
  }
}

button.addEventListener('click', () => session ? ready() : listen());
window.addEventListener('pagehide', ready);
