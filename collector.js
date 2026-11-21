/**
 * AudioWorkletProcessor: collects mic samples, sends as plain Array for
 * max compatibility with iOS WebKit structured clone.
 * Renamed to v3 to defeat any cached version of the prior file.
 */
class AudioCollector extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunkSize =
      (options && options.processorOptions && options.processorOptions.chunkSize) ||
      1024;
    this.chunkSize = chunkSize;
    this.buffer = new Float32Array(chunkSize);
    this.bufferIndex = 0;
    this.processCalls = 0;
    this.chunksSent = 0;
    this.port.postMessage({ type: 'ready', chunkSize });
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    this.processCalls += 1;

    const hasInput = !!(input && input[0] && input[0].length > 0);
    const srcLen = hasInput ? input[0].length : 0;

    if (this.processCalls <= 5 || this.processCalls % 50 === 0) {
      this.port.postMessage({
        type: 'heartbeat',
        processCalls: this.processCalls,
        hasInput,
        srcLen,
        bufIdx: this.bufferIndex,
        chunksSent: this.chunksSent,
      });
    }

    if (hasInput) {
      const src = input[0];

      // Pass-through to output so iOS keeps scheduling this node
      if (output && output[0] && output[0].length >= src.length) {
        output[0].set(src);
      }

      for (let i = 0; i < src.length; i++) {
        this.buffer[this.bufferIndex] = src[i];
        this.bufferIndex += 1;
        if (this.bufferIndex >= this.chunkSize) {
          // Send as plain Array of numbers. Slower than Transferable but
          // works around iOS WebKit's broken structured clone for typed
          // arrays inside object messages.
          const arr = new Array(this.chunkSize);
          for (let j = 0; j < this.chunkSize; j++) arr[j] = this.buffer[j];
          this.port.postMessage({ type: 'samples', samples: arr });
          this.chunksSent += 1;
          this.bufferIndex = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor('audio-collector', AudioCollector);
