'use client';
let loaderPromise = null;
const protocolNames = {
    'audible-fast': 'GGWAVE_PROTOCOL_AUDIBLE_FAST',
    'audible-normal': 'GGWAVE_PROTOCOL_AUDIBLE_NORMAL',
    'ultrasound-fast': 'GGWAVE_PROTOCOL_ULTRASOUND_FAST',
    'ultrasound-normal': 'GGWAVE_PROTOCOL_ULTRASOUND_NORMAL',
};
export const WAV_SAMPLE_RATE = 48000;
/**
 * Lazy-load ggwave WASM once per browser session.
 * Must only be called client-side.
 */
export function loadGgwave() {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('ggwave is browser-only'));
    }
    if (!loaderPromise) {
        loaderPromise = Promise.resolve({ default: window.ggwave_factory })
            .then((mod) => mod.default())
            .catch((error) => {
            loaderPromise = null;
            throw error;
        });
    }
    return loaderPromise;
}
export function createGgwaveInstance(ggwave, sampleRate) {
    const parameters = ggwave.getDefaultParameters();
    parameters.sampleRateInp = sampleRate;
    parameters.sampleRateOut = sampleRate;
    const instance = ggwave.init(parameters);
    if (instance < 0)
        throw new Error('No se pudo iniciar el módem de audio.');
    return instance;
}
export function encodeTone(ggwave, sampleRate, payload, protocol, volume) {
    const instance = createGgwaveInstance(ggwave, sampleRate);
    try {
        const waveform = ggwave.encode(instance, payload, ggwave.ProtocolId[protocolNames[protocol]], volume);
        const bytesPerSample = Float32Array.BYTES_PER_ELEMENT;
        if (!waveform.length || waveform.byteLength % bytesPerSample !== 0) {
            throw new Error('No se pudo generar el tono. Prueba con un código más corto.');
        }
        // Copy the Float32 PCM before WASM can reuse its backing memory.
        const samples = new Float32Array(waveform.buffer, waveform.byteOffset, waveform.byteLength / bytesPerSample);
        return new Float32Array(samples);
    }
    finally {
        ggwave.free(instance);
    }
}
export function decodeTone(ggwave, instance, samples) {
    // The WASM binding expects the bytes of the Float32 PCM.
    const bytes = new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    const payload = ggwave.decode(instance, bytes);
    return payload.length ? new TextDecoder().decode(payload) : null;
}
export function createPcmWave(samples, sampleRate) {
    const bytesPerSample = Int16Array.BYTES_PER_ELEMENT;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    // Write a mono PCM WAV header and little-endian 16-bit samples.
    view.setUint32(0, 0x52494646); // RIFF
    view.setUint32(4, buffer.byteLength - 8, true);
    view.setUint32(8, 0x57415645); // WAVE
    view.setUint32(12, 0x666d7420); // fmt
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461); // data
    view.setUint32(40, dataSize, true);
    for (let index = 0; index < samples.length; index++) {
        const sample = Math.max(-1, Math.min(1, samples[index]));
        const scale = sample < 0 ? 32768 : 32767;
        view.setInt16(44 + index * bytesPerSample, Math.round(sample * scale), true);
    }
    return buffer;
}
